# Mockup-Readiness Notes — Per Screen

This document is the spec that hi-fi mockups (built in an actual design tool) must follow for each of the nine Phase 0 requirement screens. It is not a substitute for pixel mockups; it is the checklist a designer or engineer uses to build/review them against the design system and app-shell contract. Each entry lists the tokens/components consumed, screen-specific layout decisions, and open questions to resolve before/during the hi-fi pass.

---

## artifact-01 — Table / Floor View

**Tokens/components used:** `Card` (table tiles), `color.status.*` + `statusSubtle.*` for tile fill, `Badge` for KOT-sent yellow dot overlay, `AppShell` (railMode="icon"), `elevation.level2`, `spacing.md` gutter between tiles, `radius.md`.

**Layout decisions:** Table tiles in a responsive grid (min tile 140x100px, meets touch-target minimum with margin), grouped by floor/section as horizontal tab strip above the grid (uses `Tab Bar` component). Tile shows: table number, cover count, elapsed time, status color fill, and a small icon+label per Accessibility §7.1 (not color-only). Selected/focused tile gets `border.selected` 2px ring, not just a fill change.

**Status:** Mockup: Ready for hi-fi pass.

---

## artifact-02 — Order Entry / Billing

**Tokens/components used:** `AppShell` (railMode="expanded" for category rail), `Card` for item tiles in the menu grid, `Table` for the running cart/order line list, `Button` (primary for "Send KOT"/"Print Bill", secondary for "Hold", danger for "Cancel Item"), numeric typography style for line totals and `grand_total_amount`.

**Layout decisions:** Two-panel layout — left panel: category rail + item grid (tiles ≥44px touch target per Accessibility §7.4); right panel: running order/cart with subtotal/tax/discount/grand-total breakdown using the standardized money field names directly as row labels internally. Discount and tax rows are visually secondary (`text.secondary`); grand total uses `Numeric` style at `H3` size for emphasis. Focus order defined in `accessibility-and-usability-notes.md` §3.

**Status:** Mockup: Ready for hi-fi pass.

---

## artifact-03 — Online Live Feed

**Tokens/components used:** `AppShell` with `liveOrderCount` badge wired to nav, `Card` per incoming order, `color.status.running`/`open` for new vs acknowledged orders, `Toast` for new-order arrival notification (uses `feedback.info`, distinct from order-status tokens per design-system §6.10), `Button` primary for "Accept", danger for "Reject".

**Layout decisions:** Vertical feed list, newest on top, auto-scroll-lock disabled once user scrolls manually. Each card shows elapsed-time-since-received with color escalation (green → amber → red) as an SLA countdown; this reuses `status.printed/paid/cancelled` hues intentionally to signal urgency, always paired with a countdown number (never color alone).

**Status:** Mockup: Ready for hi-fi pass.

---

## artifact-04 — OOS + Menu Availability

**Tokens/components used:** `Toggle` (on/off per item, per `color.brand.primary` on-state), `Table` for the item list (Table Data typography), `Category Rail` for filtering by menu category, `Badge` (statusSubtle.cancelled fill for "Out of Stock" pill).

**Layout decisions:** Dense table with sticky header, toggle in the rightmost column, item name + category + toggle as the minimum row content. Bulk "mark all off" action uses a `danger` button behind a confirm `Modal`. Row height 40px (table default), toggle hit area still meets the 44x24 minimum called out in design-system §6.4 even inside a 40px row via padding overflow.

**Status:** Mockup: Ready for hi-fi pass.

---

## artifact-05 — Order History

**Tokens/components used:** `Table` (Table Data / Table Header styles), `Badge` per row for `order_status` (all five enum values represented, plus separate `kot_sent` indicator icon), filter bar using `Button` secondary variants and date-range input, pagination control.

**Layout decisions:** Data-dense table, one row per order: bill no, table/outlet, timestamp, item count, grand_total_amount (Numeric style, right-aligned), status badge, kot_sent icon, actions (view/reprint). Keyboard navigation rules (row-to-row via arrow keys, Enter to open) defined in `accessibility-and-usability-notes.md` §2.

**Status:** Mockup: Ready for hi-fi pass.

---

## artifact-06 — Billing + Print Config

**Tokens/components used:** `Toggle` heavy screen (print options, receipt sections on/off), `Card` grouping for config sections, `Button` primary for "Save Changes", form `Label` typography for every setting name.

**Layout decisions:** Single-column settings list grouped into cards (e.g. "Receipt Header", "Tax Display", "KOT Printer Routing"), consistent with the toggle-heavy pattern observed in reference screenshots. Each toggle row: label left, description caption below label, toggle right, min row height 48px for comfortable touch spacing.

**Status:** Mockup: Ready for hi-fi pass.

---

## artifact-07 — Tax Master

**Tokens/components used:** `Table` for tax rule list (name, percentage, applicability), `Button` primary "Add Tax", `Modal` for add/edit tax rule form, `Badge` (informational, `feedback.info` subtle) for "Default" tax marker.

**Layout decisions:** Table + slide-in or modal form for CRUD, percentage values right-aligned with `Numeric` style, validation errors use `feedback.danger` inline text below the field (never color-only — paired with an error icon and message, consistent with Accessibility §7.1's general color-pairing rule extended to form validation).

**Status:** Mockup: Ready for hi-fi pass.

---

## artifact-08 — Day Summary + Item Report

**Tokens/components used:** `Table` (heaviest data-density use case in the product), summary `Card` tiles at top (total sales, total orders, average bill — Numeric style at H2 size), `color.feedback.*` for delta indicators (up/down vs. previous day), export `Button` secondary.

**Layout decisions:** Top: 3–5 summary stat cards in a row. Below: two tabs (Day Summary / Item Report) using `Tab Bar`, each rendering a dense sortable table with sticky header and sticky first column (item/category name) for horizontal scroll on narrow viewports. All monetary columns use the standardized field names (subtotal_amount, tax_amount, discount_amount, grand_total_amount) as literal column headers where the report is itemized at that granularity.

**Status:** Mockup: Ready for hi-fi pass.

---

## artifact-09 — System Config + App Shell

**Tokens/components used:** Full `AppShell` component itself (see `app-shell-spec.md`), plus `Toggle`, `Card`, `Table` for the various config sub-sections (outlet management, user roles, printer setup, tax defaults linkage).

**Layout decisions:** This screen is both a config screen and the definition source for the shell used by all other screens. Config sub-navigation uses a secondary left rail (200px expanded mode) inside the content slot, distinct from the primary app category rail — avoid nesting two icon-only rails, always expand the secondary one for legibility since this is an admin/settings context, not a high-frequency POS interaction.

**Status:** Mockup: Ready for hi-fi pass.

---

## Cross-Screen Checklist (apply to every hi-fi mockup before sign-off)

- [ ] All colors reference `tokens.json` values exactly — no ad hoc hex codes.
- [ ] Every status indicator pairs color with icon + text label (design-system §7.1 / §8).
- [ ] All interactive touch targets ≥44px on touchscreen-context screens (Table/Floor View, Order Entry item grid, toggles).
- [ ] Table components use `tableHeader`/`tableData` type styles, not generic body text.
- [ ] Money fields are labeled/named consistently with `subtotal_amount` / `tax_amount` / `discount_amount` / `grand_total_amount` semantics even when the visible label is human-readable ("Subtotal", "Tax", "Discount", "Grand Total").
- [ ] Screen renders correctly inside `AppShell` at both 1280px+ and 1024px breakpoints.
