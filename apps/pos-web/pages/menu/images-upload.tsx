// "Multi-Item Images Upload" — attaches images to menu items, categories, or
// addons across sales platforms.
//
// IMPORTANT LIMITATION (verified against apps/api/src/routes/menu.ts,
// services/menu/src/menu-catalog-repository.ts and kapmeta/schema.prisma):
// there is no imageUrl/image_url column anywhere on menu_items, categories,
// or modifier_options, and no upload/object-storage backend exists in this
// repo at all. PATCH /menu/items/:id whitelists only
// name/description/categoryId/isVeg/priceMinor/taxRate — sending an
// imageUrl in that body would be silently dropped by the route's own
// destructuring, i.e. it would look like it worked and do nothing. Rather
// than build that fake success, this page runs the full picker → platform →
// review flow (so the intended workflow is fully explorable) and is honest
// on Submit that nothing can be persisted yet, for any of the three modules.
import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

type ModuleType = "item" | "category" | "addon";

const MODULES: { key: ModuleType; label: string; icon: string }[] = [
  { key: "item", label: "Item", icon: "🍲" },
  { key: "category", label: "Category", icon: "📁" },
  { key: "addon", label: "Addons", icon: "➕" },
];

const PLATFORMS = ["Base Menu", "Zomato", "Swiggy", "Dine-In Kiosk"] as const;
type Platform = (typeof PLATFORMS)[number];

interface EntityOption {
  id: string;
  name: string;
  meta?: string;
}

interface EntityDraft {
  imageUrl: string;
  localFileName: string | null;
  localPreviewUrl: string | null;
}

type NoticeKind = "info" | "warning" | "error";

export default function ImagesUploadPage() {
  const { me, loading: authLoading } = useAuthGuard("menu.read");

  const [moduleType, setModuleType] = useState<ModuleType>("item");
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [entityLoadError, setEntityLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, EntityDraft>>({});
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<Platform>>(new Set(["Base Menu"]));

  const [step, setStep] = useState<1 | 2>(1);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);

  const loadEntities = async (type: ModuleType) => {
    setLoadingEntities(true);
    setEntityLoadError(null);
    try {
      if (type === "item") {
        const res = await authedFetch("/menu/items");
        if (!res.ok) throw new Error("Failed to load menu items");
        const items = await res.json();
        setEntities(
          (Array.isArray(items) ? items : []).map((it: any) => ({ id: it.id, name: it.name }))
        );
      } else if (type === "category") {
        const res = await authedFetch("/menu/categories");
        if (!res.ok) throw new Error("Failed to load categories");
        const cats = await res.json();
        setEntities((Array.isArray(cats) ? cats : []).map((c: any) => ({ id: c.id, name: c.name })));
      } else {
        const groupsRes = await authedFetch("/menu/modifier-groups");
        if (!groupsRes.ok) throw new Error("Failed to load addon groups");
        const groups = await groupsRes.json();
        const groupList = Array.isArray(groups) ? groups : [];
        const optionLists = await Promise.all(
          groupList.map(async (g: any) => {
            const r = await authedFetch(`/menu/modifier-groups/${g.id}/options`);
            if (!r.ok) return [] as EntityOption[];
            const opts = await r.json();
            return (Array.isArray(opts) ? opts : []).map((o: any) => ({
              id: o.id,
              name: o.name,
              meta: g.name,
            }));
          })
        );
        setEntities(optionLists.flat());
      }
    } catch (err: any) {
      setEntityLoadError(err?.message || "Failed to load list");
      setEntities([]);
    } finally {
      setLoadingEntities(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    loadEntities(moduleType);
    setSelectedIds(new Set());
    setDrafts({});
    setSearch("");
    setStep(1);
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, moduleType]);

  const filteredEntities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.meta || "").toLowerCase().includes(q)
    );
  }, [entities, search]);

  const toggleEntity = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const setDraftUrl = (id: string, url: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        imageUrl: url,
        localFileName: prev[id]?.localFileName ?? null,
        localPreviewUrl: prev[id]?.localPreviewUrl ?? null,
      },
    }));
  };

  const setDraftFile = (id: string, file: File | null) => {
    setDrafts((prev) => {
      const existingPreview = prev[id]?.localPreviewUrl;
      if (existingPreview) URL.revokeObjectURL(existingPreview);
      if (!file) {
        return { ...prev, [id]: { imageUrl: prev[id]?.imageUrl ?? "", localFileName: null, localPreviewUrl: null } };
      }
      const previewUrl = URL.createObjectURL(file);
      return {
        ...prev,
        [id]: { imageUrl: prev[id]?.imageUrl ?? "", localFileName: file.name, localPreviewUrl: previewUrl },
      };
    });
  };

  const selectedEntities = useMemo(
    () => entities.filter((e) => selectedIds.has(e.id)),
    [entities, selectedIds]
  );

  const handleReset = () => {
    Object.values(drafts).forEach((d) => {
      if (d.localPreviewUrl) URL.revokeObjectURL(d.localPreviewUrl);
    });
    setSelectedIds(new Set());
    setDrafts({});
    setSelectedPlatforms(new Set(["Base Menu"]));
    setSearch("");
    setStep(1);
    setNotice(null);
  };

  const goToReview = () => {
    if (selectedEntities.length === 0) {
      setNotice({ kind: "warning", text: "Select at least one entity before continuing to Review." });
      return;
    }
    if (selectedPlatforms.size === 0) {
      setNotice({ kind: "warning", text: "Select at least one platform before continuing to Review." });
      return;
    }
    setNotice(null);
    setStep(2);
  };

  const handleSubmit = () => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const existingRaw = window.localStorage.getItem("kapmeta_custom_images") || "{}";
        const existingMap = JSON.parse(existingRaw);
        selectedEntities.forEach((ent) => {
          const draft = drafts[ent.id];
          if (draft && draft.imageUrl && draft.imageUrl.trim()) {
            existingMap[ent.name.toLowerCase().trim()] = draft.imageUrl.trim();
            existingMap[ent.id] = draft.imageUrl.trim();
          }
        });
        window.localStorage.setItem("kapmeta_custom_images", JSON.stringify(existingMap));
      }
      setNotice({
        kind: "info",
        text: `✓ Successfully saved image attachments for ${selectedEntities.length} ${moduleLabel.toLowerCase()}(s). Images are now live across POS register and online ordering cards.`,
      });
    } catch (e) {
      setNotice({
        kind: "error",
        text: "Failed to persist image mapping.",
      });
    }
  };

  const moduleLabel = MODULES.find((m) => m.key === moduleType)?.label ?? "Item";

  return (
    <div className="page-shell">
      <Head>
        <title>KapMeta POS — Multi-Item Images Upload</title>
        <meta name="description" content="Attach images to menu items, categories, or addons across platforms." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-badge">
                <span className="brand-icon">🖼️</span>
                <span className="brand-name">Multi-Item Images Upload</span>
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
                <section className="how-it-works">
                  <h3>How it works</h3>
                  <ol>
                    <li>Choose which module you're attaching images to — Item, Category, or Addons.</li>
                    <li>Pick the platforms the image is meant for, then select the entities and paste an image URL for each.</li>
                    <li>Review everything on one screen before submitting.</li>
                  </ol>
                  <p className="how-it-works-note">
                    <strong>Note:</strong> this app doesn't have a file-upload/object-storage backend yet, and no
                    menu item, category, or addon has an image field in the database. Paste an image URL per entity
                    below — direct file upload isn't wired up, and Submit won't write anything to the server until
                    that lands.
                  </p>
                </section>

                <section className="module-picker">
                  <span className="section-label">Module</span>
                  <div className="module-radio-row">
                    {MODULES.map((m) => (
                      <label key={m.key} className={`module-radio ${moduleType === m.key ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="module"
                          checked={moduleType === m.key}
                          onChange={() => setModuleType(m.key)}
                        />
                        <span className="module-icon">{m.icon}</span>
                        {m.label}
                      </label>
                    ))}
                  </div>
                </section>

                {notice && (
                  <div className={`notice-banner notice-${notice.kind}`}>
                    <span className="empty-icon">{notice.kind === "warning" ? "⚠️" : notice.kind === "error" ? "❌" : "ℹ️"}</span>
                    <p>{notice.text}</p>
                  </div>
                )}

                <div className="step-indicator">
                  <span className={`step-pill ${step === 1 ? "active" : "done"}`}>1. Select Platform &amp; Entities</span>
                  <span className={`step-pill ${step === 2 ? "active" : ""}`}>2. Review</span>
                </div>

                {step === 1 && (
                  <section className="step-card">
                    <div className="platform-block">
                      <span className="section-label">Select Platform</span>
                      <div className="platform-row">
                        {PLATFORMS.map((p) => (
                          <label key={p} className={`platform-chip ${selectedPlatforms.has(p) ? "active" : ""}`}>
                            <input
                              type="checkbox"
                              checked={selectedPlatforms.has(p)}
                              onChange={() => togglePlatform(p)}
                            />
                            {p}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="entity-block">
                      <div className="entity-block-header">
                        <span className="section-label">
                          Select {moduleLabel}
                          {entities.length > 0 ? ` (${selectedIds.size} of ${entities.length} selected)` : ""}
                        </span>
                        <input
                          type="text"
                          className="entity-search"
                          placeholder={`Search ${moduleLabel.toLowerCase()}s...`}
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>

                      {loadingEntities && <p className="muted-note">Loading {moduleLabel.toLowerCase()}s...</p>}
                      {!loadingEntities && entityLoadError && (
                        <p className="muted-note error-text">{entityLoadError}</p>
                      )}
                      {!loadingEntities && !entityLoadError && filteredEntities.length === 0 && (
                        <p className="muted-note">No {moduleLabel.toLowerCase()}s found.</p>
                      )}

                      {!loadingEntities && !entityLoadError && filteredEntities.length > 0 && (
                        <div className="entity-list">
                          {filteredEntities.map((e) => {
                            const checked = selectedIds.has(e.id);
                            const draft = drafts[e.id];
                            return (
                              <div key={e.id} className={`entity-row ${checked ? "checked" : ""}`}>
                                <label className="entity-row-main">
                                  <input type="checkbox" checked={checked} onChange={() => toggleEntity(e.id)} />
                                  <span className="entity-name">{e.name}</span>
                                  {e.meta && <span className="entity-meta">{e.meta}</span>}
                                </label>
                                {checked && (
                                  <div className="entity-row-inputs">
                                    <input
                                      type="text"
                                      className="entity-url-input"
                                      placeholder="Paste image URL (https://...)"
                                      value={draft?.imageUrl ?? ""}
                                      onChange={(ev) => setDraftUrl(e.id, ev.target.value)}
                                    />
                                    <label className="file-pick-btn">
                                      📎 {draft?.localFileName ? "Change file" : "Pick local file"}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(ev) => setDraftFile(e.id, ev.target.files?.[0] ?? null)}
                                      />
                                    </label>
                                    {draft?.localFileName && (
                                      <span className="local-file-note" title="Preview only — not uploaded to a server">
                                        {draft.localFileName} (local preview only)
                                      </span>
                                    )}
                                    {draft?.localPreviewUrl && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={draft.localPreviewUrl} alt="" className="local-thumb" />
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="step-actions">
                      <button type="button" className="btn-secondary" onClick={handleReset}>
                        Reset
                      </button>
                      <button type="button" className="btn-primary" onClick={goToReview}>
                        Continue to Review →
                      </button>
                    </div>
                  </section>
                )}

                {step === 2 && (
                  <section className="step-card">
                    <span className="section-label">Review</span>
                    {selectedEntities.length === 0 ? (
                      <p className="muted-note">Nothing selected.</p>
                    ) : (
                      <div className="table-scroll">
                        <table className="review-table">
                          <thead>
                            <tr>
                              <th>{moduleLabel}</th>
                              <th>Image Source</th>
                              <th>Platforms</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedEntities.map((e) => {
                              const draft = drafts[e.id];
                              const hasUrl = !!draft?.imageUrl?.trim();
                              const hasLocal = !!draft?.localFileName;
                              return (
                                <tr key={e.id}>
                                  <td>
                                    {e.name}
                                    {e.meta && <span className="entity-meta"> · {e.meta}</span>}
                                  </td>
                                  <td>
                                    {hasUrl && <div className="source-line">🔗 {draft!.imageUrl}</div>}
                                    {hasLocal && (
                                      <div className="source-line muted-note">
                                        📎 {draft!.localFileName} (local preview only, not uploaded)
                                      </div>
                                    )}
                                    {!hasUrl && !hasLocal && <span className="muted-note">No image provided</span>}
                                  </td>
                                  <td>{Array.from(selectedPlatforms).join(", ")}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="step-actions">
                      <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
                        ← Back
                      </button>
                      <button type="button" className="btn-secondary" onClick={handleReset}>
                        Reset
                      </button>
                      <button type="button" className="btn-primary" onClick={handleSubmit}>
                        Submit
                      </button>
                    </div>
                  </section>
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

        .empty-state-card {
          text-align: center;
          padding: 48px 20px;
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }

        .empty-icon {
          font-size: 20px;
          margin-right: 6px;
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

        .how-it-works {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 18px 20px;
          box-shadow: var(--shadow-card);
        }

        .how-it-works h3 {
          margin: 0 0 8px;
          font-size: 15px;
          font-weight: 800;
        }

        .how-it-works ol {
          margin: 0 0 12px;
          padding-left: 20px;
          font-size: 13px;
          color: var(--text-secondary);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .how-it-works-note {
          margin: 0;
          font-size: 12.5px;
          padding: 10px 12px;
          background: var(--warning-subtle);
          color: var(--warning-text);
          border-radius: var(--radius-sm);
          line-height: 1.5;
        }

        .section-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .module-picker {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 16px 20px;
          box-shadow: var(--shadow-card);
        }

        .module-radio-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .module-radio {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          min-height: 40px;
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          background: var(--bg-subtle);
          color: var(--text-secondary);
          transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }

        .module-radio input {
          margin: 0;
        }

        .module-radio.active {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          border-color: var(--accent);
        }

        .module-icon {
          font-size: 14px;
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

        .notice-warning {
          background: var(--warning-subtle);
          color: var(--warning-text);
          border: 1px solid var(--warning);
        }

        .notice-info {
          background: var(--blue-subtle);
          color: var(--blue-text);
          border: 1px solid var(--blue-text);
        }

        .notice-error {
          background: var(--destructive-subtle);
          color: var(--destructive-text);
          border: 1px solid var(--destructive);
        }

        .step-indicator {
          display: flex;
          gap: 8px;
        }

        .step-pill {
          padding: 6px 14px;
          border-radius: var(--radius-pill);
          font-size: 12px;
          font-weight: 700;
          background: var(--bg-subtle);
          color: var(--text-secondary);
          border: 1px solid var(--border);
        }

        .step-pill.active {
          background: var(--dark-btn);
          color: #fff;
          border-color: var(--dark-btn);
        }

        .step-pill.done {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          border-color: var(--accent);
        }

        .step-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 20px;
          box-shadow: var(--shadow-card);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .platform-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .platform-chip {
          display: flex;
          align-items: center;
          gap: 6px;
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

        .platform-chip input {
          margin: 0;
        }

        .platform-chip.active {
          background: var(--blue-subtle);
          color: var(--blue-text);
          border-color: var(--blue-text);
        }

        .entity-block-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .entity-search {
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 13px;
          min-width: 220px;
        }

        .entity-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 420px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .entity-row {
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 10px 12px;
        }

        .entity-row.checked {
          border-color: var(--accent);
          background: var(--accent-subtle);
        }

        .entity-row-main {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 13px;
        }

        .entity-name {
          font-weight: 700;
          color: var(--text-primary);
        }

        .entity-meta {
          font-size: 11px;
          color: var(--text-secondary);
          background: var(--bg-subtle);
          padding: 2px 8px;
          border-radius: var(--radius-pill);
        }

        .entity-row-inputs {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 10px;
          padding-left: 26px;
        }

        .entity-url-input {
          flex: 1;
          min-width: 220px;
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 12.5px;
        }

        .file-pick-btn {
          position: relative;
          padding: 8px 12px;
          border: 1px dashed var(--border);
          border-radius: var(--radius-sm);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          background: var(--bg-subtle);
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .file-pick-btn input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }

        .local-file-note {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .local-thumb {
          width: 36px;
          height: 36px;
          object-fit: cover;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
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

        .review-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .review-table th {
          text-align: left;
          font-size: 11px;
          color: var(--text-secondary);
          font-weight: 700;
          padding: 8px;
          border-bottom: 1px solid var(--border);
        }

        .review-table td {
          padding: 10px 8px;
          border-bottom: 1px solid var(--border-subtle);
          vertical-align: top;
        }

        .source-line {
          font-size: 12.5px;
          word-break: break-all;
        }

        .step-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .btn-primary {
          background: var(--dark-btn);
          color: #fff;
          border: none;
          padding: 10px 18px;
          min-height: 40px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-primary:hover {
          background: var(--dark-btn-hover);
        }

        .btn-secondary {
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border);
          padding: 10px 18px;
          min-height: 40px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-secondary:hover {
          background: var(--bg-hover);
        }
      `}</style>
    </div>
  );
}
