# Tax, Settings & Printing services

Three independently deployable, DI-friendly services implementing the
`TaxService`, `SettingsService`, and `PrintingService` contracts declared in
`services/shared/src/interfaces.ts`. Each service ships as an in-memory
repository (a documented Postgres placeholder) plus a pure service class,
fully unit-tested with vitest.

## services/tax

- `src/types.ts` — `Tax` (outlet-configurable tax row: title, calcType,
  rate, active) and `TaxChannelRule` (which tax rows + which mode apply for
  a given outlet+channel).
- `src/TaxRepository.ts` — in-memory CRUD for both.
- `src/TaxService.ts` — `computeTax({ outletId, channel, subtotalAmount })`.
  Implements both tax modes:
  - **Backward** (dine_in, pickup): `taxAmount = subtotal - subtotal / (1 + rate/100)`.
    The subtotal is tax-inclusive; tax is extracted from it.
  - **Forward** (delivery, swiggy, zomato): `taxAmount = subtotal * (rate/100)`.
    The subtotal is tax-exclusive; tax is added on top.

  The mode-per-channel mapping is a LOCKED default used only when the
  outlet hasn't configured an explicit `TaxChannelRule`; rates themselves
  are always outlet-configured, never hardcoded. Verified example: subtotal
  200, 5% total rate → backward tax ≈ 9.52 (net ≈ 190.48), forward tax =
  10.00 exactly.

## services/settings

- `src/types.ts` — `OutletBillingSettings` and `OutletPrintSettings`,
  matching the exact field lists agreed with Orders/Tables.
- `src/SettingsRepository.ts` — in-memory per-outlet store. Seeds "first-run
  defaults" only when an outlet has never been configured — these are
  explicitly commented as placeholder starting values, not business data;
  every field is changeable via admin CRUD (`updateBillingSettings` /
  `updatePrintSettings`).
- `src/SettingsService.ts` — thin get/update wrapper with `updated_at`
  bumping on every write.

## services/printing

- `src/types.ts` — `PrintDocument { type, lines: PrintLine[] }` where
  `PrintLine = { text, style }`.
- `src/PrintingService.ts` — `renderKot` / `renderBill`. Every conditional
  branches on an `OutletPrintSettings` flag (e.g. `print_cancelled_kot`,
  `print_deleted_items_inline` vs `print_deleted_items_separate`,
  `show_duplicate_marker_bill` / `_kot`, `consider_nonprepared_kot_in_bill`,
  `cwt_bifurcation`, `show_assign_label`, `highlight_orderid_mode`,
  `item_price_backward_tax_mode` + `show_backward_tax_on_bill`). The
  restaurant name, header, and footer text are read from
  `printSettings.restaurant_name` / `header_text` / `footer_text` — this
  file contains **no literal restaurant text**.

## How OrdersService is expected to consume these

Orders (built separately, against the same `services/shared/src/interfaces.ts`
contract) should depend on `TaxService`, `SettingsService`, and
`PrintingService` purely through the interfaces, injected via constructor:

```ts
class OrdersService {
  constructor(
    private readonly taxService: TaxService,
    private readonly settingsService: SettingsService,
    private readonly printingService: PrintingService,
  ) {}

  async finalizeOrder(order: DraftOrder) {
    const billing = await this.settingsService.getBillingSettings(order.outletId);
    // ... apply delivery/container/service charges & discount per billing settings ...

    const tax = await this.taxService.computeTax({
      outletId: order.outletId,
      channel: order.channel,
      subtotalAmount: order.subtotalAfterDiscount, // per tax_before_discount / backward_tax_after_discount
    });

    const printSettings = await this.settingsService.getPrintSettings(order.outletId);
    const kot = this.printingService.renderKot(toKotInput(order), printSettings);
    const bill = this.printingService.renderBill(toBillInput(order, tax), printSettings);
  }
}
```

At the composition root, concrete classes are wired up:

```ts
const taxService = new TaxService(new TaxRepository());
const settingsService = new SettingsService(new SettingsRepository());
const printingService = new PrintingService();
const orders = new OrdersService(taxService, settingsService, printingService);
```

Swapping the in-memory repositories for real Postgres-backed ones later
requires touching only `TaxRepository` / `SettingsRepository` — the service
classes and the Orders integration are unaffected because they only ever
see the DI interfaces.

## Running tests

```
npx vitest run services/tax services/settings services/printing
```

22 tests pass across the three packages as of this writing.

## Known contract-reconciliation note

`services/shared/src/interfaces.ts` was authored independently by this
service agent without visibility into any version a sibling
Orders/Tables-building agent may also be writing to the same path. A human
should reconcile any signature mismatch (e.g. `computeTax` argument shape)
before both sides are wired together.
