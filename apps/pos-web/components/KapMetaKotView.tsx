import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export interface KotItemLine {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
}

export interface KotCardData {
  id: string;
  kotNo: string | number;
  orderType: "PICK_UP" | "DELIVERY" | "DINE_IN" | "SWIGGY" | "ZOMATO" | "TAKEAWAY";
  orderTypeDisplay?: string;
  orderTag?: string; // e.g. 'b18', 'b14', 'b3', 'A1'
  initialElapsedSeconds: number; // For MM:SS timer
  biller: string;
  items: KotItemLine[];
  status: "QUEUED" | "PREPARING" | "READY" | "SERVED";
  createdAt?: string;
}

export interface KapMetaKotViewProps {
  initialTickets?: KotCardData[];
  onMarkFoodReady?: (kotId: string) => void;
  onBackToPos?: () => void;
  // Switches to the historical KOT report table (/kitchen?view=list,
  // rendered by components/KotHistoryView.tsx). This board stays the live
  // KDS work surface; the list is a separate, filterable history screen.
  onOpenKotList?: () => void;
}

// Clean empty reference set - live tickets are provisioned from PostgreSQL kot_tickets
export const REFERENCE_KOT_TICKETS: KotCardData[] = [];

// Kitchen Audio Chime Helper
function playKitchenReadyChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.19);
    });
  } catch {
    // Graceful fallback
  }
}

export default function KapMetaKotView({
  initialTickets = [],
  onMarkFoodReady,
  onBackToPos,
  onOpenKotList,
}: KapMetaKotViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"ORDER_VIEW" | "KOT_VIEW">("KOT_VIEW");
  const [viewStyle, setViewStyle] = useState<"NEW" | "OLD">("OLD");
  const [tickets, setTickets] = useState<KotCardData[]>(initialTickets);
  const [elapsedMap, setElapsedMap] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    initialTickets.forEach((t) => {
      map[t.id] = t.initialElapsedSeconds;
    });
    return map;
  });

  // Search & Filter state
  const [quickSearchText, setQuickSearchText] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync query params from router (e.g. from header search or QuickSearchModal)
  useEffect(() => {
    if (!router.isReady) return;
    const queryKot = router.query.kot || router.query.kotNo || router.query.kotId || router.query.search;
    if (queryKot && typeof queryKot === "string") {
      setQuickSearchText(queryKot);
    }
  }, [router.isReady, router.query]);

  // Sync state whenever parent tickets change (e.g. from live API fetch)
  useEffect(() => {
    setTickets(initialTickets);
    setElapsedMap((prev) => {
      const next = { ...prev };
      initialTickets.forEach((t) => {
        if (next[t.id] === undefined) {
          next[t.id] = t.initialElapsedSeconds;
        }
      });
      return next;
    });
  }, [initialTickets]);

  // Live Timer: tick every second
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedMap((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          next[id] = (next[id] || 0) + 1;
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format seconds to MM : SS (or HHH:MM)
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleFoodIsReady = (ticketId: string, kotNo: string | number) => {
    playKitchenReadyChime();
    // No local optimistic status write here: the real next status depends on
    // the ticket's current status (QUEUED -> PREPARING -> READY -> SERVED,
    // see KOT_TRANSITIONS), which the parent looks up and PATCHes, then
    // re-fetches. Guessing "READY" here could mislabel a QUEUED ticket that
    // actually just moved to PREPARING.
    setToastMessage(`✓ KOT #${kotNo} updated!`);
    setTimeout(() => setToastMessage(null), 3000);

    if (onMarkFoodReady) {
      onMarkFoodReady(ticketId);
    }
  };

  // Quick MFR (Mark Food Ready via Search Input)
  const handleQuickMfr = () => {
    const query = quickSearchText.trim();
    if (!query) {
      alert("Please enter a KOT or Order number to Mark Food Ready.");
      return;
    }

    const qLower = query.toLowerCase();
    const qClean = qLower.replace(/^(kot\s*#?\s*|#\s*)/i, "").trim();
    const qSuffix = qClean.replace(/^kot-/i, "").trim();

    const matched = tickets.find(
      (t) =>
        String(t.kotNo).toLowerCase() === qLower ||
        (qClean && String(t.kotNo).toLowerCase() === qClean) ||
        (qSuffix && String(t.kotNo).toLowerCase() === qSuffix) ||
        (t.orderTag && t.orderTag.toLowerCase() === qLower) ||
        t.id.toLowerCase() === qLower ||
        (qClean && t.id.toLowerCase() === qClean)
    );

    if (matched) {
      handleFoodIsReady(matched.id, matched.kotNo);
      setQuickSearchText("");
    } else {
      alert(`No active KOT found matching "${query}".`);
    }
  };

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const qLower = quickSearchText.trim().toLowerCase();
      const qClean = qLower.replace(/^(kot\s*#?\s*|#\s*)/i, "").trim();
      const qSuffix = qClean.replace(/^kot-/i, "").trim();

      const matchQuery =
        !qLower ||
        String(t.kotNo).toLowerCase().includes(qLower) ||
        (qClean && String(t.kotNo).toLowerCase().includes(qClean)) ||
        (qSuffix && qSuffix.length >= 2 && String(t.kotNo).toLowerCase().includes(qSuffix)) ||
        (t.id && (t.id.toLowerCase().includes(qClean) || t.id.toLowerCase().includes(qLower))) ||
        (t.orderTag && t.orderTag.toLowerCase().includes(qClean || qLower)) ||
        t.items.some((i) => i.name.toLowerCase().includes(qLower) || (qClean && i.name.toLowerCase().includes(qClean)));

      const tType = String(t.orderType || "").toUpperCase();
      const matchChannel =
        channelFilter === "ALL" ||
        tType === channelFilter ||
        (channelFilter === "PICK_UP" && (tType === "PICK_UP" || tType === "PICKUP" || tType === "TAKEAWAY")) ||
        (channelFilter === "DELIVERY" && (tType === "DELIVERY" || tType === "AGGREGATOR")) ||
        (channelFilter === "DINE_IN" && tType === "DINE_IN") ||
        (channelFilter === "SWIGGY" && tType === "SWIGGY") ||
        (channelFilter === "ZOMATO" && tType === "ZOMATO");

      return matchQuery && matchChannel;
    });
  }, [tickets, quickSearchText, channelFilter]);

  const handleBack = () => {
    if (onBackToPos) {
      onBackToPos();
    } else {
      router.push("/");
    }
  };

  return (
    <div className="kapmeta-kot-view-root">
      {/* Toast notification */}
      {toastMessage && (
        <div className="kot-toast-banner">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Subheader: Tabs on Left, Switcher & Back on Right */}
      <div className="kot-top-navigation-bar">
        <div className="nav-tabs-left">
          <button
            type="button"
            className={`view-tab-btn ${activeTab === "ORDER_VIEW" ? "is-active" : ""}`}
            onClick={() => {
              setActiveTab("ORDER_VIEW");
              router.push("/orders");
            }}
          >
            <span className="tab-icon">📋</span>
            <span className="tab-label">Order View</span>
          </button>

          <button
            type="button"
            className={`view-tab-btn ${activeTab === "KOT_VIEW" ? "is-active kot-active" : ""}`}
            onClick={() => setActiveTab("KOT_VIEW")}
          >
            <span className="tab-icon kot-icon">🧾</span>
            <span className="tab-label">Kot View</span>
          </button>

          {/* Historical KOT report table - /kitchen?view=list */}
          <button
            type="button"
            className="view-tab-btn"
            onClick={() => {
              if (onOpenKotList) onOpenKotList();
              else router.push("/kitchen?view=list");
            }}
            title="Open the KOT history report"
          >
            <span className="tab-icon">📑</span>
            <span className="tab-label">Kot List</span>
          </button>
        </div>

        <div className="nav-controls-right">
          {/* New View | Old View Segmented Switcher */}
          <div className="view-mode-segmented-pill">
            <button
              type="button"
              className={`segmented-opt ${viewStyle === "NEW" ? "is-selected" : ""}`}
              onClick={() => setViewStyle("NEW")}
            >
              New View
            </button>
            <button
              type="button"
              className={`segmented-opt ${viewStyle === "OLD" ? "is-selected blue-highlight" : ""}`}
              onClick={() => setViewStyle("OLD")}
            >
              Old View
            </button>
          </div>

          {/* Back Button */}
          <button
            type="button"
            className="btn-back-nav"
            onClick={handleBack}
            title="Return to Main POS Register"
          >
            &lt; Back
          </button>
        </div>
      </div>

      {/* Filter, Status Legend & Quick MFR Bar */}
      <div className="kot-filter-legend-bar">
        {/* Left Filter Pill */}
        <div className="filter-dropdown-wrap">
          <button
            type="button"
            className="search-filter-pill-btn"
            onClick={() => setShowFilterDropdown((p) => !p)}
          >
            <span className="search-icon">🔍</span>
            <span className="filter-text">
              {channelFilter === "ALL" ? "Search" : `Filter: ${channelFilter}`}
            </span>
            <span className="dropdown-caret">⌄</span>
          </button>

          {showFilterDropdown && (
            <div className="filter-dropdown-menu">
              <div
                className="dropdown-item"
                onClick={() => {
                  setChannelFilter("ALL");
                  setShowFilterDropdown(false);
                }}
              >
                All Orders ({tickets.length})
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setChannelFilter("PICK_UP");
                  setShowFilterDropdown(false);
                }}
              >
                🔵 Pick Up ({tickets.filter((t) => t.orderType === "PICK_UP").length})
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setChannelFilter("DELIVERY");
                  setShowFilterDropdown(false);
                }}
              >
                🟢 Delivery ({tickets.filter((t) => t.orderType === "DELIVERY").length})
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setChannelFilter("DINE_IN");
                  setShowFilterDropdown(false);
                }}
              >
                🟡 Dine In ({tickets.filter((t) => t.orderType === "DINE_IN").length})
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setChannelFilter("SWIGGY");
                  setShowFilterDropdown(false);
                }}
              >
                🔴 Swiggy ({tickets.filter((t) => t.orderType === "SWIGGY").length})
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setChannelFilter("ZOMATO");
                  setShowFilterDropdown(false);
                }}
              >
                🍷 Zomato ({tickets.filter((t) => t.orderType === "ZOMATO").length})
              </div>
            </div>
          )}
        </div>

        {/* Center/Right Status Indicators Legend */}
        <div className="status-indicators-legend-row">
          <div className="legend-item">
            <span className="legend-dot dot-delivery" />
            <span className="legend-label">Delivery</span>
          </div>

          <div className="legend-item">
            <span className="legend-dot dot-limit-exceed" />
            <span className="legend-label">Limit Exceed</span>
          </div>

          <div className="legend-item">
            <span className="legend-dot dot-swiggy" />
            <span className="legend-label">Swiggy</span>
          </div>

          <div className="legend-item">
            <span className="legend-dot dot-zomato" />
            <span className="legend-label">Zomato</span>
          </div>

          <div className="legend-item">
            <span className="legend-dot dot-dine-in" />
            <span className="legend-label">Dine In</span>
          </div>

          <div className="legend-item">
            <span className="legend-dot dot-pickup" />
            <span className="legend-label">Pick Up</span>
          </div>
        </div>

        {/* Far Right Quick Search & MFR Button */}
        <div className="quick-mfr-input-group">
          <input
            type="text"
            className="kot-search-input-field"
            placeholder="Enter kot/Order no."
            value={quickSearchText}
            onChange={(e) => setQuickSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleQuickMfr();
            }}
          />
          <button
            type="button"
            className="btn-mfr-red"
            onClick={handleQuickMfr}
            title="Mark Food Ready"
          >
            MFR
          </button>
        </div>
      </div>

      {/* Main KOT Ticket Cards Matrix Grid (4 Columns) */}
      <div className="kot-cards-matrix-container">
        {filteredTickets.length === 0 ? (
          <div className="empty-kot-state-card">
            <span className="empty-icon">🍳</span>
            <div className="empty-title">No KOT Tickets Found</div>
            <div className="empty-desc">
              All kitchen orders have been prepared or match no search query.
            </div>
            {channelFilter !== "ALL" && (
              <button
                type="button"
                className="btn-reset-filter"
                onClick={() => {
                  setChannelFilter("ALL");
                  setQuickSearchText("");
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="kot-4col-grid">
            {filteredTickets.map((card) => {
              const currentElapsed = elapsedMap[card.id] || card.initialElapsedSeconds;
              const formattedTime = formatTimer(currentElapsed);
              const isReady = card.status === "READY";

              return (
                <div
                  key={card.id}
                  className={`kot-ticket-card-box ${isReady ? "is-ready-state" : ""}`}
                >
                  {/* Card Red / Channel Header Bar */}
                  <div className="card-top-red-bar">
                    <div className="badge-order-type">
                      {card.orderTypeDisplay || "Pick Up"}
                    </div>

                    <div className="kot-number-block">
                      <span className="kot-big-num">{card.kotNo}</span>
                      <span className="kot-no-sublabel">KOT No.</span>
                    </div>

                    <div className="kot-timer-block">
                      <span className="kot-time-value">{formattedTime}</span>
                      <span className="kot-mm-ss-sublabel">MM : SS</span>
                    </div>
                  </div>

                  {/* Card Body / Metadata */}
                  <div className="card-inner-body">
                    {/* Optional Token / Bill Tag (e.g. b18, b14, b3) */}
                    {card.orderTag && (
                      <div className="order-tag-line">
                        <span className="order-tag-text">{card.orderTag}</span>
                      </div>
                    )}

                    {/* Table Column Header: Item | Qty. */}
                    <div className="card-table-header-row">
                      <span className="th-item">Item</span>
                      <span className="th-qty">Qty.</span>
                    </div>

                    {/* Biller / Captain User Line */}
                    <div className="biller-info-row">
                      <span className="biller-user-icon">👤</span>
                      <span className="biller-name-text">{card.biller}</span>
                    </div>

                    {/* Items List */}
                    <div className="card-items-scroll-list">
                      {card.items.map((it) => (
                        <div key={it.id} className="card-item-line-row">
                          <span className="item-title">{it.name}</span>
                          <span className="item-qty-number">{it.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card Bottom Button: Food Is Ready */}
                  <div className="card-footer-action-wrap">
                    <button
                      type="button"
                      className={`btn-food-ready-pill ${isReady ? "is-marked-ready" : ""}`}
                      onClick={() => handleFoodIsReady(card.id, card.kotNo)}
                      disabled={isReady}
                    >
                      {isReady ? "✓ Ready" : "Food Is Ready"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .kapmeta-kot-view-root {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 42px);
          width: 100vw;
          background: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          user-select: none;
          overflow: hidden;
        }

        .kot-toast-banner {
          position: fixed;
          top: 50px;
          right: 24px;
          background: #16a34a;
          color: #ffffff;
          padding: 10px 18px;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 700;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.15);
          z-index: 99999;
          animation: slideDown 0.2s ease-out;
        }

        @keyframes slideDown {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        /* ------------------------------------------------------------ */
        /* SUB-HEADER TABS & CONTROLS                                  */
        /* ------------------------------------------------------------ */
        .kot-top-navigation-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background: #ffffff;
          border-bottom: 1.5px solid #e2e8f0;
          height: 48px;
          box-sizing: border-box;
        }

        .nav-tabs-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .view-tab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 14px;
          font-size: 0.875rem;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          transition: all 0.12s;
        }

        .view-tab-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }

        .view-tab-btn.is-active.kot-active {
          border-color: #ef4444;
          color: #dc2626;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(220, 38, 38, 0.1);
        }

        .tab-icon {
          font-size: 0.9375rem;
        }

        .tab-icon.kot-icon {
          color: #dc2626;
        }

        .nav-controls-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* Segmented View Switcher: New View | Old View */
        .view-mode-segmented-pill {
          display: flex;
          align-items: center;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          overflow: hidden;
          padding: 2px;
        }

        .segmented-opt {
          background: transparent;
          border: none;
          padding: 5px 12px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.12s;
        }

        .segmented-opt.is-selected.blue-highlight {
          background: #e0f2fe;
          color: #0284c7;
          font-weight: 700;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .btn-back-nav {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 14px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.12s;
        }

        .btn-back-nav:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }

        /* ------------------------------------------------------------ */
        /* FILTER, STATUS LEGEND & QUICK MFR BAR                        */
        /* ------------------------------------------------------------ */
        .kot-filter-legend-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 16px;
          background: #ffffff;
          border-bottom: 1.5px solid #e2e8f0;
          gap: 12px;
          min-height: 44px;
          box-sizing: border-box;
        }

        .filter-dropdown-wrap {
          position: relative;
        }

        .search-filter-pill-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 5px 12px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }

        .search-filter-pill-btn:hover {
          background: #f8fafc;
        }

        .search-icon {
          font-size: 0.75rem;
          color: #64748b;
        }

        .dropdown-caret {
          font-size: 0.75rem;
          color: #64748b;
        }

        .filter-dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 4px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          z-index: 100;
          min-width: 180px;
          overflow: hidden;
        }

        .dropdown-item {
          padding: 8px 12px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: #1e293b;
          cursor: pointer;
          transition: background-color 0.1s;
        }

        .dropdown-item:hover {
          background: #f1f5f9;
        }

        /* Status Legend with colored dots */
        .status-indicators-legend-row {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .legend-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          display: inline-block;
        }

        .dot-delivery {
          background-color: #22c55e;
        }

        .dot-limit-exceed {
          background-color: #f97316;
        }

        .dot-swiggy {
          background-color: #ef4444;
        }

        .dot-zomato {
          background-color: #881337;
        }

        .dot-dine-in {
          background-color: #eab308;
        }

        .dot-pickup {
          background-color: #3b82f6;
        }

        .legend-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #475569;
        }

        /* Quick Search & MFR */
        .quick-mfr-input-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .kot-search-input-field {
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 5px 10px;
          font-size: 0.8125rem;
          color: #0f172a;
          outline: none;
          width: 170px;
          transition: border-color 0.12s;
        }

        .kot-search-input-field:focus {
          border-color: #3b82f6;
        }

        .kot-search-input-field::placeholder {
          color: #94a3b8;
        }

        .btn-mfr-red {
          background: #b91c1c;
          color: #ffffff;
          border: none;
          border-radius: 4px;
          padding: 5px 14px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.5px;
          transition: background-color 0.12s;
        }

        .btn-mfr-red:hover {
          background: #991b1b;
        }

        /* ------------------------------------------------------------ */
        /* 4-COLUMN KOT CARDS GRID                                      */
        /* ------------------------------------------------------------ */
        .kot-cards-matrix-container {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px 24px;
        }

        .kot-4col-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          align-items: start;
        }

        @media (max-width: 1200px) {
          .kot-4col-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 860px) {
          .kot-4col-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .kot-ticket-card-box {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 250px;
          transition: transform 0.1s, box-shadow 0.1s;
        }

        .kot-ticket-card-box:hover {
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .kot-ticket-card-box.is-ready-state {
          border-color: #22c55e;
          opacity: 0.85;
        }

        /* Top Red Bar Header */
        .card-top-red-bar {
          background: #dc2626;
          color: #ffffff;
          padding: 6px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .badge-order-type {
          font-size: 0.8125rem;
          font-weight: 700;
          color: #ffffff;
        }

        .kot-number-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1.1;
        }

        .kot-big-num {
          font-size: 1.25rem;
          font-weight: 900;
          color: #ffffff;
        }

        .kot-no-sublabel {
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
          color: #fee2e2;
        }

        .kot-timer-block {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          line-height: 1.1;
        }

        .kot-time-value {
          font-size: 0.8125rem;
          font-weight: 800;
          font-family: monospace;
          color: #ffffff;
        }

        .kot-mm-ss-sublabel {
          font-size: 0.625rem;
          font-weight: 600;
          color: #fee2e2;
        }

        /* Card Inner Body */
        .card-inner-body {
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .order-tag-line {
          font-size: 0.8125rem;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .card-table-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 3px;
          margin-bottom: 4px;
        }

        .biller-info-row {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          color: #0f172a;
          margin-bottom: 8px;
          font-weight: 600;
        }

        .biller-user-icon {
          font-size: 0.75rem;
          color: #475569;
        }

        .card-items-scroll-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          min-height: 70px;
        }

        .card-item-line-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          font-size: 0.8125rem;
          color: #1e293b;
          line-height: 1.25;
        }

        .item-title {
          font-weight: 500;
          word-break: break-word;
          padding-right: 8px;
        }

        .item-qty-number {
          font-weight: 700;
          color: #0f172a;
          min-width: 16px;
          text-align: right;
        }

        /* Card Footer Action */
        .card-footer-action-wrap {
          padding: 8px 10px 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-top: 1px solid #f1f5f9;
        }

        .btn-food-ready-pill {
          background: #b91c1c;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 6px 18px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          width: 60%;
          max-width: 160px;
          text-align: center;
          transition: background-color 0.12s;
        }

        .btn-food-ready-pill:hover {
          background: #991b1b;
        }

        .btn-food-ready-pill.is-marked-ready {
          background: #16a34a;
          cursor: default;
        }

        /* Empty State */
        .empty-kot-state-card {
          background: #ffffff;
          border-radius: 8px;
          padding: 48px 24px;
          text-align: center;
          margin: 40px auto;
          max-width: 450px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: 12px;
          display: inline-block;
        }

        .empty-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 6px;
        }

        .empty-desc {
          font-size: 0.875rem;
          color: #64748b;
          margin-bottom: 16px;
        }

        .btn-reset-filter {
          background: #ef4444;
          color: #ffffff;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

