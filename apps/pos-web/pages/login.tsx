import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { login, logout, getApiBase } from "../lib/auth";
import CaptainPinLoginModal from "../components/CaptainPinLoginModal";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Incorrect email or password. Please try again.",
  USER_INACTIVE: "This account has been deactivated. Contact your outlet admin.",
  NO_OUTLET_ACCESS: "This account has no access to the outlet you entered.",
  NETWORK_ERROR: "Cannot reach API server (port 4001). Make sure the backend is running.",
  LOGIN_FAILED: "Login failed. Please verify credentials and try again.",
};

interface OutletOption {
  id: string;
  name: string;
  code: string | null;
  address?: string | null;
}

interface StaffOption {
  id: string;
  name: string;
  role: string;
  email: string;
  avatar: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"PIN" | "PASSWORD">("PIN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [outletId, setOutletId] = useState("");
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffOption[]>([]);
  const [loadingOutlets, setLoadingOutlets] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedEmail = localStorage.getItem("kapmeta_last_email") || "";
      const savedOutletId = localStorage.getItem("kapmeta_last_outlet_id") || "";
      if (savedEmail) setEmail(savedEmail);
      if (savedOutletId) setOutletId(savedOutletId);
    }

    fetch(`${getApiBase()}/auth/outlets`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setOutlets(data);
          setOutletId((prev) => prev || data[0].id);
        }
      })
      .catch((err) => console.error("Failed to load outlets:", err))
      .finally(() => setLoadingOutlets(false));
  }, []);

  useEffect(() => {
    if (outletId) {
      fetch(`${getApiBase()}/auth/staff-profiles?outletId=${encodeURIComponent(outletId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setStaffProfiles(data);
          }
        })
        .catch((err) => console.error("Failed to load staff profiles:", err));
    }
  }, [outletId]);

  const performLogin = async (eMail: string, pass: string, outId: string, targetPath = "/") => {
    setError(null);
    setErrorDetail(null);
    setNotice(`Authenticating ${eMail}...`);
    setSubmitting(true);

    const result = await login(eMail, pass, outId);

    if (result.ok === false) {
      const friendlyMsg = ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.LOGIN_FAILED;
      setError(friendlyMsg);
      if (!ERROR_MESSAGES[result.error]) {
        setErrorDetail(`Error code: ${result.error}`);
      }
      setNotice(null);
      setSubmitting(false);
      return;
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("kapmeta_last_email", eMail);
      localStorage.setItem("kapmeta_last_outlet_id", outId);
    }

    setNotice("Authenticated successfully! Loading POS workspace...");
    setTimeout(() => {
      router.push(targetPath);
    }, 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outletId) {
      setError("Please select an active outlet.");
      return;
    }
    performLogin(email, password, outletId, "/");
  };

  return (
    <div className="login-canvas">
      <Head>
        <title>Login | KapMeta POS Platform</title>
        <meta name="description" content="Sign in to KapMeta Restaurant POS Platform" />
      </Head>

      <div className="login-card">
        {/* Brand Header */}
        <div className="brand-header">
          <div className="brand-crest">
            <span className="crest-letter">K</span>
            <span className="crest-dot"></span>
          </div>
          <div>
            <h1 className="brand-name">Kap<span className="brand-highlight">Meta</span></h1>
            <p className="brand-subtitle">Unified Restaurant POS Platform</p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="mode-toggle">
          <button
            type="button"
            className={`mode-btn ${authMode === "PIN" ? "active" : ""}`}
            onClick={() => {
              setAuthMode("PIN");
              setError(null);
            }}
          >
            🧑‍🍳 Crew Touch PIN
          </button>
          <button
            type="button"
            className={`mode-btn ${authMode === "PASSWORD" ? "active" : ""}`}
            onClick={() => {
              setAuthMode("PASSWORD");
              setError(null);
            }}
          >
            🔑 Admin Credentials
          </button>
        </div>

        {/* Notifications & Error alerts */}
        {notice && (
          <div className="alert-banner notice">
            <span>✨</span>
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div className="alert-banner error">
            <span>⚠️</span>
            <span>{error}{errorDetail ? ` (${errorDetail})` : ""}</span>
          </div>
        )}

        {/* Outlet Selector Pill */}
        <div className="field-group">
          <label className="field-label">Selected Outlet</label>
          <div className="select-pill-wrapper">
            <span className="field-icon">🏢</span>
            {outlets.length > 0 ? (
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                className="select-pill"
              >
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} {o.code ? `(${o.code})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                placeholder="Enter Outlet ID"
                className="select-pill"
              />
            )}
          </div>
        </div>

        {/* AUTH MODE 1: Fast Touch PIN for Crew */}
        {authMode === "PIN" && (
          <div className="pin-mode-section">
            <div className="crew-label">Choose Active Staff Member</div>
            <div className="crew-grid">
              {(staffProfiles.length > 0 ? staffProfiles : [
                { id: "s1", name: "Armin A.", role: "CAPTAIN", email: "admin@kapmeta.com", avatar: "🧑‍🍳" },
                { id: "s2", name: "Mikasa A.", role: "WAITER", email: "waiter@kapmeta.com", avatar: "🏃" },
                { id: "s3", name: "Eren Y.", role: "KITCHEN", email: "chef@kapmeta.com", avatar: "👨‍🍳" },
              ]).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  className="crew-pill"
                  onClick={() => {
                    setEmail(st.email);
                    setIsPinModalOpen(true);
                  }}
                  title={`Unlock with PIN as ${st.name}`}
                >
                  <div className="crew-avatar">{st.name.charAt(0)}</div>
                  <div className="crew-text">
                    <span className="crew-name">{st.name}</span>
                    <span className="crew-role">{st.role.toLowerCase()}</span>
                  </div>
                  <span className="crew-arrow">→</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="quick-pin-launch-btn"
              onClick={() => setIsPinModalOpen(true)}
            >
              <span>⚡</span>
              <span>Open Fast Numeric Keypad</span>
            </button>
          </div>
        )}

        {/* AUTH MODE 2: Admin Password Form */}
        {authMode === "PASSWORD" && (
          <form onSubmit={handleSubmit} className="password-form">
            <div className="field-group">
              <label className="field-label" htmlFor="email">Email Address</label>
              <div className="input-pill-wrapper">
                <span className="field-icon">👤</span>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-pill"
                  placeholder="admin@kapmeta.com"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="password">Password</label>
              <div className="input-pill-wrapper">
                <span className="field-icon">🔒</span>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-pill"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button type="submit" className="submit-pill-btn" disabled={submitting}>
              {submitting ? "Authenticating..." : "Sign In to Management Hub →"}
            </button>
          </form>
        )}
      </div>

      {/* Shakuro Fast PIN Modal */}
      <CaptainPinLoginModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => {
          router.push("/waiter");
        }}
        outletId={outletId}
      />

      <style jsx>{`
        .login-canvas {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f4f4f6;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #18181b;
          padding: 24px;
        }

        .login-card {
          width: 100%;
          max-width: 440px;
          background: #ffffff;
          border: 1px solid #f4f4f5;
          border-radius: 28px;
          padding: 36px 32px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .brand-header {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-crest {
          width: 46px;
          height: 46px;
          border-radius: 16px;
          background: #18181b;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .crest-letter {
          color: #ffffff;
          font-weight: 900;
          font-size: 1.3rem;
        }

        .crest-dot {
          position: absolute;
          top: 5px;
          right: 5px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
        }

        .brand-name {
          font-size: 1.45rem;
          font-weight: 900;
          color: #18181b;
          letter-spacing: -0.02em;
          margin: 0;
        }

        .brand-highlight {
          color: #10b981;
        }

        .brand-subtitle {
          font-size: 0.8rem;
          color: #71717a;
          margin: 2px 0 0 0;
          font-weight: 500;
        }

        .mode-toggle {
          display: flex;
          padding: 4px;
          border-radius: 9999px;
          background: #f4f4f6;
          gap: 4px;
        }

        .mode-btn {
          flex: 1;
          padding: 8px 12px;
          border-radius: 9999px;
          border: none;
          background: transparent;
          font-size: 0.78rem;
          font-weight: 700;
          color: #71717a;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .mode-btn.active {
          background: #ffffff;
          color: #18181b;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        .alert-banner {
          padding: 10px 14px;
          border-radius: 14px;
          font-size: 0.82rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .alert-banner.notice {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }

        .alert-banner.error {
          background: #fff1f2;
          color: #e11d48;
          border: 1px solid #fecdd3;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #71717a;
        }

        .select-pill-wrapper, .input-pill-wrapper {
          display: flex;
          align-items: center;
          background: #fafafa;
          border: 1px solid #e4e4e7;
          border-radius: 9999px;
          padding: 6px 14px;
          gap: 8px;
          transition: border-color 0.15s ease;
        }

        .select-pill-wrapper:focus-within, .input-pill-wrapper:focus-within {
          border-color: #18181b;
          background: #ffffff;
        }

        .field-icon {
          font-size: 0.95rem;
        }

        .select-pill, .input-pill {
          width: 100%;
          border: none;
          background: transparent;
          font-size: 0.86rem;
          font-weight: 600;
          color: #18181b;
          outline: none;
        }

        .pin-mode-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .crew-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #a1a1aa;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .crew-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .crew-pill {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 14px;
          border-radius: 16px;
          background: #fafafa;
          border: 1px solid #f4f4f5;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }

        .crew-pill:hover {
          background: #f4f4f6;
          border-color: #e4e4e7;
          transform: translateY(-1px);
        }

        .crew-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #e4e4e7;
          color: #18181b;
          font-weight: 800;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .crew-text {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .crew-name {
          font-size: 0.85rem;
          font-weight: 700;
          color: #18181b;
        }

        .crew-role {
          font-size: 0.7rem;
          color: #71717a;
          text-transform: capitalize;
        }

        .crew-arrow {
          font-size: 0.9rem;
          color: #a1a1aa;
        }

        .quick-pin-launch-btn {
          margin-top: 6px;
          padding: 12px;
          border-radius: 9999px;
          border: 1px dashed #d4d4d8;
          background: #ffffff;
          color: #18181b;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.15s ease;
        }

        .quick-pin-launch-btn:hover {
          background: #f4f4f6;
          border-color: #18181b;
        }

        .password-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .submit-pill-btn {
          margin-top: 8px;
          padding: 13px;
          border-radius: 9999px;
          border: none;
          background: #18181b;
          color: #ffffff;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(24, 24, 27, 0.2);
          transition: all 0.15s ease;
        }

        .submit-pill-btn:hover:not(:disabled) {
          background: #27272a;
          transform: translateY(-1px);
        }

        .submit-pill-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
