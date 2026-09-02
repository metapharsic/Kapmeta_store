import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { authedFetch } from "../lib/auth";
import {
  downloadCsv,
  formatDateTime,
  formatMinor,
  humanizeCode,
  minorToMajor,
  statusTone,
} from "./orders-shared";

/**
 * One row of `GET /orders/online`. Every field below is served by the API —
 * rider name/phone, OTP and the received/accepted timestamps come from the
 * `orders` columns migration 0039 adds, and are null (rendered as a dash)
 * until an aggregator webhook fills them in. Nothing here is invented.
 */
export interface OnlineOrderRow {
  id: string;
  orderNo: string;
  orderNumber: string;
  externalOrderId: string | null;
  outletName: string | null;
  channel: string | null;
  orderType: string;
  tableNumber: string | null;
  riderName: string | null;
  riderPhone: string | null;
  customerName: string | null;
  customerPhone: string | null;
  otp: string | null;
  createdAt: string;
  receivedAt: string | null;
  acceptedAt: string | null;
  updatedAt: string | null;
  grandTotalMinor: string;
  status: string;
  elapsedMinutes: number;
}

export interface AggregatorOrdersViewProps {
  onViewOrder?: (orderId: string) => void;
}

type ChannelTab = "ALL" | "ZOMATO" | "SWIGGY";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  "PLACED",
  "CONFIRMED",
  "KOT_CREATED",
  "IN_PREPARATION",
  "READY",
  "OUT_FOR_DELIVERY",
  "HANDED_OVER",
  "COMPLETED",
  "CANCELLED",
];

// `orders.order_type` is free text; these are the values the aggregator
// webhook and the POS write for an online order.
const RECORD_TYPE_OPTIONS = ["DELIVERY", "PICKUP", "DINE_IN", "AGGREGATOR"];

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.2 3.5h3l1.5 3.8-2 1.4a11 11 0 0 0 4.6 4.6l1.4-2 3.8 1.5v3a1.7 1.7 0 0 1-1.9 1.7A15.5 15.5 0 0 1 4.5 5.4 1.7 1.7 0 0 1 6.2 3.5Z" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.4a2.3 2.3 0 1 1 3.1 2.2c-.6.3-.9.8-.9 1.4v.4" />
      <path d="M12 16.6h.01" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Renders a value or an em dash so an empty cell never reads as a bug. */
function orDash(value: string | null | undefined) {
  return value && String(value).trim() ? String(value) : "—";
}

export default function AggregatorOrdersView({ onViewOrder }: AggregatorOrdersViewProps) {
  const router = useRouter();

  const [channelTab, setChannelTab] = useState<ChannelTab>("ALL");
  const [draftRecordType, setDraftRecordType] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftOrderNo, setDraftOrderNo] = useState("");
  const [recordType, setRecordType] = useState("");
  const [status, setStatus] = useState("");
  const [orderNo, setOrderNo] = useState("");

  const [orders, setOrders] = useState<OnlineOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("channel", channelTab);
      qs.set("page", String(page));
      qs.set("limit", String(PAGE_SIZE));
      if (status) qs.set("status", status);
      if (orderNo.trim()) qs.set("orderNo", orderNo.trim());

      const res = await authedFetch(`/orders/online?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to load online orders");
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      console.error(err);
      setError("Could not reach the aggregator order feed.");
    } finally {
      setLoading(false);
    }
  }, [channelTab, page, status, orderNo]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  // Record Type has no server-side parameter on GET /orders/online, so it is
  // applied to the fetched page here.
  const visibleOrders = useMemo(
    () =>
      recordType
        ? orders.filter((o) => String(o.orderType || "").toUpperCase() === recordType)
        : orders,
    [orders, recordType]
  );

  const apply = () => {
    setRecordType(draftRecordType);
    setStatus(draftStatus);
    setOrderNo(draftOrderNo);
    setPage(1);
  };

  const showAll = () => {
    setDraftRecordType("");
    setDraftStatus("");
    setDraftOrderNo("");
    setRecordType("");
    setStatus("");
    setOrderNo("");
    setChannelTab("ALL");
    setPage(1);
  };

  const exportReport = () => {
    downloadCsv(
      `online-orders-${channelTab.toLowerCase()}-page${page}.csv`,
      [
        "Order No.",
        "External Order Id",
        "Outlet",
        "Order From",
        "Order Type",
        "Table",
        "Rider Name",
        "Rider Phone",
        "Customer Name",
        "Customer Phone",
        "OTP",
        "Created",
        "Received",
        "Accepted",
        "Updated",
        "Total",
        "Status",
        "Elapsed (min)",
      ],
      visibleOrders.map((o) => [
        o.orderNo,
        o.externalOrderId || "",
        o.outletName || "",
        o.channel || "",
        humanizeCode(o.orderType),
        o.tableNumber || "",
        o.riderName || "",
        o.riderPhone || "",
        o.customerName || "",
        o.customerPhone || "",
        o.otp || "",
        formatDateTime(o.createdAt),
        formatDateTime(o.receivedAt),
        formatDateTime(o.acceptedAt),
        formatDateTime(o.updatedAt),
        minorToMajor(o.grandTotalMinor).toFixed(2),
        o.status,
        o.elapsedMinutes,
      ])
    );
  };

  const openOrder = (id: string) => {
    if (onViewOrder) onViewOrder(id);
    else router.push(`/pending-order-detail?orderId=${id}`);
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRecord = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRecord = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="online-root">
      <header className="online-head">
        <div>
          <h1 className="online-title">Online Orders Activity</h1>
          <div className="channel-tabs" role="tablist" aria-label="Aggregator channels">
            {(["ALL", "ZOMATO", "SWIGGY"] as ChannelTab[]).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={channelTab === c}
                className={`channel-tab ${channelTab === c ? "is-active" : ""}`}
                onClick={() => {
                  setChannelTab(c);
                  setPage(1);
                }}
              >
                {c === "ALL" ? "All" : humanizeCode(c)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => router.push("/integrations")}
        >
          <IconHelp />
          <span>Aggregator Help Center</span>
        </button>
      </header>

      <section className="filter-card">
        <label className="field">
          <span className="field-label">Record Type</span>
          <select
            className="field-input"
            value={draftRecordType}
            onChange={(e) => setDraftRecordType(e.target.value)}
          >
            <option value="">All Record Types</option>
            {RECORD_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {humanizeCode(t)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Status</span>
          <select
            className="field-input"
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value)}
          >
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {humanizeCode(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Order No.</span>
          <input
            type="text"
            className="field-input"
            placeholder="Order No."
            value={draftOrderNo}
            onChange={(e) => setDraftOrderNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
          />
        </label>

        <div className="filter-actions">
          <button type="button" className="btn-primary" onClick={apply}>
            Apply
          </button>
          <button type="button" className="btn-secondary" onClick={showAll}>
            Show All
          </button>
          <button type="button" className="btn-secondary" onClick={exportReport}>
            Export Report
          </button>
        </div>
      </section>

      {error && <div className="online-error">{error}</div>}

      <section className="table-card">
        <div className="table-scroll">
          <table className="online-table">
            <thead>
              <tr>
                <th scope="col">Order No.</th>
                <th scope="col">Outlet Name / Order From</th>
                <th scope="col">Order Type / Rider Details</th>
                <th scope="col">Customer Details</th>
                <th scope="col">OTP</th>
                <th scope="col">Date Time</th>
                <th scope="col" className="num">Total</th>
                <th scope="col">Status</th>
                <th scope="col">At</th>
                <th scope="col" className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="state-cell">
                    Loading aggregator orders…
                  </td>
                </tr>
              ) : visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="state-cell">
                    No online orders match these filters.
                  </td>
                </tr>
              ) : (
                visibleOrders.map((o) => (
                  <tr key={o.id} className="data-row">
                    <td>
                      <button type="button" className="link-cell" onClick={() => openOrder(o.id)}>
                        {o.orderNo}
                      </button>
                      {/* Aggregator orders are settled by the platform, so the
                          tender is online-paid by definition. Shown only when
                          the row really is an aggregator order. */}
                      {o.channel && <span className="cell-sub">(Online Paid)</span>}
                      {o.externalOrderId && (
                        <span className="cell-sub">#{o.externalOrderId}</span>
                      )}
                    </td>

                    <td>
                      <span className="cell-title">{orDash(o.outletName)}</span>
                      <span className="cell-sub">{orDash(o.channel && humanizeCode(o.channel))}</span>
                    </td>

                    <td>
                      <span className="cell-title">
                        {humanizeCode(o.orderType)}
                        {o.tableNumber ? ` (${o.tableNumber})` : ""}
                      </span>
                      <span className="cell-sub">
                        {o.riderName || o.riderPhone
                          ? `${o.riderName || "Rider"}${o.riderPhone ? ` · ${o.riderPhone}` : ""}`
                          : "No rider assigned"}
                      </span>
                    </td>

                    <td>
                      <span className="cell-title">{orDash(o.customerName)}</span>
                      {o.customerPhone ? (
                        <a className="call-link" href={`tel:${o.customerPhone}`}>
                          <IconPhone />
                          <span>Call Customer</span>
                        </a>
                      ) : (
                        <span className="cell-sub">No phone on file</span>
                      )}
                    </td>

                    <td className="otp-cell">
                      {o.otp ? <span className="otp-pill">{o.otp}</span> : <span className="cell-sub">—</span>}
                    </td>

                    <td className="datetime-cell">
                      <span className="dt-line">
                        <span className="dt-key">Created</span>
                        <span className="dt-val">{orDash(formatDateTime(o.createdAt))}</span>
                      </span>
                      <span className="dt-line">
                        <span className="dt-key">Received</span>
                        <span className="dt-val">{orDash(formatDateTime(o.receivedAt))}</span>
                      </span>
                      <span className="dt-line">
                        <span className="dt-key">Accepted</span>
                        <span className="dt-val">{orDash(formatDateTime(o.acceptedAt))}</span>
                      </span>
                      <span className="dt-line">
                        <span className="dt-key">Updated</span>
                        <span className="dt-val">{orDash(formatDateTime(o.updatedAt))}</span>
                      </span>
                    </td>

                    <td className="num total-cell">₹{formatMinor(o.grandTotalMinor)}</td>

                    <td>
                      <span className={`badge tone-${statusTone(o.status)}`}>
                        {humanizeCode(o.status)}
                      </span>
                    </td>

                    <td className="nowrap elapsed-cell">{o.elapsedMinutes} Min</td>

                    <td className="col-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="View order details"
                        aria-label={`View online order ${o.orderNo}`}
                        onClick={() => openOrder(o.id)}
                      >
                        <IconEye />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <span className="record-count">
            Showing {firstRecord} to {lastRecord} of {total} records
          </span>
          <div className="pager">
            <button type="button" className="page-btn" disabled={page === 1} onClick={() => setPage(1)}>
              First
            </button>
            <button
              type="button"
              className="page-btn"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="page-indicator">
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              className="page-btn"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
            <button
              type="button"
              className="page-btn"
              disabled={page >= pageCount}
              onClick={() => setPage(pageCount)}
            >
              Last
            </button>
          </div>
        </div>
      </section>

      <style jsx>{`
        .online-root {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: var(--bg-base);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .online-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .online-title {
          margin: 0 0 10px 0;
          font-size: 1.125rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }

        .channel-tabs {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
        }

        .channel-tab {
          min-height: 36px;
          padding: 0 20px;
          border: none;
          border-radius: var(--radius-pill);
          background: transparent;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .channel-tab:hover {
          color: var(--text-primary);
        }
        .channel-tab.is-active {
          background: var(--bg-card);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }

        .btn-primary,
        .btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 38px;
          padding: 0 16px;
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .btn-primary {
          border: 1px solid var(--dark-btn);
          background: var(--dark-btn);
          color: var(--bg-card);
        }
        .btn-primary:hover {
          background: var(--dark-btn-hover);
        }
        .btn-secondary {
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-primary);
        }
        .btn-secondary:hover {
          background: var(--bg-subtle);
        }

        .channel-tab:focus-visible,
        .btn-primary:focus-visible,
        .btn-secondary:focus-visible,
        .field-input:focus-visible,
        .page-btn:focus-visible,
        .icon-btn:focus-visible,
        .link-cell:focus-visible,
        .call-link:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .filter-card,
        .table-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 12px;
        }

        .filter-card {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 160px;
        }
        .field-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .field-input {
          min-height: 38px;
          width: 100%;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 0.8125rem;
        }
        select.field-input {
          cursor: pointer;
        }

        .filter-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
        }

        .online-error {
          padding: 10px 14px;
          border-radius: var(--radius-md);
          background: var(--destructive-subtle);
          color: var(--destructive-text);
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .table-scroll {
          overflow-x: auto;
        }

        .online-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8125rem;
        }

        .online-table th {
          background: var(--bg-card);
          padding: 10px 12px;
          text-align: left;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-primary);
          white-space: nowrap;
          border-bottom: 1px solid var(--border);
        }

        .online-table td {
          padding: 10px 12px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-subtle);
          vertical-align: top;
        }

        .online-table .num {
          text-align: right;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .total-cell {
          font-weight: 700;
        }
        .nowrap {
          white-space: nowrap;
        }
        .elapsed-cell {
          font-variant-numeric: tabular-nums;
          color: var(--text-secondary);
          font-weight: 600;
        }
        .col-actions {
          text-align: right;
          white-space: nowrap;
        }

        .data-row:hover td {
          background: var(--bg-hover);
        }

        .link-cell {
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          background: var(--bg-card);
          padding: 3px 10px;
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--text-primary);
          cursor: pointer;
          transition: border-color 0.15s ease, color 0.15s ease;
        }
        .link-cell:hover {
          border-color: var(--accent);
          color: var(--accent-subtle-text);
        }

        .cell-title {
          display: block;
          font-weight: 600;
        }
        .cell-sub {
          display: block;
          font-size: 0.6875rem;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .call-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 4px;
          min-height: 28px;
          padding: 2px 10px;
          border-radius: var(--radius-pill);
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          font-size: 0.75rem;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .call-link:hover {
          background: var(--bg-subtle);
        }

        .otp-cell {
          white-space: nowrap;
        }
        .otp-pill {
          display: inline-block;
          padding: 4px 12px;
          border-radius: var(--radius-sm);
          background: var(--warning-subtle);
          color: var(--warning-text);
          font-size: 0.875rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          font-variant-numeric: tabular-nums;
        }

        .datetime-cell {
          min-width: 220px;
        }
        .dt-line {
          display: flex;
          align-items: baseline;
          gap: 8px;
          font-size: 0.6875rem;
          line-height: 1.6;
        }
        .dt-key {
          width: 62px;
          flex-shrink: 0;
          color: var(--text-muted);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .dt-val {
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
        }

        .badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          font-size: 0.6875rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .tone-neutral {
          background: var(--bg-subtle);
          color: var(--text-secondary);
        }
        .tone-accent {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
        }
        .tone-warning {
          background: var(--warning-subtle);
          color: var(--warning-text);
        }
        .tone-danger {
          background: var(--destructive-subtle);
          color: var(--destructive-text);
        }
        .tone-info {
          background: var(--blue-subtle);
          color: var(--blue-text);
        }
        .tone-purple {
          background: var(--purple-subtle);
          color: var(--purple-text);
        }

        .icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .icon-btn:hover {
          background: var(--bg-subtle);
          color: var(--text-primary);
        }

        .state-cell {
          padding: 40px 12px;
          text-align: center;
          color: var(--text-muted);
        }

        .pagination-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 4px 4px 4px;
        }
        .record-count {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
        }
        .pager {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .page-indicator {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
          padding: 0 6px;
        }
        .page-btn {
          min-width: 34px;
          min-height: 32px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-secondary);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .page-btn:hover:not(:disabled) {
          background: var(--bg-subtle);
          color: var(--text-primary);
        }
        .page-btn:disabled {
          color: var(--text-muted);
          cursor: not-allowed;
        }

        @media (prefers-reduced-motion: reduce) {
          .channel-tab,
          .btn-primary,
          .btn-secondary,
          .icon-btn,
          .page-btn,
          .link-cell,
          .call-link {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
