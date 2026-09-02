# Design Contract — KapMeta POS

**Status:** ACTIVE — all UI work must conform
**Gate:** CP-15
**Source:** derived from the app's existing token system (`apps/pos-web/pages/_app.tsx`) audited against
`ui-ux-pro-max` skill guidance (`.claude/skills/ui-ux-pro-max`, MIT, vendored 2026-09-01).

## 0. What this is

The `ui-ux-pro-max` skill's first recommendation for this app was **Glassmorphism + a marketing
"Operations Landing" pattern**. That was rejected: this is a touch-operated point-of-sale used for
long shifts, often on cheap screens in bright rooms. Frosted-glass transparency has documented
contrast risk (the skill's own data marks it `risk:conditional`), and a landing-page section pattern
is irrelevant to an operator tool. The skill's *guideline* data (contrast, touch targets, density)
is what's authoritative here, not its style recommendation.

The app's existing token system is sound and stays. This contract fixes what's measurably broken
and defines what everything must conform to.

## 1. Tokens — the single source of truth

Defined in `apps/pos-web/pages/_app.tsx` `:root`. **No page may hardcode a hex colour, a raw Tailwind
colour class (`bg-slate-900`, `text-gray-400`, …), or its own font stack.** Use the token.

## 2. Contrast defects found (measured WCAG ratios, not opinion)

| Pair | Ratio | Verdict |
|---|---|---|
| `--text-muted` (#94a3b8) on `--bg-card` (#fff) | **2.56** | FAIL — needs 4.5 |
| `--text-muted` on `--bg-base` (#f8fafc) | **2.45** | FAIL |
| `--accent` (#10b981) as text on white | **2.54** | FAIL |
| `--text-secondary` on `--bg-card` | 4.76 | pass |
| `--text-primary` on `--bg-card` | 17.85 | pass |
| `--warning-text` on `--warning-subtle` | 6.84 | pass |
| `--accent-subtle-text` on `--accent-subtle` | 7.29 | pass |

**Required fixes:**
- `--text-muted` → darken to meet 4.5:1 on both `--bg-card` and `--bg-base`. It is currently used for
  real information (timestamps, counts, secondary labels), not decoration.
- `--accent` must never be used as text colour on a light background. It is a *fill* colour (buttons,
  bars, indicators) with `--color-on-accent` text on top. Where green text is needed on light,
  use `--accent-subtle-text` (#065f46, 7.29:1).

## 3. Touch targets

POS is finger-operated. Per skill guideline (Touch Target Size, severity High):
web minimum 24 CSS px, but **this app targets 44px minimum** for any control a
cashier or waiter hits during service (order buttons, table tiles, quantity steppers, payment
actions). Admin-only controls (settings forms, report filters) may use the 24px web minimum.

## 4. Density — reports and data tables

Per the skill's `data-dense-dashboard` profile, which fits the reports surface:
`--grid-gap: 8px`, `--card-padding: 12px`, table row height 36px, small text 12–14px,
sticky table headers, 12-column grid. Applies to the analytics tab and any data table.
Does NOT apply to the POS terminal itself, which needs bigger targets (§3).

## 5. Pre-delivery checklist (every UI change)

- [ ] No hardcoded hex / raw Tailwind colour classes — tokens only
- [ ] Text contrast ≥ 4.5:1 (verify, don't eyeball)
- [ ] `cursor: pointer` on every clickable element
- [ ] Visible focus state for keyboard nav
- [ ] Hover transition 150–300ms
- [ ] `prefers-reduced-motion` respected for any animation
- [ ] Service-path controls ≥ 44px
- [ ] No emoji used as a functional icon (emoji as decoration in labels is fine; controls need SVG)

## 6. Known architectural debt (not a style issue, but a UX defect)

Two disconnected nav systems — `components/Nav.tsx` (sidebar, 12 pages) and
`components/KapMetaHeader.tsx` (drawer, the POS terminal + operational pages). A page wired into
one is invisible from the other. This has already caused two "I can't find it" incidents this
session (User Management, Reports). Any new destination must be wired into **both** until they
are unified.
