# apps/pos-web

Kapmeta POS web frontend — React + TypeScript. Built against a typed API
client interface so it does not depend on the backend services agents
(services/orders, services/tables, services/tax, services/settings,
services/printing, services/admin) being merged yet.

## Structure

```
src/
  api/
    types.ts       Types mirroring the /contracts/*.yaml API shapes
                    (Order, OrderItem, RestaurantTable, MenuCategory,
                    MenuItem, OrderStatus, OrderType, ...).
    ApiClient.ts    KapmetaApiClient interface (listTables, createOrder,
                    addOrderItem, printBill, printKot, ...) plus
                    InMemoryMockApiClient, a mock implementation for local
                    dev and tests only.
  shell/
    AppShell.tsx            Persistent top bar (New Order CTA, Bill No /
                             KOT No search, Item On/Off, Store, Live View,
                             Orders, Recent, Hold, Alerts, Zomato Help,
                             Logout, support phone). Every screen mounts
                             inside its content area.
    AppShell.module.css     Shell layout styles, using local CSS custom
                             properties as token fallbacks.
  screens/
    TableFloorView/
      TableFloorView.tsx   Fetches tables via ApiClient, groups by zone,
                            renders TableCard per table. Add Table /
                            Delivery / Pick Up buttons + Move KOT/Items
                            mode toggle.
      TableCard.tsx         Individual table card (status color, elapsed
                             minutes, running amount).
    OrderEntry/
      OrderEntry.tsx        Category rail + item grid from
                             ApiClient.listMenu() (never hardcoded).
      OrderTicket.tsx        Right-side ticket: order-type tabs, customer
                             fields (Delivery/Pick Up only), item list,
                             footer actions.
  lib/
    getTableStatusColor.ts  Pure status -> color mapping function, used by
                             TableCard and independently unit-tested.
test/
  getTableStatusColor.test.ts               Vitest unit tests, all
                                             status/kotSent combinations.
  OrderEntry.conditional-fields.test.tsx    RTL test proving customer
                                             fields render only for
                                             delivery/pickup, not dine_in.
```

## What is real vs. mock-for-now

- **Real**: every component under `src/shell` and `src/screens`, the pure
  `getTableStatusColor` function, and the `KapmetaApiClient` TypeScript
  interface. These compile against React 18 + TypeScript and are exercised
  by the vitest/RTL tests in `test/`.
- **Mock-for-now**: `InMemoryMockApiClient` in `src/api/ApiClient.ts` is
  explicitly commented as mock data for local development and tests only.
  It is never used in production. **The real HTTP implementation of
  `KapmetaApiClient` is out of scope for this agent** and must be wired up
  by a future integration pass once the backend services agents'
  (orders/tables/tax/settings/printing/admin) work is merged — at that
  point a `HttpApiClient implements KapmetaApiClient` should be added
  alongside `InMemoryMockApiClient` and swapped in at the app root.

## Running tests

```
npm install
npm test
```

## Notes / follow-ups for the integration pass

- `OrderEntry`'s order-type tab switch currently only updates local state;
  there is no dedicated "update order type" endpoint in the current
  contract draft, so wiring that to the real API is left for integration.
- `AppShell.module.css` defines local CSS custom properties as fallbacks
  for colors/spacing; once `packages/ui-kit/tokens.json` is published,
  those values should be sourced from there instead (property names are
  kept stable to make that swap a no-op).
