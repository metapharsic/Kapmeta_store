# Dine-In Order Flow

Real end-to-end trace of a dine-in order through this codebase, from table
selection on the floor plan to the printed bill. Every file/route named here
exists in the repo as of commit `67fde89`; nothing in this trace is
speculative.

## 1. Table selection — `apps/pos-web/components/TableViewFloor.tsx` (1111 lines)

The captain/cashier opens the floor plan and taps an occupied or vacant
table. This component is the canvas for the whole seat/merge subsystem built
in CP-10 (`table_merge_groups`, `table_merge_members`, `table_seats` —
migrations 0028-0037, 0047). Selecting a table hands its id to
`PosBillingView.tsx`, which becomes the active order surface for that table.

## 2. Order creation — `apps/pos-web/components/PosBillingView.tsx` (2263 lines)

This is the single largest UI component in the app. It renders the item
grid, the running ticket, and the mode tabs (`DINE_IN` / `DELIVERY` /
`PICKUP` / `TAKEAWAY`) that were enabled end-to-end in CP-25. For a dine-in
order the active `diningTableId` is carried on every line add. Confirming
the order (or adding items to an already-confirmed one) calls
`POST /orders` (dine-in) or `PATCH /orders/:id/items` (adding to a live
ticket).

## 3. Order creation route — `apps/api/src/routes/orders.ts` (1489 lines)

`POST /orders` uses the same `createOrder` domain function
(`apps/api/src/domain` price-lookup + repository pattern) that the public
customer app's `public-order.ts` also calls — one order-creation path, two
callers. It resolves the JWT's `outletId`, prices every line server-side
(never trusts a client-sent price — see `public-order.ts` comment at line
114, "price is intentionally never accepted"), and persists the order with
its `diningTableId`. `orders.ts` is also where CP-11's `TSK-008j` permission
sweep landed — before that round every mutating route here (create, void,
hold, fire, charges, payments) had zero `requirePermission` checks, only
`requireAuth`. That gap is closed.

## 4. KOT creation — `apps/api/src/orchestration/order-lifecycle.ts` (73 lines)

`onOrderConfirmed(orderId, prisma)` is the hinge between "order exists" and
"kitchen knows about it":

- Loads the order with its `orderItems`.
- Diffs against `KOTItem` rows already linked to this order (by
  `orderItemId`) so re-confirming an order with items already ticketed does
  not double-fire the kitchen — only genuinely new, non-voided lines become
  a KOT.
- Calls `createKot(...)` from `@kapmeta/kitchen` (`services/kitchen/src/kot-service.ts`),
  writing a `KOTItem` row per line at status `QUEUED`, grouped into a
  `kot_ticket` (see `prisma-kot-repository.ts`).
- If the order has a `diningTableId`, stamps the merge label
  (`stampOrderMergeLabel`, `./table-merge.ts`) and broadcasts three
  WebSocket events on the outlet channel: `kot.created`, `order.updated`,
  `table.status_updated` (table flips to `OCCUPIED`).
- `onItemsAdded` is a thin alias of the same function — adding items to an
  already-open dine-in ticket goes through the identical KOT-diff logic.

`createKot` failures are caught and logged, not thrown — a KOT failure never
rolls back the order itself.

## 5. Kitchen display — `apps/pos-web/pages/kitchen.tsx` (208 lines) + `apps/api/src/routes/kitchen.ts` (670 lines)

`GET /kitchen/kot` (line 70 of `kitchen.ts`) is deliberately live-only: open
tickets (`QUEUED`/`PREPARING`/`READY`) plus a short recall grace window
(`status: SERVED, servedAt > recallCutoff`, `RECALL_GRACE_WINDOW_MS` from
`@kapmeta/kitchen`) so a chef can un-serve a just-completed ticket by
mistake. `kitchen.tsx` polls this endpoint — the same 15-second poll
convention CP-24 later reused for `waiter.tsx`'s menu refresh (see
`WF-MNU-menu-management-as-built.md`). A separate history view exists at
`GET /kitchen/kot/history` (line 217) for closed tickets, surfaced via
`KotHistoryView.tsx` / `/kitchen?view=list` (added in CP-16).

## 6. The real state machine

Defined once, in `services/kitchen/src/kot-service.ts` (compiled form
visible at `services/kitchen/dist/packages/shared-types/kitchen.js:13-16`):

```
QUEUED    -> [PREPARING, CANCELLED, MODIFIED, SHIFTED]
PREPARING -> [READY, CANCELLED, MODIFIED, SHIFTED]
READY     -> [SERVED, CANCELLED, MODIFIED, SHIFTED]
SERVED    -> []   // terminal
```

`transitionKot(kotTicketId, toStatus, repository, userId, reasonCode)` is
the only way a KOT status changes. It is exercised by a real unit suite
(`services/kitchen/src/kot-service.test.ts`, confirmed compiled at
`kot-service.test.js`): `QUEUED->PREPARING` legal, `PREPARING->READY`
legal, `READY->SERVED` legal, `QUEUED->READY` illegal (no skipping stages),
`SERVED->anything` illegal (terminal), and same-state transitions
(`READY->READY` etc.) illegal.

The chef advances a ticket via `PATCH /kitchen/kot/:kotTicketId/status`
(`kitchen.ts` line 342). This route:
1. Checks permission (`kot.status.update`, `order.create`, or `kot.read` —
   any one is accepted, `checkPermissionDirect`, line 349).
2. Calls `transitionKot`; a `409` with `{from, to}` on an illegal jump, a
   `404` if the ticket doesn't exist.
3. Cascades the KOT-level status up to the parent Order's derived "stage"
   (`FOOD_READY` if any sibling KOT is `READY`, `COOKING` if any is
   `PREPARING`/`COOKING`/`IN_PREPARATION` — lines 396-404) and broadcasts
   `kot.status_updated`, `order.status_updated`, `table.status_updated`.

## 7. Related fix this session: aggregator status-history bug (CP-20)

The state machine transition logic itself (`transitionKot` /
`isKotTransitionLegal`) was not found broken this session — its dedicated
test suite passed unmodified. The real, adjacent bug fixed in CP-20 (commit
`903e9df`) was in the *status audit trail* that sits next to this flow:
`OrderStatusHistory.create` was silently failing on every write because the
Prisma call used field names that do not exist on the model — `to_status`
instead of the real `status` column, and a missing `outletId`. That meant no
aggregator order ever accumulated a status-history row, even though the KOT
state machine itself kept working correctly. Fixed in
`apps/api/src/routes/integration.ts`/`orders.ts` to use the real
`schema.prisma` field names, verified by hand against the schema (not just
trusted) per that round's STATUS.md entry.

## 8. Settlement — `apps/api/src/orchestration/settle-order.ts` (301 lines)

Once every KOT on the order reaches `SERVED` (or is voided), the cashier
settles the bill from `PosBillingView.tsx`. `settleOrderCommand` is the
single settlement path — CP-10 P2's per-seat settlement
(`POST /orders/:id/seats/:seatNumber/settle`) explicitly converges into this
same command once all seats clear rather than being a parallel settlement
path (documented in that round's STATUS.md entry, 2026-09-01 CP-10 P2). This
is also where the CP-10 D3 fix landed: split-bill previously floored paise
away; it now uses a largest-remainder split so parts always sum exactly to
the original total.
