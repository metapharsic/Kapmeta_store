# Accessibility & Usability Notes

Consolidated findings for Phase 1. These are binding constraints on `packages/ui-kit` components and on every hi-fi mockup (see the checklist in `mockup-notes-per-screen.md`).

## 1. Status Color Is Not a Sufficient Signal (color-blindness finding)

**Finding:** The reference app's status legend uses five close, largely warm/mid-saturation colors — grey (open), blue (running), green (printed), amber/orange (paid), red (cancelled) — plus a sixth yellow (`kot_sent`). Under common color-vision deficiencies (deuteranopia, protanopia — affecting roughly 1 in 12 men), amber (#F59E0B), yellow (#EAB308), and red (#EF4444) are difficult to reliably distinguish from one another, and green/red confusion is the single most common form of CVD.

**Rule:** Every status representation in the product — table tiles, order-history badges, live-feed cards — must encode status with three redundant channels simultaneously:
1. Color (the token from `color.status.*`)
2. A distinct icon shape (e.g. empty circle = open, half-fill/clock = running, checkmark = printed, currency/coin = paid, X/ban = cancelled, small "K" tag = kot_sent)
3. A text label, always present at least on hover/focus, and present at rest wherever space allows (table rows, list views)

This should be enforced structurally: the `StatusBadge` / `StatusDot` components in `ui-kit` should not expose a color-only render mode, and code review should reject any status UI that ships icon or label as optional/hidden-by-default.

Additionally, `color.status.paid` (#F59E0B) and `color.status.kotSent` (#EAB308) fail WCAG AA contrast (3:1) for small text directly on white — use only as icon fills, pill backgrounds paired with `statusSubtle`, or with dark text on top, never as standalone small colored text.

## 2. Keyboard Navigation — Data-Dense Report Tables

Applies to artifact-05 (Order History) and artifact-08 (Day Summary + Item Report), the two heaviest table screens.

- Tables must support arrow-key row navigation (Up/Down moves focus between rows; Left/Right moves between focusable cells/actions within a row when a row has multiple actions).
- `Enter` on a focused row activates its primary action (open order detail / drill into item report row); `Space` toggles selection where multi-select exists (e.g. bulk export).
- Column headers must be individually focusable and support `Enter`/`Space` to trigger sort, with the current sort direction exposed via both a visual indicator (arrow icon) and `aria-sort`.
- Sticky headers and sticky first columns (item/category name in artifact-08) must not break tab order — visually sticky elements stay in natural DOM order.
- Filter bar controls (date range, status filter) precede the table in tab order; pagination controls follow it.
- Provide a visible focus ring using `color.border.focus` (#3B82F6) at 2px on every focusable element — tables are the screen type most likely to be operated by keyboard/scanner-adjacent hardware in a back-office context, unlike the touchscreen-first POS screens.

## 3. Focus Order — Order Entry Two-Panel Layout (artifact-02)

The two-panel layout (menu/category grid on the left, running cart on the right) creates an ambiguous natural focus order if left purely to DOM/visual order. Rule:

- Tab order: Top nav (shell) → category rail → item grid (left-to-right, top-to-bottom within the visible/scrolled viewport) → cart line items (top to bottom) → cart summary actions (discount, tax override if applicable) → primary actions (Send KOT, Print Bill, Hold, Cancel) in that order.
- Adding an item to the cart (via click/Enter on an item tile) should NOT silently move focus into the cart panel — this disorients touch users switching between panels rapidly. Focus stays on the item grid unless the user explicitly navigates to the cart (e.g. via a "Review Order" affordance on smaller viewports).
- The cart panel's primary action buttons (Send KOT / Print Bill) must remain reachable via a single, predictable tab stop sequence even as the cart list grows — do not let a long cart list push focus order into a scroll trap; consider a `role="region"` with its own internal tab boundary if the cart list becomes long, so Tab can escape past it in one step when needed (or document a "skip to actions" affordance).
- Category rail selection (left) and item grid (center) must not fight for arrow-key handling — arrow keys only navigate within whichever region currently holds focus, never bleed across regions.

## 4. Touch-Target Sizing (POS terminals are touchscreen-first)

Order Entry's item-grid tiles, table/floor-view tiles, and all toggles are the highest-frequency touch interactions in the product and are used on POS terminal touchscreens, often by staff working quickly under time pressure.

- **Minimum touch target: 44x44px** (`sizing.touchTargetMinPx` in `tokens.json`), matching WCAG 2.1 AA (2.5.5, Level AAA target but adopted here as a hard minimum given the touchscreen-first context) and standard iOS/Android platform guidance.
- Item-grid tiles in Order Entry (artifact-02) must never render below 44px in their shortest dimension, even in a dense/compact grid mode — reduce columns before shrinking below the minimum.
- Toggle switches (artifact-06 Billing+Print Config, artifact-04 OOS toggles) have a visually smaller track (~36x20px per common patterns) but must have an invisible hit-area padding out to at least 44x24px; this is documented per-component in `design-system.md` §6.4.
- Adjacent interactive elements (e.g. two item tiles side by side, or an item tile next to its OOS toggle) need a minimum 8px (`spacing.sm`) gap so mis-taps don't trigger the wrong control — do not rely on touch-target padding alone to create separation when two targets are visually adjacent.
- Destructive touch actions (Cancel Item, Cancel Order, bulk "mark all off") must require a confirm step (`Modal`) rather than firing on a single tap, since touch mis-taps are more likely than mis-clicks with a mouse.

## 5. General Contrast & Motion

- Body text (14px/16px regular) must maintain 4.5:1 contrast against its background at minimum; this is already satisfied by `text.primary` (#111827) on `surface.raised`/`surface.page` and `text.secondary` (#4B5563) on the same surfaces — do not introduce lighter text-on-light-surface combinations without re-checking contrast.
- Any animation (status pulse on the connection indicator, toast entry/exit) must respect `prefers-reduced-motion` and fall back to a static state change.
- Print-preview and receipt-style mono text (bill/KOT numbers) must not drop below 11px even in compact print-preview panes, per design-system §2.
