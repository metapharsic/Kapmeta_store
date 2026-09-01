# Admin / System Configuration Service

Implements the "System Configuration" screen's destructive one-click tiles
from the reference KapMeta app (Reset Bill No., Reset Sync Code, Database
Migration, Remove All Orders/KOT, Remove Backup Files, Logs, Check Machine)
-- but safely, not as one-click actions with no confirmation.

## Why this exists

The Phase 12-15 hardening plan flagged that the captured reference app
exposes these tiles as simple one-click actions with no visible
confirmation step. That's an easy way to nuke a live outlet's data by
accident (or via a compromised session). This service was built to close
that gap from the start rather than replicate the unsafe pattern and patch
it later.

## Safety model

Every destructive action in `AdminService` enforces all of the following
before doing anything:

1. **`confirm: true`** -- the caller must explicitly pass this flag. Its
   absence throws `ConfirmationRequiredError`.
2. **`actorId` + `role: 'admin'`** -- the caller's `ActorContext` must have
   admin role. Any other role throws `ForbiddenError`, even with
   `confirm: true`.
3. **Audit log entry** -- every successful destructive action is written to
   `AdminAuditLog`, an append-only log reusing the same shape as the
   Orders service's audit-log pattern: `actorId`, `action`, `beforeVal`,
   `afterVal`, `at` (plus `outletId`, since every action here is
   outlet-scoped).
4. **Double-confirm phrase for the single most destructive action** --
   `removeAllOrdersAndKot` additionally requires `doubleConfirmPhrase` to
   exactly equal the outlet's name (the common "type the name to confirm"
   UX pattern), on top of `confirm: true` and the admin-role check. A
   mismatch throws `InvalidConfirmationPhraseError`.
5. **Archive, not hard-delete, by default** -- `removeAllOrdersAndKot` does
   not permanently delete anything. It calls into an injected
   `OrdersArchiver` (the Orders service owns the real order/KOT records)
   to move live orders/KOT into an archived store, and keeps a local
   record of what was archived for admin-side visibility. A true
   hard-delete / purge should be a separate, even more tightly gated
   operation (e.g. only run by a scheduled retention job), not something
   this admin action performs directly.
6. **Backup retention floor** -- `removeBackupFiles` always keeps at least
   one backup for the outlet. If the caller's `backupIds` includes the
   single most-recent backup, that id is silently excluded from removal,
   a warning is logged, and the response reports `skippedMostRecent: true`
   so the caller/UI can surface it.

The role gate is centralized in `AdminAuthGuard.ts` (`requireAdminRole` /
`requireRoleAtLeast`) rather than duplicated per method, so every
destructive action goes through the same check.

Read-only actions get a lighter, but still non-zero, gate:

- `getLogs` requires at least `role: 'manager'` (admin also allowed) --
  not open to cashiers/staff, but does not need `confirm` or an audit
  entry since it changes nothing.
- `getMachines` (the "Check Machine" sync-topology view) has no role
  restriction beyond being an authenticated staff member -- viewing which
  machine is the Main Server vs. a Client has no destructive potential.

Every audit entry also records `confirmedExplicitly: boolean`, so audit
consumers never have to infer "was this explicitly confirmed?" from the
mere presence of a successful record -- it's an explicit field.

## Per-outlet isolation (bill_no / kot_no)

`bill_no`/`kot_no` sequences are per-outlet-local by design (this is
exactly why the sequence lives keyed by `outletId` in the Orders service).
`resetBillNo` only ever touches the target outlet's counter via the
injected `BillKotSequenceResetter` interface -- it never reaches into or
affects any other outlet's sequence. See the cross-outlet isolation test
in `test/AdminService.test.ts`.

## Check Machine / LAN sync topology

`getMachines` models the real LAN topology per outlet: one Main Server
plus one or more Client Machines, each tracked as a `MachineInfo` with an
`ip`, `isSelf` (true for the machine issuing the request), and
`lastSeenAt`. `isOnline` is **computed at read time** against a freshness
window (`MACHINE_FRESHNESS_WINDOW_MS`, 30s) rather than stored as a
persisted fact, so a machine that stops heartbeating shows as offline the
moment it goes stale without any extra polling job. Each machine calls
`registerMachineHeartbeat` periodically to keep itself marked fresh.
(`checkMachines` remains as a deprecated alias for `getMachines`.)

## Backups

`BackupService.createBackup` / `.listBackups` are the read/append-only
half of backups -- creating or listing a backup needs no confirm/role
gate (documented placeholder for a real `pg_dump`-style job; see the
file header in `BackupService.ts`). Removing backups is the destructive
half and lives on `AdminService.removeBackupFiles`, which is why it
carries the full `confirm` + admin-role + audit treatment above.

## Dependency injection, not reimplementation

The real bill/kot sequence, the real order/KOT records, and the real
migration execution engine all live in other services (Orders service,
migration infra). `AdminService` never reimplements them -- it depends on
narrow interfaces (`BillKotSequenceResetter`, `OrdersArchiver`,
`MigrationRunner`, `OutletDirectory`) injected via its constructor, so the
real implementations can be wired in without this service needing to know
their internals. Test fakes for these interfaces live alongside the tests.

## Storage

All repositories (`BackupJobsRepository`, `MachinesRepository`,
`AdminAuditLog`, logs, migration jobs, local archived-orders mirror) use
the same in-memory `Repository<T>` pattern as sibling services -- a
placeholder for Phase 2-3's Postgres schema. No hardcoded business/tenant
data is baked into this module; all outlet/actor/machine data is supplied
by callers or seeded in tests.

## Contract compliance

This closes the gap flagged in the Phase 12-15 hardening plan and
satisfies the intent of the aggregator/admin OpenAPI contract's
`confirm: true` requirement for destructive system-configuration actions.

## Running tests

```bash
npm install
npm test
```
