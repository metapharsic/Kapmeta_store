import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { authedFetch, logout } from "../lib/auth";
import QuickSearchModal from "./QuickSearchModal";
import ItemToggleModal from "./ItemToggleModal";
import HoldOrdersDrawer from "./HoldOrdersDrawer";

interface PetPoojaHeaderProps {
  outletName?: string;
  outletCode?: string;
  onNewOrder?: () => void;
  activeMode?: "DINE_IN" | "DELIVERY" | "PICKUP";
  onModeChange?: (mode: "DINE_IN" | "DELIVERY" | "PICKUP") => void;
  heldOrdersCount?: number;
  onOpenHoldDrawer?: () => void;
}

export default function PetPoojaHeader({
  outletName = "Hotel kapila",
  outletCode = "R327038",
  onNewOrder,
  activeMode,
  onModeChange,
  heldOrdersCount = 0,
  onOpenHoldDrawer,
}: PetPoojaHeaderProps) {
  const router = useRouter();
  const [searchModalType, setSearchModalType] = useState<"BILL" | "KOT" | null>(null);
  const [billSearchQuery, setBillSearchQuery] = useState("");
  const [kotSearchQuery, setKotSearchQuery] = useState("");
  const [isItemToggleOpen, setIsItemToggleOpen] = useState(false);
  const [isHoldOpen, setIsHoldOpen] = useState(false);
  const [isStoreOnline, setIsStoreOnline] = useState(true);
  const [liveViewActive, setLiveViewActive] = useState(true);
  const [alertsCount, setAlertsCount] = useState(0);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);

  // Left Drawer Expanded Submenu States
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [operationsExpanded, setOperationsExpanded] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [activeMenuItem, setActiveMenuItem] = useState<string>("Billing");

  const handleBillSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && billSearchQuery.trim()) {
      router.push(`/orders?search=${encodeURIComponent(billSearchQuery.trim())}`);
    }
  };

  const handleKotSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && kotSearchQuery.trim()) {
      router.push(`/kitchen?kot=${encodeURIComponent(kotSearchQuery.trim())}`);
    }
  };

  const handleCheckUpdates = () => {
    alert("Checking kapMeta POS System Updates...\n\nCurrent Version: 126.0.1\nDatabase: Synchronized\nStatus: Up to date (Latest Stable Release).");
  };

  return (
    <>
      {/* Desktop Window Title Bar */}
      <div className="petpooja-window-titlebar">
        <div className="window-title-left">
          <div className="window-app-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff">
              <path d="M12 2L2 9.5V22h20V9.5L12 2zm0 3.5l6 4.5v9H6v-9l6-4.5z" />
            </svg>
          </div>
          <span className="window-title-text">
            {outletName} ({outletCode}) - The Finest Restaurant Management Platform
          </span>
        </div>
        <div className="window-controls-right">
          <button type="button" className="win-btn" title="Minimize">─</button>
          <button type="button" className="win-btn" title="Maximize">🗖</button>
          <button type="button" className="win-btn win-close" title="Close">✕</button>
        </div>
      </div>

      {/* Main PetPooja Navigation Header */}
      <header className="petpooja-top-header">
        {/* Left Section: Online dot, Hamburger, Logo, New Order, Search Pills */}
        <div className="header-left-cluster">
          <span className="online-indicator-dot" title="LAN / Cloud Connected"></span>

          <button
            type="button"
            className="hamburger-menu-btn"
            onClick={() => setShowMenuDrawer(true)}
            title="Open kapMeta Settings & Operations Menu"
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>

          <Link href="/" className="petpooja-brand-badge" title="KapMeta POS Home">
            <div className="brand-icon-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff">
                <path d="M12 3L4 9v12h16V9l-8-6zm6 16H6v-9.5l6-4.5 6 4.5V19z" />
              </svg>
            </div>
            <div className="brand-text-col">
              <span className="brand-sub">KAPMETA</span>
              <span className="brand-main">POS</span>
            </div>
          </Link>

          <button
            type="button"
            className="petpooja-new-order-pill"
            onClick={() => {
              if (onNewOrder) onNewOrder();
              else router.push("/");
            }}
          >
            New Order
          </button>

          {/* Bill No Search Pill */}
          <div className="search-pill-box">
            <span className="search-glass-icon">🔍</span>
            <input
              type="text"
              className="search-pill-input"
              placeholder="Bill No"
              value={billSearchQuery}
              onChange={(e) => setBillSearchQuery(e.target.value)}
              onKeyDown={handleBillSearchSubmit}
              onClick={() => setSearchModalType("BILL")}
            />
          </div>

          {/* KOT No Search Pill */}
          <div className="search-pill-box">
            <span className="search-glass-icon">🔍</span>
            <input
              type="text"
              className="search-pill-input"
              placeholder="KOT No"
              value={kotSearchQuery}
              onChange={(e) => setKotSearchQuery(e.target.value)}
              onKeyDown={handleKotSearchSubmit}
              onClick={() => setSearchModalType("KOT")}
            />
          </div>
        </div>

        {/* Right Section: Icon Actions & Support Hotline */}
        <div className="header-right-cluster">
          {/* 1. Item On/Off */}
          <button
            type="button"
            className="top-nav-action-btn"
            onClick={() => setIsItemToggleOpen(true)}
            title="Item Availability / 86 Stock On-Off"
          >
            <div className="nav-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="6" />
                <circle cx="8" cy="12" r="3" fill="#475569" />
              </svg>
            </div>
            <span className="nav-caption">Item On/Off</span>
          </button>

          {/* 2. Store */}
          <button
            type="button"
            className={`top-nav-action-btn ${isStoreOnline ? "is-online" : "is-offline"}`}
            onClick={() => setIsStoreOnline(!isStoreOnline)}
            title={isStoreOnline ? "Store is Online" : "Store is Offline"}
          >
            <div className="nav-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="nav-caption">Store</span>
          </button>

          {/* 3. Live View */}
          <button
            type="button"
            className={`top-nav-action-btn ${liveViewActive ? "is-live" : ""}`}
            onClick={() => {
              setLiveViewActive(!liveViewActive);
              router.push("/orders?tab=live");
            }}
            title="Live View Floor & KDS Feed"
          >
            <div className="nav-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <path d="M4.93 19.07A10 10 0 0 1 12 16a10 10 0 0 1 7.07 3.07M1.39 15.54A15 15 0 0 1 12 11a15 15 0 0 1 10.61 4.54M8.46 22.54A5 5 0 0 1 12 21a5 5 0 0 1 3.54 1.54" />
                <circle cx="12" cy="11" r="1" fill="#475569" />
              </svg>
            </div>
            <span className="nav-caption">Live View</span>
          </button>

          {/* 4. Orders */}
          <Link href="/orders" className="top-nav-action-btn" title="Orders Register">
            <div className="nav-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <span className="nav-caption">Orders</span>
          </Link>

          {/* 5. Recent */}
          <Link href="/orders?tab=recent" className="top-nav-action-btn" title="Recent Invoices">
            <div className="nav-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <span className="nav-caption">Recent</span>
          </Link>

          {/* 6. Hold */}
          <button
            type="button"
            className="top-nav-action-btn"
            onClick={() => {
              if (onOpenHoldDrawer) onOpenHoldDrawer();
              else setIsHoldOpen(true);
            }}
            title="Held Orders"
          >
            <div className="nav-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span className="nav-caption">Hold {heldOrdersCount > 0 ? `(${heldOrdersCount})` : ""}</span>
          </button>

          {/* 7. Alerts */}
          <button
            type="button"
            className="top-nav-action-btn alert-action-btn"
            onClick={() => setAlertsCount(0)}
            title="Alerts"
          >
            <div className="nav-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {alertsCount > 0 && <span className="red-badge-dot"></span>}
            </div>
            <span className="nav-caption">Alerts</span>
          </button>

          {/* 8. Zomato Help */}
          <Link href="/channel-availability" className="top-nav-action-btn" title="Zomato / Swiggy Aggregator Support">
            <div className="nav-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
            </div>
            <span className="nav-caption">Zomato Help</span>
          </Link>

          {/* 9. Logout */}
          <button
            type="button"
            className="top-nav-action-btn"
            onClick={() => {
              if (confirm("Are you sure you want to log out of kapMeta POS?")) {
                logout().catch(() => {});
              }
            }}
            title="Logout"
          >
            <div className="nav-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <span className="nav-caption">Logout</span>
          </button>

          {/* Need Help Support Pill */}
          <div className="support-contact-block" onClick={() => setShowSupportModal(true)}>
            <span className="support-heading">Need Help ?</span>
            <span className="support-phone-number">07969 223344</span>
          </div>
        </div>
      </header>

      {/* LEFT MENU BAR (Exact match to Reference Screenshot) */}
      {showMenuDrawer && (
        <div className="petpooja-drawer-backdrop" onClick={() => setShowMenuDrawer(false)}>
          <aside className="petpooja-left-menu-bar" onClick={(e) => e.stopPropagation()}>
            {/* 1. Header Bar: "Settings" with Left Arrow */}
            <div className="drawer-header-bar">
              <h2 className="drawer-title-text">Settings</h2>
              <button
                type="button"
                className="drawer-back-arrow-btn"
                onClick={() => setShowMenuDrawer(false)}
                title="Close Menu"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
            </div>

            {/* 2. Menu Navigation Items List */}
            <div className="drawer-menu-items-scroll">
              {/* Item 1: Billing */}
              <div
                className={`menu-row-item ${activeMenuItem === "Billing" ? "is-selected" : ""}`}
                onClick={() => {
                  setActiveMenuItem("Billing");
                  setShowMenuDrawer(false);
                  router.push("/");
                }}
              >
                <div className="item-icon-col">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <span className="item-label-text">Billing</span>
              </div>

              {/* Item 2: Operations (Expandable) */}
              <div
                className={`menu-row-item ${activeMenuItem === "Operations" ? "is-selected" : ""}`}
                onClick={() => {
                  setActiveMenuItem("Operations");
                  setOperationsExpanded(!operationsExpanded);
                }}
              >
                <div className="item-icon-col">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                    <line x1="4" y1="21" x2="4" y2="14" />
                    <line x1="4" y1="10" x2="4" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12" y2="3" />
                    <line x1="20" y1="21" x2="20" y2="16" />
                    <line x1="20" y1="12" x2="20" y2="3" />
                    <line x1="1" y1="14" x2="7" y2="14" />
                    <line x1="9" y1="8" x2="15" y2="8" />
                    <line x1="17" y1="16" x2="23" y2="16" />
                  </svg>
                </div>
                <span className="item-label-text">Operations</span>
                <span className={`chevron-indicator ${operationsExpanded ? "open" : ""}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>

              {/* Operations Sub-items */}
              {operationsExpanded && (
                <div className="submenu-container">
                  <Link href="/admin" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    Cash Flow & Sales
                  </Link>
                  <Link href="/menu" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    Menu & Inventory
                  </Link>
                  <Link href="/crm" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    Customers CRM
                  </Link>
                  <button
                    type="button"
                    className="submenu-link"
                    style={{ background: "transparent", border: "none", width: "100%", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
                    onClick={() => {
                      setShowMenuDrawer(false);
                      setIsItemToggleOpen(true);
                    }}
                  >
                    Menu Item On/Off (86 Stock)
                  </button>
                </div>
              )}

              {/* Item 3: Reports (Expandable with Down Chevron) */}
              <div
                className={`menu-row-item ${activeMenuItem === "Reports" ? "is-selected" : ""}`}
                onClick={() => {
                  setActiveMenuItem("Reports");
                  setReportsExpanded(!reportsExpanded);
                }}
              >
                <div className="item-icon-col">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <span className="item-label-text">Reports</span>
                <span className={`chevron-indicator ${reportsExpanded ? "open" : ""}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>

              {/* Reports Sub-items */}
              {reportsExpanded && (
                <div className="submenu-container">
                  <Link href="/finance" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    Day-End Settlement / Z-Report
                  </Link>
                  <Link href="/admin" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    Executive Sales Summary
                  </Link>
                  <Link href="/orders?tab=recent" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    Order Sales Audit Report
                  </Link>
                  <Link href="/inventory" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    Item & Category Sales
                  </Link>
                </div>
              )}

              {/* Item 4: Live View */}
              <div
                className={`menu-row-item ${activeMenuItem === "Live View" ? "is-selected" : ""}`}
                onClick={() => {
                  setActiveMenuItem("Live View");
                  setShowMenuDrawer(false);
                  router.push("/orders?tab=live");
                }}
              >
                <div className="item-icon-col">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                    <path d="M4.93 19.07A10 10 0 0 1 12 16a10 10 0 0 1 7.07 3.07M1.39 15.54A15 15 0 0 1 12 11a15 15 0 0 1 10.61 4.54M8.46 22.54A5 5 0 0 1 12 21a5 5 0 0 1 3.54 1.54" />
                    <circle cx="12" cy="11" r="1.5" fill="#ffffff" />
                  </svg>
                </div>
                <span className="item-label-text">Live View</span>
              </div>

              {/* Item 5: Settings (Expandable) */}
              <div
                className={`menu-row-item ${activeMenuItem === "Settings" ? "is-selected" : ""}`}
                onClick={() => {
                  setActiveMenuItem("Settings");
                  setSettingsExpanded(!settingsExpanded);
                }}
              >
                <div className="item-icon-col">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </div>
                <span className="item-label-text">Settings</span>
                <span className={`chevron-indicator ${settingsExpanded ? "open" : ""}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>

              {/* Settings Sub-items */}
              {settingsExpanded && (
                <div className="submenu-container">
                  <Link href="/table-management" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    Table & Area Configuration
                  </Link>
                  <Link href="/user-management" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    Biller Profile & Users
                  </Link>
                  <Link href="/integrations" className="submenu-link" onClick={() => setShowMenuDrawer(false)}>
                    LAN / Cloud Sync Setup
                  </Link>
                </div>
              )}

              {/* Item 6: Check Updates */}
              <div
                className="menu-row-item"
                onClick={handleCheckUpdates}
              >
                <div className="item-icon-col">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </div>
                <span className="item-label-text">Check Updates</span>
              </div>

              {/* Item 7: Logout */}
              <div
                className="menu-row-item"
                onClick={() => {
                  if (confirm("Are you sure you want to log out of kapMeta POS?")) {
                    logout().catch(() => {});
                  }
                }}
              >
                <div className="item-icon-col">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </div>
                <span className="item-label-text">Logout</span>
              </div>
            </div>

            {/* 3. Bottom Metadata Block (Ref ID, Version, Biller Name) */}
            <div className="drawer-footer-metadata-block">
              <div className="meta-row-header">
                <span className="meta-ref-id">Ref ID : A327038R</span>
                <span className="meta-version">Version : 126.0.1</span>
              </div>
              <div className="meta-row-biller">
                <span className="meta-biller-name">Biller Name : biller</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Search Modal for Bill No / KOT No */}
      {searchModalType && (
        <QuickSearchModal
          type={searchModalType}
          onClose={() => setSearchModalType(null)}
        />
      )}

      {/* Item 86 On/Off Toggle Modal */}
      {isItemToggleOpen && (
        <ItemToggleModal onClose={() => setIsItemToggleOpen(false)} />
      )}

      {/* Hold Orders Drawer */}
      {isHoldOpen && (
        <HoldOrdersDrawer onClose={() => setIsHoldOpen(false)} />
      )}

      {/* Support Dialog */}
      {showSupportModal && (
        <div className="petpooja-modal-backdrop" onClick={() => setShowSupportModal(false)}>
          <div className="petpooja-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>kapMeta Merchant Support (24x7)</h3>
            <p style={{ margin: "12px 0", color: "#475569", fontSize: "0.875rem" }}>
              Direct telephone support for billing terminal, LAN sync, and delivery aggregator help:
            </p>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#1d4ed8", padding: "14px", background: "#eff6ff", borderRadius: "8px", textAlign: "center", border: "1px solid #bfdbfe" }}>
              📞 07969 223344
            </div>
            <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-close-modal" onClick={() => setShowSupportModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        /* Top Window Titlebar */
        .petpooja-window-titlebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 24px;
          background: #ffffff;
          border-bottom: 1px solid #f1f5f9;
          padding: 0 8px;
          font-size: 0.72rem;
          color: #475569;
          user-select: none;
        }
        .window-title-left {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .window-app-icon {
          width: 14px;
          height: 14px;
          background: #d32f2f;
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .window-title-text {
          font-weight: 500;
          color: #334155;
          letter-spacing: -0.2px;
        }
        .window-controls-right {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .win-btn {
          background: transparent;
          border: none;
          padding: 2px 6px;
          font-size: 0.75rem;
          color: #64748b;
          cursor: pointer;
          border-radius: 2px;
        }
        .win-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .win-close:hover {
          background: #ef4444;
          color: #ffffff;
        }

        /* Main Top Header */
        .petpooja-top-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 52px;
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          padding: 0 14px;
          position: sticky;
          top: 0;
          z-index: 50;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
          gap: 12px;
        }

        /* Left Cluster */
        .header-left-cluster {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .online-indicator-dot {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          display: inline-block;
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
        }

        .hamburger-menu-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 4px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          border-radius: 4px;
        }
        .hamburger-menu-btn:hover {
          background: #f8fafc;
        }
        .hamburger-line {
          width: 18px;
          height: 2px;
          background: #1e293b;
          border-radius: 1px;
        }

        .petpooja-brand-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #d32f2f;
          color: #ffffff;
          padding: 4px 8px;
          border-radius: 6px;
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(211, 47, 47, 0.25);
        }
        .brand-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .brand-text-col {
          display: flex;
          flex-direction: column;
          line-height: 1;
        }
        .brand-sub {
          font-size: 0.45rem;
          letter-spacing: 0.5px;
          font-weight: 700;
          opacity: 0.9;
        }
        .brand-main {
          font-size: 0.75rem;
          font-weight: 900;
          letter-spacing: -0.3px;
        }

        .petpooja-new-order-pill {
          background: #d32f2f;
          color: #ffffff;
          border: none;
          font-weight: 700;
          font-size: 0.8125rem;
          padding: 7px 18px;
          border-radius: 9999px;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(211, 47, 47, 0.3);
          transition: background 0.15s, transform 0.1s;
        }
        .petpooja-new-order-pill:hover {
          background: #b71c1c;
          transform: translateY(-0.5px);
        }

        .search-pill-box {
          display: flex;
          align-items: center;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 9999px;
          padding: 0 12px;
          height: 32px;
          width: 110px;
          transition: border-color 0.15s, width 0.2s;
        }
        .search-pill-box:focus-within {
          border-color: #d32f2f;
          width: 140px;
          box-shadow: 0 0 0 2px rgba(211, 47, 47, 0.15);
        }
        .search-glass-icon {
          font-size: 0.75rem;
          color: #64748b;
          margin-right: 4px;
        }
        .search-pill-input {
          border: none;
          outline: none;
          background: transparent;
          font-size: 0.75rem;
          color: #1e293b;
          width: 100%;
        }
        .search-pill-input::placeholder {
          color: #64748b;
          font-weight: 500;
        }

        /* Right Cluster */
        .header-right-cluster {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .top-nav-action-btn {
          background: transparent;
          border: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3px 5px;
          cursor: pointer;
          color: #475569;
          text-decoration: none;
          border-radius: 4px;
          min-width: 46px;
          transition: background 0.15s, color 0.15s;
        }
        .top-nav-action-btn:hover {
          background: #f8fafc;
          color: #0f172a;
        }
        .nav-icon-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 22px;
        }
        .nav-caption {
          font-size: 0.625rem;
          font-weight: 500;
          margin-top: 1px;
          white-space: nowrap;
          color: #475569;
        }

        .alert-action-btn .red-badge-dot {
          position: absolute;
          top: 0;
          right: 0;
          width: 6px;
          height: 6px;
          background: #dc2626;
          border-radius: 50%;
        }

        .support-contact-block {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          padding-left: 10px;
          border-left: 1px solid #e5e7eb;
          cursor: pointer;
          user-select: none;
        }
        .support-heading {
          font-size: 0.6875rem;
          color: #374151;
          font-weight: 500;
        }
        .support-phone-number {
          font-size: 0.8125rem;
          font-weight: 700;
          color: #1d4ed8;
          letter-spacing: -0.2px;
        }

        /* ------------------------------------------------------------------ */
        /* LEFT MENU BAR (Exact Dark Charcoal Theme per Reference Screenshot) */
        /* ------------------------------------------------------------------ */
        .petpooja-drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          z-index: 1000;
          display: flex;
        }
        .petpooja-left-menu-bar {
          width: 260px;
          background: #3e3e3e;
          height: 100%;
          box-shadow: 4px 0 20px rgba(0, 0, 0, 0.35);
          display: flex;
          flex-direction: column;
          animation: slideInLeft 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          color: #ffffff;
          user-select: none;
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }

        /* 1. Header: "Settings" with Left Arrow */
        .drawer-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 52px;
          padding: 0 16px;
          background: #383838;
          border-bottom: 1px solid #4a4a4a;
        }
        .drawer-title-text {
          font-size: 1.15rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.2px;
        }
        .drawer-back-arrow-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 4px;
        }
        .drawer-back-arrow-btn:hover {
          background: #4a4a4a;
        }

        /* 2. Menu Navigation Items List */
        .drawer-menu-items-scroll {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding-top: 2px;
        }

        .menu-row-item {
          display: flex;
          align-items: center;
          padding: 14px 18px;
          cursor: pointer;
          transition: background 0.12s;
          border-left: 4px solid transparent;
          position: relative;
        }
        .menu-row-item:hover {
          background: #4a4a4a;
        }
        .menu-row-item.is-selected {
          background: #575757;
          border-left: 4px solid #ffffff;
        }

        .item-icon-col {
          width: 28px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin-right: 14px;
        }
        .item-label-text {
          flex: 1;
          font-size: 0.9375rem;
          font-weight: 500;
          color: #ffffff;
          letter-spacing: -0.1px;
        }
        .chevron-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s;
        }
        .chevron-indicator.open {
          transform: rotate(180deg);
        }

        /* Submenus */
        .submenu-container {
          display: flex;
          flex-direction: column;
          background: #333333;
          padding: 4px 0 8px 56px;
          border-left: 4px solid #575757;
        }
        .submenu-link {
          padding: 8px 12px;
          color: #cbd5e1;
          text-decoration: none;
          font-size: 0.8125rem;
          font-weight: 500;
          transition: color 0.12s, padding-left 0.12s;
        }
        .submenu-link:hover {
          color: #ffffff;
          padding-left: 16px;
        }

        /* 3. Bottom Metadata Panel */
        .drawer-footer-metadata-block {
          background: #383838;
          border-top: 1px solid #525252;
          display: flex;
          flex-direction: column;
        }
        .meta-row-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #ffffff;
          border-bottom: 1px solid #4a4a4a;
        }
        .meta-ref-id {
          letter-spacing: -0.2px;
        }
        .meta-version {
          letter-spacing: -0.2px;
        }
        .meta-row-biller {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 10px 14px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #ffffff;
          background: #343434;
        }
        .meta-biller-name {
          letter-spacing: -0.2px;
        }

        /* Support Modal */
        .petpooja-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .petpooja-modal-card {
          background: #ffffff;
          border-radius: 12px;
          padding: 24px;
          max-width: 440px;
          width: 90%;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .btn-close-modal {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #334155;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </>
  );
}

export { PetPoojaHeader as KapMetaHeader };
export type { PetPoojaHeaderProps as KapMetaHeaderProps };

