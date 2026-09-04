import React from "react";
import Link from "next/link";

interface CaptainNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  outletName?: string;
  stationCode?: string;
  appVersion?: string;
  staffName?: string;
  unsuccessfulCount?: number;
  onNewKot: () => void;
  onOpenUnsuccessfulModal: () => void;
  onSyncData: () => void;
  onUpdateMenu: () => void;
  onOpenServerIpModal: () => void;
  onOpenCashTipsCalculator?: () => void;
  onOpenSettings: () => void;
  onLogout?: () => void;
}

export default function CaptainNavDrawer({
  isOpen,
  onClose,
  outletName = "",
  stationCode = "",
  appVersion = "",
  staffName,
  unsuccessfulCount = 0,
  onNewKot,
  onOpenUnsuccessfulModal,
  onSyncData,
  onUpdateMenu,
  onOpenServerIpModal,
  onOpenCashTipsCalculator,
  onOpenSettings,
  onLogout,
}: CaptainNavDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="captain-drawer-backdrop" onClick={onClose}>
      <div className="captain-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Captain Brand Header */}
        <div className="captain-drawer-header">
          <div className="brand-badge-box">
            <div className="brand-logo-icon">
              🍽️
            </div>
            <div className="brand-titles">
              <div className="brand-title">KAPMETA</div>
              <div className="brand-subtitle">CAPTAIN TABLET</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-close-drawer"
              title="Close Drawer"
            >
              ✕
            </button>
          </div>

          <div className="captain-meta-info">
            <div className="version-station-row">
              <span className="version-text">{appVersion}</span>
              <span className="station-badge">● Station {stationCode}</span>
            </div>
            <div className="outlet-name-text">
              <span className="hotel-icon">🏨</span> {outletName}
            </div>
          </div>
        </div>

        {/* Action Menu List */}
        <div className="captain-menu-list">
          <button
            type="button"
            className="menu-item-btn"
            onClick={() => {
              onNewKot();
              onClose();
            }}
          >
            <span className="menu-icon">📝</span>
            <span className="menu-label">New KOT</span>
          </button>

          <button
            type="button"
            className="menu-item-btn"
            onClick={() => {
              if (onOpenCashTipsCalculator) onOpenCashTipsCalculator();
              onClose();
            }}
          >
            <span className="menu-icon">💰</span>
            <span className="menu-label">Shift Cash & Tips</span>
          </button>

          <button
            type="button"
            className="menu-item-btn"
            onClick={() => {
              onOpenUnsuccessfulModal();
              onClose();
            }}
          >
            <span className="menu-icon">⚠️</span>
            <span className="menu-label">Unsuccessful KOT</span>
            {unsuccessfulCount > 0 && (
              <span className="unsuccessful-badge">{unsuccessfulCount}</span>
            )}
          </button>

          <button
            type="button"
            className="menu-item-btn"
            onClick={() => {
              onSyncData();
              onClose();
            }}
          >
            <span className="menu-icon">🔄</span>
            <span className="menu-label">Sync Data</span>
          </button>

          <button
            type="button"
            className="menu-item-btn"
            onClick={() => {
              onUpdateMenu();
              onClose();
            }}
          >
            <span className="menu-icon">🍴</span>
            <span className="menu-label">Update Menu</span>
          </button>

          <button
            type="button"
            className="menu-item-btn"
            onClick={() => {
              onOpenServerIpModal();
              onClose();
            }}
          >
            <span className="menu-icon">🌐</span>
            <span className="menu-label">Find Server IP</span>
          </button>

          <button
            type="button"
            className="menu-item-btn"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
          >
            <span className="menu-icon">⚙️</span>
            <span className="menu-label">Station Settings</span>
          </button>

          <div style={{ height: "1px", background: "rgba(255,255,255,0.12)", margin: "8px 0" }} />

          <Link href="/" className="menu-item-btn" onClick={onClose} style={{ textDecoration: "none" }}>
            <span className="menu-icon">🖥️</span>
            <span className="menu-label">POS Terminal Floor</span>
          </Link>

          <Link href="/kitchen" className="menu-item-btn" onClick={onClose} style={{ textDecoration: "none" }}>
            <span className="menu-icon">👨‍🍳</span>
            <span className="menu-label">Kitchen Display (KDS)</span>
          </Link>

          <Link href="/orders?tab=live" className="menu-item-btn" onClick={onClose} style={{ textDecoration: "none" }}>
            <span className="menu-icon">⚡</span>
            <span className="menu-label">Live Orders Register</span>
          </Link>

          <Link href="/admin?tab=daily-ops" className="menu-item-btn" onClick={onClose} style={{ textDecoration: "none" }}>
            <span className="menu-icon">📊</span>
            <span className="menu-label">Daily Operations Hub</span>
          </Link>
        </div>

        {/* Drawer Footer: Staff Profile & Logout */}
        <div className="captain-drawer-footer">
          {staffName && (
            <div className="staff-profile-chip">
              <span className="staff-avatar">🧑‍🍳</span>
              <div className="staff-details">
                <span className="staff-label">Logged In Waiter</span>
                <span className="staff-name">{staffName}</span>
              </div>
            </div>
          )}

          {onLogout && (
            <button
              type="button"
              className="btn-logout-drawer"
              onClick={() => {
                onClose();
                onLogout();
              }}
            >
              <span className="logout-icon">🚪</span>
              <span>Log Out / End Shift</span>
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .captain-drawer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(24, 24, 27, 0.4);
          backdrop-filter: blur(8px);
          z-index: 200;
          display: flex;
        }

        .captain-drawer-panel {
          width: 320px;
          height: 100%;
          background: #ffffff;
          border-right: 1px solid #f4f4f5;
          box-shadow: 10px 0 40px rgba(0, 0, 0, 0.06);
          display: flex;
          flex-direction: column;
          animation: slideDrawer 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .captain-drawer-header {
          padding: 22px 20px 18px 20px;
          background: #ffffff;
          border-bottom: 1px solid #f4f4f5;
        }

        .brand-badge-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .brand-logo-icon {
          width: 40px;
          height: 40px;
          background: #18181b;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        }
        .brand-titles {
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .brand-title {
          font-size: 0.9375rem;
          font-weight: 900;
          color: #18181b;
          letter-spacing: 0.5px;
        }
        .brand-subtitle {
          font-size: 0.6875rem;
          font-weight: 800;
          color: #71717a;
          letter-spacing: 0.5px;
        }
        .btn-close-drawer {
          background: #f4f4f6;
          border: none;
          color: #71717a;
          font-size: 1rem;
          cursor: pointer;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .btn-close-drawer:hover {
          color: #18181b;
          background: #e4e4e7;
        }

        .captain-meta-info {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .version-station-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.6875rem;
          color: #71717a;
          font-weight: 600;
        }
        .station-badge {
          color: #18181b;
          font-weight: 800;
          background: #f4f4f6;
          padding: 2px 8px;
          border-radius: 999px;
        }
        .outlet-name-text {
          font-size: 0.8125rem;
          font-weight: 800;
          color: #18181b;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .captain-menu-list {
          padding: 14px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          overflow-y: auto;
        }

        .menu-item-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: transparent;
          border: none;
          border-radius: 999px;
          color: #18181b;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: all 0.15s;
          position: relative;
        }
        .menu-item-btn:hover {
          background: #f4f4f6;
          color: #18181b;
          transform: translateX(3px);
        }

        .menu-icon {
          font-size: 1.15rem;
        }
        .menu-label {
          flex: 1;
        }

        .unsuccessful-badge {
          background: #f43f5e;
          color: #ffffff;
          font-size: 0.6875rem;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 999px;
        }

        .captain-drawer-footer {
          padding: 16px;
          border-top: 1px solid #f4f4f5;
          background: #fafafa;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .staff-profile-chip {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #ffffff;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid #f4f4f5;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
        }
        .staff-avatar {
          font-size: 1.25rem;
        }
        .staff-details {
          display: flex;
          flex-direction: column;
        }
        .staff-label {
          font-size: 0.625rem;
          color: #71717a;
          font-weight: 700;
          text-transform: uppercase;
        }
        .staff-name {
          font-size: 0.8125rem;
          color: #18181b;
          font-weight: 800;
        }

        .btn-logout-drawer {
          background: #fee2e2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          font-size: 0.8125rem;
          font-weight: 800;
          padding: 12px 16px;
          border-radius: 999px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.15s;
        }
        .btn-logout-drawer:hover {
          background: #fca5a5;
          color: #991b1b;
          border-color: #f87171;
        }
        .logout-icon {
          font-size: 1rem;
        }

        @keyframes slideDrawer {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
