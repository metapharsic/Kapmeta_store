# DECISION-0002: Generic `management_lists`/`management_settings`/`management_activity_logs` Instead of One Table Per Admin Screen

**Status:** Accepted
**Date:** 2026-09-03 (migration `0053_create_management_tables.sql`)
**Deciders:** Backend/Database agents (this session)
**Related:** `docs/brain/DOMAIN_MODEL.md` (Generic management tables
section), `docs/decision/0001-text-ids-not-uuid.md`

## Context

The Admin/Management surface of this app accumulated a growing number of
small, low-traffic settings and reference-data screens over this session's
build-out (things like dropdown option lists, per-outlet toggle settings,
and free-form activity/audit feeds for various admin panels). Each one, in
isolation, is a tiny CRUD surface: a handful of key/value rows or log
lines, scoped to one outlet, with no complex relational structure of its
own.

## Options Considered

- **Option A (rejected): One bespoke table per screen.** E.g. a
  `printer_settings` table, a `discount_reason_codes` table, a
  `staff_shift_notes_log` table, etc., each with its own migration, its
  own Prisma model, its own CRUD route file. This is the "correct" DDD-ish
  answer for any one screen in isolation, but multiplied across many small
  admin screens it means a proportional multiplication of migrations,
  Prisma models, and near-identical CRUD route boilerplate for data that
  has no real schema of its own beyond "a label/value pair" or "a log
  line."
- **Option B (accepted): Three generic, outlet-scoped catalog tables.**
  `management_lists` (`kapmeta/schema.prisma:1737-1751`) — one row per
  option in some named list (`list_key`, `label`, `value`, `extra` JSON,
  `sort_order`, `is_active`), `management_settings` (`:1753-1763`) — one
  row per outlet per named settings blob (`settings_key`, `data` JSON,
  unique on `[outlet_id, settings_key]`), and
  `management_activity_logs` (`:1765-1775`) — an append-only, indexed
  (`[outlet_id, log_type, created_at desc]`) generic activity/audit feed
  (`log_type`, `actor_id`, `message`, `meta` JSON).
- **Option C (rejected): One giant polymorphic table with a `type`
  discriminator column and no per-type schema at all.** Would have
  collapsed all three concerns (lists, settings, logs) into one table.
  Rejected because the three have genuinely different access patterns
  (lists are read/reordered together by `list_key`; settings are a
  singleton per key; logs are append-only and time-ordered) that a single
  undifferentiated table would obscure.

## Decision

Build the three generic tables (Option B) and route new small admin
screens through them via `list_key`/`settings_key`/`log_type`
discriminators plus a `Json` payload column (`extra`/`data`/`meta`) for
whatever shape that particular screen's data actually needs, rather than
minting a new migration and Prisma model per screen.

## Consequences

- **What becomes easier:** a new small admin/settings screen needs zero
  new migrations or Prisma models — just a new `list_key`/`settings_key`/
  `log_type` value and a route that reads/writes the generic table. This
  matched the pace this session needed to ship several small admin
  screens without each one becoming its own schema-design exercise.
- **What becomes harder:** the JSON payload columns (`extra`, `data`,
  `meta`) have no schema-level validation — malformed or inconsistent
  shapes per `list_key`/`settings_key` are only caught (if at all) at the
  application layer, not the database layer. Querying or reporting across
  a specific `list_key`'s `extra` field requires knowing that key's
  implicit shape; there's no way for the database itself to enforce or
  document it. This is a deliberate trade of schema rigor for build
  velocity on genuinely low-complexity screens — it is the wrong choice
  for any screen whose data actually has real relational structure
  (which is why `Order`, `KOTTicket`, `Payment`, etc. remain fully
  bespoke, first-class models rather than being routed through these
  tables).
- **Commitment:** these three tables stay reserved for genuinely generic,
  low-structure admin data. A screen whose data grows real relational
  needs (foreign keys to other domain entities, uniqueness constraints
  beyond `[outlet_id, key]`, queries that need to join across payload
  fields) should graduate out to its own bespoke table rather than being
  forced to stay in `management_lists`/`management_settings`.
