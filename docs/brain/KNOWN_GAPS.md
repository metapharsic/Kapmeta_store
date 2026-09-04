# Known Gaps and Debt

Sourced from `agents/task-board.json` (42 `TSK-*` entries at time of
writing, several still `"status": "PENDING"`). This file lists real,
currently-open gaps with their task ID and why each is unresolved — not a
generic risk register.

## TSK-027 — `order_payments` table does not exist live at all

> "order_payments table does not exist live at all (db:migrate 42P01) - two
> conflicting lineages (0004_orders.sql vs 0010_create_order_payments.sql)
> declare it with different columns, neither landed - 0043 patched to skip
> it safely (DO-block existence guard), needs its own decision+migration"
> (`agents/task-board.json:684`, `assignedTo: database-agent`, `priority:
> P1`, `relatedGate: CP-20`)

Two migration files independently tried to create `order_payments` with
different column sets; both fail to apply live (Postgres error `42P01`,
undefined table, surfacing from a downstream reference). Migration 0043
worked around it with a `DO`-block existence guard so the migration run
doesn't hard-fail, but the table itself is still absent. Unresolved because
it needs a real design decision (which lineage wins, or a merged schema)
before a repair migration can be written — not just a mechanical fix. Note
the schema currently uses `Payment`/`payments` (`kapmeta/schema.prisma:669`)
as the working payment model; `order_payments` appears to be a
never-completed second attempt.

## TSK-028 / TSK-044 — `@db.Uuid` vs live TEXT audit is incomplete

> TSK-028: "SYSTEMIC: schema.prisma has @db.Uuid on many id/FK fields
> (MenuItem, Station, InboundEvent, OutboundEvent, SyncJob,
> IntegrationError, CP-17/18/19 models etc.) but scripts/inspect-db-v2.js
> proves the ENTIRE live database uses TEXT ... only item_availability +
> ChannelAccount fixed so far ... the rest is unaudited and each @db.Uuid
> mismatch risks a Prisma-side uuid-cast error against a text column"
> (`agents/task-board.json:691-696`, P1, CP-20)
>
> TSK-044: "schema.prisma MenuItem/modifier_* still @db.Uuid, contradicts
> TEXT convention - needs same audit as TSK-028" (`:854-856`, PENDING)

See `docs/adr/0009-text-ids-not-uuid.md` and
`docs/brain/BUSINESS_RULES.md` rule 5 for the full discovery. This session
fixed the id/FK types on `table_merge_groups`, `table_merge_members`,
`table_seats`, `order_seat_bills`, `order_item_seat_shares`, `KOTItem`
(outlet/seat columns only), and `Customer` (`organization_id` only) — each
carries an in-schema comment recording the fix and explicitly says which
sibling columns were left alone as "out of scope, see TSK-028"
(e.g. `kapmeta/schema.prisma:576-580` for `KOTItem`: "kotTicketId/
menuItemId/orderItemId left @db.Uuid: not directly confirmed this pass").
`MenuItem`, `Station`, `InboundEvent`, `OutboundEvent`, `SyncJob`,
`IntegrationError`, and the modifier tables are all still `@db.Uuid` in the
schema and have not been directly confirmed against the live DB. This is
real, live audit debt: each unconfirmed `@db.Uuid` column risks a Prisma
`uuid`-cast error the moment a query touches a text-actual column typed as
uuid.

## TSK-029 — customers/modifier_groups/recipes/purchase_order_items repair (0046-class)

> "DB: repair customers/modifier_groups/recipes/purchase_order_items (0046,
> edited-after-applied class)" (`agents/task-board.json:699` area)

Grouped with the TEXT/UUID repair series; same root cause as TSK-028 —
tables edited after their original migration already applied live, so the
Prisma schema and the live DDL drifted.

## Reconciliation and Payment History — honestly stubbed, no backing schema

> "Payment History tabs (swiping/MDR/hardware/deposit/invoices/ledgers) +
> reconciliation status-mismatch/variance/rejected/final have no real
> backing schema, honestly stubbed" (`agents/task-board.json:838-842`,
> `assignedTo: unassigned`, `priority: LOW`, `relatedGate: CP-23`)

No tables back these UI tabs at all (not even a partial/placeholder table
— confirmed absent from `kapmeta/schema.prisma`). Marked explicitly
"honestly stubbed" rather than backed by fabricated data, consistent with
this repo's stated rule (referenced elsewhere in the task board as
"AGENTS.md Rule 1") against inventing fake data for unbuilt features.
Priority LOW and unassigned — deprioritized relative to the P1 TEXT/UUID
and `order_payments` gaps above.

## Other real, currently-open PENDING items worth knowing about

- **No file-upload/object-storage backend** anywhere in the repo —
  `images-upload.tsx` and `physical.tsx` cannot persist real files, only
  URL-paste (`agents/task-board.json:468-470`).
- **Zomato/Swiggy sync status is a placeholder** — `ChannelAccount` has no
  `lastSyncedAt` or store-URL field to source the sync banner / "Visit
  Store" button from real data (`:524-526`).
- **Two parallel purchase-order backends** — `/inventory/purchase-orders`
  (raw CRUD, used by the live UI) vs. `purchase.ts`/`services/purchase`
  (a real state-machine domain service, unused by any UI) — needs a
  consolidation decision, not yet made (`:604-606`).
- **`prisma generate` cannot run in the cloud sandbox** (403 fetching the
  query-engine binary, no network path) — `report_notifications` has no
  Prisma delegate; routes use a raw-query workaround until a real
  environment can run `prisma generate` once (`:790-792`).
- **`finance.ts GET /refunds` returns hardcoded `reasonCode`/`status`
  literals** because `order_refunds` has no such columns — spotted, not
  fixed, flagged as a possible Rule 1 (no-fake-data) violation needing a
  design decision (`:750-752`).
- **Variants and Discounts tabs have zero backend** on the Manage Menu
  page; Addons/Taxes have real backend but no frontend page yet — both
  marked "coming-soon" rather than faked (`:532-534`).
- **Explore Products / Audit Trail / Device Mapping** — stub pages only,
  no real backend (`:814-816`).

Anything not listed above and not found in `agents/task-board.json` as
`PENDING` is not claimed as a gap here — this file only restates debt this
session actually found documented, not a general audit.
