# UX Design Tokens

**ID:** UX-DESIGN-TOKENS · **Status:** APPROVED · **Version:** 2.0 · **Updated:** 2026-08-09 · **Traces to:** Nonprofit CRM Dashboard / Clean SaaS Aesthetic Reference (2026-08-09)

---

## 1. Unified Color Palette (Clean SaaS Aesthetic)

The entire application across both POS and Admin interfaces adopts a unified, modern, high-clarity Light SaaS design system inspired by the Nonprofit CRM Dashboard aesthetic reference.

### Global Tokens
* **Background (Base Canvas)**: `#f8fafc` (`hsl(210, 40%, 98%)` - Soft cool grey canvas)
* **Background (Card / Panel)**: `#ffffff` (`hsl(0, 0%, 100%)` - Pure white card surface with 1px hairline border)
* **Background (Subtle / Form Fields)**: `#f1f5f9` (`hsl(210, 40%, 96%)` - Form inputs and row hovers)
* **Text (Primary)**: `#0f172a` (`hsl(222, 47%, 11%)` - High-contrast deep slate navy)
* **Text (Secondary)**: `#64748b` (`hsl(215, 16%, 47%)` - Subtitles, metadata, timestamps)
* **Text (Muted)**: `#94a3b8` (`hsl(215, 16%, 65%)` - Section headers, placeholder hints)
* **Border (Hairline / Card Divider)**: `#e2e8f0` (`hsl(214, 32%, 91%)` - 1px crisp divider, no heavy drop shadows)

### Accent & Brand Colors
* **Primary Action / Button**: `#0f172a` (Deep slate navy pill button — "+ Add", "Checkout", "Export")
* **Interactive Accent**: `#10b981` (`hsl(142, 71%, 45%)` - Emerald green for success, totals, and positive trends)
* **Soft Mint Badge / Pill**: `#ecfdf5` (bg) + `#065f46` (text) - Active category chips, paid status, item selections
* **Soft Blue Badge / Pill**: `#eff6ff` (bg) + `#1d4ed8` (text) - Occupancy, card payments, table allocations
* **Soft Amber Badge / Pill**: `#fffbeb` (bg) + `#92400e` (text) - Low stock warnings, SLA breach alerts
* **Soft Red Badge / Pill**: `#fef2f2` (bg) + `#991b1b` (text) - 86-ed / out of stock, voided tickets
* **Soft Purple Badge / Pill**: `#faf5ff` (bg) + `#7e22ce` (text) - Average order value (AOV) stats

---

## 2. Typography

Modern, legible sans-serif typography geared for high clarity across both seated desktop admin work and standing touch register operations.

* **Primary Font Family**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
* **Scale**:
  * `text-xs`: `0.75rem (12px)` — Timestamps, section uppercase labels (`font-weight: 700`, `letter-spacing: 0.5px`).
  * `text-sm`: `0.8125rem (13px)` — Subtitles, modifiers, table cell metadata.
  * `text-base`: `0.875rem (14px)` — Standard body text, menu item names, button labels.
  * `text-lg`: `1.125rem (18px)` — Card titles, section headers.
  * `text-xl`: `1.375rem (22px)` — Modal headings, invoice titles.
  * `text-2xl`: `1.875rem (30px)` — Big KPI metric numbers (`tabular-nums`, bold).

---

## 3. Spacing, Shapes & Touch Accessibility

* **Touch Targets (Mandatory POS Accessibility Rule)**:
  * Minimum interactive target is **`44px x 44px`** for buttons, steppers, and category tabs.
* **Border Radii**:
  * `radius-sm`: `6px` (Small toggles and badges)
  * `radius-md`: `10px` (Input fields, modifier chips, buttons)
  * `radius-lg`: `16px` (Product cards, KPI metric cards, panels)
  * `radius-pill`: `9999px` (Navigation pills, status chips, primary action buttons)
* **Shadows & Elevations**:
  * `shadow-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`
  * `shadow-card`: `0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)`
  * `shadow-pop`: `0 10px 25px -3px rgba(15, 23, 42, 0.08)` (Card hover / toast popups)
  * `shadow-modal`: `0 25px 50px -12px rgba(15, 23, 42, 0.2)` (Overlay dialogs)

---

## 4. Component Layout Mapping

| Component | Design Pattern |
|-----------|----------------|
| **Top Navigation Bar** | Sticky white bar (`64px`), brand icon box, outlet info pill, center pill navigation group, right-aligned user profile badge & digital clock. |
| **Left Sidebar** | Grouped uppercase section labels (`ORDER TYPE`, `CATEGORIES`), pill items with count chips, light mint active background. |
| **KPI Tiles** | 4-up responsive grid, icon in rounded pastel square (green, blue, amber, purple), uppercase small label, big bold metric number, trend pill (`+18.22%`), mini horizontal progress sparkline. |
| **Product & Stock Cards** | White rounded card with 1px border `#e2e8f0`, soft hover elevation, food icon in subtle square, stock pill right-aligned, bold price, dark navy action button. |
| **Active Cart Panel** | White vertical panel, light grey item cards, 32px stepper buttons, subtotal/tax calculation lines, prominent dark navy checkout CTA. |
| **Data Tables** | Clean table with uppercase headers, hairline row dividers, pill status badges, amount right-aligned in bold slate. |
| **Modals & Overlays** | Centered white dialog (`max-width: 580px - 780px`) with blurred backdrop, clean header, scrollable options grid, and pill action buttons. |
