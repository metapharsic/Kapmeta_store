import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";

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

const STAFF_LIST: StaffProfile[] = [
  { id: "waiter-1", name: "Ramesh (Captain 1)", role: "Captain", email: "waiter@hotelkapila.com", avatar: "👨‍🍳" },
  { id: "waiter-2", name: "Suresh (Captain 2)", role: "Captain", email: "waiter@hotelkapila.com", avatar: "🧑‍🍳" },
  { id: "cashier-1", name: "Kapila Cashier", role: "Cashier", email: "cashier@hotelkapila.com", avatar: "💳" },
  { id: "admin-1", name: "Store Manager", role: "Manager", email: "admin@hotelkapila.com", avatar: "🛡️" },
];

export default function CaptainPinLoginModal({
  isOpen,
  onClose,
  onSuccess,
  outletId = "11111111-1111-1111-1111-111111111111",
}: CaptainPinLoginModalProps) {
  const router = useRouter();
  const [selectedStaff, setSelectedStaff] = useState<StaffProfile>(STAFF_LIST[0]);
  const [pin, setPin] = useState("");
  const [openingFloat, setOpeningFloat] = useState("500.00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch("/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          email: selectedStaff.email,
          outletId,
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
        <div className="pin-login-header">
          <div className="brand-badge">
            <span className="logo-text">POSS</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>KapMeta Captain Login</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Fast PIN Authentication & Shift Start</div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error-alert">{error}</div>}

        {/* Staff Profile Selection Chips */}
        <div className="staff-selector-row">
          {STAFF_LIST.map((st) => (
            <button
              key={st.id}
              type="button"
              className={`staff-chip ${selectedStaff?.id === st.id ? "active" : ""}`}
              onClick={() => {
                setSelectedStaff(st);
                setPin("");
                setError(null);
              }}
            >
              <span className="staff-avatar">{st.avatar}</span>
              <span className="staff-name">{st.name}</span>
            </button>
          ))}
        </div>

        {/* Shift Opening Float Input */}
        <div className="float-row">
          <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#334155" }}>
            💵 Opening Cash Float (₹):
          </label>
          <input
            type="number"
            step="10"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            className="float-input"
            placeholder="500.00"
          />
        </div>

        {/* PIN Dots Indicator */}
        <div className="pin-display-container">
          <div className="pin-dots">
            {[0, 1, 2, 3].map((idx) => (
              <span
                key={idx}
                className={`pin-dot ${pin.length > idx ? "filled" : ""}`}
              />
            ))}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#94a3b8", marginTop: "4px" }}>
            Default test PIN: 1234
          </div>
        </div>

        {/* Touch Keypad */}
        <div className="touch-keypad-grid">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((btn) => (
            <button
              key={btn}
              type="button"
              className={`keypad-btn ${btn === "C" ? "btn-clear" : btn === "⌫" ? "btn-backspace" : ""}`}
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

        {/* Login CTA */}
        <div style={{ marginTop: "16px" }}>
          <button
            type="button"
            className="btn-unlock-captain"
            onClick={handleSubmit}
            disabled={loading || pin.length < 4}
          >
            {loading ? "Verifying PIN..." : `Unlock & Start Shift (${selectedStaff?.name})`}
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
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
        }

        .pin-login-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 24px;
          width: 90%;
          max-width: 420px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
        }

        .pin-login-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 12px;
        }
        .brand-badge {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo-text {
          background: #e11d48;
          color: #fff;
          font-weight: 900;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.875rem;
        }
        .close-btn {
          background: transparent;
          border: none;
          font-size: 1.2rem;
          color: #64748b;
          cursor: pointer;
        }

        .error-alert {
          background: #fef2f2;
          color: #dc2626;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.8125rem;
          margin-top: 12px;
        }

        .staff-selector-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 14px;
        }
        .staff-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 600;
          color: #334155;
          text-align: left;
        }
        .staff-chip.active {
          border-color: #2563eb;
          background: #eff6ff;
          color: #1e40af;
          box-shadow: 0 0 0 1px #2563eb;
        }
        .staff-avatar {
          font-size: 1.1rem;
        }

        .float-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px 12px;
          border-radius: 8px;
          margin-top: 12px;
        }
        .float-input {
          width: 100px;
          padding: 4px 8px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-weight: 700;
          text-align: right;
          font-size: 0.875rem;
        }

        .pin-display-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 16px 0 10px 0;
        }
        .pin-dots {
          display: flex;
          gap: 14px;
        }
        .pin-dot {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 2px solid #cbd5e1;
          background: #f8fafc;
          transition: all 0.15s;
        }
        .pin-dot.filled {
          background: #2563eb;
          border-color: #2563eb;
          transform: scale(1.15);
        }

        .touch-keypad-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 6px;
        }
        .keypad-btn {
          height: 48px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          border-radius: 8px;
          font-size: 1.25rem;
          font-weight: 700;
          color: #0f172a;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.1s, transform 0.05s;
        }
        .keypad-btn:active {
          background: #f1f5f9;
          transform: scale(0.96);
        }
        .btn-clear {
          color: #dc2626;
          font-size: 1rem;
        }
        .btn-backspace {
          color: #64748b;
          font-size: 1.1rem;
        }

        .btn-unlock-captain {
          width: 100%;
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
        }
        .btn-unlock-captain:disabled {
          background: #94a3b8;
          cursor: not-allowed;
          box-shadow: none;
        }
      `}</style>
    </div>
  );
}
