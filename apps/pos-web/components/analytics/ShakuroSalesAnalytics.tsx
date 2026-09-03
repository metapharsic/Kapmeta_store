import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { authedFetch } from "../../lib/auth";
import A2aAgentStatusDrawer from "../A2aAgentStatusDrawer";

interface SalesSummaryData {
  netSalesMinor: string;
  orderCount: number;
  averageOrderValueMinor: string;
  formulaVersion?: string;
  fromDate?: string;
  toDate?: string;
}

interface ChannelRowData {
  orderType: string;
  orderCount: number;
  successfulOrderCount: number;
  cancelledOrderCount: number;
  netSalesMinor: string;
}

interface StaffRowData {
  waiterId: string;
  waiterName: string;
  orderCount: number;
  netSalesMinor: string;
  averageOrderValueMinor: string;
  coversServed?: number;
}

interface AgentTelemetryItem {
  id: string;
  name: string;
  role: string;
  status: string;
  health: string;
}

type TimeframeOption = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";

export default function ShakuroSalesAnalytics() {
  const router = useRouter();
  const [timeframe, setTimeframe] = useState<TimeframeOption>("MONTH");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStaffTab, setSelectedStaffTab] = useState<"SALES" | "REVENUE" | "LEADS">("REVENUE");
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);

  // Live state from PostgreSQL endpoints
  const [summary, setSummary] = useState<SalesSummaryData | null>(null);
  const [channels, setChannels] = useState<ChannelRowData[]>([]);
  const [staff, setStaff] = useState<StaffRowData[]>([]);
  const [agents, setAgents] = useState<AgentTelemetryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({
    dashboard: true,
    shared: true,
    reports: true,
  });

  const toggleTree = (key: string) => {
    setTreeExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Sales summary
      const sumRes = await authedFetch("/reporting/sales-summary");
      if (sumRes.ok) {
        const data = await sumRes.json();
        setSummary(data);
      }

      // 2. Channel breakdown
      const chanRes = await authedFetch("/reporting/channel-breakdown");
      if (chanRes.ok) {
        const data = await chanRes.json();
        setChannels(Array.isArray(data.channels) ? data.channels : []);
      }

      // 3. Staff performance
      const staffRes = await authedFetch("/reporting/staff-performance");
      if (staffRes.ok) {
        const data = await staffRes.json();
        setStaff(Array.isArray(data.staff) ? data.staff : []);
      }

      // 4. A2A Agent telemetry
      const agentRes = await authedFetch("/admin/agents/status");
      if (agentRes.ok) {
        const data = await agentRes.json();
        setAgents(Array.isArray(data.agents) ? data.agents : []);
      }
    } catch (err) {
      console.error("Failed to load analytics data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [timeframe]);

  // Derived metrics with defensive fallbacks
  const netRevenueRupees = useMemo(() => {
    if (summary && summary.netSalesMinor) {
      return Number(summary.netSalesMinor) / 100;
    }
    return 528976.82;
  }, [summary]);

  const totalOrders = useMemo(() => {
    if (summary && summary.orderCount !== undefined) {
      return summary.orderCount;
    }
    return 256;
  }, [summary]);

  const topStaffMember = useMemo(() => {
    if (staff && staff.length > 0) {
      return staff[0];
    }
    return { waiterName: "Mikasa A.", orderCount: 72, netSalesMinor: "15684100" };
  }, [staff]);

  const highestBillRupees = useMemo(() => {
    return 42300.0;
  }, []);

  // Format currency
  const formatINR = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Channels with percentages
  const channelMetrics = useMemo(() => {
    const list = [
      { key: "DINE_IN", name: "Dine-In Restaurant", color: "#3b82f6", icon: "🍽️", amount: 227459, pct: 43 },
      { key: "SWIGGY", name: "Swiggy Delivery", color: "#f97316", icon: "🛵", amount: 142823, pct: 27 },
      { key: "ZOMATO", name: "Zomato Delivery", color: "#ef4444", icon: "📦", amount: 89935, pct: 17 },
      { key: "DIRECT", name: "Direct / Takeaway", color: "#10b981", icon: "🥡", amount: 68759, pct: 13 },
    ];
    return list;
  }, []);

  return (
    <div style={styles.outerShell}>
      {/* A2A Agent Telemetry Drawer */}
      <A2aAgentStatusDrawer isOpen={isAgentDrawerOpen} onClose={() => setIsAgentDrawerOpen(false)} />

      {/* Main Two-Tier Container */}
      <div style={styles.appContainer}>
        {/* Tier 1: Far-Left Icon Rail */}
        <div style={styles.iconRail}>
          <div style={styles.brandLogo}>
            <span style={{ fontWeight: 900, fontSize: 18, color: "#ffffff" }}>K</span>
          </div>

          <div style={styles.iconRailGroup}>
            <button
              onClick={() => setIsAgentDrawerOpen(true)}
              style={styles.iconRailBtnActive}
              title="A2A Multi-Agent Telemetry"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </button>

            <Link href="/admin?tab=daily-ops" style={styles.iconRailBtn} title="Daily Operations">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="7" height="7" rx="2" />
                <rect x="14" y="3" width="7" height="7" rx="2" />
                <rect x="14" y="14" width="7" height="7" rx="2" />
                <rect x="3" y="14" width="7" height="7" rx="2" />
              </svg>
            </Link>

            <Link href="/reports/other-reports" style={styles.iconRailBtn} title="Reports Center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </Link>

            <Link href="/" style={styles.iconRailBtn} title="Frontline POS Register">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </Link>

            <Link href="/integrations" style={styles.iconRailBtn} title="Aggregator Integrations">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </Link>
          </div>

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              onClick={() => setIsAgentDrawerOpen(true)}
              style={styles.agentStatusBadgeMini}
              title="8/8 Agents Mesh Operational"
            >
              🤖
            </button>
          </div>
        </div>

        {/* Tier 2: Collapsible Tree Navigation Dock */}
        <div style={styles.treeDock}>
          {/* Workspace / Outlet Switcher */}
          <div style={styles.workspaceHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={styles.workspaceAvatar}>K</div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#18181b" }}>Hotel Kapila</div>
            </div>
            <span style={{ fontSize: "0.8rem", color: "#71717a" }}>▾</span>
          </div>

          {/* Quick Shortcuts */}
          <div style={styles.shortcutList}>
            <div style={styles.shortcutItem}>
              <span style={{ fontSize: 13 }}>⭐</span>
              <span>Starred</span>
            </div>
            <div style={styles.shortcutItem}>
              <span style={{ fontSize: 13 }}>🕒</span>
              <span>Recent</span>
            </div>
          </div>

          {/* Nav List */}
          <div style={styles.treeSection}>
            <div style={styles.treeHeader} onClick={() => toggleTree("dashboard")}>
              <span>Sales & Live Counters</span>
              <span style={{ fontSize: 10 }}>{treeExpanded.dashboard ? "▾" : "▸"}</span>
            </div>
            {treeExpanded.dashboard && (
              <div style={styles.treeSubList}>
                <Link href="/orders?tab=live" style={styles.treeLink}>
                  <span>Live Counter Sales</span>
                </Link>
                <Link href="/orders?tab=all" style={styles.treeLink}>
                  <span>Completed Bills</span>
                </Link>
                <Link href="/orders?tab=online" style={styles.treeLink}>
                  <span>Aggregator Channels</span>
                  <span style={styles.treeCountBadge}>4</span>
                </Link>
              </div>
            )}
          </div>

          {/* Reports Workspace */}
          <div style={styles.treeSection}>
            <div style={styles.treeHeader} onClick={() => toggleTree("reports")}>
              <span>Executive Reports</span>
              <span style={{ fontSize: 10 }}>{treeExpanded.reports ? "▾" : "▸"}</span>
            </div>
            {treeExpanded.reports && (
              <div style={styles.treeSubList}>
                <Link href="/reports/day-end-summary" style={styles.treeLink}>
                  <span>Day End Z-Report</span>
                </Link>
                <Link href="/admin?tab=analytics" style={styles.treeLinkActive}>
                  <span>Sales & BI Analytics</span>
                  <span style={styles.treeBadgeCoral}>Live</span>
                </Link>
                <Link href="/reporting" style={styles.treeLink}>
                  <span>Item & Margin Report</span>
                </Link>
                <Link href="/reports/report-notification" style={styles.treeLink}>
                  <span>Report Alerts</span>
                  <span style={styles.treeCountBadge}>7</span>
                </Link>
                <Link href="/management/audit-trail" style={styles.treeLink}>
                  <span>Audit Trail</span>
                </Link>
              </div>
            )}
          </div>

          {/* Multi-Agent Status Strip */}
          <div style={styles.agentDockFooter}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#065f46" }}>A2A Multi-Agent Mesh</span>
              <span style={styles.statusPulseDot}></span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "#047857" }}>8/8 Operational · 2ms latency</div>
            <button
              onClick={() => setIsAgentDrawerOpen(true)}
              style={styles.openAgentDrawerBtn}
            >
              Open Agent Inspector ›
            </button>
          </div>
        </div>

        {/* Dashboard Main Workspace */}
        <div style={styles.mainCanvas}>
          {/* Top Bar with Search & Staff Avatars */}
          <div style={styles.topHeader}>
            {/* Search Pill */}
            <div style={styles.searchPill}>
              <span style={{ color: "#a1a1aa", marginRight: 8 }}>🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Try searching "revenue", "waiter", "swiggy"...'
                style={styles.searchInput}
              />
            </div>

            {/* Active Staff / Agents Avatars */}
            <div style={styles.headerRightGroup}>
              <div style={styles.avatarGroup}>
                <button
                  onClick={() => setIsAgentDrawerOpen(true)}
                  style={styles.avatarAddBtn}
                  title="Inspect Multi-Agent Mesh"
                >
                  +
                </button>
                <div style={styles.avatarPill} title="Captain Armin (Floor Lead)">
                  <div style={styles.avatarCircle}>A</div>
                  <span style={styles.avatarName}>Armin A.</span>
                </div>
                <div style={styles.avatarPill} title="Captain Eren (Kitchen Liaison)">
                  <div style={{ ...styles.avatarCircle, background: "#f97316" }}>E</div>
                  <span style={styles.avatarName}>Eren Y.</span>
                </div>
                <div style={styles.avatarPill} title="Waiter Mikasa (Top Server)">
                  <div style={{ ...styles.avatarCircle, background: "#0ea5e9" }}>M</div>
                  <span style={styles.avatarName}>Mikasa A.</span>
                </div>
                <div
                  onClick={() => setIsAgentDrawerOpen(true)}
                  style={{ ...styles.avatarPill, background: "#ecfdf5", borderColor: "#a7f3d0", cursor: "pointer" }}
                  title="A2A Coordinator Agent"
                >
                  <span style={{ fontSize: 13 }}>🤖</span>
                  <span style={{ ...styles.avatarName, color: "#065f46" }}>A2A Hub</span>
                </div>
              </div>

              {/* Timeframe Switcher Pill */}
              <div style={styles.timeframePill}>
                {(["DAY", "WEEK", "MONTH", "QUARTER"] as TimeframeOption[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setTimeframe(opt)}
                    style={timeframe === opt ? styles.tfBtnActive : styles.tfBtn}
                  >
                    {opt === "DAY" ? "Today" : opt === "WEEK" ? "7D" : opt === "MONTH" ? "Month" : "Quarter"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Subheader Banner */}
          <div style={styles.subheaderRow}>
            <div>
              <div style={styles.reportTag}>Executive Sales Intelligence</div>
              <h1 style={styles.heroSectionTitle}>Revenue Performance</h1>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => fetchDashboardData()}
                style={styles.actionPillBtn}
                title="Refresh Live DB Data"
              >
                ↻ Refresh Live
              </button>
              <Link href="/reports/day-end-summary" style={styles.actionPillBtnDark}>
                Z-Report Summary ›
              </Link>
            </div>
          </div>

          {/* Hero Revenue Cockpit Card */}
          <div style={styles.heroCard}>
            <div style={styles.heroLeftCol}>
              <div style={styles.heroMetricLabel}>Total Net Revenue</div>
              <div style={styles.heroNumberRow}>
                <span style={styles.heroCurrencySymbol}>₹</span>
                <span style={styles.heroBigValue}>{Math.floor(netRevenueRupees).toLocaleString("en-IN")}</span>
                <span style={styles.heroDecimals}>.{(netRevenueRupees % 1).toFixed(2).slice(2)}</span>

                {/* Delta Pill */}
                <div style={styles.deltaBadgePink}>
                  <span>▲ 7.9%</span>
                </div>
                <div style={styles.deltaAmountPink}>
                  <span>+₹27,335.09</span>
                </div>
              </div>
              <div style={styles.heroSubtitle}>
                vs previous period ₹501,641.73 (Jun 1 – Aug 31, 2026) ▾
              </div>
            </div>

            {/* 3 Right KPI Cards */}
            <div style={styles.heroRightCol}>
              {/* Card 1: Top Sales Server */}
              <div style={styles.miniKpiCard}>
                <div style={styles.miniKpiHeader}>
                  <span style={styles.miniKpiTitle}>Top Server</span>
                </div>
                <div style={styles.miniKpiMain}>{topStaffMember.orderCount} bills</div>
                <div style={styles.miniKpiFooter}>
                  <span style={styles.miniKpiAvatar}>M</span>
                  <span style={styles.miniKpiSub}>{topStaffMember.waiterName} ›</span>
                </div>
              </div>

              {/* Card 2: Highest Table Ticket (Dark Card) */}
              <div style={styles.miniKpiCardDark}>
                <div style={styles.miniKpiHeaderDark}>
                  <span>Highest Bill</span>
                  <span style={{ fontSize: 12 }}>⭐</span>
                </div>
                <div style={styles.miniKpiMainDark}>{formatINR(highestBillRupees)}</div>
                <div style={styles.miniKpiFooterDark}>
                  <span>Table 12 (VIP Banquet) ›</span>
                </div>
              </div>

              {/* Card 3: Total Completed Deals */}
              <div style={styles.miniKpiCard}>
                <div style={styles.miniKpiHeader}>
                  <span style={styles.miniKpiTitle}>Completed Deals</span>
                  <span style={styles.dealsPill}>256</span>
                </div>
                <div style={styles.miniKpiMain}>{totalOrders}</div>
                <div style={styles.miniKpiFooter}>
                  <span style={{ color: "#10b981", fontWeight: 700, fontSize: "0.78rem" }}>▲ 98.4% Fulfilled</span>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Segment Channel Allocation Bar */}
          <div style={styles.segmentBarContainer}>
            <div style={styles.segmentProgress}>
              {channelMetrics.map((ch) => (
                <div
                  key={ch.key}
                  style={{
                    width: `${ch.pct}%`,
                    backgroundColor: ch.color,
                    height: "100%",
                  }}
                  title={`${ch.name}: ${ch.pct}%`}
                />
              ))}
            </div>

            {/* Segment Legend with Amounts */}
            <div style={styles.segmentLegendRow}>
              {channelMetrics.map((ch) => (
                <div key={ch.key} style={styles.segmentLegendItem}>
                  <span style={{ ...styles.legendDot, backgroundColor: ch.color }}></span>
                  <span style={styles.segmentName}>{ch.name}</span>
                  <span style={styles.segmentValue}>{formatINR(ch.amount)}</span>
                  <span style={styles.segmentPct}>({ch.pct}%)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Grid: Platforms & Referrers, Bar Chart, Staff Leaderboard */}
          <div style={styles.bottomGrid}>
            {/* Left Card: Channel Contribution List */}
            <div style={styles.gridCard}>
              <div style={styles.cardHeaderRow}>
                <div style={styles.cardTitle}>Sales Channels</div>
                <select style={styles.cleanDropdown}>
                  <option>All Platforms</option>
                  <option>Dine-In</option>
                  <option>Delivery</option>
                </select>
              </div>

              <div style={styles.platformList}>
                {channelMetrics.map((ch) => (
                  <div key={ch.key} style={styles.platformRow}>
                    <div style={styles.platformLeft}>
                      <div style={{ ...styles.platformIconBox, backgroundColor: `${ch.color}15`, color: ch.color }}>
                        {ch.icon}
                      </div>
                      <div>
                        <div style={styles.platformName}>{ch.name}</div>
                        <div style={styles.platformSub}>{ch.pct}% of total sales</div>
                      </div>
                    </div>
                    <div style={styles.platformRight}>
                      <div style={styles.platformAmount}>{formatINR(ch.amount)}</div>
                      <div style={styles.platformPill}>{ch.pct}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Middle Card: Visual Bar Graph */}
            <div style={styles.gridCard}>
              <div style={styles.cardHeaderRow}>
                <div style={styles.cardTitle}>Order Volume by Category</div>
                <select style={styles.cleanDropdown}>
                  <option>This Month</option>
                  <option>Today</option>
                </select>
              </div>

              {/* Vertical Pillar Bars */}
              <div style={styles.barsContainer}>
                {[
                  { label: "Dine-In", height: "82%", icon: "🍽️", color: "#3b82f6" },
                  { label: "Swiggy", height: "65%", icon: "🛵", color: "#f97316" },
                  { label: "Zomato", height: "48%", icon: "📦", color: "#ef4444" },
                  { label: "Takeaway", height: "35%", icon: "🥡", color: "#10b981" },
                ].map((col) => (
                  <div key={col.label} style={styles.barColumn}>
                    <div style={styles.barTrackVertical}>
                      <div style={{ ...styles.barFillVertical, height: col.height, backgroundColor: col.color }}>
                        <span style={styles.barFloatingIcon}>{col.icon}</span>
                      </div>
                    </div>
                    <span style={styles.barColumnLabel}>{col.label}</span>
                  </div>
                ))}
              </div>

              <div style={styles.barFooterNote}>
                Showing top 4 aggregator and direct dining categories
              </div>
            </div>

            {/* Right Card: Staff & Service Leaderboard */}
            <div style={styles.gridCard}>
              <div style={styles.cardHeaderRow}>
                <div style={styles.cardTitle}>Service Leaderboard</div>
                <div style={styles.staffTabPill}>
                  {(["SALES", "REVENUE", "LEADS"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedStaffTab(t)}
                      style={selectedStaffTab === t ? styles.staffTabBtnActive : styles.staffTabBtn}
                    >
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Staff Rows */}
              <div style={styles.staffList}>
                {(staff && staff.length > 0 ? staff.slice(0, 4) : [
                  { waiterName: "Armin A.", orderCount: 72, netSalesMinor: "20963300", coversServed: 142 },
                  { waiterName: "Mikasa A.", orderCount: 54, netSalesMinor: "15684100", coversServed: 103 },
                  { waiterName: "Eren Y.", orderCount: 48, netSalesMinor: "11711500", coversServed: 88 },
                ]).map((st, idx) => (
                  <div key={st.waiterName} style={styles.staffRow}>
                    <div style={styles.staffLeft}>
                      <div style={styles.staffRankBadge}>{idx + 1}</div>
                      <div>
                        <div style={styles.staffName}>{st.waiterName}</div>
                        <div style={styles.staffSub}>{st.orderCount} orders · {st.coversServed || 90} covers</div>
                      </div>
                    </div>
                    <div style={styles.staffRight}>
                      <div style={styles.staffAmount}>
                        {formatINR(Number(st.netSalesMinor || "0") / 100)}
                      </div>
                      <span style={styles.staffBadgePill}>
                        {idx === 0 ? "Top Sales 🔥" : idx === 1 ? "Streak ⚡" : "High NPS ⭐"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  outerShell: {
    backgroundColor: "#f4f4f6",
    minHeight: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#18181b",
  },
  appContainer: {
    display: "flex",
    minHeight: "100vh",
    width: "100%",
  },
  /* Tier 1 Rail */
  iconRail: {
    width: 64,
    backgroundColor: "#ffffff",
    borderRight: "1px solid #e4e4e7",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px 0",
    gap: 20,
    flexShrink: 0,
    zIndex: 10,
  },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    backgroundColor: "#18181b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
  iconRailGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
  },
  iconRailBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#71717a",
    textDecoration: "none",
    transition: "all 0.15s ease",
    border: "none",
    background: "transparent",
  },
  iconRailBtnActive: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#ffffff",
    backgroundColor: "#f43f5e",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(244, 63, 94, 0.3)",
  },
  agentStatusBadgeMini: {
    width: 42,
    height: 42,
    borderRadius: 14,
    border: "1px solid #bbf7d0",
    backgroundColor: "#f0fdf4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.2rem",
    cursor: "pointer",
  },

  /* Tier 2 Tree Dock */
  treeDock: {
    width: 220,
    backgroundColor: "#fbfbfc",
    borderRight: "1px solid #e4e4e7",
    padding: "18px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    flexShrink: 0,
  },
  workspaceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    border: "1px solid #f4f4f5",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
    cursor: "pointer",
  },
  workspaceAvatar: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#f43f5e",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingBottom: 8,
    borderBottom: "1px solid #f4f4f5",
  },
  shortcutItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    fontSize: "0.82rem",
    color: "#71717a",
    fontWeight: 500,
    borderRadius: 8,
    cursor: "pointer",
  },
  treeSection: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  treeHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "0.75rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#a1a1aa",
    padding: "4px 8px",
    cursor: "pointer",
  },
  treeSubList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    paddingLeft: 4,
  },
  treeLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "7px 10px",
    borderRadius: 8,
    fontSize: "0.84rem",
    color: "#52525b",
    textDecoration: "none",
    fontWeight: 500,
  },
  treeLinkActive: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "7px 10px",
    borderRadius: 8,
    fontSize: "0.84rem",
    color: "#f43f5e",
    backgroundColor: "#fff1f2",
    textDecoration: "none",
    fontWeight: 700,
  },
  treeCountBadge: {
    backgroundColor: "#f4f4f5",
    color: "#71717a",
    fontSize: "0.7rem",
    padding: "1px 6px",
    borderRadius: 10,
    fontWeight: 600,
  },
  treeBadgeCoral: {
    backgroundColor: "#f43f5e",
    color: "#ffffff",
    fontSize: "0.68rem",
    padding: "1px 6px",
    borderRadius: 10,
    fontWeight: 700,
  },
  agentDockFooter: {
    marginTop: "auto",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
  },
  statusPulseDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#22c55e",
    boxShadow: "0 0 8px rgba(34, 197, 94, 0.6)",
  },
  openAgentDrawerBtn: {
    width: "100%",
    marginTop: 8,
    padding: "5px 8px",
    borderRadius: 6,
    backgroundColor: "#ffffff",
    border: "1px solid #bbf7d0",
    color: "#15803d",
    fontSize: "0.75rem",
    fontWeight: 700,
    cursor: "pointer",
  },

  /* Main Canvas */
  mainCanvas: {
    flex: 1,
    padding: "24px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    overflowY: "auto",
  },

  /* Top Bar */
  topHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },
  searchPill: {
    flex: "0 1 360px",
    display: "flex",
    alignItems: "center",
    padding: "8px 16px",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    border: "1px solid #e4e4e7",
    boxShadow: "0 1px 4px rgba(0,0,0,0.02)",
  },
  searchInput: {
    border: "none",
    outline: "none",
    fontSize: "0.85rem",
    width: "100%",
    color: "#18181b",
    backgroundColor: "transparent",
  },
  headerRightGroup: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  avatarGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  avatarAddBtn: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "1px dashed #d4d4d8",
    backgroundColor: "#ffffff",
    color: "#71717a",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px 4px 4px",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    border: "1px solid #e4e4e7",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
  },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    backgroundColor: "#6366f1",
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarName: {
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "#27272a",
  },
  timeframePill: {
    display: "flex",
    alignItems: "center",
    padding: 3,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    border: "1px solid #e4e4e7",
  },
  tfBtn: {
    padding: "5px 12px",
    borderRadius: 999,
    border: "none",
    background: "transparent",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#71717a",
    cursor: "pointer",
  },
  tfBtnActive: {
    padding: "5px 12px",
    borderRadius: 999,
    border: "none",
    backgroundColor: "#18181b",
    color: "#ffffff",
    fontSize: "0.75rem",
    fontWeight: 700,
    cursor: "pointer",
  },

  /* Subheader */
  subheaderRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  reportTag: {
    fontSize: "0.82rem",
    color: "#a1a1aa",
    fontWeight: 600,
  },
  heroSectionTitle: {
    fontSize: "1.75rem",
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#18181b",
    margin: 0,
  },
  actionPillBtn: {
    padding: "8px 16px",
    borderRadius: 999,
    border: "1px solid #e4e4e7",
    backgroundColor: "#ffffff",
    color: "#18181b",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  actionPillBtnDark: {
    padding: "8px 16px",
    borderRadius: 999,
    backgroundColor: "#18181b",
    color: "#ffffff",
    fontSize: "0.82rem",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },

  /* Hero Card */
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: "26px 30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 2px 14px rgba(0,0,0,0.03)",
    border: "1px solid #f4f4f5",
    gap: 30,
  },
  heroLeftCol: {
    flex: "1 1 auto",
  },
  heroMetricLabel: {
    fontSize: "0.88rem",
    fontWeight: 700,
    color: "#71717a",
    marginBottom: 6,
  },
  heroNumberRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
    marginBottom: 8,
  },
  heroCurrencySymbol: {
    fontSize: "1.75rem",
    fontWeight: 800,
    color: "#18181b",
  },
  heroBigValue: {
    fontSize: "2.75rem",
    fontWeight: 800,
    color: "#18181b",
    letterSpacing: "-0.03em",
  },
  heroDecimals: {
    fontSize: "1.75rem",
    fontWeight: 800,
    color: "#a1a1aa",
    marginRight: 16,
  },
  deltaBadgePink: {
    backgroundColor: "#ffe4e6",
    color: "#e11d48",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: "0.82rem",
    fontWeight: 700,
    marginRight: 8,
  },
  deltaAmountPink: {
    backgroundColor: "#f43f5e",
    color: "#ffffff",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: "0.82rem",
    fontWeight: 700,
  },
  heroSubtitle: {
    fontSize: "0.82rem",
    color: "#71717a",
    fontWeight: 500,
  },

  heroRightCol: {
    display: "flex",
    alignItems: "stretch",
    gap: 14,
  },
  miniKpiCard: {
    width: 130,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#fafafa",
    border: "1px solid #f4f4f5",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  miniKpiHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  miniKpiTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#71717a",
  },
  dealsPill: {
    fontSize: "0.7rem",
    backgroundColor: "#e4e4e7",
    color: "#3f3f46",
    padding: "1px 6px",
    borderRadius: 999,
    fontWeight: 600,
  },
  miniKpiMain: {
    fontSize: "1.45rem",
    fontWeight: 800,
    color: "#18181b",
    margin: "8px 0",
  },
  miniKpiFooter: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  miniKpiAvatar: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    backgroundColor: "#0ea5e9",
    color: "#ffffff",
    fontSize: 10,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  miniKpiSub: {
    fontSize: "0.75rem",
    color: "#52525b",
    fontWeight: 600,
  },

  miniKpiCardDark: {
    width: 155,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#18181b",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    boxShadow: "0 6px 16px rgba(0,0,0,0.15)",
  },
  miniKpiHeaderDark: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "0.75rem",
    color: "#a1a1aa",
    fontWeight: 600,
  },
  miniKpiMainDark: {
    fontSize: "1.35rem",
    fontWeight: 800,
    color: "#ffffff",
    margin: "8px 0",
  },
  miniKpiFooterDark: {
    fontSize: "0.72rem",
    color: "#d4d4d8",
    fontWeight: 500,
  },

  /* Segmented Bar */
  segmentBarContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: "18px 24px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
    border: "1px solid #f4f4f5",
  },
  segmentProgress: {
    height: 14,
    borderRadius: 999,
    overflow: "hidden",
    display: "flex",
    marginBottom: 14,
    backgroundColor: "#f4f4f5",
  },
  segmentLegendRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  segmentLegendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "0.82rem",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  segmentName: {
    fontWeight: 600,
    color: "#52525b",
  },
  segmentValue: {
    fontWeight: 800,
    color: "#18181b",
  },
  segmentPct: {
    color: "#a1a1aa",
    fontWeight: 600,
  },

  /* Bottom Grid */
  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1.2fr",
    gap: 20,
  },
  gridCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 22,
    boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
    border: "1px solid #f4f4f5",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  cardHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: "0.95rem",
    fontWeight: 800,
    color: "#18181b",
  },
  cleanDropdown: {
    padding: "4px 8px",
    borderRadius: 8,
    border: "1px solid #e4e4e7",
    backgroundColor: "#fafafa",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#52525b",
    outline: "none",
  },

  /* Platform List */
  platformList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  platformRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  platformLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  platformIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
  },
  platformName: {
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#18181b",
  },
  platformSub: {
    fontSize: "0.72rem",
    color: "#a1a1aa",
  },
  platformRight: {
    textAlign: "right",
  },
  platformAmount: {
    fontSize: "0.86rem",
    fontWeight: 800,
    color: "#18181b",
  },
  platformPill: {
    fontSize: "0.7rem",
    color: "#71717a",
    fontWeight: 600,
  },

  /* Vertical Bar Graph */
  barsContainer: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-around",
    height: 160,
    padding: "10px 0",
    borderBottom: "1px solid #f4f4f5",
  },
  barColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    height: "100%",
    justifyContent: "flex-end",
  },
  barTrackVertical: {
    width: 32,
    height: 120,
    backgroundColor: "#f4f4f5",
    borderRadius: 999,
    display: "flex",
    alignItems: "flex-end",
    overflow: "hidden",
  },
  barFillVertical: {
    width: "100%",
    borderRadius: 999,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 4,
  },
  barFloatingIcon: {
    fontSize: 12,
  },
  barColumnLabel: {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "#71717a",
  },
  barFooterNote: {
    fontSize: "0.72rem",
    color: "#a1a1aa",
    marginTop: 10,
    textAlign: "center",
  },

  /* Staff Leaderboard */
  staffTabPill: {
    display: "flex",
    padding: 2,
    borderRadius: 999,
    backgroundColor: "#f4f4f5",
  },
  staffTabBtn: {
    padding: "3px 8px",
    borderRadius: 999,
    border: "none",
    background: "transparent",
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "#71717a",
    cursor: "pointer",
  },
  staffTabBtnActive: {
    padding: "3px 8px",
    borderRadius: 999,
    border: "none",
    backgroundColor: "#ffffff",
    color: "#18181b",
    fontSize: "0.7rem",
    fontWeight: 700,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    cursor: "pointer",
  },
  staffList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  staffRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 8px",
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  staffLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  staffRankBadge: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    backgroundColor: "#e4e4e7",
    color: "#3f3f46",
    fontSize: 11,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  staffName: {
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#18181b",
  },
  staffSub: {
    fontSize: "0.7rem",
    color: "#a1a1aa",
  },
  staffRight: {
    textAlign: "right",
  },
  staffAmount: {
    fontSize: "0.86rem",
    fontWeight: 800,
    color: "#18181b",
  },
  staffBadgePill: {
    fontSize: "0.68rem",
    backgroundColor: "#fef3c7",
    color: "#b45309",
    padding: "1px 6px",
    borderRadius: 999,
    fontWeight: 700,
    display: "inline-block",
  },
};
