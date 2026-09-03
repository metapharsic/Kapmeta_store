import type { AppProps } from "next/app";
import React from "react";
import Head from "next/head";
import "../styles/globals.css";

import GlobalAlertModal from "../components/GlobalAlertModal";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>KapMeta POS Platform</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <meta name="description" content="KapMeta Restaurant POS Platform — Enterprise Operations, Kitchen KDS & Analytics" />
      </Head>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        :root {
          --bg-base: #f4f4f6;
          --bg-card: #ffffff;
          --bg-subtle: #f9f9fb;
          --bg-hover: #f1f1f4;
          
          --text-primary: #18181b;
          --text-secondary: #71717a;
          --text-muted: #a1a1aa;
          
          --border: #e4e4e7;
          --border-subtle: #f4f4f5;
          
          --accent: #10b981;
          --accent-hover: #059669;
          --accent-subtle: #ecfdf5;
          --accent-subtle-text: #065f46;
          --accent-glow: rgba(16, 185, 129, 0.15);
          
          --color-coral: #f43f5e;
          --color-coral-hover: #e11d48;
          --color-coral-subtle: #fff1f2;
          --color-coral-text: #e11d48;

          --dark-btn: #18181b;
          --dark-btn-hover: #27272a;
          
          --warning: #f59e0b;
          --warning-subtle: #fffbeb;
          --warning-text: #92400e;
          
          --destructive: #ef4444;
          --destructive-subtle: #fef2f2;
          --destructive-text: #991b1b;
          
          --blue-subtle: #eff6ff;
          --blue-text: #1d4ed8;
          
          --purple-subtle: #faf5ff;
          --purple-text: #7e22ce;

          --radius-sm: 8px;
          --radius-md: 14px;
          --radius-lg: 22px;
          --radius-card: 24px;
          --radius-btn: 14px;
          --radius-pill: 9999px;
          
          --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.02);
          --shadow-card: 0 2px 14px rgba(0, 0, 0, 0.03);
          --shadow-pop: 0 12px 28px -4px rgba(0, 0, 0, 0.06);
          --shadow-modal: 0 24px 60px -12px rgba(0, 0, 0, 0.12);
        }

        body {
          margin: 0;
          padding: 0;
          background-color: var(--bg-base);
          color: var(--text-primary);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        * {
          box-sizing: border-box;
        }

        /* Common Form & Input Styles */
        input, select, textarea, button {
          font-family: inherit;
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 9999px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        /* Global Header/Topbar & Permission-Aware Navigation System */
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
          gap: 16px;
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-shrink: 0;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-shrink: 0;
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
          color: var(--text-primary);
        }

        /* Horizontal Scrollable Nav Pills */
        .nav-pill-group, .topbar-nav {
          display: flex;
          background-color: var(--bg-subtle);
          padding: 4px;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border);
          gap: 4px;
          overflow-x: auto;
          scrollbar-width: none; /* Hide scrollbar for Firefox */
          -ms-overflow-style: none; /* Hide scrollbar for IE/Edge */
          max-width: 60%;
          flex-grow: 1;
        }

        .nav-pill-group::-webkit-scrollbar, .topbar-nav::-webkit-scrollbar {
          display: none; /* Hide scrollbar for Chrome/Safari */
        }

        .nav-item, .nav-pill {
          padding: 6px 16px;
          border-radius: var(--radius-pill);
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-decoration: none;
          transition: all 0.15s ease;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .nav-item:hover, .nav-pill:hover {
          color: var(--text-primary);
          background-color: var(--bg-hover);
        }

        .nav-item.active, .nav-pill.active {
          background-color: var(--bg-card);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }
      `,
        }}
      />
      <Component {...pageProps} />
      <GlobalAlertModal />
    </>
  );
}

export default MyApp;
