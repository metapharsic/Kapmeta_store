import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import { getReportByKey } from "../../lib/report-catalog";

// Generic detail page for any report from apps/api/src/routes/reporting.ts
// (or finance.ts) that has no bespoke page of its own. It fetches the real
// endpoint named by the ?key= catalog entry and renders whatever JSON comes
// back as plain tables — no per-report layout, so a new report only needs
// a new entry in lib/report-catalog.ts, never a new page.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatCell(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => (isPlainObject(v) ? JSON.stringify(v) : String(v))).join(", ");
  }
  if (isPlainObject(value)) return JSON.stringify(value);
  // Money fields cross the wire as stringified-BigInt minor units (paise),
  // same convention as every other report in this app — a key ending in
  // "Minor" is always minor units, never a fabricated currency guess.
  if (/minor$/i.test(key) && !Number.isNaN(Number(value))) {
    const n = Number(value) / 100;
    return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (/percent$/i.test(key) && !Number.isNaN(Number(value))) {
    return `${value}%`;
  }
  return String(value);
}

function ArrayTable({ rows }: { rows: unknown[] }) {
  if (rows.length === 0) {
    return (
      <div className="not-available-box">
        <p>No rows returned.</p>
      </div>
    );
  }
  const objectRows = rows.every((r) => isPlainObject(r));
  if (!objectRows) {
    return (
      <div className="table-responsive">
        <table className="clean-table">
          <thead>
            <tr>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{isPlainObject(r) ? JSON.stringify(r) : String(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of rows as Record<string, unknown>[]) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return (
    <div className="table-responsive">
      <table className="clean-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{humanizeKey(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows as Record<string, unknown>[]).map((row, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c}>{formatCell(c, row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JsonSection({ data, title }: { data: unknown; title?: string }): JSX.Element {
  if (Array.isArray(data)) {
    return (
      <div className="json-section">
        {title && <h4>{title}</h4>}
        <ArrayTable rows={data} />
      </div>
    );
  }
  if (!isPlainObject(data)) {
    return (
      <div className="json-section">
        {title && <h4>{title}</h4>}
        <p className="scalar-line">{formatCell("value", data)}</p>
      </div>
    );
  }

  const entries = Object.entries(data);
  const scalarEntries = entries.filter(([, v]) => !isPlainObject(v) && !Array.isArray(v));
  const arrayEntries = entries.filter(([, v]) => Array.isArray(v));
  const objectEntries = entries.filter(([, v]) => isPlainObject(v));

  return (
    <div className="json-section">
      {title && <h4>{title}</h4>}
      {scalarEntries.length > 0 && (
        <table className="clean-table kv-table">
          <tbody>
            {scalarEntries.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{humanizeKey(k)}</th>
                <td>{formatCell(k, v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {arrayEntries.map(([k, v]) => (
        <JsonSection key={k} data={v} title={humanizeKey(k)} />
      ))}
      {objectEntries.map(([k, v]) => (
        <JsonSection key={k} data={v} title={humanizeKey(k)} />
      ))}
    </div>
  );
}

export default function ReportViewPage() {
  const router = useRouter();
  const key = typeof router.query.key === "string" ? router.query.key : undefined;
  const entry = getReportByKey(key);

  const { me, loading: authLoading } = useAuthGuard(entry?.permission || "report.read");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");

  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !entry?.endpoint) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams();
    if (appliedFrom) qs.set("fromDate", appliedFrom);
    if (appliedTo) qs.set("toDate", appliedTo);
    // A few endpoints (e.g. tally-export) key off a single `date` rather
    // than a range — harmless extra param for every other endpoint, which
    // simply ignores it.
    if (appliedTo) qs.set("date", appliedTo);

    const url = qs.toString() ? `${entry.endpoint}?${qs.toString()}` : entry.endpoint;
    authedFetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load report");
        setData(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, entry?.endpoint, appliedFrom, appliedTo]);

  if (authLoading) return null;

  const noAccess = entry && me && !me.permissions.includes(entry.permission);

  return (
    <div className="rv-app">
      <Head>
        <title>KapMeta POS - {entry ? entry.title : "Report"}</title>
        <meta name="description" content={entry?.description || "Report detail."} />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/reports/other-reports">Reports</Link> / {entry ? entry.title : "Unknown Report"}
                </span>
                <h1 className="greeting-title">{entry ? entry.title : "Report Not Found"}</h1>
                {entry && <p className="greeting-subtitle">{entry.description}</p>}
              </div>
            </section>

            {!entry && (
              <div className="empty-state-card">
                <span className="empty-icon">❓</span>
                <h3>Unknown report</h3>
                <p>No report matches key "{key}". Go back to Other Reports and pick one from the list.</p>
              </div>
            )}

            {entry && !entry.endpoint && (
              <div className="empty-state-card">
                <span className="empty-icon">↪️</span>
                <h3>This report has its own page</h3>
                <p>
                  <Link href={entry.href}>Open {entry.title}</Link>
                </p>
              </div>
            )}

            {entry && entry.endpoint && noAccess && (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No access</h3>
                <p>Your role does not grant the "{entry.permission}" permission required to view this report.</p>
              </div>
            )}

            {entry && entry.endpoint && !noAccess && (
              <>
                <section className="filter-card">
                  <div className="filter-row">
                    <label className="field">
                      <span className="field-label">From</span>
                      <input type="date" className="field-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="field-label">To</span>
                      <input type="date" className="field-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                    </label>
                    <div className="filter-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          setAppliedFrom(fromDate);
                          setAppliedTo(toDate);
                        }}
                      >
                        Search
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setFromDate("");
                          setToDate("");
                          setAppliedFrom("");
                          setAppliedTo("");
                        }}
                      >
                        Reset (default range)
                      </button>
                    </div>
                  </div>
                  <p className="filter-hint">
                    Leave blank to use this report's own default range. Backed live by GET {entry.endpoint}.
                  </p>
                </section>

                {loading && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⏳</span>
                    <h3>Loading report...</h3>
                  </div>
                )}

                {!loading && error && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⚠️</span>
                    <h3>Could not load this report</h3>
                    <p>{error}</p>
                  </div>
                )}

                {!loading && !error && data && (
                  <section className="panel-card">
                    <JsonSection data={data} />
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx global>{`
        .rv-app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background-color: var(--bg-base);
          color: var(--text-primary);
        }
        .dashboard-body {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
        }
        .dashboard-greeting-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .breadcrumb-line { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .breadcrumb-line :global(a) { color: var(--text-muted); text-decoration: underline; }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .greeting-subtitle { margin: 0; font-size: 0.875rem; color: var(--text-secondary); }
        .btn-primary, .btn-secondary {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          min-height: 38px; padding: 0 16px; border-radius: var(--radius-md);
          font-size: 0.8125rem; font-weight: 600; cursor: pointer;
        }
        .btn-primary { border: 1px solid var(--dark-btn); background: var(--dark-btn); color: var(--bg-card); }
        .btn-primary:hover { background: var(--dark-btn-hover); }
        .btn-secondary { border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); }
        .btn-secondary:hover { background: var(--bg-subtle); }
        .filter-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: 16px; display: flex; flex-direction: column; gap: 8px; }
        .filter-row { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
        .filter-hint { margin: 0; font-size: 0.75rem; color: var(--text-muted); }
        .field { display: flex; flex-direction: column; gap: 4px; min-width: 160px; }
        .field-label { font-size: 0.6875rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
        .field-input { min-height: 38px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-primary); font-size: 0.8125rem; font-weight: 500; width: 100%; }
        .filter-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .panel-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 22px; }
        .json-section { display: flex; flex-direction: column; gap: 10px; }
        .json-section h4 { margin: 6px 0 0 0; font-size: 0.9375rem; font-weight: 800; color: var(--text-primary); padding-top: 10px; border-top: 1px solid var(--border-subtle); }
        .json-section:first-child h4 { border-top: none; padding-top: 0; }
        .scalar-line { margin: 0; font-size: 0.875rem; color: var(--text-primary); }
        .not-available-box { background: var(--bg-subtle); border: 1px dashed var(--border); border-radius: var(--radius-md); padding: 16px; font-size: 0.8125rem; color: var(--text-secondary); }
        .not-available-box p { margin: 0; }
        .table-responsive { overflow-x: auto; }
        .clean-table { width: 100%; border-collapse: collapse; text-align: left; }
        .clean-table th { padding: 12px 16px; font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .clean-table td { padding: 12px 16px; font-size: 0.8438rem; border-bottom: 1px solid var(--border-subtle); }
        .clean-table tr:hover td { background: var(--bg-subtle); }
        .kv-table th[scope="row"] { text-align: left; width: 260px; text-transform: none; letter-spacing: 0; font-weight: 700; color: var(--text-secondary); border-bottom: 1px solid var(--border-subtle); }
        .kv-table td { font-weight: 600; color: var(--text-primary); }
        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
        .empty-state-card :global(a) { color: var(--accent); font-weight: 700; }
      `}</style>
    </div>
  );
}
