import React, { useEffect, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../lib/auth";
import Nav from "../components/Nav";

// Real response shape of GET /marketing/campaigns and POST /marketing/campaigns
// (services/marketing/src/marketing-service.ts CampaignWithCounts / MarketingCampaignRecord,
// kapmeta/schema.prisma model MarketingCampaign).
interface CampaignApi {
  id: string;
  outletId: string;
  name: string;
  triggerType: "MANUAL" | "INACTIVE_CUSTOMER" | "BIRTHDAY";
  segmentFilter: Record<string, unknown> | null;
  discountId: string | null;
  messageTemplate: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  recipientCounts: { total: number; pending: number; sent: number; failed: number };
}

// Real response shape of POST /marketing/campaigns/:id/queue
// (services/marketing/src/marketing-service.ts QueueCampaignResult).
interface QueueResultApi {
  segmentSize: number;
  queuedCount: number;
  gap?: string;
  dispatchNote: string;
}

interface CampaignRecipientApi {
  id: string;
  campaignId: string;
  customerId: string;
  status: "PENDING" | "SENT" | "FAILED";
  queuedAt: string;
  sentAt: string | null;
}

const TRIGGER_LABELS: Record<CampaignApi["triggerType"], string> = {
  MANUAL: "Manual (pick customers)",
  INACTIVE_CUSTOMER: "Inactive customers (no order in N days)",
  BIRTHDAY: "Birthday (requires customer birthdate — not yet captured)",
};

export default function MarketingPage() {
  // marketing.ts checks requirePermission("crm.write") on every route in this
  // file — the frontend gate matches that exact action string.
  const { me, loading: authLoading } = useAuthGuard("crm.write");

  const [campaigns, setCampaigns] = useState<CampaignApi[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<CampaignApi["triggerType"]>("MANUAL");
  const [inactiveDays, setInactiveDays] = useState("30");
  const [manualCustomerIds, setManualCustomerIds] = useState("");
  const [discountId, setDiscountId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [queueLoadingId, setQueueLoadingId] = useState<string | null>(null);
  const [queueResults, setQueueResults] = useState<Record<string, QueueResultApi>>({});
  const [queueErrors, setQueueErrors] = useState<Record<string, string>>({});

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Record<string, CampaignRecipientApi[]>>({});
  const [recipientsLoading, setRecipientsLoading] = useState<string | null>(null);

  const loadCampaigns = () => {
    setListLoading(true);
    setListError(null);
    authedFetch(`/marketing/campaigns`)
      .then(async (res) => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        const data = (await res.json()) as CampaignApi[];
        setCampaigns(data);
        setListLoading(false);
      })
      .catch((err) => {
        setListError(err instanceof Error ? err.message : "Failed to load campaigns");
        setCampaigns(null);
        setListLoading(false);
      });
  };

  useEffect(() => {
    if (authLoading) return;
    if (me?.permissions.includes("crm.write")) loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, me]);

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !messageTemplate.trim()) return;

    const segmentFilter: Record<string, unknown> = {};
    if (triggerType === "INACTIVE_CUSTOMER") {
      const days = Number(inactiveDays);
      if (!Number.isFinite(days) || days <= 0) {
        setCreateError("Inactive-days must be a positive number");
        return;
      }
      segmentFilter.inactiveDays = days;
    }
    if (triggerType === "MANUAL") {
      const ids = manualCustomerIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      segmentFilter.customerIds = ids;
    }

    setCreateLoading(true);
    setCreateError(null);
    authedFetch(`/marketing/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        triggerType,
        segmentFilter: Object.keys(segmentFilter).length > 0 ? segmentFilter : undefined,
        discountId: discountId.trim() || undefined,
        messageTemplate: messageTemplate.trim(),
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        setName("");
        setInactiveDays("30");
        setManualCustomerIds("");
        setDiscountId("");
        setMessageTemplate("");
        setCreateLoading(false);
        loadCampaigns();
      })
      .catch((err) => {
        setCreateError(err instanceof Error ? err.message : "Failed to create campaign");
        setCreateLoading(false);
      });
  };

  const submitQueue = (campaignId: string) => {
    setQueueLoadingId(campaignId);
    setQueueErrors((prev) => ({ ...prev, [campaignId]: "" }));
    authedFetch(`/marketing/campaigns/${campaignId}/queue`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        const data = (await res.json()) as QueueResultApi;
        setQueueResults((prev) => ({ ...prev, [campaignId]: data }));
        setQueueLoadingId(null);
        loadCampaigns();
      })
      .catch((err) => {
        setQueueErrors((prev) => ({
          ...prev,
          [campaignId]: err instanceof Error ? err.message : "Failed to queue campaign",
        }));
        setQueueLoadingId(null);
      });
  };

  const toggleRecipients = (campaignId: string) => {
    if (expandedId === campaignId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(campaignId);
    if (!recipients[campaignId]) {
      setRecipientsLoading(campaignId);
      authedFetch(`/marketing/campaigns/${campaignId}/recipients`)
        .then(async (res) => {
          if (!res.ok) throw new Error("HTTP error " + res.status);
          const data = (await res.json()) as CampaignRecipientApi[];
          setRecipients((prev) => ({ ...prev, [campaignId]: data }));
          setRecipientsLoading(null);
        })
        .catch(() => {
          setRecipientsLoading(null);
        });
    }
  };

  const initials = me?.name
    ? me.name
        .split(" ")
        .map((p) => p.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div className="admin-app">
      <Head>
        <title>Kapmeta POS - Marketing Campaigns</title>
        <meta name="description" content="Create and queue customer marketing campaigns." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <Nav variant="sidebar" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand-badge">
            <span className="brand-icon">⚡</span>
            <span className="brand-name">Kapmeta Marketing</span>
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

        {!authLoading && me && !me.permissions.includes("crm.write") && (
          <div className="empty-state-card">
            <span className="empty-icon">🚫</span>
            <h3>No marketing access</h3>
            <p>Your role does not grant the "crm.write" permission required for marketing campaigns.</p>
          </div>
        )}

        {!authLoading && me && me.permissions.includes("crm.write") && (
          <>
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">Operations &gt; Marketing</span>
                <h1 className="greeting-title">Marketing Campaigns</h1>
                <p className="greeting-subtitle">
                  Real campaign creation, real customer-segment targeting, and real recipient
                  queueing against your Customer/Order data.
                </p>
              </div>
            </section>

            <div className="not-available-box gateway-notice">
              <p>
                <strong>No delivery gateway is configured.</strong> This repo has no SMS, push, or
                email integration wired up (no Twilio, no FCM, nothing). "Queue Campaign" below
                computes the real segment and inserts <code>PENDING</code> recipient rows — it does
                not send anything and never marks a recipient as sent. Delivery requires a gateway
                integration that does not exist yet.
              </p>
            </div>

            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <h3>Create Campaign</h3>
                  <p className="panel-sub">Writes to POST /marketing/campaigns — real insert, no mock data</p>
                </div>
              </div>
              <form className="create-form" onSubmit={submitCreate}>
                <input
                  type="text"
                  className="text-input"
                  placeholder="Campaign name *"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <select
                  className="text-input"
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as CampaignApi["triggerType"])}
                >
                  {(Object.keys(TRIGGER_LABELS) as CampaignApi["triggerType"][]).map((t) => (
                    <option key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </option>
                  ))}
                </select>

                {triggerType === "INACTIVE_CUSTOMER" && (
                  <input
                    type="number"
                    min={1}
                    className="text-input"
                    placeholder="Inactive days *"
                    value={inactiveDays}
                    onChange={(e) => setInactiveDays(e.target.value)}
                  />
                )}

                {triggerType === "MANUAL" && (
                  <input
                    type="text"
                    className="text-input wide"
                    placeholder="Customer IDs, comma-separated (leave blank to pick later)"
                    value={manualCustomerIds}
                    onChange={(e) => setManualCustomerIds(e.target.value)}
                  />
                )}

                {triggerType === "BIRTHDAY" && (
                  <div className="not-available-box inline-warning">
                    <p>
                      Requires a customer birthdate field, not yet captured in the schema. You can
                      still create this campaign, but queueing it will report a gap instead of
                      matching any customers.
                    </p>
                  </div>
                )}

                <input
                  type="text"
                  className="text-input"
                  placeholder="Discount ID (optional — no discount list endpoint exists yet, paste an ID)"
                  value={discountId}
                  onChange={(e) => setDiscountId(e.target.value)}
                />

                <textarea
                  className="text-input wide"
                  placeholder="Message template *"
                  rows={3}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                />

                <button type="submit" className="export-btn" disabled={createLoading}>
                  {createLoading ? "Creating..." : "Create Campaign"}
                </button>
              </form>
              {createError && (
                <div className="not-available-box">
                  <p>{createError}</p>
                </div>
              )}
            </section>

            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <h3>Campaigns</h3>
                  <p className="panel-sub">From GET /marketing/campaigns</p>
                </div>
                <span className="total-badge">{campaigns?.length ?? 0} campaigns</span>
              </div>

              {listLoading && (
                <div className="not-available-box">
                  <p>Loading campaigns...</p>
                </div>
              )}

              {!listLoading && listError && (
                <div className="not-available-box">
                  <p>Could not load campaigns: {listError}.</p>
                </div>
              )}

              {!listLoading && !listError && (campaigns?.length ?? 0) === 0 && (
                <div className="not-available-box">
                  <p>No campaigns yet. Create one above.</p>
                </div>
              )}

              {!listLoading && !listError && campaigns && campaigns.length > 0 && (
                <div className="campaign-list">
                  {campaigns.map((c) => (
                    <div key={c.id} className="campaign-card">
                      <div className="campaign-card-top">
                        <div>
                          <h4>{c.name}</h4>
                          <p className="panel-sub">
                            {TRIGGER_LABELS[c.triggerType]} &middot; Status: {c.status}
                            {c.discountId ? ` · Discount: ${c.discountId}` : ""}
                          </p>
                        </div>
                        <span className={`pill-status status-${c.status.toLowerCase()}`}>{c.status}</span>
                      </div>

                      <p className="message-preview">{c.messageTemplate}</p>

                      <div className="recipient-counts">
                        <span>Total queued: <strong>{c.recipientCounts.total}</strong></span>
                        <span>Pending: <strong>{c.recipientCounts.pending}</strong></span>
                        <span>Sent: <strong>{c.recipientCounts.sent}</strong></span>
                        <span>Failed: <strong>{c.recipientCounts.failed}</strong></span>
                      </div>

                      <div className="campaign-card-actions">
                        <button
                          type="button"
                          className="export-btn"
                          disabled={queueLoadingId === c.id}
                          onClick={() => submitQueue(c.id)}
                        >
                          {queueLoadingId === c.id ? "Queueing..." : "Queue Campaign"}
                        </button>
                        <button type="button" className="export-btn secondary" onClick={() => toggleRecipients(c.id)}>
                          {expandedId === c.id ? "Hide Recipients" : "View Recipients"}
                        </button>
                      </div>

                      {queueErrors[c.id] && (
                        <div className="not-available-box">
                          <p>{queueErrors[c.id]}</p>
                        </div>
                      )}

                      {queueResults[c.id] && (
                        <div className="not-available-box success">
                          <p>
                            Segment size: <strong>{queueResults[c.id].segmentSize}</strong>, newly
                            queued: <strong>{queueResults[c.id].queuedCount}</strong> (re-queueing
                            skips customers already queued).
                          </p>
                          {queueResults[c.id].gap && (
                            <p className="gap-note">{queueResults[c.id].gap}</p>
                          )}
                          <p className="gap-note">{queueResults[c.id].dispatchNote}</p>
                        </div>
                      )}

                      {expandedId === c.id && (
                        <div className="recipients-table-wrap">
                          {recipientsLoading === c.id && <p className="panel-sub">Loading recipients...</p>}
                          {recipientsLoading !== c.id && (recipients[c.id]?.length ?? 0) === 0 && (
                            <p className="panel-sub">No recipients queued yet.</p>
                          )}
                          {recipientsLoading !== c.id && (recipients[c.id]?.length ?? 0) > 0 && (
                            <table className="directory-table">
                              <thead>
                                <tr>
                                  <th>Customer ID</th>
                                  <th>Status</th>
                                  <th>Queued At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {recipients[c.id].map((r) => (
                                  <tr key={r.id}>
                                    <td>{r.customerId}</td>
                                    <td>{r.status}</td>
                                    <td>{new Date(r.queuedAt).toLocaleString("en-IN")}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
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
          max-width: 1200px;
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
          max-width: 640px;
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

        .status-draft { background: var(--bg-subtle); color: var(--text-muted); }
        .status-active { background: #ecfdf5; color: #065f46; }
        .status-paused { background: #fffbeb; color: #92400e; }
        .status-completed { background: #eff6ff; color: #1d4ed8; }

        .not-available-box {
          background: var(--bg-subtle);
          border: 1px dashed var(--border);
          border-radius: var(--radius-md);
          padding: 16px;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .not-available-box.success {
          border-style: solid;
          border-color: #10b981;
          color: var(--text-primary);
        }

        .not-available-box p {
          margin: 0;
        }

        .gap-note {
          margin-top: 6px !important;
          color: var(--text-secondary);
        }

        .gateway-notice {
          border-color: #f59e0b;
        }

        .inline-warning {
          padding: 10px 14px;
          margin-top: -4px;
        }

        .create-form {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: flex-start;
        }

        .text-input {
          flex: 1 1 200px;
          padding: 9px 14px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          background: var(--bg-card);
          color: var(--text-primary);
          min-width: 160px;
        }

        .text-input.wide {
          flex-basis: 100%;
        }

        textarea.text-input {
          resize: vertical;
          font-family: inherit;
        }

        .export-btn {
          padding: 8px 18px;
          background: var(--dark-btn);
          color: #fff;
          border: none;
          border-radius: var(--radius-pill);
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          min-height: 38px;
        }

        .export-btn.secondary {
          background: var(--bg-subtle);
          color: var(--text-primary);
          border: 1px solid var(--border);
        }

        .export-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .total-badge {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          background: var(--bg-subtle);
          padding: 4px 10px;
          border-radius: var(--radius-pill);
        }

        .campaign-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .campaign-card {
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .campaign-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .campaign-card-top h4 {
          margin: 0 0 2px 0;
          font-size: 1rem;
          font-weight: 800;
        }

        .message-preview {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--text-secondary);
          background: var(--bg-subtle);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
        }

        .recipient-counts {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .campaign-card-actions {
          display: flex;
          gap: 10px;
        }

        .recipients-table-wrap {
          overflow-x: auto;
          margin-top: 4px;
        }

        .directory-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8125rem;
        }

        .directory-table th {
          text-align: left;
          padding: 10px 12px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          border-bottom: 1px solid var(--border);
        }

        .directory-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
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
