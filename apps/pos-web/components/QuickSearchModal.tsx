import React, { useState } from "react";
import { useRouter } from "next/router";
import { authedFetch } from "../lib/auth";

interface QuickSearchModalProps {
  type: "BILL" | "KOT";
  onClose: () => void;
}

/** Strips the "bill #", "order #", "kot #", "#" prefixes a cashier may type. */
function cleanQuery(raw: string, type: "BILL" | "KOT"): string {
  const pattern =
    type === "BILL" ? /^(bill\s*#?\s*|ord\s*#?\s*|order\s*#?\s*|#\s*)/i : /^(kot\s*#?\s*|#\s*)/i;
  return raw.trim().replace(pattern, "").trim();
}

export default function QuickSearchModal({ type, onClose }: QuickSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = query.trim();
    if (!raw) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    // Both endpoints filter server-side: GET /orders maps orderNumber/search
    // onto the repository's orderNumberSearch, and GET /kitchen/kot matches
    // ticketNumber (raw, cleaned and numeric-suffix forms). Re-filtering the
    // response here only ever threw away rows the server had already matched.
    const term = cleanQuery(raw, type) || raw;

    try {
      if (type === "BILL") {
        const qs = new URLSearchParams({ orderNumber: term, search: term, limit: "25" });
        const res = await authedFetch(`/orders?${qs.toString()}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.orders || (Array.isArray(data) ? data : [data]));
      } else {
        const qs = new URLSearchParams({ ticketNumber: term });
        const res = await authedFetch(`/kitchen/kot?${qs.toString()}`);
        if (!res.ok) throw new Error("KOT Search failed");
        const data = await res.json();
        setResults(Array.isArray(data) ? data : data.tickets || [data]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to find matching records");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const openResult = (res: any) => {
    onClose();
    if (type === "BILL") {
      router.push(`/pending-order-detail?orderId=${encodeURIComponent(res.id)}`);
    } else {
      const kotParam = res.ticketNumber || res.id;
      router.push(`/kitchen?kot=${encodeURIComponent(kotParam)}&kotId=${res.id}`);
    }
  };

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div
        className="search-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={type === "BILL" ? "Search bill or order number" : "Search kitchen order ticket"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="search-modal-header">
          <h3 className="search-modal-title">
            {type === "BILL" ? "Search Bill / Order Number" : "Search Kitchen Order Ticket (KOT)"}
          </h3>
          <button type="button" className="close-btn" aria-label="Close search" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            className="search-input"
            autoFocus
            placeholder={type === "BILL" ? "Enter bill / order number" : "Enter KOT number"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="search-submit-btn" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {error && <div className="search-error">{error}</div>}

        <div className="search-results-container">
          {results.length === 0 && !loading && (
            <div className="empty-results">
              {hasSearched
                ? `No matching ${type === "BILL" ? "orders" : "KOT tickets"} found.`
                : "Type a number and press search."}
            </div>
          )}

          {results.map((res, i) => (
            <button
              key={res.id || i}
              type="button"
              className="result-row"
              onClick={() => openResult(res)}
            >
              <span className="result-main">
                <span className="result-title">
                  {type === "BILL"
                    ? res.orderNumber || res.id
                    : res.ticketNumber || `KOT ${res.id}`}
                </span>
                <span className="result-sub">
                  Status: <span className="result-status">{res.status}</span>
                  {" · "}
                  Table: {res.tableNumber || res.diningTableId || "Direct"}
                </span>
              </span>
              <span className="result-amount">
                {res.grandTotalMinor
                  ? `₹${(Number(res.grandTotalMinor) / 100).toFixed(2)}`
                  : "View"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        .search-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 150;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        /* Scrim from a token rather than a literal colour value. */
        .search-modal-backdrop::before {
          content: "";
          position: absolute;
          inset: 0;
          background: var(--dark-btn);
          opacity: 0.5;
        }
        .search-modal-card {
          position: relative;
          z-index: 1;
          background: var(--bg-card);
          padding: 20px;
          border-radius: var(--radius-lg);
          width: 100%;
          max-width: 480px;
          box-shadow: var(--shadow-modal);
        }
        .search-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .search-modal-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .close-btn {
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
        .close-btn:hover {
          background: var(--bg-subtle);
          color: var(--text-primary);
        }
        .search-form {
          margin-top: 16px;
          display: flex;
          gap: 8px;
        }
        .search-input {
          flex: 1;
          min-height: 44px;
          padding: 0 14px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 0.875rem;
          outline: none;
        }
        .search-submit-btn {
          min-height: 44px;
          padding: 0 20px;
          border: 1px solid var(--dark-btn);
          border-radius: var(--radius-md);
          background: var(--dark-btn);
          color: var(--bg-card);
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .search-submit-btn:hover:not(:disabled) {
          background: var(--dark-btn-hover);
        }
        .search-submit-btn:disabled {
          cursor: progress;
        }
        .search-input:focus-visible,
        .search-submit-btn:focus-visible,
        .close-btn:focus-visible,
        .result-row:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .search-error {
          margin-top: 10px;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          background: var(--destructive-subtle);
          color: var(--destructive-text);
          font-size: 0.75rem;
          font-weight: 600;
        }
        .search-results-container {
          margin-top: 16px;
          max-height: 260px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .empty-results {
          color: var(--text-muted);
          font-size: 0.8125rem;
          text-align: center;
          padding: 24px 0;
        }
        .result-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          min-height: 48px;
          padding: 10px 12px;
          text-align: left;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .result-row:hover {
          background: var(--bg-hover);
          border-color: var(--accent);
        }
        .result-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .result-title {
          font-weight: 700;
          font-size: 0.875rem;
          color: var(--text-primary);
        }
        .result-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .result-status {
          font-weight: 600;
          color: var(--text-secondary);
        }
        .result-amount {
          font-weight: 700;
          font-size: 0.875rem;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        @media (prefers-reduced-motion: reduce) {
          .close-btn,
          .search-submit-btn,
          .result-row {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
