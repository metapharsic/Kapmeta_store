import React, { useEffect, useRef, useState, useCallback } from "react";
import { authedFetch } from "../lib/auth";

const POLL_INTERVAL_MS = 30000;

// Real response shape of GET /notifications (services/notifications/src's
// NotificationRecord, serialized by apps/api/src/routes/notifications.ts).
interface NotificationApi {
  id: string;
  outletId: string;
  userId: string | null;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationApi[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [desktopEnabled, setDesktopEnabled] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Load desktop enabled setting from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("kapmeta_desktop_notifications_enabled");
      setDesktopEnabled(saved === "true");
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/notifications`);
      if (!res.ok) return;
      const data = (await res.json()) as NotificationApi[];
      setNotifications(data);
    } catch {
      // best-effort — leave the last known list in place on a transient failure
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  // Effect to handle browser notification dispatch
  useEffect(() => {
    if (notifications.length === 0) return;

    const isFirstLoad = seenIdsRef.current.size === 0;
    let newUnreadFound = false;

    notifications.forEach((n) => {
      if (!seenIdsRef.current.has(n.id)) {
        seenIdsRef.current.add(n.id);
        // Only trigger alerts for new unread notifications (not on initial load)
        if (!isFirstLoad && !n.isRead) {
          newUnreadFound = true;
          if (
            desktopEnabled &&
            typeof window !== "undefined" &&
            "Notification" in window &&
            window.Notification.permission === "granted"
          ) {
            try {
              new window.Notification(n.title, {
                body: n.message,
                tag: n.id,
              });
            } catch (err) {
              console.error("Failed to trigger browser notification", err);
            }
          }
        }
      }
    });
  }, [notifications, desktopEnabled]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await authedFetch(`/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      // best-effort — next poll will reconcile if this failed
    }
  }

  const toggleDesktop = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("This browser does not support desktop notifications.");
      return;
    }

    if (desktopEnabled) {
      setDesktopEnabled(false);
      window.localStorage.setItem("kapmeta_desktop_notifications_enabled", "false");
    } else {
      try {
        const permission = await window.Notification.requestPermission();
        if (permission === "granted") {
          setDesktopEnabled(true);
          window.localStorage.setItem("kapmeta_desktop_notifications_enabled", "true");
          new window.Notification("Notifications Enabled", {
            body: "You will now receive desktop alerts for important events.",
          });
        } else {
          alert("Permission denied. Please enable notifications in your browser settings to receive alerts.");
        }
      } catch (err) {
        console.error("Failed to request notification permission", err);
      }
    }
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <span className="notification-bell-icon">🔔</span>
        {unreadCount > 0 && <span className="notification-bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-bell-dropdown">
          <div className="notification-bell-dropdown-header">
            <span>Notifications</span>
            <button
              type="button"
              onClick={toggleDesktop}
              className="desktop-alert-toggle"
              style={{
                background: desktopEnabled ? "#ecfdf5" : "#f1f5f9",
                color: desktopEnabled ? "#065f46" : "#64748b",
                border: desktopEnabled ? "1px solid #10b981" : "1px solid #cbd5e1",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "0.6875rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                minHeight: "32px",
              }}
            >
              🔔 {desktopEnabled ? "Alerts: ON" : "Alerts: OFF"}
            </button>
          </div>
          {notifications.length === 0 && (
            <div className="notification-bell-empty">No notifications yet.</div>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notification-bell-item${n.isRead ? "" : " unread"}`}
              onClick={() => !n.isRead && markRead(n.id)}
            >
              <div className="notification-bell-item-title">{n.title}</div>
              <div className="notification-bell-item-message">{n.message}</div>
              <div className="notification-bell-item-time">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .notification-bell {
          position: relative;
        }
        .notification-bell-trigger {
          position: relative;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1.25rem;
          padding: 6px;
          line-height: 1;
        }
        .notification-bell-badge {
          position: absolute;
          top: 0;
          right: 0;
          background: #e53935;
          color: #fff;
          border-radius: 999px;
          font-size: 0.65rem;
          font-weight: 700;
          padding: 1px 5px;
          min-width: 16px;
          text-align: center;
        }
        .notification-bell-dropdown {
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          width: 320px;
          max-height: 400px;
          overflow-y: auto;
          background: #fff;
          color: #1a1a1a;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
          z-index: 100;
        }
        .notification-bell-dropdown-header {
          padding: 12px 16px;
          font-weight: 700;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .notification-bell-empty {
          padding: 16px;
          color: #888;
          font-size: 0.9rem;
        }
        .notification-bell-item {
          padding: 10px 16px;
          border-bottom: 1px solid #f2f2f2;
          cursor: pointer;
        }
        .notification-bell-item.unread {
          background: #f5f8ff;
        }
        .notification-bell-item-title {
          font-weight: 600;
          font-size: 0.85rem;
        }
        .notification-bell-item-message {
          font-size: 0.8rem;
          color: #555;
          margin-top: 2px;
        }
        .notification-bell-item-time {
          font-size: 0.7rem;
          color: #999;
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
