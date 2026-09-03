import React, { useState, useEffect } from "react";
import { fetchMyOutlets, OutletSummary } from "../../lib/auth";

interface InventoryHeaderProps {
  onOpenAgentStatus?: () => void;
  currentOutletName?: string;
  onOutletChange?: (outlet: OutletSummary) => void;
}

export default function InventoryHeader({
  onOpenAgentStatus,
  currentOutletName,
  onOutletChange,
}: InventoryHeaderProps) {
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<string>(currentOutletName || "Hotel Kapila");

  useEffect(() => {
    fetchMyOutlets()
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setOutlets(list);
          if (!currentOutletName) {
            setSelectedOutlet(list[0].name);
          }
        }
      })
      .catch((e) => console.error("Error loading outlets:", e));
  }, [currentOutletName]);

  return (
    <header style={styles.header}>
      {/* Left: Outlet Selector */}
      <div style={styles.outletContainer}>
        <div style={styles.outletBox}>
          <span style={styles.outletIcon}>🏢</span>
          <select
            value={selectedOutlet}
            onChange={(e) => {
              setSelectedOutlet(e.target.value);
              const found = outlets.find((o) => o.name === e.target.value);
              if (found && onOutletChange) onOutletChange(found);
            }}
            style={styles.outletSelect}
          >
            {outlets.length > 0 ? (
              outlets.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))
            ) : (
              <option value="Hotel Kapila">Hotel Kapila</option>
            )}
          </select>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>

      {/* Right: Actions */}
      <div style={styles.actionsContainer}>
        {/* AI Agent Button */}
        <button onClick={onOpenAgentStatus} style={styles.aiAgentBtn} title="View Multi-Agent & A2A Status">
          <span style={styles.aiSparkle}>🤖</span>
          <span style={styles.aiText}>AI Agent</span>
          <span style={styles.aiLiveBadge}>● LIVE</span>
        </button>

        {/* Notification Bell */}
        <button style={styles.iconBtn} title="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </button>

        {/* Integration Link */}
        <button style={styles.iconBtn} title="Sync Link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </button>

        {/* Settings Gear */}
        <button style={styles.iconBtn} title="Inventory Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    height: 58,
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #edf2f7",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    position: "sticky",
    top: 0,
    zIndex: 25,
  },
  outletContainer: {
    display: "flex",
    alignItems: "center",
  },
  outletBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "6px 12px",
    backgroundColor: "#ffffff",
  },
  outletIcon: {
    fontSize: "1rem",
  },
  outletSelect: {
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#0f172a",
    cursor: "pointer",
    paddingRight: 4,
  },
  actionsContainer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  aiAgentBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
    transition: "all 0.15s ease",
  },
  aiSparkle: {
    fontSize: "1.1rem",
  },
  aiText: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  aiLiveBadge: {
    fontSize: "0.65rem",
    fontWeight: 800,
    color: "#16a34a",
    backgroundColor: "#f0fdf4",
    padding: "2px 6px",
    borderRadius: 999,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 0.15s",
  },
};
