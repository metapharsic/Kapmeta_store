import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { authedFetch, logout } from "../lib/auth";
import QuickSearchModal from "./QuickSearchModal";
import ItemToggleModal from "./ItemToggleModal";
import HoldOrdersDrawer from "./HoldOrdersDrawer";

interface PetPoojaHeaderProps {
  outletName?: string;
  outletCode?: string;
  onNewOrder?: () => void;
  activeMode?: "DINE_IN" | "DELIVERY" | "PICKUP";
  onModeChange?: (mode: "DINE_IN" | "DELIVERY" | "PICKUP") => void;
  heldOrdersCount?: number;
  onOpenHoldDrawer?: () => void;
}

export default function PetPoojaHeader({
  outletName = "Hotel Kapila",
  outletCode = "R327038",
  onNewOrder,
  activeMode,
  onModeChange,
  heldOrdersCount = 0,
  onOpenHoldDrawer,
}: PetPoojaHeaderProps) {
  const router = useRouter();
  const [searchModalType, setSearchModalType] = useState<"BILL" | "KOT" | null>(null);
  const [isItemToggleOpen, setIsItemToggleOpen] = useState(false);
  const [isHoldOpen, setIsHoldOpen] = useState(false);
  const [isStoreOnline, setIsStoreOnline] = useState(true);
  const [liveViewActive, setLiveViewActive] = useState(true);
  const [alertsCount, setAlertsCount] = useState(3);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);

  return (
    <>
      <header className="petpooja-top-header">
        {/* Left branding & Outlet title */}
        <div className="petpooja-header-left">
          <button
            type="button"
            className="petpooja-hamburger-btn"
            onClick={() => setShowMenuDrawer(!showMenuDrawer)}
            title="Navigation Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="petpooja-logo-badge">
            <span className="logo-text">POSS</span>
          </div>

          <div className="petpooja-outlet-title">
            <span className="outlet-name-bold">{outletName} ({outletCode})</span>
            <span className="outlet-subtitle"> - The Finest Restaurant Management Platform</span>
          </div>
        </div>

        {/* Center Actions: New Order & Quick Search */}
        <div className="petpooja-header-center">
          <button
            type="button"
            className="petpooja-new-order-btn"
            onClick={() => {
              if (onNewOrder) {
                onNewOrder();
              } else {
                router.push("/");
              }
            }}
          >
            New Order
          </button>

          <div className="petpooja-search-box" onClick={() => setSearchModalType("BILL")}>
            <span className="search-icon">🔍</span>
            <span className="search-label">Q Bill No</span>
          </div>

          <div className="petpooja-search-box" onClick={() => setSearchModalType("KOT")}>
            <span className="search-icon">🔍</span>
            <span className="search-label">Q KOT No</span>
          </div>
        </div>

        {/* Right Utility Icons & Actions */}
        <div className="petpooja-header-right">
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => setIsItemToggleOpen(true)}
            title="Item On/Off (86 Stock Toggle)"
          >
            <span className="icon-glyph">⊘</span>
            <span className="icon-caption">Item On/Off</span>
          </button>

          <button
            type="button"
            className={`header-icon-btn ${isStoreOnline ? "is-active" : "is-offline"}`}
            onClick={() => setIsStoreOnline(!isStoreOnline)}
            title="Store Status"
          >
            <span className="icon-glyph">🏪</span>
            <span className="icon-caption">Store</span>
          </button>

          <button
            type="button"
            className={`header-icon-btn ${liveViewActive ? "is-live" : ""}`}
            onClick={() => setLiveViewActive(!liveViewActive)}
            title="Live View KDS & Floor Sync"
          >
            <span className="icon-glyph">📡</span>
            <span className="icon-caption">Live View</span>
          </button>

          <Link href="/orders?tab=live" className="header-icon-btn" title="Orders Manager">
            <span className="icon-glyph">📋</span>
            <span className="icon-caption">Orders</span>
          </Link>

          <Link href="/orders?tab=all" className="header-icon-btn" title="Recent Transactions">
            <span className="icon-glyph">🕒</span>
            <span className="icon-caption">Recent</span>
          </Link>

          <button
            type="button"
            className="header-icon-btn"
            onClick={() => {
              if (onOpenHoldDrawer) onOpenHoldDrawer();
              else setIsHoldOpen(true);
            }}
            title="Held Orders / Parked Carts"
          >
            <span className="icon-glyph">⏸</span>
            <span className="icon-caption">Hold {heldOrdersCount > 0 ? `(${heldOrdersCount})` : ""}</span>
          </button>

          <button
            type="button"
            className="header-icon-btn alert-btn"
            onClick={() => setAlertsCount(0)}
            title="Alerts & Notifications"
          >
            <span className="icon-glyph">🔔</span>
            {alertsCount > 0 && <span className="alert-badge">{alertsCount}</span>}
            <span className="icon-caption">Alerts</span>
          </button>

          <Link href="/channel-availability" className="header-icon-btn" title="Zomato / Swiggy Help & Status">
            <span className="icon-glyph">🛵</span>
            <span className="icon-caption">Zomato Help</span>
          </Link>

          <button
            type="button"
            className="header-icon-btn"
            onClick={() => {
              if (confirm("Are you sure you want to log out of PetPooja POS?")) {
                logout().catch(() => {});
              }
            }}
            title="Log Out"
          >
            <span className="icon-glyph">🚪</span>
            <span className="icon-caption">Logout</span>
          </button>

          <div className="header-support-pill" onClick={() => setShowSupportModal(true)}>
            <span className="support-title">Need Help?</span>
            <span className="support-phone">07969 223344</span>
          </div>
        </div>
      </header>

      {/* Slide-out Global Navigation Drawer */}
      {showMenuDrawer && (
        <div className="petpooja-drawer-backdrop" onClick={() => setShowMenuDrawer(false)}>
          <div className="petpooja-side-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-brand">
                <span className="logo-text">POSS</span>
                <h3>PetPooja POS</h3>
              </div>
              <button className="close-btn" onClick={() => setShowMenuDrawer(false)}>✕</button>
            </div>
            <div className="drawer-nav-list">
              <Link href="/" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                🛒 <span>POS Register (Order Taking)</span>
              </Link>
              <Link href="/table-management" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                🪑 <span>Table View / Floor Plan</span>
              </Link>
              <Link href="/waiter" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                🏃 <span>PetPooja Captain (Tablet / Mobile)</span>
              </Link>
              <Link href="/orders?tab=live" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                🔴 <span>Live Orders</span>
              </Link>
              <Link href="/orders?tab=online" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                🌐 <span>Online Orders (Swiggy / Zomato)</span>
              </Link>
              <Link href="/kitchen" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                🍳 <span>Kitchen Display System (KDS)</span>
              </Link>
              <Link href="/inventory" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                📦 <span>Stock & 86 Item Control</span>
              </Link>
              <Link href="/menu" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                🍽️ <span>Menu Management</span>
              </Link>
              <Link href="/channel-availability" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                📡 <span>Aggregator Menu Status</span>
              </Link>
              <Link href="/admin" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                📊 <span>Sales Analytics & Reports</span>
              </Link>
              <Link href="/finance" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                💰 <span>Finance & Z-Report</span>
              </Link>
              <Link href="/user-management" className="drawer-item" onClick={() => setShowMenuDrawer(false)}>
                🧑‍💼 <span>Staff & Role Access</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Search Modal for Bill No / KOT No */}
      {searchModalType && (
        <QuickSearchModal
          type={searchModalType}
          onClose={() => setSearchModalType(null)}
        />
      )}

      {/* Item 86 On/Off Toggle Modal */}
      {isItemToggleOpen && (
        <ItemToggleModal onClose={() => setIsItemToggleOpen(false)} />
      )}

      {/* Hold Orders Drawer */}
      {isHoldOpen && (
        <HoldOrdersDrawer onClose={() => setIsHoldOpen(false)} />
      )}

      {/* Support Dialog */}
      {showSupportModal && (
        <div className="petpooja-modal-backdrop" onClick={() => setShowSupportModal(false)}>
          <div className="petpooja-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>PetPooja 24x7 Merchant Support</h3>
            <p style={{ margin: "12px 0", color: "var(--text-secondary)" }}>
              Direct line for billing, thermal printing, and aggregator escalation assistance:
            </p>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#e11d48", padding: "12px", background: "#fff1f2", borderRadius: "8px", textAlign: "center" }}>
              📞 07969 223344
            </div>
            <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
              <button className="petpooja-btn-secondary" onClick={() => setShowSupportModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .petpooja-top-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 48px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          padding: 0 12px;
          position: sticky;
          top: 0;
          z-index: 50;
          font-family: inherit;
          gap: 8px;
        }

        .petpooja-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .petpooja-hamburger-btn {
          background: transparent;
          border: none;
          color: #475569;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          border-radius: 4px;
        }
        .petpooja-hamburger-btn:hover {
          background: #f1f5f9;
        }

        .petpooja-logo-badge {
          background: #e11d48;
          color: #ffffff;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 900;
          font-size: 0.875rem;
          letter-spacing: -0.5px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .petpooja-outlet-title {
          font-size: 0.75rem;
          color: #64748b;
          white-space: nowrap;
        }
        .outlet-name-bold {
          font-weight: 700;
          color: #1e293b;
        }

        .petpooja-header-center {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-grow: 1;
          max-width: 480px;
        }

        .petpooja-new-order-btn {
          background: #dc2626;
          color: #ffffff;
          border: none;
          font-weight: 700;
          font-size: 0.8125rem;
          padding: 5px 14px;
          border-radius: 4px;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(220, 38, 38, 0.2);
          transition: background 0.15s;
        }
        .petpooja-new-order-btn:hover {
          background: #b91c1c;
        }

        .petpooja-search-box {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 4px 10px;
          font-size: 0.75rem;
          color: #64748b;
          cursor: pointer;
          min-width: 95px;
        }
        .petpooja-search-box:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }

        .petpooja-header-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .header-icon-btn {
          background: transparent;
          border: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2px 6px;
          cursor: pointer;
          color: #64748b;
          text-decoration: none;
          font-size: 0.65rem;
          position: relative;
          border-radius: 4px;
          min-width: 44px;
        }
        .header-icon-btn:hover {
          background: #f8fafc;
          color: #0f172a;
        }
        .icon-glyph {
          font-size: 0.95rem;
          line-height: 1;
        }
        .icon-caption {
          font-size: 0.625rem;
          font-weight: 500;
          margin-top: 1px;
          white-space: nowrap;
        }

        .header-icon-btn.is-active .icon-glyph {
          color: #16a34a;
        }
        .header-icon-btn.is-live .icon-glyph {
          color: #2563eb;
          animation: pulse 2s infinite;
        }

        .alert-btn {
          position: relative;
        }
        .alert-badge {
          position: absolute;
          top: 0;
          right: 6px;
          background: #dc2626;
          color: #fff;
          font-size: 0.5625rem;
          font-weight: 800;
          border-radius: 999px;
          padding: 0 4px;
          line-height: 12px;
        }

        .header-support-pill {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          padding: 2px 8px;
          background: #f8fafc;
          border-left: 1px solid #e2e8f0;
          cursor: pointer;
        }
        .support-title {
          font-size: 0.625rem;
          color: #94a3b8;
        }
        .support-phone {
          font-size: 0.6875rem;
          font-weight: 700;
          color: #3b82f6;
        }

        /* Drawer & Modals */
        .petpooja-drawer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.45);
          z-index: 100;
          display: flex;
        }
        .petpooja-side-drawer {
          width: 280px;
          height: 100%;
          background: #ffffff;
          box-shadow: 4px 0 20px rgba(0,0,0,0.15);
          display: flex;
          flex-direction: column;
          animation: slideIn 0.2s ease-out;
        }
        .drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        .drawer-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .drawer-brand h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
        }
        .close-btn {
          background: transparent;
          border: none;
          font-size: 1.1rem;
          cursor: pointer;
          color: #64748b;
        }
        .drawer-nav-list {
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow-y: auto;
        }
        .drawer-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 6px;
          color: #334155;
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 600;
        }
        .drawer-item:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .petpooja-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.5);
          z-index: 120;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .petpooja-modal-card {
          background: #ffffff;
          padding: 24px;
          border-radius: 12px;
          width: 90%;
          max-width: 420px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .petpooja-btn-secondary {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
