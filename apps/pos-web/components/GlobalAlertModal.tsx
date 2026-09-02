import React, { useEffect, useState, useCallback } from "react";

export type AlertType = "info" | "success" | "warning" | "error" | "confirm";

export interface ModalAlertOptions {
  id?: string;
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  isConfirm?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface AlertState extends ModalAlertOptions {
  isOpen: boolean;
}

// Global programmatic dispatcher
export function showPosAlert(message: string, title?: string, type?: AlertType) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("pos:show-alert", {
        detail: { message, title, type: type || autoDetectType(message), isConfirm: false },
      })
    );
  }
}

export function showPosConfirm(
  message: string,
  onConfirm: () => void,
  title?: string,
  confirmText = "Confirm",
  cancelText = "Cancel"
) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("pos:show-alert", {
        detail: {
          message,
          title: title || "Please Confirm",
          type: "confirm",
          isConfirm: true,
          confirmText,
          cancelText,
          onConfirm,
        },
      })
    );
  }
}

function autoDetectType(msg: string): AlertType {
  const m = String(msg || "").toLowerCase();
  if (m.includes("✓") || m.includes("success") || m.includes("dispatched") || m.includes("completed")) {
    return "success";
  }
  if (m.includes("⚠️") || m.includes("failed") || m.includes("error") || m.includes("denied") || m.includes("out of stock")) {
    return "error";
  }
  if (m.includes("please") || m.includes("warning") || m.includes("select") || m.includes("required") || m.includes("enter")) {
    return "warning";
  }
  return "info";
}

function autoDetectTitle(msg: string, type: AlertType): string {
  const m = String(msg || "").toLowerCase();
  if (type === "success" || m.includes("✓") || m.includes("dispatched")) {
    return "Order & Billing Notification";
  }
  if (type === "error" || m.includes("failed") || m.includes("error")) {
    return "Action Failed";
  }
  if (type === "warning" || m.includes("please") || m.includes("required")) {
    return "Attention Required";
  }
  return "KapMeta POS";
}

export default function GlobalAlertModal() {
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const handleClose = useCallback(() => {
    setAlertState((prev) => (prev ? { ...prev, isOpen: false } : null));
  }, []);

  const handleConfirm = useCallback(() => {
    if (alertState?.onConfirm) {
      alertState.onConfirm();
    }
    handleClose();
  }, [alertState, handleClose]);

  const handleCancel = useCallback(() => {
    if (alertState?.onCancel) {
      alertState.onCancel();
    }
    handleClose();
  }, [alertState, handleClose]);

  useEffect(() => {
    // Override default browser window.alert with KapMeta modal popup
    const originalAlert = window.alert;
    window.alert = (message?: any) => {
      const msgStr = String(message ?? "");
      const detectedType = autoDetectType(msgStr);
      const detectedTitle = autoDetectTitle(msgStr, detectedType);
      setAlertState({
        isOpen: true,
        message: msgStr,
        title: detectedTitle,
        type: detectedType,
        isConfirm: false,
      });
    };

    const handleCustomAlert = (event: Event) => {
      const customEvent = event as CustomEvent<ModalAlertOptions>;
      const detail = customEvent.detail;
      const detectedType = detail.type || autoDetectType(detail.message);
      const detectedTitle = detail.title || autoDetectTitle(detail.message, detectedType);
      setAlertState({
        isOpen: true,
        message: detail.message,
        title: detectedTitle,
        type: detectedType,
        isConfirm: !!detail.isConfirm,
        confirmText: detail.confirmText || "OK",
        cancelText: detail.cancelText || "Cancel",
        onConfirm: detail.onConfirm,
        onCancel: detail.onCancel,
      });
    };

    window.addEventListener("pos:show-alert", handleCustomAlert);

    return () => {
      window.alert = originalAlert;
      window.removeEventListener("pos:show-alert", handleCustomAlert);
    };
  }, []);

  useEffect(() => {
    if (!alertState?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (alertState.isConfirm) {
          handleCancel();
        } else {
          handleClose();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (alertState.isConfirm) {
          handleConfirm();
        } else {
          handleClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [alertState, handleClose, handleConfirm, handleCancel]);

  if (!alertState || !alertState.isOpen) return null;

  const { title, message, type = "info", isConfirm, confirmText = "OK", cancelText = "Cancel" } = alertState;

  // Format message lines
  const lines = message.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const isStructured = lines.some((l) => l.includes(":") || l.startsWith("•") || l.startsWith("✓") || l.startsWith("⚠️"));

  // Badge & Colors configuration
  const theme = {
    success: {
      accent: "#10b981",
      accentText: "var(--accent-subtle-text, #065f46)",
      accentBg: "#ecfdf5",
      icon: "✓",
      border: "#a7f3d0",
      btnBg: "#059669",
      btnHover: "#047857",
    },
    warning: {
      accent: "#f59e0b",
      accentText: "#f59e0b",
      accentBg: "#fffbeb",
      icon: "⚠️",
      border: "#fde68a",
      btnBg: "#0284c7",
      btnHover: "#0369a1",
    },
    error: {
      accent: "#ef4444",
      accentText: "#ef4444",
      accentBg: "#fef2f2",
      icon: "✕",
      border: "#fecaca",
      btnBg: "#dc2626",
      btnHover: "#b91c1c",
    },
    confirm: {
      accent: "#6366f1",
      accentText: "#6366f1",
      accentBg: "#eef2ff",
      icon: "❓",
      border: "#c7d2fe",
      btnBg: "#4f46e5",
      btnHover: "#4338ca",
    },
    info: {
      accent: "#0284c7",
      accentText: "#0284c7",
      accentBg: "#f0f9ff",
      icon: "ℹ️",
      border: "#bae6fd",
      btnBg: "#0284c7",
      btnHover: "#0369a1",
    },
  }[type];

  return (
    <div className="pos-alert-overlay" onClick={handleClose}>
      <div
        className="pos-alert-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Top Accent Strip */}
        <div className="pos-alert-accent-strip" style={{ backgroundColor: theme.accent }} />

        {/* Dialog Header */}
        <div className="pos-alert-header">
          <div className="pos-alert-icon-wrapper" style={{ backgroundColor: theme.accentBg, color: theme.accent, borderColor: theme.border }}>
            <span className="pos-alert-icon">{theme.icon}</span>
          </div>
          <div className="pos-alert-title-area">
            <h3 className="pos-alert-title">{title}</h3>
            <span className="pos-alert-subtitle">KapMeta POS Terminal</span>
          </div>
          <button
            type="button"
            className="pos-alert-close-btn"
            onClick={isConfirm ? handleCancel : handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Dialog Content */}
        <div className="pos-alert-body">
          {isStructured ? (
            <div className="pos-alert-structured-content">
              {lines.map((line, idx) => {
                if (line.includes(":") && !line.startsWith("•")) {
                  const parts = line.split(":");
                  const label = parts[0].trim();
                  const value = parts.slice(1).join(":").trim();
                  return (
                    <div key={idx} className="pos-alert-kv-row">
                      <span className="pos-alert-kv-label">{label}:</span>
                      <span className="pos-alert-kv-value">{value}</span>
                    </div>
                  );
                }
                const isHeading = line.startsWith("✓") || line.startsWith("⚠️") || line.startsWith("✓ KOT");
                return (
                  <p
                    key={idx}
                    className={`pos-alert-text-line ${isHeading ? "is-heading" : ""}`}
                    style={{ color: isHeading ? theme.accentText : "#334155" }}
                  >
                    {line}
                  </p>
                );
              })}
            </div>
          ) : (
            <div className="pos-alert-simple-message">
              {lines.map((line, idx) => (
                <p key={idx} className="pos-alert-paragraph">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Dialog Footer Actions */}
        <div className="pos-alert-footer">
          {isConfirm && (
            <button
              type="button"
              className="pos-alert-btn-secondary"
              onClick={handleCancel}
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            className="pos-alert-btn-primary"
            style={{ backgroundColor: theme.btnBg }}
            onClick={isConfirm ? handleConfirm : handleClose}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style jsx>{`
        .pos-alert-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          padding: 16px;
          animation: posAlertFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .pos-alert-dialog {
          background: #ffffff;
          border-radius: 14px;
          box-shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8);
          width: 100%;
          max-width: 440px;
          overflow: hidden;
          position: relative;
          display: flex;
          flex-direction: column;
          animation: posAlertScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .pos-alert-accent-strip {
          height: 4px;
          width: 100%;
        }

        .pos-alert-header {
          display: flex;
          align-items: center;
          padding: 18px 20px 14px 20px;
          gap: 14px;
          border-bottom: 1px solid #f1f5f9;
        }

        .pos-alert-icon-wrapper {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          border: 1px solid;
          flex-shrink: 0;
        }

        .pos-alert-title-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .pos-alert-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.25;
          letter-spacing: -0.2px;
        }

        .pos-alert-subtitle {
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 500;
        }

        .pos-alert-close-btn {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 0.95rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .pos-alert-close-btn:hover {
          background: #f1f5f9;
          color: #334155;
        }

        .pos-alert-body {
          padding: 18px 20px;
          max-height: 380px;
          overflow-y: auto;
          font-size: 0.925rem;
          line-height: 1.5;
          color: #334155;
        }

        .pos-alert-paragraph {
          margin: 0 0 8px 0;
          font-weight: 500;
          color: #1e293b;
        }

        .pos-alert-paragraph:last-child {
          margin-bottom: 0;
        }

        .pos-alert-structured-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #f8fafc;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
        }

        .pos-alert-text-line {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .pos-alert-text-line.is-heading {
          font-weight: 700;
          font-size: 0.95rem;
          margin-bottom: 4px;
        }

        .pos-alert-kv-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 3px 0;
          border-bottom: 1px dashed #e2e8f0;
          font-size: 0.875rem;
        }

        .pos-alert-kv-row:last-child {
          border-bottom: none;
        }

        .pos-alert-kv-label {
          color: #64748b;
          font-weight: 600;
        }

        .pos-alert-kv-value {
          color: #0f172a;
          font-weight: 700;
          text-align: right;
        }

        .pos-alert-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 14px 20px 18px 20px;
          gap: 10px;
          background: #ffffff;
          border-top: 1px solid #f1f5f9;
        }

        .pos-alert-btn-secondary {
          padding: 10px 18px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #475569;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .pos-alert-btn-secondary:hover {
          background: #f8fafc;
          border-color: #94a3b8;
          color: #1e293b;
        }

        .pos-alert-btn-primary {
          padding: 10px 24px;
          border-radius: 8px;
          border: none;
          color: #ffffff;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
          transition: all 0.15s ease;
          min-width: 90px;
        }

        .pos-alert-btn-primary:hover {
          filter: brightness(0.92);
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
        }

        .pos-alert-btn-primary:active {
          transform: translateY(0);
        }

        @keyframes posAlertFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes posAlertScaleIn {
          from {
            opacity: 0;
            transform: scale(0.94) translateY(6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
