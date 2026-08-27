// User-customizable shortcuts to frequently-used pages/actions. Real per-user
// rows in user_quick_links (see kapmeta/schema.prisma UserQuickLink model) —
// no hardcoded links per repo CLAUDE.md no-hardcode-data rule. The user picks
// from the pages their own Nav already shows them (permission-filtered) or
// types a free-text href, then the list is persisted via
// GET/POST/DELETE /quick-links on apps/api/src/routes/user-management.ts.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "../lib/auth";

// Kept in sync with the NAV_LINKS labels in ./Nav.tsx — used only to offer
// convenient picks in the "+ Add" prompt; the user can still type any href.
const SUGGESTED_PAGES: { href: string; label: string }[] = [
  { href: "/", label: "POS Terminal" },
  { href: "/kitchen", label: "KDS Kitchen Board" },
  { href: "/inventory", label: "Stock & 86-List" },
  { href: "/channel-availability", label: "Online Item Status" },
  { href: "/admin", label: "Sales Analytics" },
  { href: "/finance", label: "Finance & Z-Report" },
  { href: "/crm", label: "Customers & Loyalty" },
  { href: "/user-management", label: "User & Role Management" },
];

// Real response shape of GET/POST /quick-links (UserQuickLink rows scoped to
// the current user, serialized by apps/api/src/routes/user-management.ts).
interface QuickLinkApi {
  id: string;
  label: string;
  href: string;
  sortOrder: number;
}

export default function QuickLinks() {
  const [links, setLinks] = useState<QuickLinkApi[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/quick-links`);
      if (!res.ok) return;
      const data = (await res.json()) as QuickLinkApi[];
      setLinks(data);
    } catch {
      // best-effort — leave the last known list in place on a transient failure
    }
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

  async function addLink() {
    const pageList = SUGGESTED_PAGES.map((p, i) => `${i + 1}. ${p.label} (${p.href})`).join("\n");
    const choice = window.prompt(
      `Add a quick link.\n\nType a number to pick a page, or type/paste any URL or path:\n${pageList}`
    );
    if (!choice) return;

    const trimmed = choice.trim();
    const asIndex = Number(trimmed);
    let href: string;
    let label: string;

    if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= SUGGESTED_PAGES.length) {
      href = SUGGESTED_PAGES[asIndex - 1].href;
      label = SUGGESTED_PAGES[asIndex - 1].label;
    } else {
      href = trimmed;
      const suggested = SUGGESTED_PAGES.find((p) => p.href === href);
      label = suggested
        ? suggested.label
        : window.prompt("Label for this quick link?", href)?.trim() || href;
    }

    setLoading(true);
    try {
      const res = await authedFetch(`/quick-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, href }),
      });
      if (res.ok) {
        const created = (await res.json()) as QuickLinkApi;
        setLinks((prev) => [...prev, created]);
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }

  async function removeLink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await authedFetch(`/quick-links/${id}`, { method: "DELETE" });
    } catch {
      // best-effort — next load() reconciles if this failed
      load();
    }
  }

  return (
    <div className="quick-links" ref={containerRef}>
      <button
        type="button"
        className="quick-links-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick Links"
      >
        <span className="quick-links-icon">⭐</span>
        <span className="quick-links-label">Quick Links</span>
      </button>

      {open && (
        <div className="quick-links-dropdown">
          <div className="quick-links-dropdown-header">
            <span>Quick Links</span>
            <button type="button" className="quick-links-add-btn" onClick={addLink} disabled={loading}>
              + Add
            </button>
          </div>
          {links.length === 0 && <div className="quick-links-empty">No quick links yet.</div>}
          {links.map((link) => (
            <div key={link.id} className="quick-links-item">
              <a href={link.href} className="quick-links-item-link">
                {link.label}
              </a>
              <button
                type="button"
                className="quick-links-remove-btn"
                onClick={() => removeLink(link.id)}
                aria-label={`Remove ${link.label}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .quick-links {
          position: relative;
          width: 100%;
        }
        .quick-links-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 600;
          color: #334155;
          padding: 8px 12px;
          border-radius: 8px;
          transition: all 0.15s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .quick-links-trigger:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .quick-links-dropdown {
          position: absolute;
          left: 0;
          right: 0;
          bottom: calc(100% + 6px);
          width: 100%;
          max-height: 280px;
          overflow-y: auto;
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          z-index: 9999;
          box-sizing: border-box;
        }
        .quick-links-dropdown-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          font-weight: 700;
          font-size: 0.8rem;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          border-radius: 9px 9px 0 0;
        }
        .quick-links-add-btn {
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 5px;
          padding: 3px 8px;
          font-size: 0.72rem;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s ease;
        }
        .quick-links-add-btn:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .quick-links-add-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .quick-links-empty {
          padding: 14px 10px;
          color: #64748b;
          font-size: 0.78rem;
          text-align: center;
        }
        .quick-links-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 1px solid #f1f5f9;
          gap: 6px;
        }
        .quick-links-item:last-child {
          border-bottom: none;
        }
        .quick-links-item-link {
          font-size: 0.8rem;
          font-weight: 500;
          color: #1e293b;
          text-decoration: none;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .quick-links-item-link:hover {
          color: #2563eb;
          text-decoration: underline;
        }
        .quick-links-remove-btn {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          padding: 2px 4px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .quick-links-remove-btn:hover {
          color: #ef4444;
          background: #fee2e2;
        }
      `}</style>
    </div>
  );
}
