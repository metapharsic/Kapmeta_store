import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchMyOutlets, getSession, switchOutlet, type OutletSummary } from "../lib/auth";

// Real multi-outlet switcher. Outlets come from GET /auth/outlets/mine
// (apps/api/src/routes/auth.ts), which queries the user's real UserRole
// grants — never a hardcoded list, per repo CLAUDE.md no-hardcode-data rule.
// Switching calls POST /auth/switch-outlet, which re-validates the grant
// server-side and mints a fresh token scoped to the chosen outlet, then
// reloads so every screen re-fetches data for the new outlet.
export default function OutletSwitcher() {
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [currentOutletId, setCurrentOutletId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const session = getSession();
    setCurrentOutletId(session?.outletId ?? null);
    const list = await fetchMyOutlets();
    setOutlets(list);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleSwitch(outletId: string) {
    if (outletId === currentOutletId || switching) return;
    setSwitching(true);
    setError(null);
    const result = await switchOutlet(outletId);
    if (result.ok === false) {
      setError(result.error);
      setSwitching(false);
      return;
    }
    window.location.reload();
  }

  // Nothing to switch between — don't show the control for a single-outlet user.
  if (outlets.length <= 1 && !error) {
    return null;
  }

  const current = outlets.find((o) => o.id === currentOutletId);

  return (
    <div className="outlet-switcher" ref={containerRef}>
      <button
        type="button"
        className="outlet-switcher-trigger"
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        aria-label="Switch outlet"
      >
        <span className="outlet-switcher-icon">🏢</span>
        <span className="outlet-switcher-label">{switching ? "Switching..." : current?.name ?? "Select outlet"}</span>
        <span className="outlet-switcher-caret">▾</span>
      </button>

      {open && (
        <div className="outlet-switcher-dropdown">
          <div className="outlet-switcher-dropdown-header">Switch outlet</div>
          {error && <div className="outlet-switcher-error">{error}</div>}
          {outlets.map((outlet) => (
            <button
              key={outlet.id}
              type="button"
              className={`outlet-switcher-item ${outlet.id === currentOutletId ? "active" : ""}`}
              onClick={() => handleSwitch(outlet.id)}
              disabled={switching}
            >
              <span className="outlet-switcher-item-name">{outlet.name}</span>
              <span className="outlet-switcher-item-code">{outlet.code}</span>
              {outlet.id === currentOutletId && <span className="outlet-switcher-item-check">✓</span>}
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .outlet-switcher {
          position: relative;
        }

        .outlet-switcher-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }

        .outlet-switcher-trigger:hover:not(:disabled) {
          border-color: #2563eb;
        }

        .outlet-switcher-trigger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .outlet-switcher-icon {
          font-size: 14px;
        }

        .outlet-switcher-label {
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .outlet-switcher-caret {
          font-size: 10px;
          color: #94a3b8;
        }

        .outlet-switcher-dropdown {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          width: 260px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
          z-index: 50;
          overflow: hidden;
        }

        .outlet-switcher-dropdown-header {
          padding: 10px 14px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #94a3b8;
          border-bottom: 1px solid #f1f5f9;
        }

        .outlet-switcher-error {
          padding: 8px 14px;
          font-size: 12px;
          color: #991b1b;
          background: #fef2f2;
        }

        .outlet-switcher-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: transparent;
          border: none;
          text-align: left;
          cursor: pointer;
          font-size: 13px;
          color: #0f172a;
        }

        .outlet-switcher-item:hover:not(:disabled) {
          background: #f8fafc;
        }

        .outlet-switcher-item:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .outlet-switcher-item.active {
          background: #eff6ff;
        }

        .outlet-switcher-item-name {
          flex: 1;
          font-weight: 600;
        }

        .outlet-switcher-item-code {
          font-size: 11px;
          color: #94a3b8;
        }

        .outlet-switcher-item-check {
          color: #2563eb;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
