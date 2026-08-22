import React, { useEffect, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard, getApiBase } from "../lib/auth";
import Nav from "../components/Nav";

interface ChannelAccount {
  id: string;
  channel: string;
  externalOutletId: string;
  status: "ACTIVE" | "PAUSED" | "REVOKED";
  connectedAt: string | null;
  hasCredentials: boolean;
}

// Only channels with a real adapter registered in services/integration-hub
// (packages/shared-types/channel.ts ChannelCode) show up here — adding a
// third card with no backend adapter would just be a dead button.
const SUPPORTED_CHANNELS = [
  { code: "SWIGGY", label: "Swiggy", color: "#fc8019", icon: "🧡" },
  { code: "ZOMATO", label: "Zomato", color: "#e23744", icon: "❤️" },
];

export default function Integrations() {
  const { loading: authLoading } = useAuthGuard("integration.manage");
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingChannel, setConnectingChannel] = useState<string | null>(null);
  const [externalOutletId, setExternalOutletId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedChannel, setCopiedChannel] = useState<string | null>(null);

  const fetchAccounts = async () => {
    try {
      const res = await authedFetch("/integration/integrations/channels");
      if (res.ok) setAccounts(await res.json());
    } catch (e) {
      console.error("Failed to fetch channel accounts", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchAccounts();
  }, [authLoading]);

  const openConnect = (channel: string) => {
    setConnectingChannel(channel);
    setExternalOutletId("");
    setApiKey("");
    setApiSecret("");
    setFormError(null);
  };

  const submitConnect = async () => {
    if (!connectingChannel) return;
    if (!externalOutletId || !apiKey || !apiSecret) {
      setFormError("All fields required");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await authedFetch(`/integration/integrations/channels/${connectingChannel}/connect`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalOutletId, apiKey, apiSecret }),
      });
      if (res.ok) {
        setConnectingChannel(null);
        fetchAccounts();
      } else {
        const err = await res.json();
        setFormError(err.error || "Connect failed");
      }
    } catch (e) {
      setFormError("Network error connecting channel");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (accountId: string) => {
    if (!confirm("Disconnect this channel? Menu mappings stay intact — you can reconnect any time.")) return;
    try {
      const res = await authedFetch(`/integration/integrations/channels/${accountId}/disconnect`, { method: "POST" });
      if (res.ok) fetchAccounts();
    } catch (e) {
      console.error("Failed to disconnect", e);
    }
  };

  const copyWebhookUrl = (channel: string) => {
    const url = `${getApiBase()}/webhooks/${channel.toLowerCase()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedChannel(channel);
      setTimeout(() => setCopiedChannel(null), 2000);
    });
  };

  if (authLoading) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg-base, #f8fafc)" }}>
      <Head>
        <title>Kapmeta POS - Connect Delivery Apps</title>
      </Head>
      <Nav variant="sidebar" />
      <div style={{ flex: 1, padding: 24, maxWidth: 760, margin: "0 auto", width: "100%" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 4 }}>Connect Delivery Apps</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary, #64748b)", marginBottom: 20 }}>
          Link Swiggy/Zomato so their orders drop straight into Live Orders and fire to the kitchen automatically.
        </p>

        {loading ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>Loading...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {SUPPORTED_CHANNELS.map((ch) => {
              const account = accounts.find((a) => a.channel === ch.code);
              const isConnected = account?.status === "ACTIVE";
              const isPaused = account?.status === "PAUSED";

              return (
                <div
                  key={ch.code}
                  style={{
                    background: "var(--bg-card, #fff)",
                    border: "1px solid var(--border, #e2e8f0)",
                    borderRadius: 12,
                    padding: 18,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "1.5rem" }}>{ch.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{ch.label}</div>
                        {account && (
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted, #94a3b8)" }}>
                            Outlet ID: {account.externalOutletId}
                          </div>
                        )}
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: 9999,
                        background: isConnected ? "var(--accent-subtle, #ecfdf5)" : isPaused ? "var(--warning-subtle, #fffbeb)" : "var(--bg-subtle, #f1f5f9)",
                        color: isConnected ? "var(--accent-subtle-text, #065f46)" : isPaused ? "var(--warning-text, #92400e)" : "var(--text-muted, #94a3b8)",
                      }}
                    >
                      {isConnected ? "● Connected" : isPaused ? "◐ Paused" : "○ Not Connected"}
                    </span>
                  </div>

                  {account && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "var(--bg-subtle, #f1f5f9)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: "0.72rem",
                      }}
                    >
                      <code style={{ color: "var(--text-secondary, #64748b)" }}>
                        Webhook URL: /webhooks/{ch.code.toLowerCase()}
                      </code>
                      <button
                        onClick={() => copyWebhookUrl(ch.code)}
                        style={{
                          border: "none",
                          background: "var(--bg-card, #fff)",
                          borderRadius: 6,
                          padding: "4px 8px",
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {copiedChannel === ch.code ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => openConnect(ch.code)}
                      style={{
                        flex: 1,
                        padding: "8px 16px",
                        borderRadius: 9999,
                        border: "none",
                        background: ch.color,
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      {account ? "Reconnect / Rotate Key" : "Connect"}
                    </button>
                    {isConnected && (
                      <button
                        onClick={() => disconnect(account!.id)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 9999,
                          border: "1px solid var(--border, #e2e8f0)",
                          background: "transparent",
                          color: "var(--destructive, #ef4444)",
                          fontWeight: 700,
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {connectingChannel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{ background: "var(--bg-card, #fff)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800 }}>
                Connect {SUPPORTED_CHANNELS.find((c) => c.code === connectingChannel)?.label}
              </h2>
              <button onClick={() => setConnectingChannel(null)} style={{ border: "none", background: "none", fontSize: "1.25rem", cursor: "pointer" }}>
                ×
              </button>
            </div>

            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary, #64748b)", marginBottom: 16 }}>
              Find these in your {SUPPORTED_CHANNELS.find((c) => c.code === connectingChannel)?.label} partner dashboard under API/Integration settings.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Restaurant/Outlet ID on the platform</label>
                <input
                  type="text"
                  value={externalOutletId}
                  onChange={(e) => setExternalOutletId(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border, #e2e8f0)", fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: 4 }}>API Key</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border, #e2e8f0)", fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: 4 }}>API Secret</label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border, #e2e8f0)", fontSize: "0.85rem" }}
                />
              </div>

              {formError && <div style={{ fontSize: "0.75rem", color: "var(--destructive, #ef4444)" }}>{formError}</div>}

              <button
                onClick={submitConnect}
                disabled={saving}
                style={{
                  padding: "10px",
                  borderRadius: 9999,
                  border: "none",
                  background: "var(--dark-btn, #0f172a)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                {saving ? "Connecting..." : "Save & Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
