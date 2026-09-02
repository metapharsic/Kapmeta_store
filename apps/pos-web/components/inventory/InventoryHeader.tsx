import React, { useState } from "react";
import Link from "next/link";
import OutletSwitcher from "../OutletSwitcher";
import NotificationBell from "../NotificationBell";
import A2aAgentStatusDrawer from "../A2aAgentStatusDrawer";

// Top navbar for the Inventory & Supply Chain section. Reuses the same
// real, self-contained components already wired into the app's other admin
// surfaces (apps/pos-web/pages/admin.tsx) rather than re-implementing an
// outlet switcher or notification feed here:
//   - OutletSwitcher: GET /auth/outlets/mine + POST /auth/switch-outlet
//   - NotificationBell: GET /notifications
// The AI Agent button owns the A2aAgentStatusDrawer instance and its own
// open/close state, so any page can drop <InventoryHeader /> in without
// separately wiring the drawer.
export default function InventoryHeader() {
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);

  return (
    <>
      <header className="topbar inventory-topbar">
        <div className="topbar-left">
          <div className="brand-badge">
            <span className="brand-icon">📦</span>
            <span className="brand-name">Inventory &amp; Supply Chain</span>
          </div>
          <OutletSwitcher />
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="agent-status-btn"
            onClick={() => setIsAgentDrawerOpen(true)}
            title="Open A2A Multi-Agent Status"
          >
            <span aria-hidden="true">🤖</span>
            <span>AI Agent</span>
          </button>

          <NotificationBell />

          <Link href="/settings/company" className="settings-icon-btn" title="Settings" aria-label="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </Link>
        </div>
      </header>

      <A2aAgentStatusDrawer isOpen={isAgentDrawerOpen} onClose={() => setIsAgentDrawerOpen(false)} />

      <style jsx>{`
        .inventory-topbar {
          gap: 16px;
        }
        .agent-status-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--dark-btn);
          color: #ffffff;
          border: none;
          padding: 8px 14px;
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .agent-status-btn:hover {
          background: var(--dark-btn-hover);
        }
        .agent-status-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .settings-icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
          flex-shrink: 0;
        }
        .settings-icon-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .settings-icon-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .agent-status-btn,
          .settings-icon-btn {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
