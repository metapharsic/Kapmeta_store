# UI/UX Artifacts

**ID:** UX-INDEX · **Status:** DRAFT · **Owner:** UX Designer · **Version:** 1.0 · **Updated:** 2026-08-08

Every screen, component, state and token — registered, versioned, traceable to a requirement.

---

## Files

| ID | File | Contains |
|----|------|----------|
| `UX-SCR` | [UX-SCREEN-INVENTORY.md](UX-SCREEN-INVENTORY.md) | Every screen, its source evidence, endpoints, permission, status |
| `UX-CMP` | [UX-COMPONENT-REGISTRY.md](UX-COMPONENT-REGISTRY.md) | Shared component library with props and states |
| `UX-STA` | [UX-STATE-CATALOGUE.md](UX-STATE-CATALOGUE.md) | The six mandatory states every screen implements |
| `UX-TOK` | [UX-DESIGN-TOKENS.md](UX-DESIGN-TOKENS.md) | Colour, type, spacing, elevation, motion |

Related: [`../04-design/design-system.md`](../04-design/design-system.md) (principles), [`../mappings/MAP-SCR-screen-to-endpoint.md`](../mappings/MAP-SCR-screen-to-endpoint.md) (wiring).

---

## Design Context

POS is used **standing up, at speed, under load, often on a touchscreen, by staff who did not choose this software.** Optimize for target size and error recovery, not density or elegance.

The admin console is the opposite: seated, deliberate, data-dense, used by people who will learn it. Two different design problems in one product — do not apply POS rules to admin screens or vice versa.

---

## Artifact Standard

Every screen artifact records:

| Field | Notes |
|-------|-------|
| ID | `UX-SCR-NN`, permanent |
| Source evidence | Page number, or "no source — proposed" |
| App | `pos-web` or `admin-web` |
| Endpoints | Per `MAP-SCR` |
| Permission | Server-enforced; UI hiding is cosmetic |
| States | All six from `UX-STA` |
| Realtime | Event subscription, plus polling fallback |
| Status | WIREFRAME / PROTOTYPE / SPECIFIED / BUILT |

A screen without all six states specified is not `SPECIFIED`. "We'll handle errors later" produces a blank panel in production while a customer waits.

---

## Deliverable Sequence

```
Wireframe → interactive prototype → design tokens → component specs (all states)
    → usability review with operations → CP-01 gate → build
```

Usability review is with the people who will actually use it during a dinner rush, not with stakeholders in a meeting room.
