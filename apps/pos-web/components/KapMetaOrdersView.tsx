import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";

export type OrderCategory = "ALL" | "DINE_IN" | "DELIVERY" | "PICK_UP";
export type OrderBillStatus = "SAVED_BILL" | "PRINTED_BILL" | "CANCELLED_BILL" | "PAID";

export interface KapMetaOrderRowData {
  id: string;
  orderNo: string;
  aggregatorTag?: string | null; // e.g. "Swiggy"
  orderTypeTitle: string; // e.g. "Dine In (B9)", "Delivery", "Pick Up"
  orderTypeSubtitle?: string; // e.g. "(Non AC)", "(Swiggy)", "(Pick Up)"
  customerPhone?: string | null;
  customerName?: string | null;
  paymentType: string; // e.g. "Cash", "UPI", "Swiggy"
  myAmount: number;
  tax: number;
  discount: number;
  grandTotal: number;
  created: string; // e.g. "2026-08-21 11:40:35"
  status: OrderBillStatus;
}

export interface KapMetaOrdersViewProps {
  initialOrders?: KapMetaOrderRowData[];
  onBackToPos?: () => void;
  onViewOrderDetails?: (orderId: string) => void;
  onPrintBill?: (orderId: string) => void;
}

// Clean reference dataset - live orders are provisioned from PostgreSQL orders table
export const REFERENCE_CURRENT_ORDERS: KapMetaOrderRowData[] = [];

export default function KapMetaOrdersView({
  initialOrders = [],
  onBackToPos,
  onViewOrderDetails,
  onPrintBill,
}: KapMetaOrdersViewProps) {
  const router = useRouter();
  const [topTab, setTopTab] = useState<"LIVE" | "ALL" | "ONLINE" | "ADVANCE">("LIVE");
  const [channelFilter, setChannelFilter] = useState<OrderCategory>("ALL");
  const [statusFilter, setStatusFilter] = useState<OrderBillStatus | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<"LATEST" | "OLDEST" | "AMOUNT_HIGH" | "AMOUNT_LOW">("LATEST");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (router.query.tab) {
      const t = String(router.query.tab).toLowerCase();
      if (t === "live" || t === "current") {
        setTopTab("LIVE");
        setStatusFilter("ALL");
        setChannelFilter("ALL");
      } else if (t === "all") {
        setTopTab("ALL");
        setStatusFilter("ALL");
        setChannelFilter("ALL");
      } else if (t === "online") {
        setTopTab("ONLINE");
        setChannelFilter("DELIVERY");
      } else if (t === "advance") {
        setTopTab("ADVANCE");
      }
    }
  }, [router.query.tab]);

  const handleBack = () => {
    if (onBackToPos) {
      onBackToPos();
    } else {
      router.push("/");
    }
  };

  const handleViewOrder = (order: KapMetaOrderRowData) => {
    if (onViewOrderDetails) {
      onViewOrderDetails(order.id);
    } else {
      router.push(`/pending-order-detail?orderId=${order.id}&orderNo=${order.orderNo}`);
    }
  };

  const handlePrint = (order: KapMetaOrderRowData) => {
    if (onPrintBill) {
      onPrintBill(order.id);
    } else {
      setToastMessage(`🖨️ Printing Receipt for Order #${order.orderNo}...`);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  // Filtered and Sorted Orders
  const filteredOrders = useMemo(() => {
    let list = initialOrders.filter((ord) => {
      // Top Tab Filtering:
      if (topTab === "LIVE") {
        if (ord.status === "PAID" || ord.status === "CANCELLED_BILL") {
          return false;
        }
      } else if (topTab === "ONLINE") {
        const isOnline = !!ord.aggregatorTag || ord.orderTypeTitle.toLowerCase().includes("delivery") || (ord.orderTypeSubtitle && ord.orderTypeSubtitle.toLowerCase().includes("swiggy"));
        if (!isOnline) return false;
      }

      // Channel Category Filter
      if (channelFilter === "DINE_IN" && !ord.orderTypeTitle.toLowerCase().includes("dine in")) {
        return false;
      }
      if (channelFilter === "DELIVERY" && !ord.orderTypeTitle.toLowerCase().includes("delivery")) {
        return false;
      }
      if (channelFilter === "PICK_UP" && !ord.orderTypeTitle.toLowerCase().includes("pick up")) {
        return false;
      }

      // Status Legend Filter
      if (statusFilter !== "ALL" && ord.status !== statusFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesNo = ord.orderNo.toLowerCase().includes(query);
        const matchesName = ord.customerName && ord.customerName.toLowerCase().includes(query);
        const matchesType = ord.orderTypeTitle.toLowerCase().includes(query);
        const matchesPayment = ord.paymentType.toLowerCase().includes(query);
        if (!matchesNo && !matchesName && !matchesType && !matchesPayment) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === "LATEST") {
        return new Date(b.created).getTime() - new Date(a.created).getTime();
      }
      if (sortBy === "OLDEST") {
        return new Date(a.created).getTime() - new Date(b.created).getTime();
      }
      if (sortBy === "AMOUNT_HIGH") {
        return b.grandTotal - a.grandTotal;
      }
      if (sortBy === "AMOUNT_LOW") {
        return a.grandTotal - b.grandTotal;
      }
      return 0;
    });

    return list;
  }, [initialOrders, channelFilter, statusFilter, searchQuery, sortBy]);

  return (
    <div className="kapmeta-orders-view-root">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="orders-toast-banner">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Subheader 1: Top Navigation Tabs (Live Orders | All Orders | Online Orders | Advance Order) */}
      <div className="orders-top-navbar">
        <div className="orders-tabs-left">
          <button
            type="button"
            className={`top-nav-tab-btn ${topTab === "LIVE" ? "is-active" : ""}`}
            onClick={() => {
              setTopTab("LIVE");
              router.push("/orders?tab=live", undefined, { shallow: true });
            }}
          >
            ⚡ Live Orders
          </button>
          <button
            type="button"
            className={`top-nav-tab-btn ${topTab === "ALL" ? "is-active" : ""}`}
            onClick={() => {
              setTopTab("ALL");
              router.push("/orders?tab=all", undefined, { shallow: true });
            }}
          >
            📋 All Orders
          </button>
          <button
            type="button"
            className={`top-nav-tab-btn ${topTab === "ONLINE" ? "is-active" : ""}`}
            onClick={() => {
              setTopTab("ONLINE");
              router.push("/orders?tab=online", undefined, { shallow: true });
            }}
          >
            🛵 Online Orders
          </button>
          <button
            type="button"
            className={`top-nav-tab-btn ${topTab === "ADVANCE" ? "is-active" : ""}`}
            onClick={() => {
              setTopTab("ADVANCE");
              router.push("/orders?tab=advance", undefined, { shallow: true });
            }}
          >
            📅 Advance Order
          </button>
        </div>

        <div className="orders-controls-right">
          <button
            type="button"
            className="btn-back-pill"
            onClick={handleBack}
            title="Return to POS floor"
          >
            &lt; Back
          </button>
        </div>
      </div>

      {/* Subheader 2: Order Channel Type Bar (All | Dine In | Delivery | Pick Up) */}
      <div className="orders-channel-selector-bar">
        <button
          type="button"
          className={`channel-filter-card ${channelFilter === "ALL" ? "is-selected-pink" : ""}`}
          onClick={() => setChannelFilter("ALL")}
        >
          <span className="channel-icon">⊞</span>
          <span className="channel-title">All</span>
        </button>

        <button
          type="button"
          className={`channel-filter-card ${channelFilter === "DINE_IN" ? "is-selected-pink" : ""}`}
          onClick={() => setChannelFilter("DINE_IN")}
        >
          <span className="channel-icon">🍽️</span>
          <span className="channel-title">Dine In</span>
        </button>

        <button
          type="button"
          className={`channel-filter-card ${channelFilter === "DELIVERY" ? "is-selected-pink" : ""}`}
          onClick={() => setChannelFilter("DELIVERY")}
        >
          <span className="channel-icon">🚴</span>
          <span className="channel-title">Delivery</span>
        </button>

        <button
          type="button"
          className={`channel-filter-card ${channelFilter === "PICK_UP" ? "is-selected-pink" : ""}`}
          onClick={() => setChannelFilter("PICK_UP")}
        >
          <span className="channel-icon">🥡</span>
          <span className="channel-title">Pick Up</span>
        </button>
      </div>

      {/* Subheader 3: Search, Sort By & Status Indicator Legend Bar */}
      <div className="orders-toolbar-filter-row">
        {/* Left: Search button / input */}
        <div className="toolbar-search-wrap">
          <button
            type="button"
            className="btn-search-dropdown"
            onClick={() => setShowSearchInput((p) => !p)}
          >
            <span>🔍 Search</span>
            <span className="caret-down">⌄</span>
          </button>
          {showSearchInput && (
            <input
              type="text"
              className="search-input-box"
              placeholder="Search by order no, customer, type..."
              value={searchQuery}
              autoFocus
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          )}
        </div>

        {/* Right: Sort By Dropdown & Status Legends */}
        <div className="toolbar-right-controls">
          <div className="sort-by-group">
            <span className="sort-label">Sort By</span>
            <select
              className="sort-dropdown-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="LATEST">Latest Date ⌄</option>
              <option value="OLDEST">Oldest Date</option>
              <option value="AMOUNT_HIGH">Amount: High to Low</option>
              <option value="AMOUNT_LOW">Amount: Low to High</option>
            </select>
          </div>

          {/* Status Radio / Legend Pills */}
          <div className="status-legend-radio-list">
            <label
              className={`legend-pill-item ${statusFilter === "SAVED_BILL" ? "is-active-filter" : ""}`}
              onClick={() =>
                setStatusFilter((prev) => (prev === "SAVED_BILL" ? "ALL" : "SAVED_BILL"))
              }
            >
              <span className="radio-circle circle-saved" />
              <span className="legend-name">Saved Bill</span>
            </label>

            <label
              className={`legend-pill-item ${statusFilter === "PRINTED_BILL" ? "is-active-filter" : ""}`}
              onClick={() =>
                setStatusFilter((prev) => (prev === "PRINTED_BILL" ? "ALL" : "PRINTED_BILL"))
              }
            >
              <span className="radio-circle circle-printed" />
              <span className="legend-name">Printed Bill</span>
            </label>

            <label
              className={`legend-pill-item ${statusFilter === "CANCELLED_BILL" ? "is-active-filter" : ""}`}
              onClick={() =>
                setStatusFilter((prev) => (prev === "CANCELLED_BILL" ? "ALL" : "CANCELLED_BILL"))
              }
            >
              <span className="radio-circle circle-cancelled" />
              <span className="legend-name">Cancelled Bill</span>
            </label>

            <label
              className={`legend-pill-item ${statusFilter === "PAID" ? "is-active-filter" : ""}`}
              onClick={() => setStatusFilter((prev) => (prev === "PAID" ? "ALL" : "PAID"))}
            >
              <span className="radio-circle circle-paid" />
              <span className="legend-name">Paid</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Data Table Matrix */}
      <div className="orders-table-matrix-container">
        <table className="orders-data-table">
          <thead>
            <tr>
              <th className="th-orderno">Order No.</th>
              <th className="th-ordertype">Order Type</th>
              <th className="th-custphone">Customer Phone</th>
              <th className="th-custname">Customer Name</th>
              <th className="th-paymenttype">Payment Type</th>
              <th className="th-myamount">My Amount (₹)</th>
              <th className="th-tax">Tax (₹)</th>
              <th className="th-discount">Discount (₹)</th>
              <th className="th-grandtotal">Grand Total (₹)</th>
              <th className="th-created">Created</th>
              <th className="th-actions" />
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-orders-cell">
                  <div className="empty-table-state">
                    <span className="empty-state-icon">📋</span>
                    <p className="empty-state-text">No orders found matching the filter criteria.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredOrders.map((ord) => {
                const isPaidPeach = ord.status === "PAID";
                const isPrintedGreen = ord.status === "PRINTED_BILL";

                return (
                  <tr
                    key={ord.id}
                    className={`order-row-item ${
                      isPaidPeach ? "row-peach-tint" : isPrintedGreen ? "row-green-tint" : ""
                    }`}
                  >
                    {/* Order No. with Aggregator Tag */}
                    <td className="td-orderno">
                      <button
                        type="button"
                        className="btn-order-no-pill"
                        onClick={() => handleViewOrder(ord)}
                      >
                        {ord.orderNo}
                      </button>
                      {ord.aggregatorTag && (
                        <span className="aggregator-bracket-tag">[{ord.aggregatorTag}]</span>
                      )}
                    </td>

                    {/* Order Type & Subtitle */}
                    <td className="td-ordertype">
                      <div className="order-type-title">{ord.orderTypeTitle}</div>
                      {ord.orderTypeSubtitle && (
                        <div className="order-type-subtitle">{ord.orderTypeSubtitle}</div>
                      )}
                    </td>

                    {/* Customer Phone */}
                    <td className="td-custphone">{ord.customerPhone || ""}</td>

                    {/* Customer Name */}
                    <td className="td-custname">{ord.customerName || ""}</td>

                    {/* Payment Type */}
                    <td className="td-paymenttype">{ord.paymentType}</td>

                    {/* My Amount */}
                    <td className="td-myamount">{ord.myAmount.toFixed(2)}</td>

                    {/* Tax */}
                    <td className="td-tax">{ord.tax.toFixed(2)}</td>

                    {/* Discount */}
                    <td className="td-discount">({ord.discount.toFixed(2)})</td>

                    {/* Grand Total with Edit Icon */}
                    <td className="td-grandtotal">
                      <button
                        type="button"
                        className="btn-grand-total-pill"
                        onClick={() => handleViewOrder(ord)}
                      >
                        <span>{ord.grandTotal.toFixed(2)}</span>
                        <span className="edit-pencil-icon">📝</span>
                      </button>
                    </td>

                    {/* Created Date Time */}
                    <td className="td-created">{ord.created}</td>

                    {/* Action Buttons: View (Eye) & Print (Printer) */}
                    <td className="td-actions">
                      <button
                        type="button"
                        className="btn-action-icon"
                        title="View Details"
                        onClick={() => handleViewOrder(ord)}
                      >
                        👁️
                      </button>
                      <button
                        type="button"
                        className="btn-action-icon"
                        title="Print Receipt"
                        onClick={() => handlePrint(ord)}
                      >
                        🖨️
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .kapmeta-orders-view-root {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 42px);
          width: 100vw;
          background: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          user-select: none;
          overflow: hidden;
        }

        .orders-toast-banner {
          position: fixed;
          top: 50px;
          right: 24px;
          background: #0f172a;
          color: #ffffff;
          padding: 10px 18px;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 700;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
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

        /* Subheader 1: Top Navigation Tabs */
        .orders-top-navbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          background: #ffffff;
          border-bottom: 1.5px solid #e2e8f0;
          height: 44px;
          box-sizing: border-box;
        }

        .orders-tabs-left {
          display: flex;
          align-items: center;
          gap: 20px;
          height: 100%;
        }

        .top-nav-tab-btn {
          background: transparent;
          border: none;
          border-bottom: 3px solid transparent;
          font-size: 0.875rem;
          font-weight: 600;
          color: #475569;
          height: 100%;
          padding: 0 4px;
          cursor: pointer;
          transition: all 0.12s;
        }

        .top-nav-tab-btn.is-active {
          color: #dc2626;
          border-bottom-color: #dc2626;
          font-weight: 700;
        }

        .btn-back-pill {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 5px 14px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }

        .btn-back-pill:hover {
          background: #f1f5f9;
        }

        /* Subheader 2: Channel Filter Bar (Big Square Cards) */
        .orders-channel-selector-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          background: #ffffff;
          border-bottom: 1.5px solid #e2e8f0;
        }

        .channel-filter-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 6px;
          width: 96px;
          height: 64px;
          cursor: pointer;
          transition: all 0.12s;
        }

        .channel-filter-card.is-selected-pink {
          background: #ffe4e6;
          border-color: #f43f5e;
          border-bottom: 3px solid #e11d48;
        }

        .channel-icon {
          font-size: 1.25rem;
          margin-bottom: 2px;
        }

        .channel-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: #1e293b;
        }

        /* Subheader 3: Toolbar (Search, Sort By & Status Legends) */
        .orders-toolbar-filter-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background: #ffffff;
          border-bottom: 1.5px solid #e2e8f0;
          min-height: 42px;
        }

        .toolbar-search-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-search-dropdown {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 5px 12px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }

        .caret-down {
          font-size: 0.75rem;
          color: #64748b;
        }

        .search-input-box {
          border: 1px solid #3b82f6;
          border-radius: 4px;
          padding: 5px 10px;
          font-size: 0.8125rem;
          outline: none;
          width: 240px;
        }

        .toolbar-right-controls {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .sort-by-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sort-label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #475569;
        }

        .sort-dropdown-select {
          background: #e0f2fe;
          border: 1px solid #bae6fd;
          border-radius: 4px;
          padding: 4px 10px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #0369a1;
          outline: none;
          cursor: pointer;
        }

        /* Status Legends */
        .status-legend-radio-list {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .legend-pill-item {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
          transition: background-color 0.1s;
        }

        .legend-pill-item.is-active-filter {
          background: #f1f5f9;
          font-weight: 700;
        }

        .radio-circle {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }

        .circle-saved {
          border: 1.5px solid #94a3b8;
          background: transparent;
        }

        .circle-printed {
          background: #22c55e;
        }

        .circle-cancelled {
          background: #f97316;
        }

        .circle-paid {
          background: #facc15;
        }

        .legend-name {
          font-size: 0.75rem;
          font-weight: 600;
          color: #475569;
        }

        /* Main Data Table Matrix */
        .orders-table-matrix-container {
          flex: 1;
          overflow-y: auto;
          background: #ffffff;
        }

        .orders-data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .orders-data-table thead tr {
          background: #ffffff;
          border-bottom: 1.5px solid #e2e8f0;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .orders-data-table th {
          padding: 12px 14px;
          font-size: 0.8125rem;
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
        }

        .order-row-item td {
          padding: 12px 14px;
          font-size: 0.8125rem;
          color: #0f172a;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          vertical-align: middle;
        }

        /* Color Tints Matching Screenshot */
        .order-row-item.row-green-tint td {
          background-color: #86efac; /* Bright soft green */
        }

        .order-row-item.row-peach-tint td {
          background-color: #fed7aa; /* Soft peach/yellow for Swiggy */
        }

        .btn-order-no-pill {
          background: #ffffff;
          border: 1px solid #93c5fd;
          border-radius: 12px;
          padding: 3px 10px;
          font-size: 0.8125rem;
          font-weight: 700;
          color: #2563eb;
          cursor: pointer;
          text-decoration: underline;
        }

        .aggregator-bracket-tag {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #1e293b;
          margin-left: 6px;
        }

        .order-type-title {
          font-weight: 600;
          color: #0f172a;
        }

        .order-type-subtitle {
          font-size: 0.75rem;
          color: #334155;
          font-weight: 500;
        }

        .btn-grand-total-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #ffffff;
          border: 1px solid #93c5fd;
          border-radius: 12px;
          padding: 3px 10px;
          font-size: 0.8125rem;
          font-weight: 700;
          color: #2563eb;
          cursor: pointer;
        }

        .edit-pencil-icon {
          font-size: 0.75rem;
        }

        .td-actions {
          white-space: nowrap;
          text-align: right;
        }

        .btn-action-icon {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 0.875rem;
          margin-left: 6px;
          cursor: pointer;
          transition: all 0.12s;
        }

        .btn-action-icon:hover {
          background: #f1f5f9;
        }

        .empty-orders-cell {
          text-align: center;
          padding: 60px 20px;
        }

        .empty-state-icon {
          font-size: 2.5rem;
          display: block;
          margin-bottom: 8px;
        }

        .empty-state-text {
          font-size: 0.875rem;
          color: #64748b;
          margin: 0;
        }
      `}</style>
    </div>
  );
}

