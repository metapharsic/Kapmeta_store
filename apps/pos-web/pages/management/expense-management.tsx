import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

// Expense & Withdrawal. 6 tabs: Expense Listing / Expense Master /
// Withdrawal Listing / Withdrawal Master / Cash Top-Up Listing / Cash
// Top-Up Master.
//
// *-Master tabs are plain named-category lists, identical in shape to
// Utility Bill Operator: GET/POST/PUT/DELETE /management/lists with
// list_key EXPENSE_MASTER / WITHDRAWAL_MASTER / CASH_TOPUP_MASTER (see the
// header comment above the accounting routes in management.ts). Embedded
// inline here rather than round-tripping through pages/management/list.tsx
// so the "Listing" tab's create-transaction form can read the same master
// list for its title dropdown without a second fetch across pages.
//
// *-Listing tabs are real rows from GET/POST /management/expense-transactions
// (kind=EXPENSE|WITHDRAWAL|CASH_TOPUP), with a real grand total from the
// same endpoint (computed server-side over the full filtered set, not just
// the current page) and a genuinely functional client-side CSV export of
// the currently loaded rows.

type Kind = "EXPENSE" | "WITHDRAWAL" | "CASH_TOPUP";
type TabKey = "expense-listing" | "expense-master" | "withdrawal-listing" | "withdrawal-master" | "cashtopup-listing" | "cashtopup-master";

const TABS: { key: TabKey; label: string; kind: Kind; listKey: string; isMaster: boolean }[] = [
  { key: "expense-listing", label: "Expense Listing", kind: "EXPENSE", listKey: "expense_master", isMaster: false },
  { key: "expense-master", label: "Expense Master", kind: "EXPENSE", listKey: "expense_master", isMaster: true },
  { key: "withdrawal-listing", label: "Withdrawal Listing", kind: "WITHDRAWAL", listKey: "withdrawal_master", isMaster: false },
  { key: "withdrawal-master", label: "Withdrawal Master", kind: "WITHDRAWAL", listKey: "withdrawal_master", isMaster: true },
  { key: "cashtopup-listing", label: "Cash Top-Up Listing", kind: "CASH_TOPUP", listKey: "cash_topup_master", isMaster: false },
  { key: "cashtopup-master", label: "Cash Top-Up Master", kind: "CASH_TOPUP", listKey: "cash_topup_master", isMaster: true },
];

interface ListRow {
  id: string;
  listKey: string;
  label: string;
  value?: string | null;
  isActive: boolean;
}

interface TxnRow {
  id: string;
  listId: string | null;
  title: string | null;
  kind: string;
  amountMinor: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

function formatMoney(minor: string): string {
  const n = Number(minor) / 100;
  if (Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function downloadCsv(filename: string, rows: TxnRow[]) {
  const header = ["Title", "Amount", "Note", "Created By", "Created At"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      r.title || "",
      (Number(r.amountMinor) / 100).toFixed(2),
      (r.note || "").replace(/"/g, '""'),
      r.createdBy || "",
      r.createdAt,
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExpenseManagementPage() {
  const { me, loading: authLoading } = useAuthGuard("settings.read");
  const canManage = !!me && me.permissions.includes("settings.manage");

  const [tab, setTab] = useState<TabKey>("expense-listing");
  const tabDef = TABS.find((t) => t.key === tab)!;

  // Master list state (shared: the listing tab's title dropdown reads it too)
  const [masterRows, setMasterRows] = useState<ListRow[] | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [savingMaster, setSavingMaster] = useState(false);

  // Listing tab state
  const [txnRows, setTxnRows] = useState<TxnRow[] | null>(null);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnError, setTxnError] = useState<string | null>(null);
  const [grandTotalMinor, setGrandTotalMinor] = useState("0");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [titleFilter, setTitleFilter] = useState("");

  // Create-transaction form
  const [formListId, setFormListId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [savingTxn, setSavingTxn] = useState(false);

  const loadMaster = React.useCallback(() => {
    setMasterLoading(true);
    setMasterError(null);
    authedFetch(`/management/lists?key=${encodeURIComponent(tabDef.listKey)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((json) => setMasterRows(Array.isArray(json) ? json : []))
      .catch((err) => {
        setMasterError(err instanceof Error ? err.message : "Failed to load");
        setMasterRows(null);
      })
      .finally(() => setMasterLoading(false));
  }, [tabDef.listKey]);

  const loadTxns = React.useCallback(() => {
    setTxnLoading(true);
    setTxnError(null);
    const params = new URLSearchParams({ kind: tabDef.kind, pageSize: "200" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (titleFilter.trim()) params.set("title", titleFilter.trim());
    authedFetch(`/management/expense-transactions?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        setTxnRows(Array.isArray(json.items) ? json.items : []);
        setGrandTotalMinor(json.grandTotalMinor ?? "0");
      })
      .catch((err) => {
        setTxnError(err instanceof Error ? err.message : "Failed to load");
        setTxnRows(null);
      })
      .finally(() => setTxnLoading(false));
  }, [tabDef.kind, from, to, titleFilter]);

  useEffect(() => {
    if (authLoading) return;
    // The listing tab's title dropdown needs the master list too, so load
    // both whichever tab is active.
    loadMaster();
    if (!tabDef.isMaster) loadTxns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, tab]);

  if (authLoading) return null;
  const noAccess = me && !me.permissions.includes("settings.read");

  const handleAddMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setSavingMaster(true);
    try {
      const res = await authedFetch(`/management/lists`, {
        method: "POST",
        body: JSON.stringify({ listKey: tabDef.listKey, label: newLabel.trim(), value: newValue.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      setNewLabel("");
      setNewValue("");
      loadMaster();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add row");
    } finally {
      setSavingMaster(false);
    }
  };

  const toggleMasterActive = async (row: ListRow) => {
    setSavingMaster(true);
    try {
      const res = await authedFetch(`/management/lists/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      loadMaster();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSavingMaster(false);
    }
  };

  const handleDeleteMaster = async (id: string) => {
    if (!confirm("Delete this master entry?")) return;
    setSavingMaster(true);
    try {
      const res = await authedFetch(`/management/lists/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      loadMaster();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSavingMaster(false);
    }
  };

  const handleAddTxn = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Math.round(Number(formAmount) * 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a valid amount");
      return;
    }
    setSavingTxn(true);
    try {
      const res = await authedFetch(`/management/expense-transactions`, {
        method: "POST",
        body: JSON.stringify({ kind: tabDef.kind, listId: formListId || undefined, amountMinor: amount, note: formNote.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      setFormListId("");
      setFormAmount("");
      setFormNote("");
      loadTxns();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save transaction");
    } finally {
      setSavingTxn(false);
    }
  };

  return (
    <div className="mg-app">
      <Head>
        <title>KapMeta POS - Expense & Withdrawal</title>
      </Head>
      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/admin">Management</Link> / Accounting / Expense & Withdrawal
                </span>
                <h1 className="greeting-title">Expense & Withdrawal</h1>
              </div>
            </section>

            {noAccess && (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No access</h3>
                <p>Your role does not grant the "settings.read" permission required here.</p>
              </div>
            )}

            {!noAccess && (
              <>
                <section className="panel-card">
                  <div className="sub-tabs">
                    {TABS.map((t) => (
                      <button
                        type="button"
                        key={t.key}
                        className={`sub-tab ${tab === t.key ? "sub-tab-active" : ""}`}
                        onClick={() => setTab(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </section>

                {tabDef.isMaster && (
                  <>
                    {canManage && (
                      <section className="panel-card">
                        <h4>Add new {tabDef.label.replace(" Master", "")}</h4>
                        <form className="add-row-form" onSubmit={handleAddMaster}>
                          <input className="field-input" placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} required />
                          <input className="field-input" placeholder="Value (optional)" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                          <button type="submit" className="btn-primary" disabled={savingMaster || !newLabel.trim()}>
                            Add
                          </button>
                        </form>
                      </section>
                    )}

                    {masterLoading && (
                      <div className="empty-state-card">
                        <span className="empty-icon">⏳</span>
                        <h3>Loading...</h3>
                      </div>
                    )}
                    {!masterLoading && masterError && (
                      <div className="empty-state-card">
                        <span className="empty-icon">⚠️</span>
                        <h3>Could not load</h3>
                        <p>{masterError}</p>
                      </div>
                    )}
                    {!masterLoading && !masterError && masterRows && masterRows.length === 0 && (
                      <div className="empty-state-card">
                        <span className="empty-icon">📭</span>
                        <h3>No entries yet</h3>
                        <p>Add one above to get started.</p>
                      </div>
                    )}
                    {!masterLoading && !masterError && masterRows && masterRows.length > 0 && (
                      <section className="panel-card">
                        <div className="table-responsive">
                          <table className="clean-table">
                            <thead>
                              <tr>
                                <th>Label</th>
                                <th>Value</th>
                                <th>Active</th>
                                {canManage && <th>Actions</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {masterRows.map((row) => (
                                <tr key={row.id}>
                                  <td>{row.label}</td>
                                  <td>{row.value || "—"}</td>
                                  <td>
                                    {canManage ? (
                                      <button type="button" className="btn-secondary" disabled={savingMaster} onClick={() => toggleMasterActive(row)}>
                                        {row.isActive ? "Active" : "Inactive"}
                                      </button>
                                    ) : row.isActive ? "Yes" : "No"}
                                  </td>
                                  {canManage && (
                                    <td className="row-actions">
                                      <button type="button" className="btn-secondary" disabled={savingMaster} onClick={() => handleDeleteMaster(row.id)}>
                                        Delete
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}
                  </>
                )}

                {!tabDef.isMaster && (
                  <>
                    {canManage && (
                      <section className="panel-card">
                        <h4>Record new {tabDef.label.replace(" Listing", "")}</h4>
                        <form className="add-row-form" onSubmit={handleAddTxn}>
                          <select className="field-input" value={formListId} onChange={(e) => setFormListId(e.target.value)}>
                            <option value="">— Select title —</option>
                            {(masterRows || []).filter((r) => r.isActive).map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <input className="field-input" placeholder="Amount (₹)" type="number" step="0.01" min="0.01" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} required />
                          <input className="field-input" placeholder="Note (optional)" value={formNote} onChange={(e) => setFormNote(e.target.value)} />
                          <button type="submit" className="btn-primary" disabled={savingTxn || !formAmount}>
                            Save
                          </button>
                        </form>
                      </section>
                    )}

                    <section className="panel-card">
                      <div className="filter-row">
                        <label className="filter-field">
                          <span>From</span>
                          <input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </label>
                        <label className="filter-field">
                          <span>To</span>
                          <input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
                        </label>
                        <label className="filter-field">
                          <span>Title</span>
                          <input className="field-input" placeholder="Search title" value={titleFilter} onChange={(e) => setTitleFilter(e.target.value)} />
                        </label>
                        <div className="filter-actions">
                          <button type="button" className="btn-primary" disabled={txnLoading} onClick={loadTxns}>
                            Search
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={!txnRows || txnRows.length === 0}
                            onClick={() => txnRows && downloadCsv(`${tabDef.key}.csv`, txnRows)}
                          >
                            Export Excel (CSV)
                          </button>
                        </div>
                      </div>
                      <p className="grand-total">Grand Total: {formatMoney(grandTotalMinor)}</p>
                    </section>

                    {txnLoading && (
                      <div className="empty-state-card">
                        <span className="empty-icon">⏳</span>
                        <h3>Loading...</h3>
                      </div>
                    )}
                    {!txnLoading && txnError && (
                      <div className="empty-state-card">
                        <span className="empty-icon">⚠️</span>
                        <h3>Could not load transactions</h3>
                        <p>{txnError}</p>
                      </div>
                    )}
                    {!txnLoading && !txnError && txnRows && txnRows.length === 0 && (
                      <div className="empty-state-card">
                        <span className="empty-icon">📭</span>
                        <h3>No transactions found</h3>
                        <p>Record one above, or widen the date range.</p>
                      </div>
                    )}
                    {!txnLoading && !txnError && txnRows && txnRows.length > 0 && (
                      <section className="panel-card">
                        <div className="table-responsive">
                          <table className="clean-table">
                            <thead>
                              <tr>
                                <th>Title</th>
                                <th>Amount</th>
                                <th>Note</th>
                                <th>Created</th>
                              </tr>
                            </thead>
                            <tbody>
                              {txnRows.map((r) => (
                                <tr key={r.id}>
                                  <td>{r.title || "—"}</td>
                                  <td>{formatMoney(r.amountMinor)}</td>
                                  <td>{r.note || "—"}</td>
                                  <td>{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx global>{`
        .mg-app { display: flex; flex-direction: column; min-height: 100vh; background-color: var(--bg-base); color: var(--text-primary); }
        .dashboard-body { padding: 24px 32px; display: flex; flex-direction: column; gap: 20px; max-width: 1400px; margin: 0 auto; width: 100%; }
        .dashboard-greeting-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .breadcrumb-line { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .breadcrumb-line :global(a) { color: var(--text-muted); text-decoration: underline; }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .panel-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 12px; }
        .panel-card h4 { margin: 0; font-size: 0.9375rem; font-weight: 800; }
        .sub-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
        .sub-tab { border: none; background: transparent; color: var(--text-muted); padding: 8px 12px; font-size: 0.8125rem; font-weight: 600; cursor: pointer; border-radius: var(--radius-md); }
        .sub-tab-active { background: var(--bg-base); color: var(--text-primary); }
        .add-row-form { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .filter-row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
        .filter-field { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); }
        .filter-actions { display: flex; gap: 10px; }
        .grand-total { margin: 0; font-size: 0.9375rem; font-weight: 800; }
        .field-input { min-height: 38px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-primary); font-size: 0.8125rem; font-weight: 500; }
        .btn-primary, .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 16px; border-radius: var(--radius-md); font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
        .btn-primary { border: 1px solid var(--dark-btn); background: var(--dark-btn); color: var(--bg-card); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); }
        .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
        .table-responsive { overflow-x: auto; }
        .clean-table { width: 100%; border-collapse: collapse; text-align: left; }
        .clean-table th { padding: 12px 16px; font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .clean-table td { padding: 12px 16px; font-size: 0.8438rem; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
        .row-actions { display: flex; gap: 8px; }
        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
