# Kapmeta App Shell — Component Contract

Shared shell wrapping every screen (per artifact-09 System Config + App Shell). All nine screens render inside this shell; screens themselves only own their content region.

## 1. Layout Regions

```
┌───────────────────────────────────────────────────────────┐
│ Top Icon Nav Bar (56px)                                     │
├───────────┬───────────────────────────────────────────────┤
│ Category  │                                                │
│ Rail /    │              Screen Content Slot               │
│ Sidebar   │                                                │
│ (72–200px)│                                                │
└───────────┴───────────────────────────────────────────────┘
```

- The left rail is **72px icon-only** by default, expandable to **200px** on screens that need a labeled category list (e.g. menu category selection in Order Entry). Its width mode is a prop, not screen-local state.
- The top nav bar is fixed height 56px (`sizing.navBarHeightPx`), full width, background `surface.raised`, bottom border `border.default`, elevation `level1` on scroll.

## 2. Top Nav — Exact Item List

Left to right, matching the reference app's captured nav bar:

1. **New Order** — primary red button (`color.brand.primary`), always leftmost, always enabled (opens order entry / table view)
2. **Bill No search** — text input with search icon, quick jump to a bill
3. **KOT No search** — text input with search icon, quick jump to a KOT
4. **Item On/Off** — icon button, opens OOS/Menu Availability screen (artifact-04)
5. **Store** — icon button, outlet/store context indicator (single-outlet in v1 UI but wired to `outlet_id`)
6. **Live View** — icon button, opens Online Live Feed (artifact-03), shows a numeric badge for pending online orders
7. **Orders** — icon button, opens Order History (artifact-05)
8. **Recent** — icon button, recently viewed/edited orders
9. **Hold** — icon button, held/parked orders count badge
10. **Alerts** — bell icon, badge = `alertCount`, opens alerts panel (SLA breach, sync failure, low stock, etc.)
11. **Zomato Help** — icon/link, external support shortcut for the online-ordering integration
12. **Logout** — icon, rightmost, confirms via modal before firing `onLogout`
13. **Support phone number** — static text, always visible, rightmost-most element (e.g. "Support: 1800-XXX-XXXX"), not interactive

Icons at 24px per design-system §7. Items 2–3 are inputs (min width 160px, collapse to icon-triggered flyout below 1024px viewport — see §4).

## 3. Additional State: Connection Status Indicator (recommended addition)

Not present as a distinct nav item in the reference screenshots, but required given LAN sync is core to the architecture (multi-outlet, local KOT printers, periodic online-order polling). Recommended: a small dot + label at the far left of the top bar, before "New Order":

- **Synced** — `color.status.printed` (green) dot, label "Online" (tooltip only, no persistent text at rest)
- **Syncing** — `color.status.running` (blue) dot, subtle pulse animation
- **Offline / degraded** — `color.status.cancelled` (red) dot, label "Offline — orders queued locally", persistent text, non-dismissible until resolved
- Clicking the indicator opens a small popover with last-sync timestamp and a manual "Retry sync" action.

This follows the same color-plus-label rule mandated in the design system's accessibility notes — the dot color is never the sole signal.

## 4. Responsive Behavior

Kapmeta v1 targets POS terminals and tablets in landscape; the shell is not expected to support narrow mobile portrait, but must degrade gracefully down to 1024px width (common 10" POS tablet):

- **≥1280px:** full layout as diagrammed; category rail can be in expanded (200px) mode.
- **1024–1279px:** category rail forces to icon-only 72px mode regardless of screen preference; Bill No / KOT No search inputs collapse into a single search icon that opens a flyout with a mode toggle (Bill/KOT).
- **<1024px:** out of scope for v1; shell should not break but is not a design target — no bespoke work required beyond not clipping content.
- Top nav items never wrap to a second row. If total item width exceeds viewport, lowest-priority items (Recent, Zomato Help) collapse into an overflow "more" menu (kebab icon), in that priority order.

## 5. Props / Slots Contract (React)

Described as an interface spec — implementation lives in `packages/ui-kit`.

```ts
interface AppShellProps {
  /** Currently active top-level route, drives nav item highlight state */
  activeRoute:
    | "new-order" | "table-view" | "live-view" | "orders"
    | "item-on-off" | "recent" | "hold" | "alerts" | "settings";

  /** Current outlet context; v1 UI renders read-only single value but prop
   *  is required so the shell is multi-outlet-ready per the locked schema decision */
  activeOutlet: { id: string; name: string };

  /** Badge counts — omit or 0 hides the badge */
  alertCount?: number;
  liveOrderCount?: number;
  holdOrderCount?: number;

  /** Connection status indicator, §3 */
  connectionStatus: "synced" | "syncing" | "offline";
  lastSyncedAt?: string; // ISO timestamp, shown in the status popover

  /** Category rail display mode; shell may force "icon" below 1280px
   *  regardless of the value passed in */
  railMode?: "icon" | "expanded";

  /** Search handlers */
  onBillNoSearch: (billNo: string) => void;
  onKotNoSearch: (kotNo: string) => void;

  /** Navigation callbacks — shell is presentation-only, routing owned by caller */
  onNavigate: (route: AppShellProps["activeRoute"]) => void;
  onLogout: () => void;

  /** Support contact, static config-driven, not hardcoded in the component */
  supportPhone: string;

  /** Screen content */
  children: React.ReactNode;
}
```

Usage sketch:

```jsx
<AppShell
  activeRoute="table-view"
  activeOutlet={{ id: outletId, name: "Kapmeta - MG Road" }}
  alertCount={3}
  liveOrderCount={2}
  connectionStatus="synced"
  onBillNoSearch={handleBillSearch}
  onKotNoSearch={handleKotSearch}
  onNavigate={navigate}
  onLogout={handleLogout}
  supportPhone="1800-000-1234"
>
  <TableFloorView />
</AppShell>
```

## 6. Ownership Boundaries

- The shell owns: nav bar rendering, category rail chrome, connection indicator, logout confirmation modal, overflow-menu collapsing logic.
- The shell does NOT own: screen-level state, routing implementation (caller supplies `onNavigate`), or business logic behind search (caller supplies handlers and displays results itself, typically as a modal or side panel triggered from the parent route).
- All nav badge counts are passed in as props (no internal polling) — screens/state layer are responsible for keeping counts fresh; this keeps the shell a pure presentation component.
