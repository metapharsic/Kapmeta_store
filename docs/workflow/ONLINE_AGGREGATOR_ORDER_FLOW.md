# Online Aggregator (Swiggy / Zomato) Order Flow

Real trace of the channel/aggregator order feed, worked as CP-20 this
session (commits `903e9df`, plus amendments `71cea08`, `286d542`,
`de4c51a`). This doc uses CP-20 as the worked example the task asked for:
what broke, what was found, what was fixed.

## The pieces

- `channel_accounts` — one row per connected aggregator connection for an
  outlet (Swiggy, Zomato, ...), linked to `integrations` via
  `integration_id`.
- `integrations` table — added in this round; represents the aggregator
  integration itself (as distinct from a per-outlet channel account).
- `apps/api/src/routes/integration.ts` (530 lines) — `GET /integration/channel-items`
  (aggregator order feed screen's data source), `POST/GET /channels`,
  `POST /integrations/mappings`, and the webhook ingestion route
  `POST /webhooks/:channel` (aliases `/webhooks/swiggy`, `/webhooks/zomato`)
  at line 296.
- `GET /orders/online` (`apps/api/src/routes/orders.ts`) — the admin-facing
  online-orders list.

## What broke (user report: "Could not reach the aggregator order feed")

`GET /integration/channel-items` is the very first call the aggregator
order feed screen makes. It threw Postgres error `P2022` —
`channel_accounts.integration_id does not exist` — in the first query in
the handler (`prisma.channelAccount.findMany(...)`), so the whole screen
failed before rendering anything.

## Root cause

Same bug class already seen once this session in `TSK-020` (migrations
0018/0022): `0007_integration.sql` is written as one `CREATE TABLE` per
object inside a single `BEGIN`/`COMMIT` block, `schema_migrations` already
marks it applied, and `integration_id` is the one column missing from an
otherwise-intact live table — consistent with the column having been added
to the `CREATE TABLE` statement *after* the migration had already run once
against this database, so the live table never picked it up.

## Fix

Migration `0044`: adds the `integrations` table defensively
(`CREATE TABLE IF NOT EXISTS`) plus `channel_accounts.integration_id`
(`ADD COLUMN IF NOT EXISTS`), both idempotent; `integration_id` left
nullable rather than `NOT NULL` to stay safe regardless of existing rows.

## The pipeline audit that followed (dispatched as a second agent)

Rather than stop at the one reported symptom, a second agent was dispatched
to verify the entire aggregator pipeline. It found the bug class was much
bigger than the one screen:

- `POST /webhooks/:channel` — the actual aggregator ingestion route — 500'd
  on **every single call**, aggregator or fallback path, from three
  separate unknown-Prisma-argument errors: `business_date` on `Order`,
  `item_name` on `OrderItem`, and `customerName`/`customerPhone`/`otp`
  bundled together with real columns on the order update. None of these are
  real `schema.prisma` fields.
- `OrderStatusHistory.create` silently failed on every webhook call —
  `to_status` should have been `status`, and `outletId` was missing
  entirely — so no aggregator order ever got a status-history row (see also
  `DINE_IN_ORDER_FLOW.md` §7, which cites this same fix as the closest real
  bug touching order-status tracking this session).
- `AuditLog.create` used a nonexistent `actor_id` field with **no
  `.catch()` guard** — so it 500'd back to the aggregator *after* the order
  had already been created/confirmed, on every successful webhook. This was
  called out as "the worst kind of failure, since it looks like the order
  never landed when it actually did."
- `POST /channels` and `POST /integrations/mappings` had their own separate
  unknown-field/missing-required-field bugs, 500ing on every call.
- `GET /orders/online` selected the same nonexistent
  `customerName`/`customerPhone`/`otp` fields, which made Prisma reject the
  whole `select` clause and silently null out channel/rider/OTP too — a
  quieter failure than a 500, but one that made every online order in the
  list look anonymous.

All fixed in `integration.ts`/`orders.ts` to use real `schema.prisma` field
names, verified against the schema by hand rather than trusted blind.

A second, independent schema-drift table was found in the same pass:
`item_availability` — the table backing the channel-items screen's on/off
state — was recorded as applied in `schema_migrations` since
`0002_catalog.sql` but never fully landed live (25 occurrences of the
resulting error across the log set). Repaired via migration `0045`, same
idempotent pattern. (`availability_schedules`, also declared in `0002`, was
deliberately left alone in this pass — it backs `commission.ts` /
`menu-scheduling.ts`, an unrelated flow, and was tracked separately as
`TSK-025`, closed later in the CP-20 amendment-3 drift sweep via migration
`0050`.)

`GET /channels`'s hardcoded `"SWIGGY"` / `"EXT-001"` fallback literals were
also removed in this pass — leaving them in would have mislabeled a real
Zomato connection as Swiggy in the UI, a direct violation of this session's
"never fabricate data" convention (`.agents/AGENTS.md` Rule 1).

## Amendments (real DB runs surfaced two more layers)

- **CP-20 amendment 1** (`71cea08`-adjacent): the user's real
  `npm run db:migrate` run caught `0043` failing outright (`42P01`,
  `order_payments` does not exist) — two conflicting migration lineages for
  that table, neither landed. `0043`'s `order_payments` ALTERs were wrapped
  in an `information_schema`-existence guard so they skip safely instead of
  aborting the whole migration.
- **CP-20 amendment 2** (`de4c51a`, `71cea08`): `0045` failed again with a
  `42804` FK type mismatch — every id/outlet_id/item_id column across the
  entire live database was confirmed TEXT (via `scripts/inspect-db-v2.js`),
  contradicting every migration file's declared UUID. This overturned an
  earlier CP-19 "fix" that had converted some columns back to UUID — that
  earlier change was itself wrong, just harmless because the tables in
  question had already landed TEXT. `0045` rewritten TEXT throughout;
  `@db.Uuid` removed from the two Prisma models on this flow's direct path
  (`item_availability`, `ChannelAccount` — keeping `integration_id`'s
  `@db.Uuid`, which is genuinely correct since `integrations.id` really is
  uuid, created that way by `0044`).
- **CP-20 amendment 3** (`286d542`): a wider drift sweep found a third bug
  sub-class — migrations that are internally fine but declare a real
  foreign key of type UUID against a table whose live id is TEXT, which
  Postgres rejects at DDL time and rolls back the *entire* transaction,
  including unrelated `ADD COLUMN IF NOT EXISTS` statements in the same
  migration file. Six repair migrations (`0046`-`0051`) landed from this
  sweep.

## Net result

The aggregator feed screen, the webhook ingestion route, the channel/mapping
admin routes, and the online-orders list are all now using real
`schema.prisma` field names and idempotent, TEXT-consistent migrations. The
user still needs to run `npm run db:migrate` for `0044`/`0045` (and later
`0046`-`0051`) and restart the API — none of this session's DB work could
be verified against a live Postgres instance from the sandboxed dev shell
(`ECONNREFUSED 127.0.0.1:5432` throughout).
