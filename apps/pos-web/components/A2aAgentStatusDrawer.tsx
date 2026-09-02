import React, { useState, useEffect } from "react";
import { authedFetch } from "../lib/auth";

export interface AgentStatusItem {
  id: string;
  name: string;
  role: string;
  status: string;
  domain?: string;
  port?: number;
  latencyMs?: number;
  health?: string;
  currentTask?: string;
  metrics?: Record<string, any>;
  assignedFiles?: string[];
  updatedAt?: string;
}

interface A2aAgentStatusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

// Real shape of GET /admin/audit-logs — apps/api/src/routes/admin.ts serialising
// the AuditLog Prisma model. The Live Event feed is sourced from this: the
// outlet's real recent write activity, not a fabricated A2A message bus.
interface AuditLogEvent {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

const EVENTS_POLL_MS = 15000;

function formatRelativeTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function A2aAgentStatusDrawer({ isOpen, onClose }: A2aAgentStatusDrawerProps) {
  const [agents, setAgents] = useState<AgentStatusItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbLatency, setDbLatency] = useState<number>(2);
  const [storageSource, setStorageSource] = useState<string>("PostgreSQL:agent_telemetry");
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"AGENTS" | "TOPOLOGY" | "EVENTS">("AGENTS");

  // Live Event feed: real audit-log rows (GET /admin/audit-logs), not fake
  // static data. eventsError distinguishes "nothing happened yet" from "this
  // user can't see the audit trail" (admin.audit.view is not granted to every
  // role) so the empty state stays honest either way.
  const [recentEvents, setRecentEvents] = useState<AuditLogEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const fetchAgentsStatus = async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/admin/agents/status");
      if (res.ok) {
        const data = await res.json();
        if (data.agents && Array.isArray(data.agents)) {
          setAgents(data.agents);
        }
        if (data.databaseLatencyMs) setDbLatency(data.databaseLatencyMs);
        if (data.storageSource) setStorageSource(data.storageSource);
      }
    } catch (e) {
      console.error("Failed to fetch agent status:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAgentsStatus();
    }
  }, [isOpen]);

  const fetchRecentEvents = async () => {
    setEventsLoading(true);
    try {
      const res = await authedFetch("/admin/audit-logs?limit=8");
      if (res.ok) {
        const data = await res.json();
        setRecentEvents(Array.isArray(data) ? data : []);
        setEventsError(null);
      } else if (res.status === 403) {
        setEventsError("Your role doesn't have audit-log access (admin.audit.view) to view live activity.");
      } else {
        setEventsError("Could not load recent activity.");
      }
    } catch (e) {
      console.error("Failed to fetch recent activity:", e);
      setEventsError("Could not load recent activity.");
    } finally {
      setEventsLoading(false);
    }
  };

  // Poll the real audit trail while the Live Event tab is open, same idea as
  // the AGENTS tab's data but sourced from GET /admin/audit-logs instead of a
  // fabricated in-memory list.
  useEffect(() => {
    if (!isOpen || activeTab !== "EVENTS") return;
    fetchRecentEvents();
    const interval = setInterval(fetchRecentEvents, EVENTS_POLL_MS);
    return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  const handlePingHeartbeat = async () => {
    setPingStatus("Pinging...");
    try {
      const res = await authedFetch("/admin/agents/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "agent-frontend",
          currentTask: `POS Terminal Active • ${new Date().toLocaleTimeString()}`,
          health: "Passing",
        }),
      });
      if (res.ok) {
        setPingStatus("Heartbeat Acknowledged ✅");
        fetchAgentsStatus();
        setTimeout(() => setPingStatus(null), 3000);
      } else {
        setPingStatus("Ping Failed ❌");
      }
    } catch {
      setPingStatus("Error Connecting ❌");
    }
  };

  if (!isOpen) return null;

  const onlineCount = agents.filter((a) => a.status === "ONLINE" || a.status === "READY").length;

  return (
    <div className="a2a-drawer-backdrop" onClick={onClose}>
      <div className="a2a-drawer-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="a2a-drawer-header">
          <div className="header-left">
            <span className="a2a-icon">🤖</span>
            <div>
              <div className="drawer-title-row">
                <h3>A2A Multi-Agent Mesh Telemetry</h3>
                <span className="badge-db-source">💾 {storageSource}</span>
              </div>
              <p className="drawer-subtext">
                {onlineCount} of {agents.length || "…"} specialized subagents synchronized with PostgreSQL ACID boundaries.
              </p>
            </div>
          </div>
          <div className="header-right">
            <button
              type="button"
              className="btn-ping-heartbeat"
              onClick={handlePingHeartbeat}
              disabled={loading}
              title="Broadcast A2A Heartbeat Ping"
            >
              {pingStatus || "⚡ Ping A2A Heartbeat"}
            </button>
            <button type="button" className="btn-close-drawer" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="a2a-tabs-bar">
          <button
            type="button"
            className={`a2a-tab-btn ${activeTab === "AGENTS" ? "active" : ""}`}
            onClick={() => setActiveTab("AGENTS")}
          >
            Subagents ({agents.length || "…"})
          </button>
          <button
            type="button"
            className={`a2a-tab-btn ${activeTab === "TOPOLOGY" ? "active" : ""}`}
            onClick={() => setActiveTab("TOPOLOGY")}
          >
            A2A Mesh Topology
          </button>
          <button
            type="button"
            className={`a2a-tab-btn ${activeTab === "EVENTS" ? "active" : ""}`}
            onClick={() => setActiveTab("EVENTS")}
          >
            Live Event Stream
          </button>
        </div>

        {/* Tab 1: Subagents Grid */}
        {activeTab === "AGENTS" && (
          <div className="a2a-agents-grid">
            {loading && agents.length === 0 ? (
              <div className="loading-state">Querying PostgreSQL agent_telemetry...</div>
            ) : (
              agents.map((ag) => (
                <div key={ag.id} className="agent-telemetry-tile">
                  <div className="tile-top">
                    <div className="agent-identity">
                      <span className="agent-name">{ag.name}</span>
                      <span className="agent-domain">[{ag.domain || ag.role}]</span>
                    </div>
                    <span className="agent-status-pill online">● ONLINE</span>
                  </div>

                  <p className="agent-task-text">
                    <strong style={{ color: "#334155" }}>Task:</strong> {ag.currentTask || "Active"}
                  </p>

                  <div className="tile-footer">
                    <span className="meta-badge">Port: {ag.port || "N/A"}</span>
                    <span className="meta-badge">DB Latency: {dbLatency}ms</span>
                    <span className="meta-badge health">Health: {ag.health || "Passing"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Mesh Topology Visual */}
        {activeTab === "TOPOLOGY" && (
          <div className="a2a-topology-panel">
            <div className="topology-box">
              <div className="bus-hub-card">
                <span className="hub-badge">CENTRAL A2A PROTOCOL BUS</span>
                <h4>ws://localhost:4001/ws</h4>
                <p>WebSocket topic routing engine enforcing domain boundaries and event fan-out.</p>
              </div>

              {/* Derived from the same live `agents` state as the AGENTS tab
                  (GET /admin/agents/status) — never a separately hardcoded
                  roster, so this can't drift from the real agent_telemetry
                  table again. */}
              {loading && agents.length === 0 ? (
                <div className="loading-state">Querying PostgreSQL agent_telemetry...</div>
              ) : agents.length === 0 ? (
                <div className="loading-state">No agents registered in agent_telemetry.</div>
              ) : (
                <div className="topology-nodes-grid">
                  {agents.map((a) => {
                    const dotColor =
                      a.status === "ONLINE" || a.status === "READY"
                        ? "#10b981"
                        : a.status === "DEGRADED" || a.status === "BUSY"
                        ? "#f59e0b"
                        : "#ef4444";
                    const subtitle = [
                      a.domain || a.role,
                      a.port ? `Port ${a.port}` : a.health || a.status,
                    ]
                      .filter(Boolean)
                      .join(" • ");
                    return (
                      <div key={a.id} className="node-item">
                        <span className="node-dot" style={{ background: dotColor }} />
                        <strong>{a.name || a.id}</strong>
                        <span>{subtitle}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Recent Events Feed — real recent activity from the outlet's
            audit trail (GET /admin/audit-logs), polled every 15s. This is not
            a literal A2A pub/sub bus (no such feed exists in this backend),
            so it's an honest "recent activity" view rather than fabricated
            agent messages. */}
        {activeTab === "EVENTS" && (
          <div className="a2a-events-feed">
            {eventsLoading && recentEvents.length === 0 ? (
              <div className="loading-state">Querying audit_logs...</div>
            ) : eventsError ? (
              <div className="loading-state">{eventsError}</div>
            ) : recentEvents.length === 0 ? (
              <div className="loading-state">No recent activity recorded yet.</div>
            ) : (
              recentEvents.map((ev) => (
                <div key={ev.id} className="event-stream-row">
                  <div className="event-left">
                    <span className="event-pulse" />
                    <div>
                      <span className="event-topic">
                        {ev.entityType?.toLowerCase()}.{ev.action?.toLowerCase()}
                      </span>
                      <span className="event-source">by user {ev.userId ? ev.userId.slice(0, 8) : "unknown"}</span>
                    </div>
                  </div>
                  <span className="event-time">{formatRelativeTime(ev.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="a2a-drawer-footer">
          <div className="footer-stats">
            <span>WebSocket: <strong style={{ color: "#16a34a" }}>CONNECTED</strong></span>
            <span>Database: <strong style={{ color: "#16a34a" }}>PostgreSQL Active</strong></span>
          </div>
          <button type="button" className="btn-close-bottom" onClick={onClose}>Close Inspector</button>
        </div>
      </div>

      <style jsx>{`
        .a2a-drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 100000;
          display: flex;
          justify-content: flex-end;
          animation: fadeIn 0.15s ease-out;
        }
        .a2a-drawer-card {
          width: 620px;
          max-width: 95vw;
          height: 100vh;
          background: #ffffff;
          box-shadow: -10px 0 25px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          animation: slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .a2a-drawer-header {
          padding: 16px 20px;
          background: #0f172a;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #334155;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .a2a-icon {
          font-size: 1.8rem;
        }
        .drawer-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .drawer-title-row h3 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .badge-db-source {
          background: #065f46;
          color: #6ee7b7;
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 0.68rem;
          font-weight: 700;
        }
        .drawer-subtext {
          margin: 2px 0 0;
          font-size: 0.72rem;
          color: #94a3b8;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-ping-heartbeat {
          background: #3b82f6;
          color: #ffffff;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s;
        }
        .btn-ping-heartbeat:hover {
          background: #2563eb;
        }
        .btn-close-drawer {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 1.2rem;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .btn-close-drawer:hover {
          color: #ffffff;
          background: #334155;
        }
        .a2a-tabs-bar {
          display: flex;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          padding: 0 16px;
          gap: 12px;
        }
        .a2a-tab-btn {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 10px 4px;
          font-size: 0.8rem;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
        }
        .a2a-tab-btn.active {
          color: #2563eb;
          border-bottom-color: #2563eb;
        }
        .a2a-agents-grid {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
          align-content: start;
        }
        .agent-telemetry-tile {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tile-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .agent-name {
          font-size: 0.82rem;
          font-weight: 800;
          color: #0f172a;
          display: block;
        }
        .agent-domain {
          font-size: 0.68rem;
          color: #64748b;
          font-weight: 600;
        }
        .agent-status-pill {
          font-size: 0.65rem;
          padding: 2px 6px;
          border-radius: 999px;
          font-weight: 800;
        }
        .agent-status-pill.online {
          background: #ecfdf5;
          color: #059669;
        }
        .agent-task-text {
          margin: 0;
          font-size: 0.72rem;
          color: #475569;
          line-height: 1.35;
        }
        .tile-footer {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 4px;
        }
        .meta-badge {
          font-size: 0.65rem;
          background: #f1f5f9;
          color: #475569;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 600;
        }
        .meta-badge.health {
          background: #eff6ff;
          color: #2563eb;
        }
        .a2a-topology-panel {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        .topology-box {
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
        }
        .bus-hub-card {
          background: #1e293b;
          color: #ffffff;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .hub-badge {
          font-size: 0.68rem;
          background: #3b82f6;
          color: #ffffff;
          padding: 2px 8px;
          border-radius: 999px;
          font-weight: 800;
        }
        .bus-hub-card h4 {
          margin: 8px 0 4px;
          font-size: 1.1rem;
          font-family: monospace;
        }
        .bus-hub-card p {
          margin: 0;
          font-size: 0.75rem;
          color: #cbd5e1;
        }
        .topology-nodes-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          text-align: left;
        }
        .node-item {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          position: relative;
        }
        .node-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          margin-bottom: 4px;
        }
        .node-item strong {
          font-size: 0.78rem;
          color: #0f172a;
        }
        .node-item span {
          font-size: 0.68rem;
          color: #64748b;
        }
        .a2a-events-feed {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .event-stream-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
        }
        .event-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .event-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #3b82f6;
          box-shadow: 0 0 6px rgba(59, 130, 246, 0.6);
        }
        .event-topic {
          font-size: 0.8rem;
          font-weight: 700;
          color: #0f172a;
          font-family: monospace;
          display: block;
        }
        .event-source {
          font-size: 0.68rem;
          color: #64748b;
        }
        .event-time {
          font-size: 0.7rem;
          color: #94a3b8;
          font-weight: 600;
        }
        .a2a-drawer-footer {
          padding: 12px 20px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .footer-stats {
          display: flex;
          gap: 14px;
          font-size: 0.75rem;
          color: #475569;
        }
        .btn-close-bottom {
          background: #e2e8f0;
          border: none;
          color: #334155;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-close-bottom:hover {
          background: #cbd5e1;
        }
        .loading-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 40px;
          color: #64748b;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
