# TS-WF — Workflow Failures

**ID:** TS-WF · **Status:** DRAFT · **Owner:** SRE + Ops · **Version:** 1.0 · **Updated:** 2026-08-08

A process stalls. The data is fine, the app is up, but the workflow does not advance.

---

## TS-WF-01 — Order Stuck In A Status

Find where it actually is before assuming:

```sql
SELECT from_status, to_status, actor_id, reason_code, created_at
FROM order_status_history WHERE order_id = $1 ORDER BY created_at;
```

| Stuck at | Waiting on | Check |
|----------|-----------|-------|
| `PLACED` | Payment policy (prepaid channels need capture first) | `payments` for that order |
| `CONFIRMED` | KOT generation | `kot_tickets` exist? Same transaction should have created them |
| `KOT_CREATED` | Kitchen acknowledgement | Board reachable? Consumer alive? |
| `IN_PREPARATION` | All tickets DONE | Any ticket still open blocks READY |
| `READY` | Rider assignment (delivery only) | Assignment flow |
| `OUT_FOR_DELIVERY` | Delivery confirmation | Channel callback received? |

**Most common:** one KOT item on one station never marked done, so the order never reaches READY. The board shows it; nobody looked at that station.

```sql
SELECT t.id, s.name AS station, t.status, i.status AS item_status
FROM kot_tickets t
JOIN kitchen_stations s ON s.id = t.station_id
JOIN kot_items i ON i.ticket_id = t.id
WHERE t.kitchen_order_id = $1 AND i.status <> 'DONE';
```

Never fix by writing `orders.status` directly. Drive the transition through the API so history, guards and audit all fire.

---

## TS-WF-02 — KOT Not Printing

```
Ticket exists in DB?  ──no──► order→KOT transaction failed. See TS-DB.
      │ yes
Ticket on the kitchen display?  ──no──► realtime/consumer issue. See TS-APP-06.
      │ yes
      ▼
Printing only is broken → printer layer
```

| Cause | Check | Note |
|-------|-------|------|
| Printer offline | Printer status, network | **Must not block the order** (`WF-KOT-01`) |
| No station route for the item | `station_routes` for that item/category | Falls back to default station, flags config |
| Print queue stalled | Adapter logs, `logs/integration/` | |
| Wrong printer mapped | `kitchen_stations` config | |

If the order was blocked because printing failed, that is a defect against `WF-KOT-01`, not just an incident. A kitchen that cannot print must still be able to cook.

**Do not re-place the order to get a ticket.** Use reprint — it increments `reprint_count` and audits. Re-placing cooks the dish twice.

---

## TS-WF-03 — Payment Captured But Order Not Updated

The dangerous one. Money moved, the system disagrees.

```sql
SELECT p.id, p.status, p.amount_minor, p.gateway_txn_id, p.created_at,
       o.status AS order_status
FROM payments p LEFT JOIN orders o ON o.id = p.order_id
WHERE p.gateway_txn_id = $1;
```

| Finding | Meaning | Action |
|---------|---------|--------|
| Payment row exists, order not updated | `payment.captured` event not consumed | Check consumer + DLQ. Replay. |
| No payment row, gateway says captured | Webhook never processed | Check `inbound_events`. Replay from raw. |
| Two payment rows, same `gateway_txn_id` | `uq_payments_gateway_txn` missing | **S1.** Possible double capture. |
| Payment row, no order | Order creation rolled back after capture | **S1.** Refund required. |

**Never manually insert a payment row to "make it match".** Replay the event so every downstream consumer fires in order. A hand-written row skips invoice generation and reporting, and the mismatch resurfaces at day-end.

Escalate any money mismatch to S1 immediately. Do not investigate alone.

---

## TS-WF-04 — Shift Will Not Close

| Blocker | Check | Resolution |
|---------|-------|-----------|
| Open orders remain | Orders not `COMPLETED`/`CANCELLED` for the shift | Close or cancel them properly |
| Unsettled payments | Captured but unreconciled | Finance decision |
| Cash variance beyond tolerance | Blind count vs expected | Manager override + audit reason |
| Prior shift never closed | Shift table | Close in sequence |

Shift close is a control point. If it can be bypassed silently, the cash control is theatre. A forced close must require elevated permission, a reason, and an audit row.

---

## TS-WF-05 — Day-End / Z-Report Will Not Run

| Blocker | Check |
|---------|-------|
| Open shifts | All shifts closed for the business date? |
| Open orders | Orders still in progress past the business day boundary |
| Missing invoices | Completed orders without an invoice row |
| Business day boundary confusion | `fn_business_date` vs `created_at::date` |

**Business day is not calendar day.** A 1 a.m. order belongs to the previous business day. A report using `created_at::date` will disagree with the Z-report every single night, and the discrepancy gets blamed on the backend.

---

## TS-WF-06 — Menu Change Not Reflected

```
Change saved in DB?         item_availability.version incremented?
      ↓ yes
Sync job created?           sync_jobs row exists?
      ↓ yes
Adapter sent it?            logs/integration/outbound-*.log
      ↓ yes
Channel accepted?           response persisted, status
```

| Status | Meaning |
|--------|---------|
| `Synchronized` | Applied on the channel |
| `Pending` | Queued, not yet sent |
| `Failed` | Rejected — retry available in `UX-SCR-18` |

**Highest-severity case: internal OFF, channel still ON.** Customers can order something the kitchen will not make. Treat a failed OFF-push as an incident, not a warning (`WF-MNU-01`).

Stale-version responses are discarded by design. If a change appears to "revert", check whether an older version response was correctly ignored — that is the system working.

---

## TS-WF-07 — Cancellation Rejected

| Reason | Expected |
|--------|----------|
| Insufficient permission | Post-KOT cancellation needs an elevated role — working as designed |
| No reason code supplied | Mandatory. Working as designed. |
| Order already `COMPLETED` | Use refund, not cancellation |
| Wastage entry failed | Only if DEC-003 automation is on |

Most "cancellation broken" reports are the permission model working correctly. Verify the operator's role before treating it as a bug.

---

## Escalate When

- Money captured but not recorded → **S1**
- Duplicate payment rows → **S1**
- Orders cannot be placed → **S1**
- Kitchen cannot see tickets at all → **S2**
- Channel shows an item as available that is internally OFF → **S2**
