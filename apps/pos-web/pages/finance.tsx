import React, { useState, useEffect } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../lib/auth";
import Nav from "../components/Nav";

// Real response shape of GET /z-report (services/finance/src/z-report.ts
// ZReportGenerator.generateDailyReport, serialized by apps/api/src/routes/finance.ts
// with bigint fields converted to strings).
interface ZReportApi {
  outletId: string;
  date: string;
  totalSales: string;
  totalTax: string;
  grandTotal: string;
  paymentModes: Record<string, string>;
  invoiceCount: number;
}

// Real response shape of GET /ledger-entries (services/finance/src/ledger-engine.ts
// listLedgerEntries, serialized by apps/api/src/routes/finance.ts with bigint
// fields converted to strings).
interface LedgerEntryApi {
  id: string;
  sourceType: string;
  sourceId: string;
  account: string;
  debitMinor: string;
  creditMinor: string;
  externalRef: string | null;
  status: string;
  createdAt: string;
  postedAt: string | null;
}

// Real response shape of GET /refunds (services/finance/src/refund-service.ts
// listRefunds, serialized by apps/api/src/routes/finance.ts with bigint
// fields converted to strings).
interface RefundApi {
  id: string;
  orderId: string;
  paymentId: string;
  amountMinor: string;
  reasonCode: string;
  status: string;
  isPartial: boolean;
  createdAt: string;
}

function daysAgoIso(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function FinancePage() {
  // The finance router checks requirePermission("finance.report") on GET /z-report,
  // so the frontend gate must match that exact action string, not an invented one.
  const { me, loading: authLoading } = useAuthGuard("finance.report");
  const [date, setDate] = useState<string>(todayIso());
  const [report, setReport] = useState<ZReportApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState<string>(daysAgoIso(7));
  const [toDate, setToDate] = useState<string>(todayIso());
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntryApi[] | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [refunds, setRefunds] = useState<RefundApi[] | null>(null);
  const [refundsLoading, setRefundsLoading] = useState(true);
  const [refundsError, setRefundsError] = useState<string | null>(null);

  const fetchReport = () => {
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    authedFetch(`/finance/z-report?date=${encodeURIComponent(date)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json() as Promise<ZReportApi>;
      })
      .then((data) => {
        clearTimeout(timeout);
        setReport(data);
        setLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeout);
        setLoadError(err instanceof Error ? err.message : "Failed to load Z-report");
        setReport(null);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (authLoading) return;
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, date]);

  const fetchLedgerEntries = () => {
    setLedgerLoading(true);
    setLedgerError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    authedFetch(
      `/finance/ledger-entries?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json() as Promise<LedgerEntryApi[]>;
      })
      .then((data) => {
        clearTimeout(timeout);
        setLedgerEntries(data);
        setLedgerLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeout);
        setLedgerError(err instanceof Error ? err.message : "Failed to load ledger entries");
        setLedgerEntries(null);
        setLedgerLoading(false);
      });
  };

  const fetchRefunds = () => {
    setRefundsLoading(true);
    setRefundsError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    authedFetch(
      `/finance/refunds?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json() as Promise<RefundApi[]>;
      })
      .then((data) => {
        clearTimeout(timeout);
        setRefunds(data);
        setRefundsLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeout);
        setRefundsError(err instanceof Error ? err.message : "Failed to load refunds");
        setRefunds(null);
        setRefundsLoading(false);
      });
  };

  useEffect(() => {
    if (authLoading) return;
    fetchLedgerEntries();
    fetchRefunds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, fromDate, toDate]);

  const formatMoney = (minor: string | number) => {
    const paise = typeof minor === "string" ? Number(minor) : minor;
    return "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const initials = me?.name
    ? me.name
        .split(" ")
        .map((p) => p.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  const paymentModeEntries = report ? Object.entries(report.paymentModes) : [];

  return (
    <div className="admin-app">
      <Head>
        <title>KapMeta POS - Finance & Z-Report</title>
        <meta name="description" content="Daily reconciliation / Z-report for the outlet." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <Nav variant="sidebar" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand-badge">
            <span className="brand-icon">⚡</span>
            <span className="brand-name">KapMeta Finance</span>
          </div>
        </div>

        <div className="topbar-right">
          <div className="user-profile-badge">
            <div className="avatar-circle">{initials}</div>
            <div className="user-info-text">
              <span className="user-name">{me?.name ?? "Loading..."}</span>
              <span className="user-role">{me?.roles?.[0] ?? ""}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-body">
        {authLoading && (
          <div className="empty-state-card">
            <span className="empty-icon">🔐</span>
            <h3>Checking access...</h3>
          </div>
        )}

        {!authLoading && me && !me.permissions.includes("finance.report") && (
          <div className="empty-state-card">
            <span className="empty-icon">🚫</span>
            <h3>No finance access</h3>
            <p>Your role does not grant the "finance.report" permission required to view Z-reports.</p>
          </div>
        )}

        {!authLoading && me && me.permissions.includes("finance.report") && (
          <>
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">Operations &gt; Finance</span>
                <h1 className="greeting-title">Daily Z-Report</h1>
                <p className="greeting-subtitle">
                  {loading
                    ? "Loading Z-report..."
                    : report
                    ? (
                        <>
                          <strong>{formatMoney(report.grandTotal)}</strong> settled across{" "}
                          <strong>{report.invoiceCount} invoices</strong> on {report.date}.
                        </>
                      )
                    : "No Z-report data available for the selected date."}
                </p>
              </div>

              <div className="date-controls-group">
                <input
                  type="date"
                  className="date-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </section>

            {loading && (
              <div className="empty-state-card">
                <span className="empty-icon">⏳</span>
                <h3>Loading Z-report...</h3>
              </div>
            )}

            {!loading && loadError && (
              <div className="empty-state-card">
                <span className="empty-icon">⚠️</span>
                <h3>Could not load Z-report</h3>
                <p>{loadError}. Check that the API is running and you are signed in.</p>
              </div>
            )}

            {!loading && !loadError && report && (
              <>
                <section className="kpi-cards-grid">
                  <div className="kpi-card">
                    <div className="kpi-top">
                      <div className="icon-badge green">
                        <span>₹</span>
                      </div>
                      <span className="kpi-heading">TOTAL SALES (EX. TAX)</span>
                    </div>
                    <div className="kpi-main">
                      <h2 className="kpi-number">{formatMoney(report.totalSales)}</h2>
                    </div>
                  </div>

                  <div className="kpi-card">
                    <div className="kpi-top">
                      <div className="icon-badge amber">
                        <span>%</span>
                      </div>
                      <span className="kpi-heading">TOTAL TAX</span>
                    </div>
                    <div className="kpi-main">
                      <h2 className="kpi-number">{formatMoney(report.totalTax)}</h2>
                    </div>
                  </div>

                  <div className="kpi-card">
                    <div className="kpi-top">
                      <div className="icon-badge purple">
                        <span>Σ</span>
                      </div>
                      <span className="kpi-heading">GRAND TOTAL</span>
                    </div>
                    <div className="kpi-main">
                      <h2 className="kpi-number">{formatMoney(report.grandTotal)}</h2>
                    </div>
                  </div>

                  <div className="kpi-card">
                    <div className="kpi-top">
                      <div className="icon-badge blue">
                        <span>🧾</span>
                      </div>
                      <span className="kpi-heading">INVOICE COUNT</span>
                    </div>
                    <div className="kpi-main">
                      <h2 className="kpi-number">{report.invoiceCount}</h2>
                    </div>
                  </div>
                </section>

                <section className="panel-card invoices-table-card">
                  <div className="panel-header">
                    <div>
                      <h3>Payment Mode Split</h3>
                      <p className="panel-sub">From GET /z-report for {report.date}</p>
                    </div>
                    <span className="total-badge">{paymentModeEntries.length} modes</span>
                  </div>

                  {paymentModeEntries.length === 0 && (
                    <div className="not-available-box">
                      <p>No captured payments recorded for this date.</p>
                    </div>
                  )}

                  {paymentModeEntries.length > 0 && (
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Payment Mode</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentModeEntries
                            .sort((a, b) => Number(b[1]) - Number(a[1]))
                            .map(([mode, amount]) => (
                              <tr key={mode}>
                                <td>
                                  <strong>{mode}</strong>
                                </td>
                                <td className="amount-cell">{formatMoney(amount)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="panel-card invoices-table-card">
                  <div className="panel-header">
                    <div>
                      <h3>Ledger Entries</h3>
                      <p className="panel-sub">From GET /ledger-entries for {fromDate} to {toDate}</p>
                    </div>
                    <div className="date-controls-group">
                      <input
                        type="date"
                        className="date-input"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                      />
                      <input
                        type="date"
                        className="date-input"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                      />
                      <span className="total-badge">{ledgerEntries?.length ?? 0} entries</span>
                    </div>
                  </div>

                  {ledgerLoading && (
                    <div className="not-available-box">
                      <p>Loading ledger entries...</p>
                    </div>
                  )}

                  {!ledgerLoading && ledgerError && (
                    <div className="not-available-box">
                      <p>Could not load ledger entries: {ledgerError}.</p>
                    </div>
                  )}

                  {!ledgerLoading && !ledgerError && (ledgerEntries?.length ?? 0) === 0 && (
                    <div className="not-available-box">
                      <p>No ledger entries recorded for this date range.</p>
                    </div>
                  )}

                  {!ledgerLoading && !ledgerError && ledgerEntries && ledgerEntries.length > 0 && (
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Source</th>
                            <th>Account</th>
                            <th>Debit</th>
                            <th>Credit</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledgerEntries.map((entry) => (
                            <tr key={entry.id}>
                              <td>{new Date(entry.createdAt).toLocaleDateString("en-IN")}</td>
                              <td>{entry.sourceType}</td>
                              <td>{entry.account}</td>
                              <td className="amount-cell">{formatMoney(entry.debitMinor)}</td>
                              <td className="amount-cell">{formatMoney(entry.creditMinor)}</td>
                              <td>{entry.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="panel-card invoices-table-card">
                  <div className="panel-header">
                    <div>
                      <h3>Refunds</h3>
                      <p className="panel-sub">From GET /refunds for {fromDate} to {toDate}</p>
                    </div>
                    <span className="total-badge">{refunds?.length ?? 0} refunds</span>
                  </div>

                  {refundsLoading && (
                    <div className="not-available-box">
                      <p>Loading refunds...</p>
                    </div>
                  )}

                  {!refundsLoading && refundsError && (
                    <div className="not-available-box">
                      <p>Could not load refunds: {refundsError}.</p>
                    </div>
                  )}

                  {!refundsLoading && !refundsError && (refunds?.length ?? 0) === 0 && (
                    <div className="not-available-box">
                      <p>No refunds recorded for this date range.</p>
                    </div>
                  )}

                  {!refundsLoading && !refundsError && refunds && refunds.length > 0 && (
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Order</th>
                            <th>Amount</th>
                            <th>Reason</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {refunds.map((refund) => (
                            <tr key={refund.id}>
                              <td>{new Date(refund.createdAt).toLocaleDateString("en-IN")}</td>
                              <td>{refund.orderId}</td>
                              <td className="amount-cell">{formatMoney(refund.amountMinor)}</td>
                              <td>{refund.reasonCode}</td>
                              <td>{refund.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}

            {!loading && !loadError && !report && (
              <div className="empty-state-card">
                <span className="empty-icon">📊</span>
                <h3>No Z-report data available</h3>
                <p>No settlement data was returned for {date}.</p>
              </div>
            )}
          </>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .admin-app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          width: 100vw;
          background-color: var(--bg-base);
          color: var(--text-primary);
        }

        .topbar {
          height: 64px;
          background-color: var(--bg-card);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          position: sticky;
          top: 0;
          z-index: 20;
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .brand-badge {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .brand-icon {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          background: var(--dark-btn);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
        }

        .brand-name {
          font-size: 1.125rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .user-profile-badge {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .avatar-circle {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8125rem;
        }

        .user-info-text {
          display: flex;
          flex-direction: column;
        }

        .user-name {
          font-size: 0.8125rem;
          font-weight: 700;
          line-height: 1.2;
        }

        .user-role {
          font-size: 0.6875rem;
          color: var(--text-secondary);
        }

        .dashboard-body {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 1500px;
          margin: 0 auto;
          width: 100%;
        }

        .dashboard-greeting-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-bottom: 8px;
        }

        .breadcrumb-line {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .greeting-title {
          margin: 4px 0 2px 0;
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .greeting-subtitle {
          margin: 0;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .date-controls-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .date-input {
          padding: 8px 14px;
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
          background: var(--bg-card);
        }

        .kpi-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 18px;
        }

        .kpi-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: var(--shadow-card);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-pop);
        }

        .kpi-top {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-badge {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.125rem;
          font-weight: 800;
        }

        .icon-badge.green {
          background: #ecfdf5;
          color: #065f46;
        }

        .icon-badge.blue {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .icon-badge.amber {
          background: #fffbeb;
          color: #92400e;
        }

        .icon-badge.purple {
          background: #faf5ff;
          color: #7e22ce;
        }

        .kpi-heading {
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.5px;
        }

        .kpi-main {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }

        .kpi-number {
          margin: 0;
          font-size: 1.875rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .panel-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-card);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .panel-header h3 {
          margin: 0 0 2px 0;
          font-size: 1.125rem;
          font-weight: 800;
        }

        .panel-sub {
          margin: 0;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .pill-status {
          padding: 4px 10px;
          border-radius: var(--radius-pill);
          font-size: 0.75rem;
          font-weight: 700;
        }

        .pill-status.muted {
          background: var(--bg-subtle);
          color: var(--text-muted);
        }

        .not-available-box {
          background: var(--bg-subtle);
          border: 1px dashed var(--border);
          border-radius: var(--radius-md);
          padding: 16px;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .not-available-box p {
          margin: 0;
        }

        .invoices-table-card {
          margin-bottom: 0;
        }

        .total-badge {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          background: var(--bg-subtle);
          padding: 4px 10px;
          border-radius: var(--radius-pill);
        }

        .clean-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .clean-table th {
          padding: 12px 16px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          border-bottom: 1px solid var(--border);
        }

        .clean-table td {
          padding: 14px 16px;
          font-size: 0.875rem;
          border-bottom: 1px solid var(--border-subtle);
        }

        .clean-table tr:hover td {
          background: var(--bg-subtle);
        }

        .amount-cell {
          font-weight: 800;
          color: var(--text-primary);
        }

        .empty-state-card {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }

        .empty-icon {
          font-size: 40px;
          display: block;
          margin-bottom: 12px;
        }
      ` }} />
      </div>
      </div>
    </div>
  );
}
