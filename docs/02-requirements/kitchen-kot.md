# Kitchen / KOT — Functional Spec

**Source:** page 5 · **Coverage:** 70% · **Status:** DRAFT

## Concepts

- **Kitchen station** — a physical prep point (tandoor, chinese, beverages, dessert).
- **Station route** — rule mapping item/category → station.
- **KOT ticket** — the unit of work sent to one station. One order may produce several tickets.

## Flow

```
Order CONFIRMED
   ↓
Split items by station route
   ↓
Create KOT ticket per station (one transaction)
   ↓
Push to kitchen display + printer
   ↓
Station marks items: PENDING → PREPARING → DONE
   ↓
All tickets DONE → order READY
```

## Requirements

- KOT board shows tickets ordered by age with an SLA colour threshold
- Item-level and ticket-level completion
- Reprint with a reprint counter and audit entry — reprints never create a new ticket
- Order modification after KOT issues a **delta** ticket marked as amendment, never a silent replacement
- Cancellation after KOT requires elevated permission, a reason, and (if inventory is automated) a wastage entry
- Printer failure falls back to the display and raises an operator alert — a failed print never blocks the order

## Metrics

Feeds `kot_performance`: ticket age, prep duration per station, SLA breach count, reprint rate.

## Open Decisions

DEC-006 (printer hardware and protocol), DEC-003 (wastage on post-KOT cancellation).
