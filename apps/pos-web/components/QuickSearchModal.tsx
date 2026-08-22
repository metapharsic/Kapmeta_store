import React, { useState } from "react";
import { useRouter } from "next/router";
import { authedFetch } from "../lib/auth";

interface QuickSearchModalProps {
  type: "BILL" | "KOT";
  onClose: () => void;
}

export default function QuickSearchModal({ type, onClose }: QuickSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      if (type === "BILL") {
        const res = await authedFetch(`/orders?orderNumber=${encodeURIComponent(query.trim())}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.orders || (Array.isArray(data) ? data : []));
      } else {
        const res = await authedFetch(`/kitchen/kot?ticketNumber=${encodeURIComponent(query.trim())}`);
        if (!res.ok) throw new Error("KOT Search failed");
        const data = await res.json();
        setResults(Array.isArray(data) ? data : [data]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to find matching records");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-header">
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
            {type === "BILL" ? "🔍 Search Bill / Order Number" : "🍳 Search Kitchen Order Ticket (KOT)"}
          </h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSearch} style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
          <input
            type="text"
            className="search-input"
            autoFocus
            placeholder={type === "BILL" ? "Enter Bill # (e.g. ORD-2026-001)" : "Enter KOT # (e.g. KOT-101)"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="search-submit-btn" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {error && <div className="search-error">{error}</div>}

        <div className="search-results-container">
          {results.length === 0 && !loading && (
            <div className="empty-results">Type a number and press search to locate orders/KOTs.</div>
          )}

          {results.map((res, i) => (
            <div
              key={res.id || i}
              className="result-row"
              onClick={() => {
                onClose();
                if (type === "BILL") {
                  router.push(`/orders?id=${res.id}`);
                } else {
                  router.push(`/kitchen?kotId=${res.id}`);
                }
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>
                  {type === "BILL" ? (res.orderNumber || res.id) : (res.ticketNumber || `KOT #${res.id}`)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  Status: <span style={{ fontWeight: 600, color: "#2563eb" }}>{res.status}</span> • Table: {res.diningTableId || res.tableNumber || "Direct"}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: "#16a34a" }}>
                {res.grandTotalMinor ? `₹${(Number(res.grandTotalMinor) / 100).toFixed(2)}` : "View →"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .search-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.5);
          z-index: 150;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .search-modal-card {
          background: #ffffff;
          padding: 20px;
          border-radius: 12px;
          width: 90%;
          max-width: 480px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
        }
        .search-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .close-btn {
          background: transparent;
          border: none;
          font-size: 1.1rem;
          cursor: pointer;
          color: #64748b;
        }
        .search-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.875rem;
          outline: none;
        }
        .search-input:focus {
          border-color: #2563eb;
        }
        .search-submit-btn {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 10px 18px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
        }
        .search-error {
          color: #dc2626;
          background: #fef2f2;
          padding: 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          margin-top: 10px;
        }
        .search-results-container {
          margin-top: 16px;
          max-height: 250px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .empty-results {
          color: #94a3b8;
          font-size: 0.8125rem;
          text-align: center;
          padding: 24px 0;
        }
        .result-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          cursor: pointer;
        }
        .result-row:hover {
          background: #eff6ff;
          border-color: #bfdbfe;
        }
      `}</style>
    </div>
  );
}
