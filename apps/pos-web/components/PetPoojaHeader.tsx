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
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [isStoreOnline, setIsStoreOnline] = useState(true);
  const [dineInActive, setDineInActive] = useState(true);
  const [deliveryActive, setDeliveryActive] = useState(true);
  const [takeawayActive, setTakeawayActive] = useState(true);
  const [liveViewActive, setLiveViewActive] = useState(true);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);

  // Left Drawer Expanded Submenu States
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [operationsExpanded, setOperationsExpanded] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [activeMenuItem, setActiveMenuItem] = useState<string>("Billing");

  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    message: string;
    type: "WARNING" | "INFO" | "ORDER" | "FINANCE";
    time: string;
    isRead: boolean;
  }>>([
    {
      id: "notif-1",
      title: "Low Stock: Raw Ingredients",
      message: "Saffron Pure Grade A is below threshold (20 g remaining)",
      type: "WARNING",
      time: "5m ago",
      isRead: false,
    },
    {
      id: "notif-2",
      title: "Table 4 Bill Request",
      message: "Guest requested bill for Table 4 (Bill Total: ₹1,250.00)",
      type: "INFO",
      time: "12m ago",
      isRead: false,
    },
    {
      id: "notif-3",
      title: "Online Order #SW-1082 Synced",
      message: "New Swiggy order placed and dispatched to KDS",
      type: "ORDER",
      time: "25m ago",
      isRead: false,
    },
  ]);

  useEffect(() => {
    authedFetch("/notifications")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setNotifications(
            data.map((n) => ({
              id: n.id,
              title: n.title || "Alert",
              message: n.message || "",
              type: (n.type as any) || "INFO",
              time: new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              isRead: Boolean(n.isRead),
            }))
          );
        }
      })
      .catch(() => {});

    authedFetch("/settings/store-status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.isOnline === "boolean") {
          setIsStoreOnline(data.isOnline);
        }
      })
      .catch(() => {});
  }, []);

  const unreadAlertsCount = notifications.filter((n) => !n.isRead).length;

  const markAllAlertsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    authedFetch("/notifications/read-all", { method: "POST" }).catch(() => {});
  };

  const handleToggleStore = async () => {
    const next = !isStoreOnline;
    setIsStoreOnline(next);
    try {
      await authedFetch("/settings/store-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: next }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const dismissAlert = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

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
<<<<<<< HEAD
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
=======
            className={`header-icon-btn ${isStoreOnline ? "is-active" : "is-offline"}`}
            onClick={() => setShowStoreModal(true)}
            title="Store Status & Channel Control"
          >
            <span className="icon-glyph">{isStoreOnline ? "🏪" : "🛑"}</span>
            <span className="icon-caption">Store {isStoreOnline ? "(Open)" : "(Paused)"}</span>
>>>>>>> hamza/main
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
<<<<<<< HEAD
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
=======
            className="header-icon-btn alert-btn"
            onClick={() => setShowAlertsModal(true)}
            title="Live Operational Alerts"
          >
            <span className="icon-glyph">🔔</span>
            {unreadAlertsCount > 0 && <span className="alert-badge">{unreadAlertsCount}</span>}
            <span className="icon-caption">Alerts</span>
>>>>>>> hamza/main
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

      {/* INTERACTIVE STORE OPERATIONS CONTROL MODAL */}
      {showStoreModal && (
        <div className="petpooja-modal-backdrop" onClick={() => setShowStoreModal(false)}>
          <div className="petpooja-modal-card store-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="store-modal-header">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: "1.3rem" }}>🏪</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>Store Operations Control</h3>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "#64748b" }}>{outletName} ({outletCode}) • Register POS-01</p>
                </div>
              </div>
              <button className="close-btn" onClick={() => setShowStoreModal(false)}>✕</button>
            </div>

            {/* Master Store Status Toggle */}
            <div className={`store-master-box ${isStoreOnline ? "is-online" : "is-offline"}`}>
              <div className="store-master-info">
                <div className="store-status-title">
                  <span className="status-dot"></span>
                  <strong>{isStoreOnline ? "STORE IS ONLINE (OPEN)" : "STORE IS PAUSED (OFFLINE)"}</strong>
                </div>
                <p className="store-status-desc">
                  {isStoreOnline
                    ? "Currently accepting orders across all active sales channels."
                    : "Store is paused. Incoming online aggregator orders and table ordering are temporarily suspended."}
                </p>
              </div>
              <button
                type="button"
                className={`store-toggle-switch ${isStoreOnline ? "active" : ""}`}
                onClick={handleToggleStore}
              >
                <span className="switch-slider"></span>
              </button>
            </div>

            {/* Channel-Specific Operation Toggles */}
            <div className="store-channels-section">
              <h4 className="channels-heading">SALES CHANNELS & SERVICE MODES</h4>

              <div className="channel-row">
                <div className="channel-info">
                  <span className="channel-icon">🍽️</span>
                  <div>
                    <div className="channel-name">Dine-In Operations</div>
                    <div className="channel-sub">Table billing, captain ordering & floor services</div>
                  </div>
                </div>
                <button
                  type="button"
                  className={`channel-pill-btn ${dineInActive ? "active" : "inactive"}`}
                  onClick={() => setDineInActive(!dineInActive)}
                >
                  {dineInActive ? "Active" : "Paused"}
                </button>
              </div>

              <div className="channel-row">
                <div className="channel-info">
                  <span className="channel-icon">🛵</span>
                  <div>
                    <div className="channel-name">Delivery & Online Aggregators</div>
                    <div className="channel-sub">Swiggy & Zomato direct order dispatch</div>
                  </div>
                </div>
                <button
                  type="button"
                  className={`channel-pill-btn ${deliveryActive ? "active" : "inactive"}`}
                  onClick={() => setDeliveryActive(!deliveryActive)}
                >
                  {deliveryActive ? "Active" : "Paused"}
                </button>
              </div>

              <div className="channel-row">
                <div className="channel-info">
                  <span className="channel-icon">🥡</span>
                  <div>
                    <div className="channel-name">Takeaway & Direct Pickup</div>
                    <div className="channel-sub">Counter pickup & parcel orders</div>
                  </div>
                </div>
                <button
                  type="button"
                  className={`channel-pill-btn ${takeawayActive ? "active" : "inactive"}`}
                  onClick={() => setTakeawayActive(!takeawayActive)}
                >
                  {takeawayActive ? "Active" : "Paused"}
                </button>
              </div>
            </div>

            {/* Quick Links & Footer */}
            <div className="store-modal-footer">
              <Link href="/channel-availability" className="store-link-btn" onClick={() => setShowStoreModal(false)}>
                📡 Aggregator Menu Status
              </Link>
              <Link href="/table-management" className="store-link-btn" onClick={() => setShowStoreModal(false)}>
                🪑 Floor Plan
              </Link>
              <button type="button" className="store-save-btn" onClick={() => setShowStoreModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE LIVE ALERTS & NOTIFICATIONS MODAL */}
      {showAlertsModal && (
        <div className="petpooja-modal-backdrop" onClick={() => setShowAlertsModal(false)}>
          <div className="petpooja-modal-card alerts-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="alerts-modal-header">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: "1.2rem" }}>🔔</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>Operational Alerts</h3>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "#64748b" }}>
                    {unreadAlertsCount > 0 ? `${unreadAlertsCount} unread alerts requiring attention` : "All notifications caught up"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadAlertsCount > 0 && (
                  <button type="button" className="mark-all-read-btn" onClick={markAllAlertsRead}>
                    Mark all read
                  </button>
                )}
                <button className="close-btn" onClick={() => setShowAlertsModal(false)}>✕</button>
              </div>
            </div>

            {/* Alerts List Feed */}
            <div className="alerts-feed-list">
              {notifications.length === 0 ? (
                <div className="alerts-empty-state">
                  <span style={{ fontSize: "2rem" }}>🎉</span>
                  <p style={{ fontWeight: 600, color: "#334155", margin: "8px 0 0" }}>All clear!</p>
                  <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>No active operational alerts for this outlet.</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div key={notif.id} className={`alert-item-card ${notif.isRead ? "is-read" : "is-unread"}`}>
                    <div className="alert-item-icon">
                      {notif.type === "WARNING" ? "⚠️" : notif.type === "ORDER" ? "🛵" : notif.type === "FINANCE" ? "💸" : "🛎️"}
                    </div>
                    <div className="alert-item-content">
                      <div className="alert-item-top">
                        <span className="alert-item-title">{notif.title}</span>
                        <span className="alert-item-time">{notif.time}</span>
                      </div>
                      <p className="alert-item-message">{notif.message}</p>
                    </div>
                    <button
                      type="button"
                      className="alert-dismiss-btn"
                      onClick={() => dismissAlert(notif.id)}
                      title="Dismiss alert"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="alerts-modal-footer">
              <button
                type="button"
                className="alerts-clear-btn"
                onClick={() => setNotifications([])}
                disabled={notifications.length === 0}
              >
                Clear All
              </button>
              <button type="button" className="store-save-btn" onClick={() => setShowAlertsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
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
<<<<<<< HEAD
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
=======
          max-width: 440px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        .store-modal-card {
          max-width: 480px;
          padding: 20px;
        }
        .store-modal-header, .alerts-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 14px;
        }
        .store-master-box {
          padding: 14px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
          transition: all 0.2s ease;
        }
        .store-master-box.is-online {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
        }
        .store-master-box.is-offline {
          background: #fef2f2;
          border: 1px solid #fecaca;
        }
        .store-master-info {
          flex: 1;
        }
        .store-status-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
        }
        .store-master-box.is-online .store-status-title {
          color: #166534;
        }
        .store-master-box.is-offline .store-status-title {
          color: #991b1b;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .store-master-box.is-online .status-dot {
          background: #22c55e;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
        }
        .store-master-box.is-offline .status-dot {
          background: #ef4444;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
        }
        .store-status-desc {
          margin: 4px 0 0;
          font-size: 0.72rem;
          color: #64748b;
          line-height: 1.35;
        }
        .store-toggle-switch {
          width: 48px;
          height: 26px;
          background: #cbd5e1;
          border: none;
          border-radius: 999px;
          padding: 2px;
          cursor: pointer;
          position: relative;
          transition: background 0.2s ease;
          flex-shrink: 0;
        }
        .store-toggle-switch.active {
          background: #22c55e;
        }
        .switch-slider {
          display: block;
          width: 22px;
          height: 22px;
          background: #ffffff;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s ease;
          transform: translateX(0);
        }
        .store-toggle-switch.active .switch-slider {
          transform: translateX(22px);
        }
        .store-channels-section {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px;
          margin-bottom: 16px;
        }
        .channels-heading {
          margin: 0 0 10px;
          font-size: 0.68rem;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.04em;
        }
        .channel-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #f1f5f9;
        }
        .channel-row:last-child {
          border-bottom: none;
        }
        .channel-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .channel-icon {
          font-size: 1.1rem;
        }
        .channel-name {
          font-size: 0.8rem;
          font-weight: 700;
          color: #1e293b;
        }
        .channel-sub {
          font-size: 0.68rem;
          color: #94a3b8;
        }
        .channel-pill-btn {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.72rem;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: all 0.15s ease;
        }
        .channel-pill-btn.active {
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #86efac;
        }
        .channel-pill-btn.inactive {
          background: #f1f5f9;
          color: #94a3b8;
          border: 1px solid #e2e8f0;
        }
        .store-modal-footer, .alerts-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 10px;
          border-top: 1px solid #e2e8f0;
        }
        .store-link-btn {
          font-size: 0.72rem;
          font-weight: 600;
          color: #2563eb;
          text-decoration: none;
          padding: 6px 10px;
          background: #eff6ff;
          border-radius: 6px;
          transition: background 0.15s;
        }
        .store-link-btn:hover {
          background: #dbeafe;
        }
        .store-save-btn {
          background: #0f172a;
          color: #ffffff;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
        .store-save-btn:hover {
          background: #1e293b;
        }

        /* Alerts Modal */
        .alerts-modal-card {
          max-width: 480px;
          padding: 20px;
        }
        .mark-all-read-btn {
          background: none;
          border: none;
          color: #2563eb;
          font-size: 0.72rem;
          font-weight: 700;
          cursor: pointer;
          padding: 4px 6px;
        }
        .mark-all-read-btn:hover {
          text-decoration: underline;
        }
        .alerts-feed-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 320px;
          overflow-y: auto;
          margin-bottom: 14px;
        }
        .alerts-empty-state {
          padding: 28px;
          text-align: center;
        }
        .alert-item-card {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          transition: all 0.15s ease;
        }
        .alert-item-card.is-unread {
          background: #f8fafc;
          border-left: 3px solid #3b82f6;
        }
        .alert-item-icon {
          font-size: 1.1rem;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .alert-item-content {
          flex: 1;
          min-width: 0;
        }
        .alert-item-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .alert-item-title {
          font-size: 0.78rem;
          font-weight: 700;
          color: #0f172a;
        }
        .alert-item-time {
          font-size: 0.65rem;
          color: #94a3b8;
          white-space: nowrap;
        }
        .alert-item-message {
          margin: 3px 0 0;
          font-size: 0.72rem;
          color: #475569;
          line-height: 1.35;
        }
        .alert-dismiss-btn {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          padding: 2px 4px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .alert-dismiss-btn:hover {
          color: #ef4444;
          background: #fee2e2;
        }
        .alerts-clear-btn {
          background: none;
          border: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .alerts-clear-btn:hover:not(:disabled) {
          background: #f1f5f9;
          color: #0f172a;
        }
        .alerts-clear-btn:disabled {
          opacity: 0.5;
          cursor: default;
>>>>>>> hamza/main
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

