import React, { useEffect, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../lib/auth";
import Nav from "../components/Nav";

type Range = "24h" | "7d" | "30d";

interface StationOption {
  id: string;
  name: string;
}

interface StationStat {
  stationId: string;
  stationName: string;
  ticketCount: number;
  avgPrepMinutes: number;
  medianPrepMinutes: number;
  p90PrepMinutes: number;
  slaWarningMinutes: number;
  slaBreachMinutes: number;
}

interface ItemStat {
  menuItemId: string;
  itemName: string;
  ticketCount: number;
  avgPrepMinutes: number;
  medianPrepMinutes: number;
  p90PrepMinutes: number;
}

interface TrendPoint {
  bucket: string; // ISO timestamp, hour-aligned (24h) or day-aligned (7d/30d)
  ticketCount: number;
  avgPrepMinutes: number;
}

interface Comparison {
  currentAvgMinutes: number;
  previousAvgMinutes: number;
  deltaPercent: number;
}

interface AtRiskTicket {
  kotTicketId: string;
  ticketNumber: string;
  orderNumber: string | null;
  stationName: string;
  elapsedMinutes: number;
  status: string;
  severity: "WARNING" | "BREACH";
}

interface AnalyticsResponse {
  range: Range;
  granularity: "hour" | "day";
  stationFilter: string | null;
  stations: StationStat[];
  items: ItemStat[];
  trend: TrendPoint[];
  comparison: Comparison | null;
  atRisk: AtRiskTicket[];
}

const EMPTY: AnalyticsResponse = {
  range: "24h",
  granularity: "hour",
  stationFilter: null,
  stations: [],
  items: [],
  trend: [],
  comparison: null,
  atRisk: [],
};
const RANGE_LABEL: Record<Range, string> = { "24h": "Last 24 Hours", "7d": "Last 7 Days", "30d": "Last 30 Days" };

function barColor(minutes: number, warn: number, breach: number) {
  if (minutes >= breach) return "var(--destructive, #ef4444)";
  if (minutes >= warn) return "var(--warning, #f59e0b)";
  return "var(--accent, #10b981)";
}

function formatTrendLabel(bucket: string, granularity: "hour" | "day") {
  const d = new Date(bucket);
  return granularity === "hour"
    ? `${String(d.getUTCHours()).padStart(2, "0")}h`
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function KitchenAnalytics() {
  const { loading: authLoading } = useAuthGuard("report.read");
  const [range, setRange] = useState<Range>("24h");
  const [stationOptions, setStationOptions] = useState<StationOption[]>([]);
  const [stationFilter, setStationFilter] = useState<string>("");
  const [data, setData] = useState<AnalyticsResponse>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetchStations = async () => {
    try {
      const res = await authedFetch("/kitchen/stations");
      if (res.ok) setStationOptions(await res.json());
    } catch (e) {
      console.error("Failed to fetch stations", e);
    }
  };

  const fetchStats = async (r: Range, station: string) => {
    try {
      const qs = new URLSearchParams({ range: r });
      if (station) qs.set("stationId", station);
      const res = await authedFetch(`/kitchen/analytics?${qs.toString()}`);
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error("Failed to fetch kitchen analytics", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchStations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Switch range/station: refetch immediately.
  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    fetchStats(range, stationFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, range, stationFilter]);

  // Live updates: same real-time socket the KDS board uses (kot.status_updated
  // fires on every READY transition), so this page reflects the kitchen the
  // moment a ticket completes instead of waiting on a fixed poll interval.
  // Backup poll stays in as a fallback if the socket drops.
  useEffect(() => {
    if (authLoading) return;

    const ws = new WebSocket("ws://localhost:4001/ws");
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.topic === "kot.status_updated" || payload.topic === "kot.created") {
          fetchStats(range, stationFilter);
        }
      } catch (err) {
        console.error("[KitchenAnalytics] Failed to parse WebSocket message:", err);
      }
    };

    const interval = setInterval(() => fetchStats(range, stationFilter), 30000);
    return () => {
      ws.close();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, range, stationFilter]);

  if (authLoading) return null;

  const { stations, items, trend, granularity, comparison, atRisk } = data;
  const maxStationAvg = Math.max(1, ...stations.map((s) => s.avgPrepMinutes));
  const maxItemAvg = Math.max(1, ...items.map((i) => i.avgPrepMinutes));
  const maxTrendAvg = Math.max(1, ...trend.map((t) => t.avgPrepMinutes));

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ["Section", "Name", "Tickets", "Avg Min", "Median Min", "P90 Min", "SLA Warn Min", "SLA Breach Min"],
      ...stations.map((s) => ["Station", s.stationName, s.ticketCount, s.avgPrepMinutes, s.medianPrepMinutes, s.p90PrepMinutes, s.slaWarningMinutes, s.slaBreachMinutes]),
      ...items.map((it) => ["Dish", it.itemName, it.ticketCount, it.avgPrepMinutes, it.medianPrepMinutes, it.p90PrepMinutes, "", ""]),
    ];
    downloadCsv(`kitchen-prep-times-${range}${stationFilter ? `-${stationFilter}` : ""}.csv`, rows);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg-base, #f8fafc)" }}>
      <Head>
        <title>KapMeta POS - Kitchen Prep Times</title>
      </Head>
      <Nav variant="sidebar" />
      <div style={{ flex: 1, padding: 24, maxWidth: 900, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 800 }}>Kitchen Prep Times</h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--border, #e2e8f0)",
                background: "var(--bg-card, #fff)",
                color: "var(--text-secondary, #64748b)",
              }}
            >
              <option value="">All Stations</option>
              {stationOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {(["24h", "7d", "30d"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border, #e2e8f0)",
                  background: range === r ? "var(--accent, #10b981)" : "var(--bg-card, #fff)",
                  color: range === r ? "#fff" : "var(--text-secondary, #64748b)",
                  cursor: "pointer",
                }}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
            <button
              onClick={exportCsv}
              disabled={stations.length === 0}
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--border, #e2e8f0)",
                background: "var(--bg-card, #fff)",
                color: "var(--text-secondary, #64748b)",
                cursor: stations.length === 0 ? "not-allowed" : "pointer",
                opacity: stations.length === 0 ? 0.5 : 1,
              }}
            >
              ⬇ Export CSV
            </button>
          </div>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary, #64748b)", marginBottom: 16 }}>
          Avg time from QUEUED to READY, {RANGE_LABEL[range].toLowerCase()} · live updates on every ticket completion.
          Colors follow each station's own SLA thresholds (Station.slaWarningSeconds / slaBreachSeconds), not a fixed cutoff.
        </p>

        {comparison && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 10,
              marginBottom: 16,
              background: comparison.deltaPercent <= 0 ? "var(--accent-soft, #ecfdf5)" : "var(--warning-soft, #fffbeb)",
              color: comparison.deltaPercent <= 0 ? "var(--accent-subtle-text, #065f46)" : "var(--warning, #f59e0b)",
            }}
          >
            {comparison.deltaPercent <= 0 ? "▼" : "▲"} {Math.abs(comparison.deltaPercent)}% vs previous {RANGE_LABEL[range].toLowerCase()}
            <span style={{ fontWeight: 400, color: "var(--text-muted, #94a3b8)" }}>
              ({comparison.currentAvgMinutes} min now vs {comparison.previousAvgMinutes} min prior)
            </span>
          </div>
        )}

        {atRisk.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 10, color: "var(--destructive, #ef4444)" }}>
              🔥 Cooking Right Now, Over SLA ({atRisk.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {atRisk.map((t) => (
                <div
                  key={t.kotTicketId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: t.severity === "BREACH" ? "var(--destructive-soft, #fef2f2)" : "var(--warning-soft, #fffbeb)",
                    border: `1px solid ${t.severity === "BREACH" ? "var(--destructive, #ef4444)" : "var(--warning, #f59e0b)"}`,
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontSize: "0.8rem",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    KOT {t.ticketNumber} {t.orderNumber ? `· Order ${t.orderNumber}` : ""}
                  </span>
                  <span>{t.stationName}</span>
                  <span style={{ fontWeight: 700 }}>{t.elapsedMinutes} min in {t.status}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>Loading...</p>
        ) : stations.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>No completed tickets in this window yet.</p>
        ) : (
          <>
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 10 }}>By Station</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[...stations]
                  .sort((a, b) => b.avgPrepMinutes - a.avgPrepMinutes)
                  .map((s) => (
                    <div
                      key={s.stationId}
                      style={{
                        background: "var(--bg-card, #fff)",
                        border: "1px solid var(--border, #e2e8f0)",
                        borderRadius: 12,
                        padding: 16,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{s.stationName}</span>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                          {s.avgPrepMinutes} min avg{" "}
                          <span style={{ fontWeight: 400, color: "var(--text-muted, #94a3b8)" }}>
                            · median {s.medianPrepMinutes} · p90 {s.p90PrepMinutes} · {s.ticketCount} tickets · SLA {s.slaWarningMinutes}/{s.slaBreachMinutes} min
                          </span>
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 9999, background: "var(--bg-subtle, #f1f5f9)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${(s.avgPrepMinutes / maxStationAvg) * 100}%`,
                            background: barColor(s.avgPrepMinutes, s.slaWarningMinutes, s.slaBreachMinutes),
                            borderRadius: 9999,
                          }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 10 }}>Slowest Dishes</h2>
              {items.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>No item data yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((it) => (
                    <div
                      key={it.menuItemId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        background: "var(--bg-card, #fff)",
                        border: "1px solid var(--border, #e2e8f0)",
                        borderRadius: 10,
                        padding: "10px 14px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, minWidth: 160 }}>{it.itemName}</span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted, #94a3b8)" }}>
                        {it.ticketCount} tickets · median {it.medianPrepMinutes}m · p90 {it.p90PrepMinutes}m
                      </span>
                      <div style={{ width: 100, height: 6, borderRadius: 9999, background: "var(--bg-subtle, #f1f5f9)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${(it.avgPrepMinutes / maxItemAvg) * 100}%`,
                            background: "var(--accent-blue, #3b82f6)",
                            borderRadius: 9999,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, width: 60, textAlign: "right" }}>{it.avgPrepMinutes} min</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 10 }}>
                {granularity === "hour" ? "Hourly" : "Daily"} Trend
              </h2>
              {trend.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>No trend data yet.</p>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, padding: "0 4px", overflowX: "auto" }}>
                  {trend.map((t) => (
                    <div key={t.bucket} style={{ flex: 1, minWidth: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div
                        title={`${t.avgPrepMinutes} min avg · ${t.ticketCount} tickets`}
                        style={{
                          width: "100%",
                          height: `${Math.max(4, (t.avgPrepMinutes / maxTrendAvg) * 90)}px`,
                          background: "var(--accent, #10b981)",
                          borderRadius: 4,
                        }}
                      />
                      <span style={{ fontSize: "0.6rem", color: "var(--text-muted, #94a3b8)", whiteSpace: "nowrap" }}>
                        {formatTrendLabel(t.bucket, granularity)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
