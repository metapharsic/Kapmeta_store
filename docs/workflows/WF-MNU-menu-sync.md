# WF-MNU — Menu Availability Change & Channel Sync

**ID:** WF-MNU-01, WF-INT-02 · **Status:** DRAFT · **Owner:** Integration Lead · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** source page 6, `REQ-MNU` · **Traced by:** `TST-E2E-05/06`, `UX-SCR-06/18`
**Blocked by:** DEC-007

---

## Flow

**Trigger:** admin toggles item availability, changes price, or edits item metadata
**Actor:** Menu Admin / Outlet Manager (`menu.write`)

```
┌─────────────────────────────────────────────────┐
│  Admin changes item availability                │
└──────────────────┬──────────────────────────────┘
┌──────────────────▼──────────────────────────────┐
│  Validate permission + channel mapping          │
└──────────────────┬──────────────────────────────┘
┌──────────────────▼──────────────────────────────┐
│  Store change with VERSION NUMBER               │  ← + audit row, same transaction
└──────────────────┬──────────────────────────────┘
┌──────────────────▼──────────────────────────────┐
│  Generate channel-specific payload              │
│  (Swiggy / Zomato / other)                      │
└──────────────────┬──────────────────────────────┘
┌──────────────────▼──────────────────────────────┐
│  Queue for async processing                     │
└──────────────────┬──────────────────────────────┘
┌──────────────────▼──────────────────────────────┐
│  Adapter sends to external channel (IDEMPOTENT) │
└──────────────────┬──────────────────────────────┘
┌──────────────────▼──────────────────────────────┐
│  Persist response + update sync status          │
└──────────────────┬──────────────────────────────┘
┌──────────────────▼──────────────────────────────┐
│  UI: Synchronized / Failed / Pending            │
│  + retry control + audit trail                  │
└─────────────────────────────────────────────────┘
```

---

## Why The Version Number Matters

Availability is stored per `(item, channel)` with a `version`. Sync responses arrive out of order under load. Without versioning:

> Admin turns item OFF (v5), then ON (v6). The v5 response lands after v6. Item shows OFF on Swiggy while the POS says ON. Customers order an item the kitchen cannot make.

**Rule: a lower version never overwrites a higher one.** Consumers discard stale responses rather than applying them.

---

## Availability States

| State | Meaning | New orders | Existing orders |
|-------|---------|-----------|-----------------|
| **ON** | Orderable on the channel | Allowed | Valid |
| **OFF** | Deliberately blocked | **Blocked** | **Remain valid and fulfillable** |
| **Partial Changes** | Local state not fully propagated — some channels synced, some not | Per-channel | Valid |
| **Unscheduled** | No active availability schedule rule | Per config | Valid |

`OFF` blocking new orders while preserving existing ones is the critical behavior — cancelling already-placed orders because an item went unavailable is worse than fulfilling them.

---

## Local vs Channel Truth

The internal state is authoritative. Channel state is a **projection** that may lag. The UI must show both:

| Internal | Channel | Display |
|----------|---------|---------|
| ON | ON | Synchronized |
| ON | not yet pushed | Partial Changes / Pending |
| ON | push failed | Failed + retry |
| OFF | ON | **Failed — highest severity.** Customers can order something we will not make. |

The last row is the alert-worthy case. Treat a failed OFF-push as an incident, not a warning.

---

## Bulk Operations

Enable/disable a whole category, bulk price update. Each item still gets its own version, its own sync job, and its own audit row. A bulk action that writes one audit row for 60 items is not auditable.

---

## Failure Paths

| Failure | Behavior |
|---------|----------|
| No channel mapping for item | Skip channel, flag item as unmapped, surface in UI |
| Channel API rejects payload | Persist error, status Failed, manual retry available |
| Timeout | Backoff retry ×3, then DLQ (WF-INT-03) |
| Stale version response | Discard silently, log at debug |
| Partial bulk failure | Per-item status; the successful items stay applied |

---

## Open Decisions

| Decision | Affects |
|----------|---------|
| DEC-007 | Which channels; each has its own payload shape and rate limits |
| DEC-001 | Whether availability is per-outlet or organization-wide |
