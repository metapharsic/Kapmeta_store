import React, { useState } from "react";
import { authedFetch } from "../lib/auth";

interface TableOption {
  id: string;
  tableNumber: string;
  section: string | null;
  status: string;
  currentOrder?: {
    id: string;
    kots?: { id: string; ticketNumber: string; status: string }[];
  } | null;
}

interface MoveKotModalProps {
  tables: TableOption[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function MoveKotModal({ tables, onClose, onSuccess }: MoveKotModalProps) {
  const [sourceTableId, setSourceTableId] = useState("");
  const [targetTableId, setTargetTableId] = useState("");
  const [transferMode, setTransferMode] = useState<"FULL_TABLE" | "KOT">("FULL_TABLE");
  const [kotTicketId, setKotTicketId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Source tables can be any occupied table, or any table with active orders, or fallback to all tables
  const occupiedTables = tables.filter((t) => t.status === "OCCUPIED" || t.status === "RESERVED" || t.status !== "VACANT");
  const availableSourceTables = occupiedTables.length > 0 ? occupiedTables : tables;
  const vacantTables = tables.filter((t) => t.id !== sourceTableId);
  const sourceKots = tables.find((t) => t.id === sourceTableId)?.currentOrder?.kots || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTableId || !targetTableId) {
      setError("Please select both source and target tables.");
      return;
    }
    if (transferMode === "KOT" && !kotTicketId) {
      setError("Select the KOT ticket to move.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/tables/transfer`, {
        method: "POST",
        body: JSON.stringify({
          sourceTableId,
          targetTableId,
          transferMode,
          kotTicketId: transferMode === "KOT" ? kotTicketId : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to transfer table/KOT");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Transfer failed. Please check table statuses.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="move-modal-backdrop" onClick={onClose}>
      <div className="move-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="move-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.2rem", color: "#3b82f6" }}>⇄</span>
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Move KOT / Transfer Table</h3>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: "16px" }}>
          {error && <div className="error-alert">{error}</div>}

          <div className="form-group">
            <label>Transfer Type</label>
            <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="transferMode"
                  value="FULL_TABLE"
                  checked={transferMode === "FULL_TABLE"}
                  onChange={() => setTransferMode("FULL_TABLE")}
                />
                Move Entire Table (Merge / Switch)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="transferMode"
                  value="KOT"
                  checked={transferMode === "KOT"}
                  onChange={() => setTransferMode("KOT")}
                />
                Transfer Specific KOT Only
              </label>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: "14px" }}>
            <label>Source Table (From)</label>
            <select
              value={sourceTableId}
              onChange={(e) => {
                setSourceTableId(e.target.value);
                setKotTicketId("");
              }}
              className="select-field"
              required
            >
              <option value="">Select source table...</option>
              {availableSourceTables.map((t) => (
                <option key={t.id} value={t.id}>
                  Table {t.tableNumber} ({t.section || "General"}) - {t.status}
                </option>
              ))}
            </select>
          </div>

          {transferMode === "KOT" && (
            <div className="form-group" style={{ marginTop: "14px" }}>
              <label>KOT Ticket</label>
              <select
                value={kotTicketId}
                onChange={(e) => setKotTicketId(e.target.value)}
                className="select-field"
                required
              >
                <option value="">Select KOT to move...</option>
                {sourceKots.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.ticketNumber} — {k.status}
                  </option>
                ))}
              </select>
              {sourceTableId && sourceKots.length === 0 && (
                <p style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "6px" }}>
                  No live KOTs on that table. Use Move Entire Table instead.
                </p>
              )}
            </div>
          )}

          <div className="form-group" style={{ marginTop: "14px" }}>
            <label>Target Table (To)</label>
            <select
              value={targetTableId}
              onChange={(e) => setTargetTableId(e.target.value)}
              className="select-field"
              required
            >
              <option value="">Select destination table...</option>
              {vacantTables.map((t) => (
                <option key={t.id} value={t.id}>
                  Table {t.tableNumber} ({t.section || "General"}) - {t.status}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "24px" }}>
            <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Transferring..." : "Confirm Transfer"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .move-modal-backdrop {
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
        .move-modal-card {
          background: #ffffff;
          padding: 24px;
          border-radius: 12px;
          width: 90%;
          max-width: 480px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
        }
        .move-modal-header {
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
        .form-group label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
        }
        .select-field {
          width: 100%;
          padding: 9px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          margin-top: 6px;
          font-size: 0.875rem;
          background: #fff;
          outline: none;
        }
        .select-field:focus {
          border-color: #2563eb;
        }
        .error-alert {
          background: #fef2f2;
          color: #dc2626;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.8125rem;
          margin-bottom: 12px;
        }
        .btn-cancel {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-submit {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
