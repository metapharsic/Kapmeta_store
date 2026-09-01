import React from "react";
import Head from "next/head";
import { useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import CompanyDetailsPanel from "../../components/CompanyDetailsPanel";

export default function SettingsCompanyPage() {
  const { me, loading: authLoading } = useAuthGuard("settings.manage");

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
        <title>KapMeta POS - Company Details</title>
        <meta name="description" content="Manage your restaurant's company profile used on receipts and invoices." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-badge">
                <span className="brand-icon">⚡</span>
                <span className="brand-name">KapMeta Analytics</span>
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

            {!authLoading && <CompanyDetailsPanel />}
          </main>
        </div>
      </div>
    </div>
  );
}
