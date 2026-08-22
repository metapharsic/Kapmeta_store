import React, { useState } from "react";

interface QueuedKot {
  id: string;
  tableNumber: string;
  itemCount: number;
  createdAt: string;
  errorMessage?: string;
}

interface UnsuccessfulKotModalProps {
  queuedKots: QueuedKot[];
  onClose: () => void;
  onRetryAll: () => void;
  onClearAll: () => void;
}

export default function UnsuccessfulKotModal({
  queuedKots,
  onClose,
  onRetryAll,
  onClearAll,
}: UnsuccessfulKotModalProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await onRetryAll();
    setRetrying(false);
  };

  return (
    <div className="unsuccessful-modal-backdrop" onClick={onClose}>
      <div className="unsuccessful-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.25rem", color: "#dc2626" }}>⚠️</span>
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Unsuccessful KOT Queue</h3>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <p style={{ margin: "8px 0 12px 0", fontSize: "0.8125rem", color: "#64748b" }}>
          Orders taken during offline LAN disconnections waiting to sync with POS server / KDS.
        </p>

        <div className="kot-queue-list">
          {queuedKots.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#16a34a" }}>
              ✓ All KOTs successfully synced with the Kitchen POS Server.
            </div>
          ) : (
            queuedKots.map((k) => (
              <div key={k.id} className="queued-item-row">
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#0f172a" }}>
                    Table {k.tableNumber} • {k.itemCount} items
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "2px" }}>
                    {k.errorMessage || "Network timeout / POS unreachable"}
                  </div>
                </div>
                <div style={{ fontSize: "0.6875rem", color: "#94a3b8" }}>
                  {new Date(k.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
          {queuedKots.length > 0 && (
            <button type="button" className="btn-clear" onClick={onClearAll}>
              Clear Queue
            </button>
          )}
          <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
            <button type="button" className="btn-close" onClick={onClose}>
              Close
            </button>
            {queuedKots.length > 0 && (
              <button
                type="button"
                className="btn-retry"
                onClick={handleRetry}
                disabled={retrying}
              >
                {retrying ? "Retrying..." : "Sync / Retry All"}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .unsuccessful-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.5);
          z-index: 250;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .unsuccessful-modal-card {
          background: #ffffff;
          padding: 24px;
          border-radius: 12px;
          width: 90%;
          max-width: 480px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
          max-height: 80vh;
          display: flex;
          flex-direction: column;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .close-btn {
          background: transparent;
          border: none;
          font-size: 1.1rem;
          cursor: pointer;
        }
        .kot-queue-list {
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .queued-item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          border-radius: 6px;
        }
        .btn-clear {
          background: #fee2e2;
          color: #991b1b;
          border: none;
          padding: 8px 14px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .btn-close {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .btn-retry {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.8125rem;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
