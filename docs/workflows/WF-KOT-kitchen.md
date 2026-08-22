# WF-KOT — KOT Generation & Kitchen Flow

**ID:** WF-KOT-01 · **Status:** DRAFT · **Owner:** BA · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** source page 5, `REQ-KOT` · **Traced by:** `TST-E2E-01`, `UX-SCR-05`
**Blocked by:** DEC-006 (printer hardware)

---

## Flow

**Trigger:** order reaches `CONFIRMED`
**Actors:** system (routing) · Kitchen User (`kot.update`)

```
Order CONFIRMED
      ↓
Split items by station route            ← station_routes: item/category → station
      ↓
Create one KOT ticket per station       ┐ ATOMIC with order creation
      ↓                                  ┘
Push to kitchen display + printer
      ↓
Station marks items: PENDING → PREPARING → DONE
      ↓
All tickets DONE?  ──no──► wait
      ↓ yes
Order → READY
```

One order, potentially many tickets — tandoor and beverages are different physical places with different prep times. The order is READY only when every ticket is done.

---

## Ticket Lifecycle

| State | Set by | Notes |
|-------|--------|-------|
| `PENDING` | system | Created, not yet acknowledged |
| `PREPARING` | Kitchen User | Station started work |
| `DONE` | Kitchen User | All items on this ticket complete |
| `CANCELLED` | elevated role | Requires reason; wastage entry if DEC-003 automation on |

Item-level and ticket-level completion are both supported. A station can finish 3 of 4 items and the board must show it.

---

## Amendments

Order modified after KOT issued:

```
Item added / changed post-KOT
      ↓
Generate DELTA ticket marked AMENDMENT
      ↓
Print/display alongside original
```

**Never a silent replacement.** The kitchen already started cooking from the original ticket; replacing it invisibly means the wrong food gets made and nobody knows why.

---

## Reprint

```
Reprint requested
      ↓
Increment reprint_count on the SAME ticket
      ↓
Write audit row (who, when, why)
      ↓
Re-send to printer/display
```

Reprint never creates a new ticket. A duplicate ticket means the dish gets cooked twice — a real, expensive, food-wasting bug.

---

## Failure Paths

| Failure | Behavior |
|---------|----------|
| Printer offline | Fall back to kitchen display; alert operator. **Never block the order.** |
| No station route for item | Route to default station, flag for configuration fix |
| Display disconnected | Ticket persists; board recovers state on reconnect |
| Websocket down | Degrade to polling |
| KOT creation fails | Whole order transaction rolls back (no orphan order) |

A kitchen that cannot print must still be able to cook. Every hardware failure degrades to a softer path rather than stopping service.

---

## SLA & Metrics

Board shows tickets by age with colour thresholds. Feeds `kot_performance`:

| Metric | Definition |
|--------|-----------|
| Ticket age | now − created_at, for open tickets |
| Prep duration | completed_at − created_at, per station |
| SLA breach count | tickets exceeding the configured threshold |
| Reprint rate | reprints ÷ tickets — a high rate signals a hardware or process problem |

---

## Open Decisions

| Decision | Affects |
|----------|---------|
| DEC-006 | Printer protocol (network / USB / cloud, ESC-POS profile), fallback behavior |
| DEC-003 | Whether post-KOT cancellation writes a wastage record |
