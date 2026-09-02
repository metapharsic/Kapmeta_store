// "Menu Scheduling" — day-of-week / time-window availability windows for a
// menu item, optionally scoped to a category. Backed by
// GET/POST/PATCH/DELETE /menu-scheduling/schedules
// (apps/api/src/routes/menu-scheduling.ts).
import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

interface MenuItemOption {
  id: string;
  name: string;
  categoryId: string;
}

interface Category {
  id: string;
  name: string;
}

interface Schedule {
  id: string;
  outletId: string;
  itemId: string;
  categoryId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function dayLabel(value: number): string {
  return DAYS.find((d) => d.value === value)?.label ?? `Day ${value}`;
}

function toHm(time: string): string {
  // API returns "HH:MM:SS" — trim seconds for <input type="time">.
  return time.length >= 5 ? time.slice(0, 5) : time;
}

interface NewScheduleDraft {
  categoryId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

const EMPTY_DRAFT: NewScheduleDraft = {
  categoryId: "",
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "22:00",
  isActive: true,
};

export default function MenuSchedulingPage() {
  const { me, loading: authLoading } = useAuthGuard("menu.read");
  const canManage = !!me?.permissions?.includes("menu.item.manage");

  const [items, setItems] = useState<MenuItemOption[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsLoadError, setItemsLoadError] = useState<string | null>(null);

  const [itemSearch, setItemSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [schedulesLoadError, setSchedulesLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<NewScheduleDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<NewScheduleDraft>(EMPTY_DRAFT);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    setLoadingItems(true);
    setItemsLoadError(null);
    Promise.all([authedFetch("/menu/items"), authedFetch("/menu/categories")])
      .then(async ([itemsRes, catsRes]) => {
        if (!itemsRes.ok) throw new Error("Failed to load menu items");
        const itemsData = await itemsRes.json();
        setItems(
          (Array.isArray(itemsData) ? itemsData : []).map((it: any) => ({
            id: it.id,
            name: it.name,
            categoryId: it.categoryId,
          }))
        );
        if (catsRes.ok) {
          const catsData = await catsRes.json();
          setCategories((Array.isArray(catsData) ? catsData : []).map((c: any) => ({ id: c.id, name: c.name })));
        }
      })
      .catch((err) => setItemsLoadError(err?.message || "Failed to load menu items"))
      .finally(() => setLoadingItems(false));
  }, [authLoading]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, itemSearch]);

  const selectedItem = items.find((i) => i.id === selectedItemId) || null;

  const fetchSchedules = (itemId: string) => {
    setLoadingSchedules(true);
    setSchedulesLoadError(null);
    authedFetch(`/menu-scheduling/schedules?itemId=${encodeURIComponent(itemId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load schedules");
        }
        return res.json();
      })
      .then((data) => setSchedules(Array.isArray(data) ? data : []))
      .catch((err) => setSchedulesLoadError(err?.message || "Failed to load schedules"))
      .finally(() => setLoadingSchedules(false));
  };

  useEffect(() => {
    if (!selectedItemId) {
      setSchedules([]);
      return;
    }
    fetchSchedules(selectedItemId);
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setConfirmDeleteId(null);
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId]);

  const selectItem = (id: string) => {
    setSelectedItemId(id);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return;
    if (draft.endTime <= draft.startTime) {
      setNotice({ kind: "error", text: "End time must be after start time." });
      return;
    }
    setCreating(true);
    setNotice(null);
    try {
      const res = await authedFetch("/menu-scheduling/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedItemId,
          categoryId: draft.categoryId || undefined,
          dayOfWeek: draft.dayOfWeek,
          startTime: draft.startTime,
          endTime: draft.endTime,
          isActive: draft.isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create schedule");
      }
      setNotice({ kind: "info", text: `Schedule added for ${dayLabel(draft.dayOfWeek)}.` });
      setDraft((prev) => ({ ...EMPTY_DRAFT, categoryId: prev.categoryId }));
      fetchSchedules(selectedItemId);
    } catch (err: any) {
      setNotice({ kind: "error", text: err?.message || "Failed to create schedule" });
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (s: Schedule) => {
    setEditingId(s.id);
    setEditDraft({
      categoryId: s.categoryId || "",
      dayOfWeek: s.dayOfWeek,
      startTime: toHm(s.startTime),
      endTime: toHm(s.endTime),
      isActive: s.isActive,
    });
    setConfirmDeleteId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    if (editDraft.endTime <= editDraft.startTime) {
      setNotice({ kind: "error", text: "End time must be after start time." });
      return;
    }
    setSavingEditId(id);
    setNotice(null);
    try {
      const res = await authedFetch(`/menu-scheduling/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: editDraft.categoryId || null,
          dayOfWeek: editDraft.dayOfWeek,
          startTime: editDraft.startTime,
          endTime: editDraft.endTime,
          isActive: editDraft.isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update schedule");
      }
      setNotice({ kind: "info", text: "Schedule updated." });
      setEditingId(null);
      if (selectedItemId) fetchSchedules(selectedItemId);
    } catch (err: any) {
      setNotice({ kind: "error", text: err?.message || "Failed to update schedule" });
    } finally {
      setSavingEditId(null);
    }
  };

  const toggleActive = async (s: Schedule) => {
    setSavingEditId(s.id);
    try {
      const res = await authedFetch(`/menu-scheduling/schedules/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update schedule");
      }
      if (selectedItemId) fetchSchedules(selectedItemId);
    } catch (err: any) {
      setNotice({ kind: "error", text: err?.message || "Failed to update schedule" });
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDelete = async (s: Schedule) => {
    setDeletingId(s.id);
    setNotice(null);
    try {
      const res = await authedFetch(`/menu-scheduling/schedules/${s.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete schedule");
      }
      setNotice({ kind: "info", text: "Schedule deleted." });
      setSchedules((prev) => prev.filter((row) => row.id !== s.id));
    } catch (err: any) {
      setNotice({ kind: "error", text: err?.message || "Failed to delete schedule" });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="page-shell">
      <Head>
        <title>KapMeta POS — Menu Scheduling</title>
        <meta name="description" content="Set day-of-week and time-window availability for menu items." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-badge">
                <span className="brand-icon">🗓️</span>
                <span className="brand-name">Menu Scheduling</span>
              </div>
            </div>
            <div className="topbar-right">
              <div className="user-profile-badge">
                <div className="avatar-circle">{me?.name ? me.name.charAt(0).toUpperCase() : "?"}</div>
                <span className="user-name">{me?.name ?? "Loading..."}</span>
              </div>
            </div>
          </header>

          <main className="page-content">
            {authLoading && (
              <div className="empty-state-card">
                <span className="empty-icon">🔐</span>
                <h3>Checking access...</h3>
              </div>
            )}

            {!authLoading && (
              <>
                <div className="flex-banner">
                  <span className="empty-icon">💡</span>
                  <p>
                    Availability doesn&apos;t have to be all-or-nothing. Build a weekly schedule per item —
                    breakfast-only items, weekend specials, lunch-hour windows — and this outlet's menu will
                    respect it automatically.
                  </p>
                </div>

                {notice && (
                  <div className={`notice-banner notice-${notice.kind}`}>
                    <span className="empty-icon">{notice.kind === "error" ? "❌" : "ℹ️"}</span>
                    <p>{notice.text}</p>
                  </div>
                )}

                <section className="item-picker-card">
                  <span className="section-label">Select Menu Item</span>
                  <input
                    type="text"
                    className="item-search"
                    placeholder="Search menu items..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />

                  {loadingItems && <p className="muted-note">Loading menu items...</p>}
                  {!loadingItems && itemsLoadError && <p className="muted-note error-text">{itemsLoadError}</p>}
                  {!loadingItems && !itemsLoadError && (
                    <div className="item-chip-row">
                      {filteredItems.map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          className={`item-chip ${selectedItemId === i.id ? "active" : ""}`}
                          onClick={() => selectItem(i.id)}
                        >
                          {i.name}
                        </button>
                      ))}
                      {filteredItems.length === 0 && <span className="muted-note">No items match.</span>}
                    </div>
                  )}
                </section>

                {selectedItem && (
                  <>
                    {canManage && (
                      <section className="builder-card">
                        <span className="section-label">Add Schedule for &ldquo;{selectedItem.name}&rdquo;</span>
                        <form onSubmit={handleCreate} className="builder-form">
                          <label>
                            Day of Week
                            <select
                              value={draft.dayOfWeek}
                              onChange={(e) => setDraft((d) => ({ ...d, dayOfWeek: Number(e.target.value) }))}
                            >
                              {DAYS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Start Time
                            <input
                              type="time"
                              value={draft.startTime}
                              onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
                            />
                          </label>
                          <label>
                            End Time
                            <input
                              type="time"
                              value={draft.endTime}
                              onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
                            />
                          </label>
                          <label>
                            Category (optional)
                            <select
                              value={draft.categoryId}
                              onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
                            >
                              <option value="">— None —</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={draft.isActive}
                              onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                            />
                            Active
                          </label>
                          <button type="submit" className="btn-primary" disabled={creating}>
                            {creating ? "Adding..." : "+ Add Schedule"}
                          </button>
                        </form>
                      </section>
                    )}

                    <section className="schedule-list-card">
                      <span className="section-label">Existing Schedules — &ldquo;{selectedItem.name}&rdquo;</span>

                      {loadingSchedules && <p className="muted-note">Loading schedules...</p>}
                      {!loadingSchedules && schedulesLoadError && (
                        <p className="muted-note error-text">{schedulesLoadError}</p>
                      )}
                      {!loadingSchedules && !schedulesLoadError && schedules.length === 0 && (
                        <p className="muted-note">No schedules yet — this item follows normal availability every day.</p>
                      )}

                      {!loadingSchedules && !schedulesLoadError && schedules.length > 0 && (
                        <div className="table-scroll">
                          <table className="schedule-table">
                            <thead>
                              <tr>
                                <th>Day</th>
                                <th>Window</th>
                                <th>Category</th>
                                <th>Active</th>
                                {canManage && <th>Actions</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {schedules.map((s) => {
                                const isEditing = editingId === s.id;
                                if (isEditing) {
                                  return (
                                    <tr key={s.id} className="editing-row">
                                      <td>
                                        <select
                                          value={editDraft.dayOfWeek}
                                          onChange={(e) =>
                                            setEditDraft((d) => ({ ...d, dayOfWeek: Number(e.target.value) }))
                                          }
                                        >
                                          {DAYS.map((d) => (
                                            <option key={d.value} value={d.value}>
                                              {d.label}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td>
                                        <div className="inline-time-row">
                                          <input
                                            type="time"
                                            value={editDraft.startTime}
                                            onChange={(e) =>
                                              setEditDraft((d) => ({ ...d, startTime: e.target.value }))
                                            }
                                          />
                                          <span>–</span>
                                          <input
                                            type="time"
                                            value={editDraft.endTime}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, endTime: e.target.value }))}
                                          />
                                        </div>
                                      </td>
                                      <td>
                                        <select
                                          value={editDraft.categoryId}
                                          onChange={(e) =>
                                            setEditDraft((d) => ({ ...d, categoryId: e.target.value }))
                                          }
                                        >
                                          <option value="">— None —</option>
                                          {categories.map((c) => (
                                            <option key={c.id} value={c.id}>
                                              {c.name}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td>
                                        <input
                                          type="checkbox"
                                          checked={editDraft.isActive}
                                          onChange={(e) =>
                                            setEditDraft((d) => ({ ...d, isActive: e.target.checked }))
                                          }
                                        />
                                      </td>
                                      {canManage && (
                                        <td>
                                          <div className="row-actions">
                                            <button
                                              type="button"
                                              className="btn-secondary small"
                                              disabled={savingEditId === s.id}
                                              onClick={() => saveEdit(s.id)}
                                            >
                                              {savingEditId === s.id ? "Saving..." : "Save"}
                                            </button>
                                            <button type="button" className="btn-secondary small" onClick={cancelEdit}>
                                              Cancel
                                            </button>
                                          </div>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                }

                                return (
                                  <tr key={s.id}>
                                    <td>{dayLabel(s.dayOfWeek)}</td>
                                    <td>
                                      {toHm(s.startTime)} – {toHm(s.endTime)}
                                    </td>
                                    <td>{categories.find((c) => c.id === s.categoryId)?.name || "—"}</td>
                                    <td>
                                      <button
                                        type="button"
                                        className={`status-pill ${s.isActive ? "active" : "inactive"}`}
                                        disabled={!canManage || savingEditId === s.id}
                                        onClick={() => toggleActive(s)}
                                        title={canManage ? "Click to toggle" : undefined}
                                      >
                                        {savingEditId === s.id ? "..." : s.isActive ? "Active" : "Inactive"}
                                      </button>
                                    </td>
                                    {canManage && (
                                      <td>
                                        {confirmDeleteId === s.id ? (
                                          <div className="confirm-row">
                                            <span className="confirm-text">Delete?</span>
                                            <button
                                              type="button"
                                              className="btn-secondary small btn-danger"
                                              disabled={deletingId === s.id}
                                              onClick={() => handleDelete(s)}
                                            >
                                              {deletingId === s.id ? "Deleting..." : "Yes"}
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-secondary small"
                                              onClick={() => setConfirmDeleteId(null)}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="row-actions">
                                            <button
                                              type="button"
                                              className="btn-secondary small"
                                              onClick={() => startEdit(s)}
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-secondary small btn-danger"
                                              onClick={() => setConfirmDeleteId(s.id)}
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx>{`
        .page-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--bg-base);
          color: var(--text-primary);
        }

        .page-content {
          padding: 24px;
          max-width: 980px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .avatar-circle {
          width: 32px;
          height: 32px;
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
        }

        .user-profile-badge {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-name {
          font-size: 13px;
          font-weight: 600;
        }

        .empty-state-card {
          text-align: center;
          padding: 48px 20px;
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }

        .empty-icon {
          font-size: 18px;
        }

        .flex-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          background: var(--warning-subtle);
          color: var(--warning-text);
          border: 1px solid var(--warning);
          border-radius: var(--radius-lg);
          padding: 14px 18px;
        }

        .flex-banner p {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
        }

        .notice-banner {
          display: flex;
          align-items: flex-start;
          gap: 4px;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          font-size: 13px;
          line-height: 1.5;
        }

        .notice-banner p {
          margin: 0;
        }

        .notice-info {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          border: 1px solid var(--accent);
        }

        .notice-error {
          background: var(--destructive-subtle);
          color: var(--destructive-text);
          border: 1px solid var(--destructive);
        }

        .section-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-bottom: 10px;
        }

        .item-picker-card,
        .builder-card,
        .schedule-list-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 18px 20px;
          box-shadow: var(--shadow-card);
        }

        .item-search {
          width: 100%;
          box-sizing: border-box;
          padding: 9px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 13px;
          margin-bottom: 12px;
        }

        .item-chip-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          max-height: 200px;
          overflow-y: auto;
        }

        .item-chip {
          padding: 8px 14px;
          min-height: 36px;
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          background: var(--bg-subtle);
          color: var(--text-secondary);
        }

        .item-chip.active {
          background: var(--dark-btn);
          color: #fff;
          border-color: var(--dark-btn);
        }

        .builder-form {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          align-items: flex-end;
        }

        .builder-form label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .builder-form input,
        .builder-form select {
          padding: 9px 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 13px;
          color: var(--text-primary);
          font-family: inherit;
          min-height: 38px;
        }

        .checkbox-label {
          flex-direction: row !important;
          align-items: center;
          gap: 6px !important;
        }

        .muted-note {
          font-size: 12.5px;
          color: var(--text-secondary);
        }

        .error-text {
          color: var(--destructive-text);
        }

        .table-scroll {
          overflow-x: auto;
        }

        .schedule-table {
          width: 100%;
          min-width: 520px;
          border-collapse: collapse;
          font-size: 13px;
        }

        .schedule-table th {
          text-align: left;
          font-size: 11px;
          color: var(--text-secondary);
          font-weight: 700;
          padding: 10px 8px;
          border-bottom: 1px solid var(--border);
        }

        .schedule-table td {
          padding: 10px 8px;
          border-bottom: 1px solid var(--border-subtle);
          vertical-align: middle;
        }

        .schedule-table select,
        .schedule-table input[type="time"] {
          padding: 6px 8px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 12.5px;
        }

        .inline-time-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .row-actions {
          display: flex;
          gap: 6px;
        }

        .confirm-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .confirm-text {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .status-pill {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: var(--radius-pill);
          border: none;
          cursor: pointer;
        }

        .status-pill:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .status-pill.active {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
        }

        .status-pill.inactive {
          background: var(--destructive-subtle);
          color: var(--destructive-text);
        }

        .btn-primary {
          background: var(--dark-btn);
          color: #fff;
          border: none;
          padding: 10px 18px;
          min-height: 38px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-primary:hover {
          background: var(--dark-btn-hover);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border);
          padding: 8px 14px;
          min-height: 34px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-secondary.small {
          padding: 6px 10px;
          min-height: 28px;
          font-size: 12px;
        }

        .btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-danger {
          border-color: var(--destructive-subtle);
          color: var(--destructive-text);
        }
      `}</style>
    </div>
  );
}
