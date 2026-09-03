// Shared permission-aware nav for pos-web. Renders only the links whose
// required permission is present in the current user's real GET /auth/me
// permissions array (fetched via fetchMe()/getSession() from lib/auth.ts —
// no hardcoded permission lists per repo CLAUDE.md). Each page previously
// hardcoded its own <nav> with links to every page regardless of what the
// user's role actually granted; a user with only "order.create" would still
// see (and could click into, then get redirected away from) /admin, /kitchen,
// /inventory. This component centralizes that logic so all pages agree.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { fetchMe, fetchMyOutlets, switchOutlet, logout, MeOutlet, OutletSummary } from "../lib/auth";
import QuickLinks from "./QuickLinks";

interface NavLinkDef {
  href: string;
  permission: string;
  topbarLabel: string;
  pillLabel: string;
}

// Order matches the nav markup that existed inline in each page before this
// component was introduced.
const NAV_LINKS: NavLinkDef[] = [
  { href: "/", permission: "order.create", topbarLabel: "POS Terminal", pillLabel: "🛒 POS Register" },
  { href: "/waiter", permission: "order.create", topbarLabel: "Waiter App", pillLabel: "🏃 Waiter App" },
  { href: "/orders?tab=live", permission: "order.read", topbarLabel: "Live Orders", pillLabel: "🔴 Live Orders" },
  { href: "/orders?tab=all", permission: "order.read", topbarLabel: "Sales Register", pillLabel: "🧾 Sales Register" },
  { href: "/orders?tab=online", permission: "order.read", topbarLabel: "Online Orders", pillLabel: "🌐 Online Orders" },
  { href: "/kitchen", permission: "kot.read", topbarLabel: "KDS Kitchen Board", pillLabel: "🍳 Kitchen KDS" },
  { href: "/inventory", permission: "inventory.read", topbarLabel: "Stock & 86-List", pillLabel: "📦 Stock Control" },
  { href: "/menu", permission: "menu.category.manage", topbarLabel: "Menu Management", pillLabel: "🍽️ Menu Management" },
  { href: "/channel-availability", permission: "integration.manage", topbarLabel: "Online Item Status", pillLabel: "📡 Online Status" },
  { href: "/reports/other-reports", permission: "report.read", topbarLabel: "Reports & Analytics", pillLabel: "📊 Reports & Analytics" },
  { href: "/finance", permission: "report.read", topbarLabel: "Finance & Z-Report", pillLabel: "💰 Finance" },
  { href: "/crm", permission: "crm.read", topbarLabel: "Customers & Loyalty", pillLabel: "🎁 Customers" },
  { href: "/marketing", permission: "crm.write", topbarLabel: "Marketing Campaigns", pillLabel: "📣 Marketing" },
  { href: "/user-management", permission: "users.manage", topbarLabel: "User & Role Management", pillLabel: "🧑‍💼 Users & Roles" },
];

export type NavVariant = "topbar" | "pill" | "sidebar";

/* ------------------------------------------------------------------------ */
/* SIDEBAR_GROUPS - the single source of truth for app navigation.           */
/*                                                                          */
/* Both nav surfaces render from this list:                                 */
/*   - <Nav variant="sidebar" />         (the persistent sidebar)           */
/*   - components/KapMetaHeader.tsx      (the POS hamburger drawer)         */
/* A link added here therefore shows up in both. Do not hardcode a nav link */
/* anywhere else - that is exactly what produced two divergent taxonomies   */
/* and the "I can't find it" incidents recorded in                          */
/* docs/03-design/artifact-03-design-contract.md section 6.                 */
/*                                                                          */
/* Structure/labels/order follow the reference design:                      */
/*   Dashboard | Daily Operations | Menu | Inventory |                       */
/*   Marketing Automation [New] | Finance [New] | Reports | Management |    */
/*   CRM | Aggregator Center | Quick Links                                  */
/* ------------------------------------------------------------------------ */

export interface SidebarLinkDef {
  href: string;
  // Permission required to see the link. Keep this equal to the permission
  // the destination page guards with (useAuthGuard) - otherwise the link is
  // either invisible to users who may use it, or visible to users the page
  // immediately redirects away.
  permission: string;
  label: string;
  // Escape hatch for links that must stay reachable from the POS terminal
  // regardless of the cashier's permission set. The page's own useAuthGuard
  // still decides whether they can actually open it.
  alwaysVisible?: boolean;
  // Drawer-only in-place action (opens a modal instead of navigating). The
  // sidebar falls back to `href` for these.
  action?: "item-toggle";
}

export interface SidebarGroupDef {
  // Stable id - used as the React key, the drawer's expand/collapse state key
  // and the drawer's icon lookup.
  id: string;
  header: string | null; // null => single-link group, rendered directly (no header)
  badge?: string;
  // Drawer-only: when true, the group's header renders as a plain
  // non-interactive label (no chevron, no collapse) and its links are
  // always shown, instead of the default chevron-toggle/collapsed behavior.
  // Nav.tsx's own variant="sidebar" already renders every group's links
  // always-expanded regardless of this flag - it has no collapse behavior
  // to begin with.
  alwaysExpanded?: boolean;
  links: SidebarLinkDef[];
  // Optional second nesting level (drawer-only today - see KapMetaHeader.tsx).
  // Each sub-group renders as its own chevron-collapsible header nested under
  // the parent group's already-expanded body, in addition to the parent's
  // own flat `links` above.
  subGroups?: { id: string; label: string; links: SidebarLinkDef[] }[];
}

export const SIDEBAR_GROUPS: SidebarGroupDef[] = [
  {
    id: "dashboard",
    header: null,
    links: [{ href: "/admin?tab=daily-ops", permission: "report.read", label: "Dashboard" }],
  },
  {
    id: "daily-operations",
    header: "Daily Operations",
    alwaysExpanded: true,
    links: [
      { href: "/", permission: "order.create", label: "POS Terminal" },
      { href: "/waiter", permission: "order.create", label: "Waiter App" },
      { href: "/orders?tab=live", permission: "order.read", label: "Live Orders" },
      { href: "/orders?tab=all", permission: "order.read", label: "All Orders" },
      { href: "/orders?tab=online", permission: "order.read", label: "Online Orders" },
      { href: "/kitchen", permission: "kot.read", label: "KOT / Kitchen KDS" },
      { href: "/table-management", permission: "menu.category.manage", label: "Table Floor Management" },
    ],
  },
  {
    id: "menu",
    header: "Menu & Discounts",
    links: [
      { href: "/menu/hub", permission: "menu.category.manage", label: "All In One Menu Hub" },
      { href: "/menu/manage", permission: "menu.category.manage", label: "Manage Menu & Prices" },
      { href: "/menu", permission: "menu.category.manage", label: "Base Catalog" },
      { href: "/menu/virtual-outlets", permission: "settings.manage", label: "Virtual Cloud Outlets" },
      { href: "/menu/images-upload", permission: "menu.category.manage", label: "Multi-Item Images Upload" },
      { href: "/channel-availability", permission: "integration.manage", label: "Menu on/off (Channel Status)" },
      { href: "/menu/special-notes", permission: "menu.category.manage", label: "Special Kitchen Notes" },
      { href: "/menu/commission", permission: "menu.category.manage", label: "Set Item Commission" },
      { href: "/menu/scheduling", permission: "menu.category.manage", label: "Timed Menu Schedules" },
      { href: "/menu/physical", permission: "menu.category.manage", label: "Physical Menu & QR" },
    ],
  },
  {
    id: "inventory",
    header: "Inventory & Stock",
    links: [
      { href: "/inventory", permission: "menu.read", label: "Inventory Dashboard & Closing" },
      { href: "/inventory/purchase", permission: "menu.read", label: "Stock Purchases & Ingestion" },
      { href: "/inventory/purchase-orders", permission: "menu.read", label: "Purchase Orders (PO / GRN)" },
    ],
  },
  {
    id: "sales",
    header: "Sales & Invoicing",
    links: [
      { href: "/orders?tab=all", permission: "order.read", label: "Sales Invoices & Bills" },
      { href: "/reporting", permission: "report.read", label: "Daily Sales Register" },
      { href: "/orders?tab=live", permission: "order.read", label: "Live Counter Sales" },
      { href: "/orders?tab=online", permission: "order.read", label: "Online Channel Sales" },
      { href: "/reports/delivery-management", permission: "report.read", label: "Delivery Dispatch Desk" },
    ],
  },
  {
    id: "reports",
    header: "Reports & Business Intelligence",
    links: [
      { href: "/admin?tab=analytics", permission: "report.read", label: "Sales Analytics & Trends" },
      { href: "/reports/day-end-summary", permission: "report.read", label: "Day End Summary & Z-Report" },
      { href: "/reports/other-reports", permission: "report.read", label: "All Other Reports Center" },
      { href: "/reports/report-notification", permission: "report.read", label: "Scheduled Report Notifications" },
      { href: "/management/audit-trail", permission: "report.read", label: "System Audit Trail" },
    ],
  },
  {
    id: "finance",
    header: "Finance & Accounting",
    badge: "New",
    links: [
      { href: "/finance", permission: "report.read", label: "Finance Dashboard" },
      { href: "/management/online-reconciliation", permission: "settings.read", label: "Online Order Reconciliation" },
      { href: "/management/payment-information", permission: "settings.read", label: "Payment Gateways & UPI" },
      { href: "/management/virtual-wallet", permission: "settings.read", label: "Virtual Wallet" },
      { href: "/management/settings?key=gst_information", permission: "settings.manage", label: "GST & Tax Configuration" },
      { href: "/management/expense-management", permission: "settings.read", label: "Expense & Withdrawal" },
      { href: "/management/service-payment-history", permission: "settings.read", label: "Service Payment History" },
    ],
  },
  {
    id: "crm",
    header: "CRM & Marketing",
    links: [
      { href: "/crm", permission: "crm.read", label: "Customers & Loyalty Directory" },
      { href: "/marketing", permission: "crm.write", label: "Marketing Automation Campaigns" },
    ],
  },
  {
    id: "management",
    header: "Management & Settings",
    links: [
      { href: "/user-management", permission: "users.manage", label: "User & Role Management", alwaysVisible: true },
      { href: "/settings/company", permission: "settings.manage", label: "Company & Store Details", alwaysVisible: true },
      { href: "/admin", permission: "report.read", label: "Admin Overview Hub" },
      { href: "/admin?tab=agents", permission: "report.read", label: "Multi-Agent & A2A Status HUD" },
      { href: "/management/explore-products", permission: "report.read", label: "Explore Products" },
      { href: "/management/device-mapping", permission: "report.read", label: "Device Mapping" },
    ],
    subGroups: [
      {
        id: "configuration",
        label: "Configuration",
        links: [
          { href: "/management/settings?key=outlet_configuration", permission: "settings.manage", label: "Outlet Configuration" },
          { href: "/management/list?key=sub_order_type", permission: "settings.manage", label: "Sub Order Type" },
          { href: "/management/list?key=delivery_distance", permission: "settings.manage", label: "Delivery Distance" },
          { href: "/management/list?key=area_locality_delivery_charges", permission: "settings.manage", label: "Area/Locality Delivery Charges" },
          { href: "/management/list?key=floor_plan", permission: "settings.manage", label: "Floor Plan Layout" },
          { href: "/management/list?key=email_template_settings", permission: "settings.manage", label: "Email Template Settings" },
        ],
      },
      {
        id: "user-management",
        label: "User Management",
        links: [
          { href: "/management/biller-app", permission: "users.manage", label: "Biller App Setup" },
        ],
      },
      {
        id: "user-logs",
        label: "Audit & User Logs",
        links: [
          { href: "/management/logs?type=ONLINE_STORE", permission: "users.manage", label: "Online Store Logs" },
          { href: "/management/logs?type=ONLINE_ITEM_ON_OFF", permission: "users.manage", label: "Online Item On/Off Logs" },
          { href: "/management/logs?type=AUTO_ACCEPT", permission: "users.manage", label: "Auto Accept Change Logs" },
          { href: "/management/logs?type=SUPPORT", permission: "users.manage", label: "Support Management" },
          { href: "/management/logs?type=NOTIFICATION", permission: "users.manage", label: "Notification Logs" },
          { href: "/management/logs?type=MENU_TRIGGER", permission: "users.manage", label: "Menu Trigger Logs" },
          { href: "/management/logs?type=CLOSING_HOUR", permission: "users.manage", label: "Closing Hour Logs" },
          { href: "/management/logs?type=EXPENSE", permission: "users.manage", label: "Expense Logs" },
          { href: "/management/logs?type=WITHDRAWAL", permission: "users.manage", label: "Withdrawal Logs" },
          { href: "/management/logs?type=CASH_TOPUP", permission: "users.manage", label: "Cash Top-Up Logs" },
        ],
      },
    ],
  },
  {
    id: "aggregator-center",
    header: "Aggregator Center",
    links: [
      { href: "/integrations", permission: "integration.manage", label: "Connect Delivery Apps (Swiggy / Zomato)" },
      { href: "/channel-availability", permission: "integration.manage", label: "Online Channel Availability" },
    ],
  },
];

// Mirrors the super-admin bypass in useAuthGuard (lib/auth.ts): these roles
// can open every screen, so the nav must not hide anything from them.
export function isSuperAdminRoles(roles: string[] | null | undefined): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.includes("SUPER_ADMIN") || roles.includes("SUPERADMIN") || roles.includes("OWNER");
}

// Shared filter used by BOTH nav surfaces: drop the links whose permission the
// user lacks, then drop any group left with no visible links.
export function filterSidebarGroups(
  permissions: string[] | null | undefined,
  roles?: string[] | null
): SidebarGroupDef[] {
  const perms = Array.isArray(permissions) ? permissions : [];
  const superAdmin = isSuperAdminRoles(roles);
  return SIDEBAR_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter(
      (link) => superAdmin || link.alwaysVisible || perms.includes(link.permission)
    ),
    subGroups: group.subGroups
      ?.map((sub) => ({
        ...sub,
        links: sub.links.filter(
          (link) => superAdmin || link.alwaysVisible || perms.includes(link.permission)
        ),
      }))
      .filter((sub) => sub.links.length > 0),
  })).filter((group) => group.links.length > 0 || (group.subGroups && group.subGroups.length > 0));
}

interface NavProps {
  variant?: NavVariant;
}

export default function Nav({ variant = "pill" }: NavProps): JSX.Element | null {
  const router = useRouter();
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [currentOutlet, setCurrentOutlet] = useState<MeOutlet | null>(null);
  const [myOutlets, setMyOutlets] = useState<OutletSummary[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (cancelled) return;
      setPermissions(me ? me.permissions : []);
      setRoles(me && Array.isArray(me.roles) ? me.roles : []);
      setCurrentOutlet(me ? me.outlet : null);
    });
    fetchMyOutlets().then((outlets) => {
      if (cancelled) return;
      setMyOutlets(outlets);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOutletChange = async (newOutletId: string) => {
    if (!newOutletId || switching) return;
    setSwitching(true);
    const result = await switchOutlet(newOutletId);
    if (result.ok) {
      window.location.reload();
    } else {
      setSwitching(false);
      alert("Failed to switch outlet. Please try again.");
    }
  };

  const outletSwitcher =
    myOutlets.length > 1 ? (
      <select
        value={currentOutlet?.id || ""}
        disabled={switching}
        onChange={(e) => handleOutletChange(e.target.value)}
        style={{
          cursor: switching ? "wait" : "pointer",
          background: "var(--bg-card, #fff)",
          border: "1px solid var(--border, #e2e8f0)",
          color: "var(--text-primary)",
          fontWeight: 600,
          padding: "10px 12px",
          minHeight: "44px",
          borderRadius: "var(--radius-pill, 9999px)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {myOutlets.map((outlet) => (
          <option key={outlet.id} value={outlet.id}>
            {outlet.name} ({outlet.code})
          </option>
        ))}
      </select>
    ) : null;

  // Until we know the real permission set, render nothing rather than a
  // flash of links the user may not be allowed to see.
  if (permissions === null) return null;

  const visibleLinks = NAV_LINKS.filter((link) => permissions.includes(link.permission));

  const isActive = (href: string): boolean =>
    href.includes("?") ? router.asPath === href : router.pathname === href;

  const logoutButton = (
    <button
      type="button"
      onClick={() => {
        if (confirm("Are you sure you want to log out?")) {
          logout().catch(() => {});
        }
      }}
      className="logout-btn"
      style={{
        cursor: "pointer",
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        color: "var(--destructive)",
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "10px 16px",
        minHeight: "44px",
        borderRadius: "var(--radius-pill)",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      Logout 🚪
    </button>
  );

  if (variant === "topbar") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexGrow: 1, justifyContent: "center", minWidth: 0 }}>
        <nav className="topbar-nav" style={{ flexGrow: 1, maxWidth: "75%" }}>
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-pill ${isActive(link.href) ? "active" : ""}`}
            >
              {link.topbarLabel}
            </Link>
          ))}
        </nav>
        {outletSwitcher}
        {logoutButton}
      </div>
    );
  }

  if (variant === "sidebar") {
    return (
      <div className="sidebar-nav" style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%" }}>
        {outletSwitcher && (
          <div style={{ padding: "0 16px 12px" }}>{outletSwitcher}</div>
        )}
        {filterSidebarGroups(permissions, roles).map((group) => {
          const linkStyle = (active: boolean, bold: boolean): React.CSSProperties => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "10px 16px",
            margin: "2px 8px",
            borderRadius: "var(--radius-md)",
            color: active ? "var(--accent-subtle-text)" : "var(--text-primary)",
            background: active ? "var(--accent-subtle)" : "transparent",
            textDecoration: "none",
            fontSize: "0.88rem",
            fontWeight: bold ? 600 : 500,
          });

          if (group.header === null) {
            const link = group.links[0];
            const active = isActive(link.href);
            return (
              <Link key={group.id} href={link.href} style={linkStyle(active, true)}>
                <span>{link.label}</span>
                {group.badge && (
                  <span
                    style={{
                      background: "var(--accent)",
                      color: "var(--bg-card)",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "var(--radius-pill)",
                    }}
                  >
                    {group.badge}
                  </span>
                )}
              </Link>
            );
          }

          return (
            <div key={group.id} className="sidebar-group">
              <div className="sidebar-group-header">{group.header}</div>
              {group.links.map((link) => (
                <Link key={link.href + link.label} href={link.href} style={linkStyle(isActive(link.href), false)}>
                  {link.label}
                </Link>
              ))}
            </div>
          );
        })}

        <div className="sidebar-group">
          <div className="sidebar-group-header">Quick Links</div>
          <div style={{ padding: "4px 8px" }}>
            <QuickLinks />
          </div>
        </div>

        <div style={{ marginTop: "auto", padding: "16px" }}>{logoutButton}</div>

        <style jsx>{`
          .sidebar-nav {
            background: var(--bg-card, #fff);
            border-right: 1px solid var(--border, #e2e8f0);
            padding: 16px 0;
            overflow-y: auto;
          }
          .sidebar-group {
            margin-bottom: 8px;
          }
          .sidebar-group-header {
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-muted, #94a3b8);
            padding: 10px 16px 4px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexGrow: 1, justifyContent: "center", minWidth: 0 }}>
      <nav className="nav-pill-group" style={{ flexGrow: 1, maxWidth: "75%" }}>
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-item ${isActive(link.href) ? "active" : ""}`}
          >
            {link.pillLabel}
          </Link>
        ))}
      </nav>
      {outletSwitcher}
      {logoutButton}
    </div>
  );
}
