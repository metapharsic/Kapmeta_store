# UX-CMP — Component Registry

**ID:** UX-CMP · **Status:** APPROVED · **Owner:** UX + Frontend Lead · **Version:** 1.0 · **Updated:** 2026-08-09
**Traces to:** UX-SCR, `04-design/design-system.md` · **Traced by:** `packages/ui-kit`, Storybook

Shared components live in `packages/ui-kit`. A component used by both apps belongs here, not duplicated.

---

## Registry

| ID | Component | Used by | States | Notes |
|----|-----------|---------|--------|-------|
| `UX-CMP-01` | Button | all | default, hover, active, disabled, loading | POS variant ≥44px |
| `UX-CMP-02` | Input | all | default, focus, error, disabled, readonly | Error message slot required |
| `UX-CMP-03` | Select / Combobox | all | + open, searching, no-results | Touch-friendly on POS |
| `UX-CMP-04` | Data table | admin | all six from `UX-STA` | Cursor pagination, not offset |
| `UX-CMP-05` | Filter bar | admin | default, active, cleared | Must distinguish empty-result from filtered-out |
| `UX-CMP-06` | Modal | all | open, closing, blocking | Confirm dialogs state the consequence |
| `UX-CMP-07` | Toast | all | info, success, warning | **Never for blocking errors** |
| `UX-CMP-08` | Status pill | all | per status | Label + icon, never colour alone |
| `UX-CMP-09` | Quantity stepper | POS | default, min, max, disabled | Large targets; no keyboard required |
| `UX-CMP-10` | Modifier picker | POS | default, min-not-met, max-reached | Enforces group min/max rules |
| `UX-CMP-11` | Order card | POS, admin | per order status | Compact + expanded |
| `UX-CMP-12` | KOT ticket card | POS | pending, preparing, done, SLA-breach | Age colour threshold |
| `UX-CMP-13` | KPI tile | admin | loading, value, no-data, error | Drill-down affordance |
| `UX-CMP-14` | Date-range picker | admin | default, preset, custom, invalid | **Business day, not calendar day** |
| `UX-CMP-15` | Money display | all | — | Formats from minor units; never does arithmetic |
| `UX-CMP-16` | Money input | POS | default, error | Parses to minor units at the boundary |
| `UX-CMP-17` | Permission gate | all | allowed, denied, elevation-available | Cosmetic only — server re-checks |
| `UX-CMP-18` | Sync status badge | admin | synchronized, pending, failed | + retry action |
| `UX-CMP-19` | Empty state | all | — | Message + optional action slot |
| `UX-CMP-20` | Error boundary | all | — | Shows correlation ID, preserves input |

---

## Two Components That Carry Real Risk

**`UX-CMP-15` / `UX-CMP-16` — Money.** These are the only components permitted to convert between minor units and display strings. No other component, and no screen, does money arithmetic. Formatting logic scattered across screens is how two parts of the UI start showing different totals for the same order.

**`UX-CMP-14` — Date range.** Defaults to **business day**, which starts at the outlet's configured `day_start_time`, not midnight. A picker that silently uses calendar days will make every report disagree with the Z-report, and the discrepancy will be blamed on the backend.

---

## Component Standard

Each component ships with:

- [ ] Storybook story per state (the story **is** the visual spec)
- [ ] Props documented with types
- [ ] Keyboard navigation
- [ ] Contrast checked (kitchen glare, not just WCAG minimum)
- [ ] Touch target ≥44px in POS variant
- [ ] No hover-only behavior
- [ ] Tests for all six states from [`UX-STATE-CATALOGUE.md`](UX-STATE-CATALOGUE.md)

---

## Adding A Component

1. Check the registry — near-duplicates are how a design system dies
2. Used by one app only? It stays in that app until a second consumer appears
3. Register here with an ID before merging
4. Storybook story is part of the same PR, not a follow-up
