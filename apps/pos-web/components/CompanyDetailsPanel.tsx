// Admin panel for editing the restaurant's company/organization profile.
// GETs /settings/company on mount and populates the form with whatever the
// backend has saved (blank fields if nothing has been saved yet — never
// pre-filled with example data). Saving PATCHes /settings/company with the
// full set of current field values.
import React, { useEffect, useState } from "react";
import { authedFetch } from "../lib/auth";

// Real response shape from apps/api/src/routes/settings.ts GET /settings/company.
interface CompanyDetailsApi {
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  fssaiNumber: string | null;
  upiVpa: string | null;
  taxNumber: string | null;
}

// Error contract returned by the API's sendServerError (apps/api/src/errors.ts):
// { code: "SCHEMA_OUT_OF_SYNC" | "DB_UNAVAILABLE" | "INTERNAL_ERROR", error, detail? }.
// Older/other endpoints may only send { error }, so `code`/`detail` are optional.
interface ApiErrorInfo {
  message: string;
  code?: string;
  detail?: string;
}

// Never discard what the server said — a 503 SCHEMA_OUT_OF_SYNC tells the
// operator exactly which commands to run, which a generic string does not.
async function readApiError(res: Response, fallback: string): Promise<ApiErrorInfo> {
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  const serverMessage =
    body && typeof body.error === "string" && body.error.trim()
      ? body.error
      : body && typeof body.message === "string" && body.message.trim()
        ? body.message
        : null;
  return {
    message: serverMessage ?? `${fallback} (HTTP ${res.status})`,
    code: body && typeof body.code === "string" ? body.code : undefined,
    detail: body && typeof body.detail === "string" ? body.detail : undefined,
  };
}

interface FormState {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  fssaiNumber: string;
  upiVpa: string;
  taxNumber: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  address: "",
  phone: "",
  email: "",
  logoUrl: "",
  fssaiNumber: "",
  upiVpa: "",
  taxNumber: "",
};

const FIELDS: { key: keyof FormState; label: string; type?: string; placeholder?: string }[] = [
  { key: "name", label: "Company / Restaurant Name" },
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email", type: "email" },
  { key: "logoUrl", label: "Logo URL", placeholder: "https://..." },
  { key: "fssaiNumber", label: "FSSAI Number" },
  { key: "upiVpa", label: "UPI VPA", placeholder: "yourname@upi" },
  { key: "taxNumber", label: "GST / Tax Number" },
];

export default function CompanyDetailsPanel(): JSX.Element {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiErrorInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<ApiErrorInfo | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authedFetch("/settings/company");
      if (!res.ok) {
        setLoadError(await readApiError(res, "Failed to load company details"));
        return;
      }
      const data: CompanyDetailsApi = await res.json();
      setForm({
        name: data.name ?? "",
        address: data.address ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        logoUrl: data.logoUrl ?? "",
        fssaiNumber: data.fssaiNumber ?? "",
        upiVpa: data.upiVpa ?? "",
        taxNumber: data.taxNumber ?? "",
      });
    } catch (err) {
      setLoadError({
        message: err instanceof Error ? err.message : "Failed to load company details",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionNotice(null);
    setSaving(true);
    try {
      const res = await authedFetch("/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setActionError(await readApiError(res, "Failed to save company details"));
        return;
      }
      setActionNotice("Company details saved.");
      fetchData();
    } catch (err) {
      setActionError({
        message: err instanceof Error ? err.message : "Failed to save company details",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="dashboard-greeting-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div>
        <span className="breadcrumb-line">Operations &gt; Settings &gt; Company Details</span>
        <h1 className="greeting-title">Company Details</h1>
        <p className="greeting-subtitle">
          This information is used on receipts, invoices, and outlet-facing documents.
        </p>
      </div>

      {actionError && (
        <div className="empty-state-card error-card">
          <span className="empty-icon">⚠️</span>
          <p>{actionError.message}</p>
          {actionError.detail && <p style={{ opacity: 0.85 }}>{actionError.detail}</p>}
          {actionError.code && (
            <p style={{ opacity: 0.7, fontSize: "0.8rem" }}>Error code: {actionError.code}</p>
          )}
        </div>
      )}

      {actionNotice && (
        <div className="empty-state-card">
          <span className="empty-icon">ℹ️</span>
          <p>{actionNotice}</p>
        </div>
      )}

      {loading && (
        <div className="empty-state-card">
          <span className="empty-icon">⏳</span>
          <h3>Loading company details...</h3>
        </div>
      )}

      {!loading && loadError && (
        <div className="empty-state-card">
          <span className="empty-icon">⚠️</span>
          <h3>Could not load company details</h3>
          <p>{loadError.message}</p>
          {loadError.detail && <p style={{ opacity: 0.85 }}>{loadError.detail}</p>}
          {loadError.code && (
            <p style={{ opacity: 0.7, fontSize: "0.8rem" }}>Error code: {loadError.code}</p>
          )}
          <p style={{ opacity: 0.7 }}>Check that the API is running and you are signed in.</p>
        </div>
      )}

      {!loading && !loadError && (
        <form
          onSubmit={handleSave}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "16px",
            background: "var(--bg-card, #fff)",
            border: "1px solid var(--border, #e2e8f0)",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          {FIELDS.map((field) => (
            <label
              key={field.key}
              style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.85rem", fontWeight: 600 }}
            >
              {field.label}
              <input
                type={field.type ?? "text"}
                value={form[field.key]}
                placeholder={field.placeholder}
                onChange={(e) => handleChange(field.key, e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border, #e2e8f0)",
                  fontSize: "0.9rem",
                  fontWeight: 400,
                }}
              />
            </label>
          ))}

          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                cursor: saving ? "wait" : "pointer",
                background: "var(--accent)",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                padding: "10px 20px",
                minHeight: "44px",
                borderRadius: "var(--radius-pill, 9999px)",
              }}
            >
              {saving ? "Saving..." : "Save Company Details"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
