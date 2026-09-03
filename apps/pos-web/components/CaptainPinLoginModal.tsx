import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { getApiBase } from "../lib/auth";

interface StaffProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  avatar: string;
}

interface CaptainPinLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (userData: any) => void;
  outletId?: string;
}

export default function CaptainPinLoginModal({
  isOpen,
  onClose,
  onSuccess,
  outletId,
}: CaptainPinLoginModalProps) {
  const router = useRouter();
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffProfile | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [pin, setPin] = useState("");
  const [openingFloat, setOpeningFloat] = useState("500.00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoadingStaff(true);
      const url = outletId
        ? `${getApiBase()}/auth/staff-profiles?outletId=${encodeURIComponent(outletId)}`
        : `${getApiBase()}/auth/staff-profiles`;
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setStaffList(data);
            setSelectedStaff(data[0]);
          } else {
            setStaffList([]);
            setSelectedStaff(null);
          }
        })
        .catch((err) => {
          console.error("Failed to load staff profiles:", err);
          setError("Failed to load staff profiles from server.");
        })
        .finally(() => setLoadingStaff(false));
    }
  }, [isOpen, outletId]);

  if (!isOpen) return null;

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin("");
  };

  const handleSubmit = async () => {
    if (!pin) {
      setError("Please enter your 4-digit PIN.");
      return;
    }
    if (!selectedStaff) {
      setError("Please select your staff profile.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const targetOutletId = outletId || localStorage.getItem("kapmeta_last_outlet_id") || "";
      const res = await fetch(`${getApiBase()}/auth/pin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          email: selectedStaff.email,
          outletId: targetOutletId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error === "INVALID_CREDENTIALS" ? "Incorrect PIN. Please try again." : data.error || "Login failed");
      }

      // Store tokens
      if (typeof window !== "undefined") {
        localStorage.setItem("kapmeta_access_token", data.accessToken);
        localStorage.setItem("kapmeta_refresh_token", data.refreshToken);
        localStorage.setItem("kapmeta_captain_opening_float", openingFloat);
        if (targetOutletId) localStorage.setItem("kapmeta_last_outlet_id", targetOutletId);
      }

      onSuccess(data.user);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to authenticate PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pin-login-backdrop" onClick={onClose}>
      <div className="pin-login-card" onClick={(e) => e.stopPropagation()}>
        {/* Brand & Modal Header */}
        <div className="pin-login-header">
          <div className="brand-badge">
            <div className="logo-box">
              <span className="logo-letter">K</span>
              <span className="logo-dot"></span>
            </div>
            <div>
              <div className="brand-title">KapMeta Staff Access</div>
              <div className="brand-subtitle">Fast Touch PIN Authentication & Shift Start</div>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error-alert">{error}</div>}

        {/* Shakuro Staff Member Pills */}
        <div className="staff-section">
          <div className="section-label">Select Crew Member</div>
          <div className="staff-selector-row">
            {loadingStaff ? (
              <div className="loading-text">Loading crew profiles…</div>
            ) : staffList.length === 0 ? (
              <div className="empty-text">No active crew profiles configured.</div>
            ) : (
              staffList.map((st) => {
                const isSelected = selectedStaff?.id === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    className={`staff-pill ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      setSelectedStaff(st);
                      setPin("");
                      setError(null);
                    }}
                  >
                    <div className={`avatar-bubble ${isSelected ? "bubble-active" : ""}`}>
                      {st.name.charAt(0)}
                    </div>
                    <div className="staff-info">
                      <span className="staff-name">{st.name}</span>
                      <span className="staff-role">{st.role.toLowerCase()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Shift Float & PIN Display */}
        <div className="controls-row">
          <div className="float-box">
            <label className="float-label">Opening Float</label>
            <div className="float-input-wrapper">
              <span className="currency-prefix">₹</span>
              <input
                type="number"
                step="10"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                className="float-input"
                placeholder="500.00"
              />
            </div>
          </div>

          <div className="pin-display-card">
            <label className="pin-label">Security PIN</label>
            <div className="pin-dots">
              {[0, 1, 2, 3].map((idx) => (
                <span
                  key={idx}
                  className={`pin-dot ${pin.length > idx ? "filled" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Tactile Keypad */}
        <div className="keypad-grid">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((btn) => (
            <button
              key={btn}
              type="button"
              className={`keypad-key ${btn === "C" ? "key-clear" : btn === "⌫" ? "key-backspace" : ""}`}
              onClick={() => {
                if (btn === "C") handleClear();
                else if (btn === "⌫") handleBackspace();
                else handleKeypadPress(btn);
              }}
            >
              {btn}
            </button>
          ))}
        </div>

        {/* Unlock Action Button */}
        <div className="action-wrapper">
          <button
            type="button"
            className="btn-unlock"
            onClick={handleSubmit}
            disabled={loading || pin.length < 4}
          >
            {loading ? "Verifying PIN..." : `Start Shift as ${selectedStaff?.name || "Staff"} ›`}
          </button>
        </div>
      </div>

      <style jsx>{`
        .pin-login-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(24, 24, 27, 0.45);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: fadeIn 0.15s ease-out;
        }

        .pin-login-card {
          width: 100%;
          max-width: 440px;
          background: #ffffff;
          border-radius: 28px;
          padding: 28px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.12);
          border: 1px solid #f4f4f5;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .pin-login-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid #f4f4f5;
        }

        .brand-badge {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-box {
          width: 40,
          height: 40;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: #18181b;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .logo-letter {
          color: #ffffff;
          font-weight: 900;
          font-size: 1.1rem;
        }

        .logo-dot {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
        }

        .brand-title {
          font-size: 1rem;
          font-weight: 800;
          color: #18181b;
          letter-spacing: -0.01em;
        }

        .brand-subtitle {
          font-size: 0.75rem;
          color: #71717a;
          font-weight: 500;
        }

        .close-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid #e4e4e7;
          background: #fafafa;
          color: #71717a;
          font-size: 0.85rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .close-btn:hover {
          background: #18181b;
          color: #ffffff;
          border-color: #18181b;
        }

        .error-alert {
          background: #fff1f2;
          color: #e11d48;
          border: 1px solid #fecdd3;
          padding: 10px 14px;
          border-radius: 14px;
          font-size: 0.82rem;
          font-weight: 600;
        }

        .staff-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .section-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #a1a1aa;
        }

        .staff-selector-row {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
          scrollbar-width: thin;
        }

        .staff-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px 6px 6px;
          border-radius: 9999px;
          background: #f4f4f6;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .staff-pill:hover {
          background: #ebebee;
        }

        .staff-pill.active {
          background: #18181b;
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(24, 24, 27, 0.2);
        }

        .avatar-bubble {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #e4e4e7;
          color: #18181b;
          font-weight: 800;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .bubble-active {
          background: #f43f5e;
          color: #ffffff;
        }

        .staff-info {
          display: flex;
          flex-direction: column;
          text-align: left;
        }

        .staff-name {
          font-size: 0.8rem;
          font-weight: 700;
          line-height: 1.1;
        }

        .staff-role {
          font-size: 0.65rem;
          opacity: 0.75;
          text-transform: capitalize;
        }

        .controls-row {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 12px;
        }

        .float-box, .pin-display-card {
          background: #fafafa;
          border: 1px solid #f4f4f5;
          border-radius: 18px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
        }

        .float-label, .pin-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #71717a;
          margin-bottom: 6px;
        }

        .float-input-wrapper {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .currency-prefix {
          font-weight: 800;
          color: #18181b;
          font-size: 0.95rem;
        }

        .float-input {
          border: none;
          background: transparent;
          font-size: 1rem;
          font-weight: 800;
          color: #18181b;
          width: 100%;
          outline: none;
        }

        .pin-dots {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 24px;
        }

        .pin-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #e4e4e7;
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .pin-dot.filled {
          background: #f43f5e;
          transform: scale(1.25);
          box-shadow: 0 0 10px rgba(244, 63, 94, 0.5);
        }

        .keypad-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 4px;
        }

        .keypad-key {
          height: 54px;
          border-radius: 18px;
          border: 1px solid #f4f4f5;
          background: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
          font-size: 1.35rem;
          font-weight: 700;
          color: #18181b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.12s ease;
        }

        .keypad-key:hover {
          background: #f4f4f6;
          transform: translateY(-1px);
        }

        .keypad-key:active {
          transform: scale(0.96);
          background: #e4e4e7;
        }

        .key-clear {
          color: #e11d48;
          font-size: 1rem;
          font-weight: 800;
          background: #fff1f2;
          border-color: #ffe4e6;
        }

        .key-backspace {
          color: #71717a;
          font-size: 1.1rem;
          background: #f4f4f6;
        }

        .action-wrapper {
          margin-top: 4px;
        }

        .btn-unlock {
          width: 100%;
          padding: 14px;
          border-radius: 9999px;
          border: none;
          background: #18181b;
          color: #ffffff;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(24, 24, 27, 0.2);
          transition: all 0.15s ease;
        }

        .btn-unlock:hover:not(:disabled) {
          background: #27272a;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(24, 24, 27, 0.3);
        }

        .btn-unlock:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
