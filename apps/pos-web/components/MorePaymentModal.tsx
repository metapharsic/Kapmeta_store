import React, { useState } from "react";

export interface MorePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMethod: string;
  isPaid: boolean;
  totalMinor: number;
  onSelectMethod: (method: string, extraData?: any) => void;
  onOpenSplitModal?: () => void;
  customPaymentTypes?: Array<{ id: string; label: string; isOnline?: boolean }>;
}

export default function MorePaymentModal({
  isOpen,
  onClose,
  currentMethod,
  isPaid,
  totalMinor,
  onSelectMethod,
  onOpenSplitModal,
  customPaymentTypes = [],
}: MorePaymentModalProps) {
  const [isOtherExpanded, setIsOtherExpanded] = useState(true);
  const [showRoomServiceDialog, setShowRoomServiceDialog] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [guestName, setGuestName] = useState("");
  const [showUpiQrDialog, setShowUpiQrDialog] = useState(false);
  const [upiRefId, setUpiRefId] = useState("");

  if (!isOpen) return null;

  const totalRupees = (totalMinor / 100).toFixed(2);

  const handlePrimarySelect = (method: string) => {
    if (method === "Part") {
      onClose();
      if (onOpenSplitModal) {
        onOpenSplitModal();
      } else {
        onSelectMethod("PART");
      }
      return;
    }

    if (method === "Not Paid") {
      onSelectMethod("NOT_PAID", { isPaid: false });
      onClose();
      return;
    }

    if (method === "UPI") {
      setShowUpiQrDialog(true);
      return;
    }

    if (method === "Due") {
      onSelectMethod("DUE", { isPaid: false });
      onClose();
      return;
    }

    if (method === "Cash") {
      onSelectMethod("CASH", { isPaid: true });
      onClose();
      return;
    }

    if (method === "Card") {
      onSelectMethod("CARD", { isPaid: true });
      onClose();
      return;
    }

    onSelectMethod(method.toUpperCase(), { isPaid: true });
    onClose();
  };

  const handleOtherSelect = (label: string) => {
    if (label.toLowerCase().includes("room service")) {
      setShowRoomServiceDialog(true);
      return;
    }

    if (label.toUpperCase() === "UPI") {
      setShowUpiQrDialog(true);
      return;
    }

    onSelectMethod(label, { isPaid: true });
    onClose();
  };

  const confirmRoomService = () => {
    if (!roomNumber.trim()) {
      alert("Please enter a room number.");
      return;
    }
    onSelectMethod("Other (Room Service)", {
      isPaid: false,
      roomNumber: roomNumber.trim(),
      guestName: guestName.trim() || null,
    });
    setShowRoomServiceDialog(false);
    onClose();
  };

  const confirmUpiPaid = () => {
    onSelectMethod("UPI", {
      isPaid: true,
      upiRefId: upiRefId.trim() || `UPI_${Date.now()}`,
    });
    setShowUpiQrDialog(false);
    onClose();
  };

  return (
    <div className="petpooja-more-modal-backdrop" onClick={onClose}>
      <div className="petpooja-more-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="more-modal-header">
          <h2 className="more-modal-title">More</h2>
          <button
            type="button"
            className="more-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="more-modal-content">
          {/* Top Primary Payment Methods Grid (3x2) */}
          <div className="primary-payment-grid">
            <button
              type="button"
              className={`payment-grid-card ${currentMethod === "NOT_PAID" || !isPaid ? "is-active-method" : ""}`}
              onClick={() => handlePrimarySelect("Not Paid")}
            >
              <span className="payment-card-text">Not Paid</span>
            </button>

            <button
              type="button"
              className={`payment-grid-card ${currentMethod === "CASH" && isPaid ? "is-active-method" : ""}`}
              onClick={() => handlePrimarySelect("Cash")}
            >
              <span className="payment-card-text">Cash</span>
            </button>

            <button
              type="button"
              className={`payment-grid-card ${currentMethod === "CARD" && isPaid ? "is-active-method" : ""}`}
              onClick={() => handlePrimarySelect("Card")}
            >
              <span className="payment-card-text">Card</span>
            </button>

            <button
              type="button"
              className={`payment-grid-card ${currentMethod === "DUE" ? "is-active-method" : ""}`}
              onClick={() => handlePrimarySelect("Due")}
            >
              <span className="payment-card-text">Due</span>
            </button>

            <button
              type="button"
              className={`payment-grid-card ${currentMethod === "UPI" && isPaid ? "is-active-method" : ""}`}
              onClick={() => handlePrimarySelect("UPI")}
            >
              <span className="payment-card-text">UPI</span>
            </button>

            <button
              type="button"
              className={`payment-grid-card ${currentMethod === "PART" ? "is-active-method" : ""}`}
              onClick={() => handlePrimarySelect("Part")}
            >
              <span className="payment-card-text">Part</span>
            </button>
          </div>

          {/* Accordion Section: "Other" */}
          <div className="other-accordion-section">
            <button
              type="button"
              className="other-accordion-header"
              onClick={() => setIsOtherExpanded((prev) => !prev)}
            >
              <div className="other-header-left">
                {/* Credit Card / Terminal Icon */}
                <svg
                  className="other-card-icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                <span className="other-header-title">Other</span>
              </div>

              <span className="other-chevron-icon">
                {isOtherExpanded ? "⌃" : "⌄"}
              </span>
            </button>

            {isOtherExpanded && (
              <div className="other-accordion-body">
                <div className="other-payment-grid">
                  {/* Highlighted UPI card with Green Border matching screenshot */}
                  <button
                    type="button"
                    className={`other-grid-card upi-highlight-card ${currentMethod === "UPI" ? "selected-other" : ""}`}
                    onClick={() => handleOtherSelect("UPI")}
                  >
                    <span className="other-card-text upi-green-text">UPI</span>
                  </button>

                  {/* Room Service Card */}
                  <button
                    type="button"
                    className={`other-grid-card ${currentMethod.toLowerCase().includes("room service") ? "selected-other" : ""}`}
                    onClick={() => handleOtherSelect("Other (Room Service)")}
                  >
                    <span className="other-card-text">Room Service</span>
                  </button>

                  {/* Any additional custom payment types from DB/Settings */}
                  {customPaymentTypes
                    .filter(
                      (t) =>
                        t.label !== "Cash" &&
                        t.label !== "Card" &&
                        t.label !== "UPI" &&
                        !t.label.toLowerCase().includes("room service")
                    )
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`other-grid-card ${currentMethod === t.label ? "selected-other" : ""}`}
                        onClick={() => handleOtherSelect(t.label)}
                      >
                        <span className="other-card-text">{t.label}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Secondary Dialog: Room Service Assignment */}
        {showRoomServiceDialog && (
          <div className="sub-modal-backdrop" onClick={() => setShowRoomServiceDialog(false)}>
            <div className="sub-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="sub-modal-header">
                <h3>Room Service Settlement</h3>
                <button
                  type="button"
                  className="sub-modal-close"
                  onClick={() => setShowRoomServiceDialog(false)}
                >
                  ✕
                </button>
              </div>
              <div className="sub-modal-body">
                <p className="sub-modal-hint">
                  Transfer ₹{totalRupees} order charge to guest hotel room folio.
                </p>
                <label className="sub-modal-field">
                  <span>Room Number *</span>
                  <input
                    type="text"
                    placeholder="e.g. 204, Suite 101"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    autoFocus
                    className="sub-modal-input"
                  />
                </label>
                <label className="sub-modal-field">
                  <span>Guest Name (Optional)</span>
                  <input
                    type="text"
                    placeholder="e.g. Mr. Sharma"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="sub-modal-input"
                  />
                </label>
              </div>
              <div className="sub-modal-footer">
                <button
                  type="button"
                  className="sub-modal-btn-cancel"
                  onClick={() => setShowRoomServiceDialog(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="sub-modal-btn-confirm"
                  onClick={confirmRoomService}
                >
                  Charge to Room
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Secondary Dialog: Dynamic UPI QR Code */}
        {showUpiQrDialog && (
          <div className="sub-modal-backdrop" onClick={() => setShowUpiQrDialog(false)}>
            <div className="sub-modal-card upi-qr-card" onClick={(e) => e.stopPropagation()}>
              <div className="sub-modal-header">
                <h3>Scan & Pay via UPI</h3>
                <button
                  type="button"
                  className="sub-modal-close"
                  onClick={() => setShowUpiQrDialog(false)}
                >
                  ✕
                </button>
              </div>
              <div className="sub-modal-body upi-center-body">
                <div className="upi-amount-banner">
                  <span className="upi-amount-label">Amount Payable:</span>
                  <span className="upi-amount-val">₹{totalRupees}</span>
                </div>

                {/* Simulated Stylized QR Code */}
                <div className="upi-qr-box">
                  <svg width="150" height="150" viewBox="0 0 100 100" fill="#0f172a">
                    {/* Corners */}
                    <rect x="10" y="10" width="26" height="26" fill="none" stroke="#0f172a" strokeWidth="4" />
                    <rect x="16" y="16" width="14" height="14" fill="#0f172a" />
                    <rect x="64" y="10" width="26" height="26" fill="none" stroke="#0f172a" strokeWidth="4" />
                    <rect x="70" y="16" width="14" height="14" fill="#0f172a" />
                    <rect x="10" y="64" width="26" height="26" fill="none" stroke="#0f172a" strokeWidth="4" />
                    <rect x="16" y="70" width="14" height="14" fill="#0f172a" />
                    {/* Center & Dots */}
                    <rect x="42" y="14" width="6" height="18" />
                    <rect x="52" y="14" width="6" height="10" />
                    <rect x="42" y="40" width="16" height="16" fill="#16a34a" />
                    <rect x="14" y="44" width="18" height="6" />
                    <rect x="68" y="44" width="18" height="6" />
                    <rect x="42" y="68" width="8" height="18" />
                    <rect x="58" y="68" width="12" height="6" />
                    <rect x="76" y="68" width="10" height="18" />
                    <rect x="64" y="80" width="6" height="6" />
                  </svg>
                </div>

                <div className="upi-vpa-text">
                  VPA: <strong>hotelkapila@okaxis</strong>
                </div>

                <label className="sub-modal-field" style={{ width: "100%", marginTop: "10px" }}>
                  <span>UPI / UTR Transaction ID (Optional)</span>
                  <input
                    type="text"
                    placeholder="e.g. 423985729182"
                    value={upiRefId}
                    onChange={(e) => setUpiRefId(e.target.value)}
                    className="sub-modal-input"
                  />
                </label>
              </div>
              <div className="sub-modal-footer">
                <button
                  type="button"
                  className="sub-modal-btn-cancel"
                  onClick={() => setShowUpiQrDialog(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="sub-modal-btn-confirm upi-green-btn"
                  onClick={confirmUpiPaid}
                >
                  Payment Received (UPI)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .petpooja-more-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          z-index: 10000;
          padding: 38px 24px 20px 20px;
          animation: backdropFadeIn 0.15s ease-out;
        }

        @keyframes backdropFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .petpooja-more-modal-card {
          background: #ffffff;
          border-radius: 16px;
          width: 530px;
          max-width: 95vw;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: slideInRight 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideInRight {
          from {
            transform: translateX(30px) scale(0.98);
            opacity: 0;
          }
          to {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }

        /* Modal Header */
        .more-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px 12px 22px;
          background: #ffffff;
        }

        .more-modal-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #1e293b;
          font-family: inherit;
        }

        .more-modal-close-btn {
          background: transparent;
          border: none;
          font-size: 1.25rem;
          color: #64748b;
          cursor: pointer;
          padding: 4px 6px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: background-color 0.1s, color 0.1s;
        }

        .more-modal-close-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        /* Modal Content Area */
        .more-modal-content {
          padding: 4px 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 82vh;
          overflow-y: auto;
        }

        /* 3x2 Grid for Primary Payment Modes */
        .primary-payment-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px 12px;
        }

        .payment-grid-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: border-color 0.12s, box-shadow 0.12s, transform 0.08s;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
          user-select: none;
        }

        .payment-grid-card:hover {
          border-color: #94a3b8;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.06);
        }

        .payment-grid-card:active {
          transform: scale(0.98);
        }

        .payment-grid-card.is-active-method {
          border-color: #22c55e;
          background: #f0fdf4;
        }

        .payment-card-text {
          font-size: 0.9375rem;
          font-weight: 500;
          color: #1e293b;
          text-align: center;
        }

        /* Accordion: "Other" */
        .other-accordion-section {
          display: flex;
          flex-direction: column;
          margin-top: 4px;
        }

        .other-accordion-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: transparent;
          border: none;
          padding: 8px 0;
          cursor: pointer;
          user-select: none;
        }

        .other-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #1e293b;
        }

        .other-card-icon {
          color: #334155;
        }

        .other-header-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #1e293b;
        }

        .other-chevron-icon {
          font-size: 1.125rem;
          color: #64748b;
          font-weight: 700;
        }

        .other-accordion-body {
          padding-top: 10px;
        }

        .other-payment-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px 12px;
        }

        .other-grid-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: border-color 0.12s, box-shadow 0.12s, transform 0.08s;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
          user-select: none;
        }

        .other-grid-card:hover {
          border-color: #94a3b8;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.06);
        }

        .other-grid-card:active {
          transform: scale(0.98);
        }

        /* Specific Highlight for UPI with crisp Green Border */
        .other-grid-card.upi-highlight-card {
          border: 1.5px solid #22c55e;
          background: #ffffff;
        }

        .other-grid-card.upi-highlight-card:hover {
          border-color: #16a34a;
          box-shadow: 0 2px 8px rgba(34, 197, 94, 0.18);
        }

        .other-card-text {
          font-size: 0.9375rem;
          font-weight: 500;
          color: #1e293b;
          text-align: center;
        }

        .other-card-text.upi-green-text {
          color: #16a34a;
          font-weight: 600;
        }

        .other-grid-card.selected-other {
          background: #f0fdf4;
          border-color: #16a34a;
        }

        /* Sub-Modal Dialogs (Room Service, UPI QR) */
        .sub-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10001;
        }

        .sub-modal-card {
          background: #ffffff;
          border-radius: 12px;
          width: 440px;
          max-width: 90vw;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25);
          overflow: hidden;
          animation: backdropFadeIn 0.12s ease-out;
        }

        .sub-modal-header {
          padding: 14px 18px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sub-modal-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
        }

        .sub-modal-close {
          background: transparent;
          border: none;
          font-size: 1.125rem;
          color: #94a3b8;
          cursor: pointer;
        }

        .sub-modal-body {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .upi-center-body {
          align-items: center;
          text-align: center;
        }

        .sub-modal-hint {
          margin: 0;
          font-size: 0.875rem;
          color: #475569;
        }

        .sub-modal-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
          text-align: left;
        }

        .sub-modal-input {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 0.875rem;
          outline: none;
          font-family: inherit;
        }

        .sub-modal-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
        }

        .sub-modal-footer {
          padding: 12px 18px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }

        .sub-modal-btn-cancel {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
        }

        .sub-modal-btn-cancel:hover {
          background: #f1f5f9;
        }

        .sub-modal-btn-confirm {
          background: #dc2626;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 8px 18px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
        }

        .sub-modal-btn-confirm:hover {
          background: #b91c1c;
        }

        .upi-amount-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          justify-content: center;
        }

        .upi-amount-label {
          font-size: 0.875rem;
          color: #64748b;
          font-weight: 500;
        }

        .upi-amount-val {
          font-size: 1.25rem;
          font-weight: 800;
          color: #0f172a;
        }

        .upi-qr-box {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          margin: 6px 0;
        }

        .upi-vpa-text {
          font-size: 0.8125rem;
          color: #475569;
        }

        .upi-green-btn {
          background: #16a34a !important;
        }

        .upi-green-btn:hover {
          background: #15803d !important;
        }
      `}</style>
    </div>
  );
}
