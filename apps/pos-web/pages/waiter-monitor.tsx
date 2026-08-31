import React, { useEffect, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../lib/auth";
import Nav from "../components/Nav";

interface ActiveWaiter {
  userId: string;
  name: string;
  lastSeenAt: string;
  activeTables: string[];
}

export default function WaiterMonitor() {
  const { loading: authLoading } = useAuthGuard("report.read");
  const [waiters, setWaiters] = useState<ActiveWaiter[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActive = async () => {
    try {
      const res = await authedFetch("/waiters/active");
      if (res.ok) setWaiters(await res.json());
    } catch (e) {
      console.error("Failed to fetch active waiters", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchActive();
    const interval = setInterval(fetchActive, 10000);
    return () => clearInterval(interval);
  }, [authLoading]);

  if (authLoading) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg-base, #f8fafc)" }}>
      <Head>
        <title>KapMeta POS - Floor Monitor</title>
      </Head>
      <Nav variant="sidebar" />
      <div style={{ flex: 1, padding: 24, maxWidth: 900, margin: "0 auto", width: "100%" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 4 }}>Waiter Floor Monitor</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary, #64748b)", marginBottom: 20 }}>
          Live — who's logged in right now and which tables they're handling. Refreshes every 10s.
        </p>

        {loading ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>Loading...</p>
        ) : waiters.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>No waiters currently active on the floor.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {waiters.map((w) => (
              <div
                key={w.userId}
                style={{
                  background: "var(--bg-card, #fff)",
                  border: "1px solid var(--border, #e2e8f0)",
                  borderRadius: 12,
                  padding: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#10b981", marginRight: 8 }} />
                    {w.name}
                  </div>
                  <div suppressHydrationWarning style={{ fontSize: "0.72rem", color: "var(--text-muted, #94a3b8)", marginTop: 4 }}>
                    Last seen {new Date(w.lastSeenAt).toLocaleTimeString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "50%" }}>
                  {w.activeTables.length === 0 ? (
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted, #94a3b8)" }}>No active tables</span>
                  ) : (
                    w.activeTables.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          background: "var(--accent-subtle, #ecfdf5)",
                          color: "var(--accent-subtle-text, #065f46)",
                          padding: "3px 8px",
                          borderRadius: 9999,
                        }}
                      >
                        {t}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
