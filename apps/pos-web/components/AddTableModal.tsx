import React, { useState } from "react";
import { authedFetch } from "../lib/auth";

interface AddTableModalProps {
  onClose: () => void;
  onTableCreated: () => void;
  existingTables?: string[];
}

export default function AddTableModal({ onClose, onTableCreated, existingTables = [] }: AddTableModalProps) {
  const [tableNumber, setTableNumber] = useState("");
  const [section, setSection] = useState("Non AC");
  const [capacity, setCapacity] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNum = tableNumber.trim();
    if (!trimmedNum) {
      setError("Table number is required.");
      return;
    }

    if (existingTables.some((t) => t.trim().toLowerCase() === trimmedNum.toLowerCase())) {
      setError(`Table "${trimmedNum}" already exists. Please enter a unique table number.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        tableNumber: trimmedNum,
        section: section.trim() || "Non AC",
        capacity: Number(capacity) || 4,
        isActive: true,
      };

      const res = await authedFetch(`/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to create table");
      }

      // Persist to local custom table registry
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("kapmeta_custom_tables") || "[]";
          const parsed = JSON.parse(raw);
          const newTable = {
            id: `tbl_${Date.now()}`,
            tableNumber: trimmedNum,
            capacity: Number(capacity) || 4,
            section: section.trim() || "Non AC",
            status: "VACANT",
            totalMinor: 0,
            elapsedMinutes: 0,
            itemCount: 0,
          };
          if (!parsed.some((t: any) => t.tableNumber.toLowerCase() === trimmedNum.toLowerCase())) {
            parsed.push(newTable);
            localStorage.setItem("kapmeta_custom_tables", JSON.stringify(parsed));
          }
        } catch {}
      }

      onTableCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not create table.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-table-backdrop" onClick={onClose}>
      <div className="add-table-card" onClick={(e) => e.stopPropagation()}>
        <div className="add-table-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.2rem", color: "#f97316" }}>➕</span>
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Add New Dining Table</h3>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: "16px" }}>
          {error && <div className="error-alert">{error}</div>}

          <div className="form-group">
            <label>Table Number / Code</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. A16, B31, C1, LADIES C"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginTop: "12px" }}>
            <label>Floor / Section</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="input-field"
            >
              <option value="AC">AC (Air Conditioned Hall)</option>
              <option value="Non AC">Non AC (Main Dining)</option>
              <option value="Other">Other (Family / Outdoor / Bar)</option>
              <option value="Roof Top">Roof Top</option>
              <option value="First Floor">First Floor</option>
            </select>
          </div>

          <div className="form-group" style={{ marginTop: "12px" }}>
            <label>Seating Capacity</label>
            <input
              type="number"
              min="1"
              max="50"
              className="input-field"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
            <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Creating..." : "Save Table"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .add-table-backdrop {
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
        .add-table-card {
          background: #ffffff;
          padding: 24px;
          border-radius: 12px;
          width: 90%;
          max-width: 440px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
        }
        .add-table-header {
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
        .input-field {
          width: 100%;
          padding: 9px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          margin-top: 6px;
          font-size: 0.875rem;
          background: #fff;
          outline: none;
        }
        .input-field:focus {
          border-color: #f97316;
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
          background: #f97316;
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
