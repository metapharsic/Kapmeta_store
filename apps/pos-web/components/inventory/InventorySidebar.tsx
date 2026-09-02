import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

interface InventorySidebarProps {
  currentOutletName?: string;
  onOpenAgentStatus?: () => void;
}

export default function InventorySidebar({ currentOutletName = "Hotel Kapila", onOpenAgentStatus }: InventorySidebarProps) {
  const router = useRouter();
  const [purchaseOpen, setPurchaseOpen] = useState(true);
  const [manageStockOpen, setManageStockOpen] = useState(false);
  const [consumptionOpen, setConsumptionOpen] = useState(true);
  const [productionOpen, setProductionOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [mastersOpen, setMastersOpen] = useState(false);

  const pathname = router.pathname;

  const isDashboardActive = pathname === "/inventory" || pathname === "/inventory/dashboard";
  const isStockPurchaseActive = pathname === "/inventory/purchase" || pathname === "/inventory/purchase/stock";
  const isPurchaseOrderActive = pathname === "/inventory/purchase-orders" || pathname === "/inventory/purchase/orders";
  const isPurchaseReturnActive = pathname === "/inventory/purchase-returns";

  return (
    <aside style={styles.sidebar}>
      {/* Brand & Collapse Header */}
      <div style={styles.brandRow}>
        <div style={styles.brandContainer}>
          <div style={styles.brandLogoBox}>
            <span style={styles.brandLogoText}>P</span>
          </div>
          <div>
            <div style={styles.brandName}>PETPOOJA</div>
            <div style={styles.brandSub}>POSS</div>
          </div>
        </div>
        <button style={styles.collapseBtn} title="Collapse Sidebar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Back to Billing */}
      <Link href="/" style={styles.backToBilling}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>Back To Billing</span>
      </Link>

      <div style={styles.navScroll}>
        {/* Dashboard */}
        <Link href="/inventory" style={isDashboardActive ? styles.navItemActive : styles.navItem}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span style={styles.navLabel}>Dashboard</span>
        </Link>

        {/* Purchase Accordion */}
        <div>
          <button
            onClick={() => setPurchaseOpen(!purchaseOpen)}
            style={isStockPurchaseActive || isPurchaseOrderActive || isPurchaseReturnActive ? styles.accordionBtnActive : styles.accordionBtn}
          >
            <div style={styles.accordionLeft}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              <span style={styles.navLabel}>Purchase</span>
            </div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: purchaseOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>

          {purchaseOpen && (
            <div style={styles.subNavList}>
              <Link href="/inventory/purchase" style={isStockPurchaseActive ? styles.subNavItemActive : styles.subNavItem}>
                Stock Purchase
              </Link>
              <Link href="/inventory/purchase-orders" style={isPurchaseOrderActive ? styles.subNavItemActive : styles.subNavItem}>
                Purchase Order
              </Link>
              <Link href="/inventory/purchase-orders" style={isPurchaseReturnActive ? styles.subNavItemActive : styles.subNavItem}>
                Purchase Return
              </Link>
            </div>
          )}
        </div>

        {/* Manage Stock Accordion */}
        <div>
          <button onClick={() => setManageStockOpen(!manageStockOpen)} style={styles.accordionBtn}>
            <div style={styles.accordionLeft}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
              <span style={styles.navLabel}>Manage Stock</span>
            </div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: manageStockOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>

          {manageStockOpen && (
            <div style={styles.subNavList}>
              <Link href="/inventory" style={styles.subNavItem}>Opening Stock</Link>
              <Link href="/inventory" style={styles.subNavItem}>Physical Verification</Link>
              <Link href="/inventory" style={styles.subNavItem}>Stock Adjustment</Link>
            </div>
          )}
        </div>

        {/* Consumption Section */}
        <div style={styles.sectionHeader}>Consumption</div>
        <div style={styles.flatNavList}>
          <Link href="/orders?tab=all" style={styles.flatNavItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span>Sales</span>
          </Link>
          <Link href="/inventory" style={styles.flatNavItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
            <span>Transfer</span>
          </Link>
          <Link href="/inventory" style={styles.flatNavItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Wastage</span>
          </Link>
          <div style={styles.viewMoreLink}>View More</div>
        </div>

        {/* Production Section */}
        <button onClick={() => setProductionOpen(!productionOpen)} style={styles.accordionBtn}>
          <div style={styles.accordionLeft}>
            <span style={styles.sectionHeaderNoPad}>Production</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: productionOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>

        {/* Reports Section */}
        <button onClick={() => setReportsOpen(!reportsOpen)} style={styles.accordionBtn}>
          <div style={styles.accordionLeft}>
            <span style={styles.sectionHeaderNoPad}>Reports</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: reportsOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>

        {/* Masters Section */}
        <button onClick={() => setMastersOpen(!mastersOpen)} style={styles.accordionBtn}>
          <div style={styles.accordionLeft}>
            <span style={styles.sectionHeaderNoPad}>Masters</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: mastersOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
        {mastersOpen && (
          <div style={styles.subNavList}>
            <Link href="/inventory" style={styles.subNavItem}>Raw Materials</Link>
            <Link href="/inventory" style={styles.subNavItem}>Recipes Master</Link>
            <Link href="/inventory" style={styles.subNavItem}>Vendors</Link>
          </div>
        )}
      </div>

      {/* Assistance Footer */}
      <div style={styles.footerContainer}>
        <div style={styles.helpText}>Need Assistance ?</div>
        <div style={styles.callbackText}>Request a Callback.</div>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 230,
    minWidth: 230,
    backgroundColor: "#ffffff",
    borderRight: "1px solid #edf2f7",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    position: "sticky",
    top: 0,
    zIndex: 30,
    userSelect: "none",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 18px",
    borderBottom: "1px solid #f1f5f9",
  },
  brandContainer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  brandLogoBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#ffffff",
    fontWeight: 900,
    fontSize: "1.1rem",
    boxShadow: "0 2px 6px rgba(239, 68, 68, 0.3)",
  },
  brandLogoText: {
    transform: "translateY(-1px)",
  },
  brandName: {
    fontSize: "0.75rem",
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: "0.5px",
    lineHeight: 1.1,
  },
  brandSub: {
    fontSize: "0.95rem",
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: "-0.5px",
  },
  collapseBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  backToBilling: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 18px",
    color: "#475569",
    fontSize: "0.85rem",
    fontWeight: 600,
    textDecoration: "none",
    borderBottom: "1px solid #f1f5f9",
    transition: "background 0.15s",
  },
  navScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "9px 14px",
    borderRadius: 8,
    color: "#475569",
    fontSize: "0.875rem",
    fontWeight: 600,
    textDecoration: "none",
    transition: "all 0.15s",
  },
  navItemActive: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "9px 14px",
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    color: "#2563eb",
    fontSize: "0.875rem",
    fontWeight: 700,
    textDecoration: "none",
  },
  navLabel: {
    flex: 1,
  },
  accordionBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 14px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "#475569",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },
  accordionBtnActive: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 14px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#eff6ff",
    color: "#2563eb",
    fontSize: "0.875rem",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  accordionLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  subNavList: {
    paddingLeft: 34,
    paddingTop: 4,
    paddingBottom: 6,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  subNavItem: {
    padding: "7px 10px",
    borderRadius: 6,
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "#64748b",
    textDecoration: "none",
    transition: "color 0.15s",
  },
  subNavItemActive: {
    padding: "7px 10px",
    borderRadius: 6,
    fontSize: "0.8125rem",
    fontWeight: 700,
    color: "#2563eb",
    backgroundColor: "#f0f7ff",
    textDecoration: "none",
  },
  sectionHeader: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#94a3b8",
    padding: "16px 14px 6px 14px",
    textTransform: "capitalize",
    letterSpacing: "0.3px",
  },
  sectionHeaderNoPad: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#475569",
  },
  flatNavList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  flatNavItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "7px 14px",
    borderRadius: 8,
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "#64748b",
    textDecoration: "none",
  },
  viewMoreLink: {
    padding: "4px 14px",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#2563eb",
    cursor: "pointer",
  },
  footerContainer: {
    padding: "14px 16px",
    borderTop: "1px solid #f1f5f9",
    backgroundColor: "#ffffff",
  },
  helpText: {
    fontSize: "0.75rem",
    color: "#64748b",
    fontWeight: 500,
  },
  callbackText: {
    fontSize: "0.8rem",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer",
  },
};
