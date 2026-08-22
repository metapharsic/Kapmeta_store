import type { AppProps } from "next/app";
import React from "react";
import "../styles/globals.css";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        :root {
          --bg-base: #f8fafc;
          --bg-card: #ffffff;
          --bg-subtle: #f1f5f9;
          --bg-hover: #f8fafc;
          
          --text-primary: #0f172a;
          --text-secondary: #64748b;
          --text-muted: #94a3b8;
          
          --border: #e2e8f0;
          --border-subtle: #f1f5f9;
          
          --accent: #10b981;
          --accent-hover: #059669;
          --accent-subtle: #ecfdf5;
          --accent-subtle-text: #065f46;
          --accent-glow: rgba(16, 185, 129, 0.15);
          
          --dark-btn: #0f172a;
          --dark-btn-hover: #1e293b;
          
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

          --radius-sm: 6px;
          --radius-md: 10px;
          --radius-lg: 16px;
          --radius-pill: 9999px;
          
          --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          --shadow-card: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04);
          --shadow-pop: 0 10px 25px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04);
          --shadow-modal: 0 25px 50px -12px rgba(15, 23, 42, 0.2);
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
    </>
  );
}

export default MyApp;
