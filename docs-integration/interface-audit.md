# Interface Audit — Kapmeta cross-service reconciliation

Date: 2026-08-22
Author: Integration/Wiring agent

## Method

Read every file under `services/{shared,orders,tables,tax,settings,printing,admin}/src`
before making any edit, and diffed each consumer's expected shape against the
producer's actual implementation.

## Findings

### 1. PrintingService signature mismatch (the known one) — CONFIRMED

- `services/shared/src/interfaces.ts` declared its own `PrintingService`
  interface (`renderKot(order: PrintableOrder, printSettings:
  OutletPrintSettingsShape): PrintDocumentShape`) and its own
  `OutletPrintSettingsShape` with `highlight_orderid_mode: boolean`.
- The real `services/printing/src/PrintingService.ts` implements
  `IPrintingService` from `services/printing/src/types.ts`:
  `renderKot(order: KotRenderInput, printSettings: OutletPrintSettings):
  PrintDocument` / `renderBill(order: BillRenderInput, printSettings:
  OutletPrintSettings): PrintDocument`.
  - `OutletPrintSettings` (real, from `services/settings/src/types.ts`) has
    `highlight_orderid_mode: 'none' | 'background' | 'border'` — a string
    enum, not boolean.
  - `KotRenderInput`/`BillRenderInput` require fields `orderNumber`,
    `tokenNumber?`, `taxBreakdown`, `discountAmount`, `containerCharge`,
    `deliveryCharge`, `serviceCharge`, `grandTotal`, `isReprint`, and
    `items[]` with `qty`/`amount` — none of which exist on the shared
    `PrintableOrder`/`PrintableOrderItem` (`quantity`/`lineTotal`, no
    reprint/charges/breakdown fields at all).
- `services/orders/src/OrdersService.ts` built a `PrintableOrder` via
  `toPrintableOrder()` and called
  `this.printingService.renderKot(toPrintableOrder(saved), printSettings)`
  where `printingService`/`settingsService` were typed against the shared
  stub interfaces. This does not type-check against the real classes.

**Fix direction chosen: adapter layer, not a shape rewrite.**
`OutletPrintSettings`/`KotRenderInput`/`BillRenderInput` are the more
detailed, load-bearing shapes — `PrintingService.ts`'s entire rendering
logic (35+ conditionals) branches on those exact field names
(`taxBreakdown`, `discountAmount`, `containerCharge`, ...). Rewriting the
printing service internals to match the thinner shared shape would mean
re-deriving/duplicating logic that has nowhere to source those fields from
inside `PrintableOrder` anyway (backward-tax breakdown, charges, etc. are
computed and known by `OrdersService`/`TaxService`, not printing). Instead:

- `services/shared/src/interfaces.ts` no longer *redeclares* the
  print/settings shapes; it now re-exports the real ones from
  `services/settings/src/types.ts` and `services/printing/src/types.ts` so
  there is exactly one definition of each type, imported everywhere.
- A new `services/printing/src/adapters.ts` exports `toKotRenderInput()` /
  `toBillRenderInput()`, converting the orders-side `PrintableOrder` (which
  only knows what `Order`/`OrderItem` actually store) into the printing
  service's `KotRenderInput`/`BillRenderInput`, filling fields Orders does
  not yet track (per-order tax breakdown lines, container/delivery/service
  charge, customer info) with safe zero/empty defaults. `PrintableOrder`
  keeps its original field names (`quantity`, `lineTotal`, `kotNo`,
  `billNo`) — it remains OrdersService's own internal projection of `Order`,
  it is simply no longer passed directly to `PrintingService`.
- `OrdersService.printKot`/`printBill` now call the adapter before calling
  `printingService.renderKot`/`renderBill`.

### 2. `OutletBillingSettingsShape`/`OutletPrintSettingsShape` vs real settings types

- Field-for-field the shared shapes matched the real
  `OutletBillingSettings`/`OutletPrintSettings` **except**
  `highlight_orderid_mode` (see #1) and the real types carry two extra
  fields (`outlet_id`, `updated_at`) which is a structurally-compatible
  superset for a return type, but NOT for the `patch: Partial<Shape>`
  parameter direction — passing a real `Partial<OutletPrintSettings>` (which
  may legally include `outlet_id`/`updated_at`) where the shared
  `Partial<OutletPrintSettingsShape>` was declared caused no error, but the
  reverse (shared `SettingsService` interface promising to accept
  `Partial<OutletPrintSettingsShape>` while the concrete `SettingsService`
  class in `services/settings/src/SettingsService.ts` declares its patch
  parameter as `Partial<Omit<OutletPrintSettings, 'outlet_id'>>`) is an
  incompatible narrower parameter type is fine (`Omit<...,'outlet_id'>>` is
  a supertype-safe restriction of updatable fields) EXCEPT for the boolean
  vs string enum clash on `highlight_orderid_mode`, which is a real,
  non-structural mismatch (`boolean` and `'none'|'background'|'border'`
  share no overlapping literal values).
- **Fix**: re-export the real `OutletBillingSettings`/`OutletPrintSettings`/
  `SettingsService` types from `services/settings/src/types.ts` as the
  canonical shapes (aliased as `OutletBillingSettingsShape` /
  `OutletPrintSettingsShape` for import-name backward compatibility) instead
  of maintaining a second, drifted copy.

### 3. `services/orders/src/index.ts` re-exports

- Re-exported `TaxService`, `SettingsService`, `PrintingService`,
  `TaxComputeInput`, `TaxComputeResult`, `OutletBillingSettingsShape`,
  `OutletPrintSettingsShape`, `PrintableOrder`, `PrintDocumentShape` from
  `../../shared/src/interfaces.js`. Once `shared/src/interfaces.ts` is fixed
  (#1/#2), these re-exports keep working under the same names with no
  further changes needed — `apps/api` and `apps/pos-web` can keep importing
  these names.
- `PrintDocumentShape` no longer exists as its own shared declaration; it is
  now aliased to the real `PrintDocument` from `services/printing/src/types.ts`.

### 4. TaxService — no mismatch found

- Shared `TaxComputeInput`/`TaxComputeResult`/`TaxBreakdownLine`/
  `TaxService` are field-for-field identical to
  `services/tax/src/types.ts`'s versions (same names, same types). The real
  `TaxService` class satisfies the shared interface as-is. Left unchanged,
  now sourced from a single place (`services/tax/src/types.ts`,
  re-exported by shared) rather than duplicated, to prevent future drift.

### 5. `services/admin/src/interfaces.ts` — DI seams, not a mismatch, but no real implementation exists yet

- `AdminService` depends on `BillKotSequenceResetter`, `OrdersArchiver`,
  `MigrationRunner`, and `OutletDirectory`, none of which have a concrete
  implementation anywhere in the six service packages (Orders never
  implemented an "archiver" or an outlet directory; there is no migration
  runner service). This is not a type mismatch to "fix" between two
  existing implementations — it is a DI seam the admin author correctly
  left abstract for whoever wires the composition root.
- **Resolved in `apps/api/src/container.ts`**: thin adapter classes are
  written there (not inside `services/admin`) that implement these four
  interfaces on top of the real `BillKotSequence` and
  `InMemoryOrdersRepository` from `services/orders`:
  - `BillKotSequenceResetterAdapter` wraps `BillKotSequence` (adds
    `getCurrentSequence`/`resetSequence` by peeking/re-seeding the
    per-outlet counters via a small extension, since `BillKotSequence` only
    exposed `next*`/`peek*`, no reset — see `services/orders/src/BillKotSequence.ts`
    change below).
  - `OrdersArchiverAdapter` wraps `InMemoryOrdersRepository` +
    `OrdersService.transitionStatus`-free direct archive (moves matching
    orders into a local archived set and removes them from the live repo).
  - `MigrationRunnerStub` and `OutletDirectoryAdapter` are simple in-memory
    stand-ins (no real migration/outlet-directory service exists to wire to
    yet) — documented as stubs in the container and the README.
- **Minimal addition to `services/orders/src/BillKotSequence.ts`**: added
  `resetSequence(outletId)` (sets both counters back to 0) so
  `BillKotSequenceResetterAdapter` has something real to call instead of
  reaching into private state. This is the only edit made to
  `services/orders` business logic outside of the printing-adapter wiring
  in `OrdersService.ts`.

### 6. Module systems differ across packages (not a type mismatch, but relevant to `apps/api`)

- `services/orders`, `services/tables` use `"module": "ESNext"` /
  `"moduleResolution": "Bundler"` with explicit `.js` extensions on relative
  imports (TS source, ESM-style specifiers).
- `services/settings`, `services/tax`, `services/printing` have no
  `tsconfig.json` of their own and use extensionless relative imports.
- `services/admin` uses `"module": "commonjs"`.
- **Resolution for `apps/api`**: `apps/api/tsconfig.json` uses `"module":
  "ESNext"` + `"moduleResolution": "Bundler"` (same as orders/tables), which
  resolves both `.js`-suffixed and extensionless relative specifiers to
  their `.ts` source files. Runtime uses `tsx` (esbuild-based loader), which
  resolves the same way. `services/admin`'s CommonJS tsconfig only affects
  *its own* isolated `tsc --noEmit` run; when its `.ts` sources are pulled
  into `apps/api`'s Bundler-mode program they are plain TS source files and
  compile the same way as everything else — no dual-compilation problem in
  practice since nothing here imports compiled `dist/` output, only `src/`.

## Files changed to fix mismatches

- `services/shared/src/interfaces.ts` — re-export real settings/printing
  types instead of redeclaring drifted copies.
- `services/printing/src/adapters.ts` — **new** — `toKotRenderInput` /
  `toBillRenderInput`.
- `services/orders/src/OrdersService.ts` — use the adapters before calling
  `printingService.renderKot`/`renderBill`.
- `services/orders/src/BillKotSequence.ts` — added `resetSequence()`.
- `services/orders/src/index.ts` — no changes needed (re-export names
  unchanged).
