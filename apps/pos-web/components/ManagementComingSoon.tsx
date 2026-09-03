import React from "react";
import Head from "next/head";
import Link from "next/link";
import { useAuthGuard } from "../lib/auth";
import Nav from "./Nav";

// Honest "coming soon" placeholder, reused by the three Management screens
// that have no backend contract yet (Explore Products, Audit Trail, Device
// Mapping - out of scope for the backend agent this session). Matches the
// empty-state-card visual language already used across pages/reports/view.tsx
// and pages/management/*.tsx rather than inventing fake data for these.

interface Props {
  title: string;
  permission: string;
  description: string;
}

export default function ManagementComingSoon({ title, permission, description }: Props) {
  const { loading } = useAuthGuard(permission);
  if (loading) return null;

  return (
    <div className="mg-app">
      <Head>
        <title>KapMeta POS - {title}</title>
      </Head>
      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/admin">Management</Link> / {title}
                </span>
                <h1 className="greeting-title">{title}</h1>
              </div>
            </section>

            <div className="empty-state-card">
              <span className="empty-icon">🚧</span>
              <h3>Coming soon</h3>
              <p>{description}</p>
            </div>
          </main>
        </div>
      </div>

      <style jsx global>{`
        .mg-app { display: flex; flex-direction: column; min-height: 100vh; background-color: var(--bg-base); color: var(--text-primary); }
        .dashboard-body { padding: 24px 32px; display: flex; flex-direction: column; gap: 20px; max-width: 1400px; margin: 0 auto; width: 100%; }
        .dashboard-greeting-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .breadcrumb-line { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .breadcrumb-line :global(a) { color: var(--text-muted); text-decoration: underline; }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
