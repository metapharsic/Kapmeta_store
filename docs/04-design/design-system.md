# Kapmeta Design System (Phase 1)

Source of truth for visual tokens and components consumed by `packages/ui-kit`. Companion file `tokens.json` holds machine-readable values; this document explains intent and usage rules. Visual language is derived from 86 captured screenshots of the reference PetPooja app plus the locked Phase 0 data model decisions (canonical `order_status` enum: open/running/printed/paid/cancelled, separate `kot_sent` boolean; money fields `subtotal_amount` / `tax_amount` / `discount_amount` / `grand_total_amount`).

## 1. Color Palette

### 1.1 Brand
| Token | Hex | Usage |
|---|---|---|
| `color.brand.primary` | `#C0272D` | Primary actions ("New Order" button), logo mark, active nav underline |
| `color.brand.primaryHover` | `#A01F24` | Hover state on primary buttons/links |
| `color.brand.primaryActive` | `#861A1F` | Pressed state |
| `color.brand.primarySubtle` | `#FBE8E8` | Light red backgrounds (selected list row, badge fill) |

### 1.2 Status colors (order lifecycle)
These map 1:1 to the canonical `order_status` enum, plus one extra for the independent `kot_sent` boolean. Do not invent additional status colors — any new UI state must be expressed as a combination of these five plus `kotSent`.

| Status | Token | Hex | Meaning |
|---|---|---|---|
| open | `color.status.open` | `#9CA3AF` | Table/order created, no KOT sent, blank/neutral grey |
| running | `color.status.running` | `#3B82F6` | Order active, KOT sent, in progress — blue |
| printed | `color.status.printed` | `#22C55E` | Bill printed — green |
| paid | `color.status.paid` | `#F59E0B` | Settled — amber/orange |
| cancelled | `color.status.cancelled` | `#EF4444` | Voided/cancelled — red |
| kot_sent (flag) | `color.status.kotSent` | `#EAB308` | Yellow dot/badge overlay indicating KOT already sent, independent of order_status |

Each status also has a subtle background variant (`color.statusSubtle.*`) for pill/badge fills, computed at ~12% opacity equivalent against white, used so text stays legible (see Accessibility, §7).

### 1.3 Surface
| Token | Hex | Usage |
|---|---|---|
| `color.surface.page` | `#F5F6F8` | App background |
| `color.surface.raised` | `#FFFFFF` | Cards, panels, modals |
| `color.surface.sunken` | `#EEF0F3` | Table zebra stripe, input backgrounds |
| `color.surface.overlay` | `rgba(17,24,39,0.5)` | Modal backdrop |
| `color.surface.inverse` | `#111827` | Dark surfaces (tooltips, dark nav variants) |

### 1.4 Text
| Token | Hex | Usage |
|---|---|---|
| `color.text.primary` | `#111827` | Headings, primary body text |
| `color.text.secondary` | `#4B5563` | Supporting text, table sub-rows |
| `color.text.tertiary` | `#9CA3AF` | Placeholder, disabled labels |
| `color.text.disabled` | `#D1D5DB` | Disabled control text |
| `color.text.inverse` | `#FFFFFF` | Text on dark/brand backgrounds |
| `color.text.link` | `#2563EB` | Hyperlinks |

### 1.5 Border
| Token | Hex | Usage |
|---|---|---|
| `color.border.default` | `#E5E7EB` | Card/table/input borders |
| `color.border.strong` | `#D1D5DB` | Dividers needing more contrast |
| `color.border.focus` | `#3B82F6` | Keyboard focus ring |
| `color.border.selected` | `#3B82F6` | Selected table card border (matches "running/selected-border" pattern from reference app) |

### 1.6 Feedback (system messages, distinct from order status)
`color.feedback.success` (#22C55E), `.warning` (#F59E0B), `.danger` (#EF4444), `.info` (#3B82F6) — each with a `Subtle` background pair. Used for toasts, form validation, and banners; intentionally reuses the same hues as order status colors since both derive from the same reference palette, but feedback tokens are semantically separate and must not be conflated with order-status tokens in code.

## 2. Typography

- **Base family:** Inter, falling back to Segoe UI / Roboto / system sans-serif. Numeric-heavy screens (Day Summary, Item Report, Order Entry line totals) should enable tabular figures where the font supports it.
- **Mono family:** Roboto Mono for KOT numbers, bill numbers, and receipt-style print previews.

| Style | Size | Line height | Weight | Usage |
|---|---|---|---|---|
| H1 | 28px / 1.75rem | 36px | 700 | Page titles (rare in POS shell) |
| H2 | 22px / 1.375rem | 30px | 700 | Section headers, modal titles |
| H3 | 18px / 1.125rem | 26px | 600 | Card headers, panel titles |
| Body | 14px / 0.875rem | 20px | 400 | Default UI text |
| Body Strong | 14px | 20px | 600 | Emphasized body, item names |
| Label | 12px / 0.75rem | 16px | 500 | Form labels, nav labels |
| Caption | 11px | 14px | 400 | Timestamps, helper text |
| Table Data | 13px | 18px | 400 | Dense report table cells |
| Table Header | 12px | 16px | 600, uppercase, letter-spacing 0.02em | Table column headers |
| Numeric | 14px | 20px | 600, tabular-nums | Prices, totals, quantities |

Minimum body text size across the product is 13px; nothing below 11px (caption) is permitted anywhere, including print-preview miniatures, to keep touchscreen legibility.

## 3. Spacing Scale (4px base unit)

`xxs 2 · xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48 · xxxl 64` (all px). Component internal padding should snap to `sm`/`md`; layout gutters between major regions (sidebar, content, panel) use `lg`/`xl`.

## 4. Border Radius

`none 0 · sm 4px · md 8px · lg 12px · xl 16px · pill 999px`

- Buttons, inputs, badges: `sm` (4px)
- Cards, modals, table-grid tiles: `md` (8px)
- Large panels / floating action surfaces: `lg` (12px)
- Status pills / tags: `pill`

## 5. Elevation / Shadow Scale

| Token | Value | Usage |
|---|---|---|
| level0 | none | Flat inline elements |
| level1 | `0 1px 2px rgba(17,24,39,.06)` | Table rows on hover, list items |
| level2 | `0 2px 6px rgba(17,24,39,.08)` | Cards, table tiles (default resting elevation for the table/floor grid) |
| level3 | `0 4px 12px rgba(17,24,39,.12)` | Dropdowns, popovers |
| level4 | `0 12px 24px rgba(17,24,39,.18)` | Modals, dialogs |

Kapmeta's visual language is flat overall (per reference screenshots); avoid stacking more than one elevation step above `level2` except for true modal/overlay contexts.

## 6. Component Inventory

Each entry names the component, its states, and the tokens it must consume. This is the contract `packages/ui-kit` implements against.

1. **Button** — variants: `primary` (brand red fill, white text), `secondary` (white fill, `border.default`, `text.primary`), `danger` (feedback.danger fill, white text), `ghost` (transparent, text-only). States: default/hover/active/disabled/loading. Min height 40px desktop, 44px touch-target contexts (see Accessibility §7.4). Radius `sm`.
2. **Card** — surface `raised`, border `border.default`, radius `md`, elevation `level2`. Used for the table/floor grid tiles and dashboard summary tiles.
3. **Modal** — overlay `surface.overlay`, panel `surface.raised`, radius `lg`, elevation `level4`. Header/body/footer slot structure; footer right-aligns actions with `secondary` then `primary`/`danger` button order.
4. **Toggle (switch)** — on = `brand.primary` track, off = `border.strong` track. Used throughout Billing+Print Config and System Config screens. Minimum hit area 44x24px even though visual track is smaller.
5. **Table** — header row uses `tableHeader` style on `surface.sunken` background; body rows alternate `raised`/`sunken`; row height minimum 40px (44px where row itself is clickable/actionable, e.g. Order History). Sticky header for reports over one viewport height.
6. **Badge / Status Pill** — background = `statusSubtle.<status>`, text/icon = `status.<status>` at full saturation, radius `pill`, always paired with a status icon and text label (never color alone — see §7.1).
7. **Tab Bar** — underline style, active tab uses `brand.primary` 2px underline + `text.primary`; inactive tabs `text.secondary`.
8. **Top Nav Shell** — see `app-shell-spec.md` for full contract. Height `sizing.navBarHeightPx` (56px), background `surface.raised`, bottom border `border.default`.
9. **Category Rail (left sidebar)** — width `sizing.categoryRailWidthPx` (200px) for menu category lists, or icon-only rail `sizing.sidebarWidthPx` (72px) variant for the primary app nav icons. Selected item: `brand.primarySubtle` background + `brand.primary` left border (3px, `border.widthThick`).
10. **Toast / Alert** — top-right stack, radius `md`, elevation `level3`, auto-dismiss 4s for success/info, persistent for danger until acknowledged. Uses `feedback.*` tokens, never `status.*` tokens (toasts are system messages, not order-state indicators).

## 7. Icon Usage Notes

- Icon set should be a single consistent line-icon family (e.g. Lucide/Feather-style, 1.5–2px stroke) at 16px (inline/label-adjacent), 20px (buttons/nav), and 24px (top nav bar icons).
- Status must always be represented by icon + color + text label together (dot/check/clock/x-circle/ban icons for open/running/printed/paid/cancelled respectively) — see Accessibility §7.1 for the rationale.
- Icons inherit `currentColor`; never hardcode icon fill colors separately from the text/status token driving them.

## 8. Accessibility Notes (summary — full detail in `accessibility-and-usability-notes.md`)

- **Contrast minimum:** All body text must meet WCAG 2.1 AA — 4.5:1 for text under 18px/24px-bold, 3:1 for larger text and for UI component boundaries (button borders, focus rings). `color.status.paid` (#F59E0B) and `color.status.kotSent` (#EAB308) on white fall below 3:1 for text use — these two tokens must only be used as fills behind white/dark text (verified pairing) or as icon/pill colors on their `statusSubtle` background, never as small text color directly on white.
- **Status color is not the only signal.** The five order-status colors plus the KOT-sent yellow are all warm-leaning or mid-saturation hues (blue is the one cool exception) and several (paid #F59E0B, kot_sent #EAB308, cancelled #EF4444 under some CVD simulations) are difficult to distinguish for users with deuteranopia/protanopia. Every status indicator in the product — table tiles, order list rows, badges — must pair color with a distinct icon shape and a text label. This is a mandatory rule, not a suggestion, and should be enforced in code review / component API (the `StatusBadge` component should not accept a color-only render mode).
- Full keyboard, focus-order, and touch-target rules live in `accessibility-and-usability-notes.md`.

## 9. Naming Convention

Tokens follow `category.subcategory.variant` dot notation matching `tokens.json` structure exactly (e.g. `color.status.running`, `spacing.md`, `radius.pill`). CSS custom properties should mirror this as `--color-status-running`, etc., generated directly from `tokens.json` — do not hand-maintain a parallel CSS token list.
