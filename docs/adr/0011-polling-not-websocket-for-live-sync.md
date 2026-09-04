# ADR-0011: Live Sync Is WebSocket-Primary With a `setInterval` Polling Backup — Not Polling-Only

**Status:** Accepted (documents actual behavior; corrects an incorrect
premise this decision was originally framed under — see Correction below)
**Date:** 2026-09-04
**Deciders:** Frontend/Backend agents (this session)
**Related:** `docs/03-architecture/system-overview-as-built.md`,
`docs/brain/BUSINESS_RULES.md`

## Correction to the original framing

This entry was requested on the premise that "no socket.io/SSE/WebSocket
exists in this app, live sync uses setInterval polling." That premise is
**false** and this session's own code disproves it: `apps/api/src/
websockets.ts` implements a real `ws`-based WebSocket server
(`WebSocketServer`, `setupWebSockets(server)`, JWT-authenticated on the
`/ws` upgrade path — lines 1-33), and `apps/pos-web/lib/
useKapmetaSocket.ts` is a real client hook consuming it, subscribed to a
documented topic set (`FLOOR_EVENT_TOPICS`, lines 4-20: `table.*`, `kot.*`,
`order.*`, `finance.*`, `inventory.stock_updated`, `menu.*`,
`item.availability_changed`). Both `kitchen.tsx` and `waiter.tsx` call
`useKapmetaSocket(...)` (`kitchen.tsx:77`, `waiter.tsx:730`). The real,
verified architecture is documented below instead of the false premise.

## Context

`kitchen.tsx` (KOT board) and `waiter.tsx` (waiter tablet) both need to
reflect state changes made elsewhere (a new KOT fired from the POS
terminal, an item 86'd from the admin menu page, another waiter serving a
ticket) with low latency, without every client polling the database
directly.

## What's actually there

- **Primary channel: authenticated WebSocket.** `apps/api/src/
  websockets.ts` upgrades `/ws` connections after verifying a JWT
  (`verifyAccessToken`, lines 26-27) and tags each socket with the caller's
  `outletId` (line 30) so events can be scoped per outlet. `apps/pos-web/
  lib/useKapmetaSocket.ts` reconnects with a retry timer on drop (`connect`
  function, referenced from line ~36 onward) and dispatches every incoming
  `{topic, data}` payload to the caller's `onEvent`.
- **`kitchen.tsx`:** the comment directly above its effect block reads
  "Long-lived socket + backup poller + clock tick" (`apps/pos-web/pages/
  kitchen.tsx:75`). `useKapmetaSocket` triggers `fetchTickets()` on any
  relevant event (lines 77-82); a separate `setInterval(fetchTickets,
  30000)` (line 88) runs alongside it as a backup, plus a 1-second
  `setInterval` purely for the on-screen clock (line 89) — unrelated to
  sync.
- **`waiter.tsx`:** same pattern. `useKapmetaSocket` drives immediate
  updates (from line 730), and a separate 15-second `setInterval` (line
  705) independently re-fetches tables, KOTs, and — specifically —
  **menu** (`fetchMenu()`), with an inline comment explaining why: "Menu
  items/categories/prices/availability are edited from the admin menu page
  ... on a different device/tab; without this the waiter tablet only ever
  sees the menu as it was at page load" (lines 710-714). The same comment
  explicitly frames this as "Same polling cadence/pattern as the rest of
  this app ... rather than inventing a new transport" — i.e. the polling
  interval was a deliberate, acknowledged choice for menu-freshness, made
  even though the socket channel already exists.
- **Same-tab-only custom event, confirmed this session:**
  `apps/pos-web/components/ItemToggleModal.tsx:124` dispatches a
  `window.dispatchEvent(new CustomEvent("item-availability-changed", ...))`
  on the 86-toggle action; `waiter.tsx:694` listens for it
  (`window.addEventListener("item-availability-changed", ...)`). This is a
  `window`-scoped DOM `CustomEvent`, not `BroadcastChannel` or any
  cross-device mechanism — it only fires within the same browser tab/
  document that dispatched it. If the 86-toggle happens on the admin
  device and the waiter tablet is a different device (the real deployment
  shape — waiter tablets vs. an admin terminal), this custom event never
  reaches the waiter tablet at all; the waiter tablet's own copy of that
  same code path never runs `dispatchEvent` for a change made elsewhere.
  Cross-device 86-toggle propagation to the waiter tablet in practice
  relies on the WebSocket `item.availability_changed` topic and/or the
  15-second `fetchMenu()` poll, not this custom event.

## Decision

Accept the WebSocket-primary/polling-backup pattern as-is: keep the socket
as the low-latency channel, keep the interval-based re-fetch as a
deliberate safety net (covers the socket-drop window during its retry
backoff, and — per the `waiter.tsx` comment — explicitly covers
menu-freshness against edits made on a different device/tab), and do not
extend the `item-availability-changed` same-tab `CustomEvent` into a
cross-device signaling mechanism; that job is already covered by the
socket topic of the same name plus the poll.

## Consequences

- **What becomes easier:** the socket gives near-real-time updates for the
  common case; the polling backup means a socket outage degrades to "stale
  by at most one interval" rather than "stale forever," so no client can
  go silently out of sync even if the WebSocket layer misbehaves.
- **What becomes harder / real limitation:** two sync mechanisms exist per
  screen, and their comments (not a formal spec) are currently the only
  place documenting why both exist and what each backstops — a future
  change to one (e.g. removing the "redundant-looking" poll) could
  silently reintroduce the staleness the poll was added to prevent,
  particularly the menu-freshness case in `waiter.tsx`.
- **Real gap confirmed this session:** the `item-availability-changed`
  custom event is same-tab-only and does not reach other devices; anyone
  extending it (e.g. adding new same-tab listeners) should not assume it
  provides cross-device sync — only the socket topic of the same name and
  the interval poll do.
