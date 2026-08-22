/**
 * Shared interfaces for the Tax, Settings, and Printing services.
 *
 * NOTE: This file is authored independently by the Tax+Settings+Printing
 * service agent, working from a shared spec but without visibility into the
 * exact file a sibling agent (building services/orders and services/tables)
 * may also be authoring against the same path. A human will reconcile any
 * signature mismatch between the two. Consumers (e.g. OrdersService) should
 * depend on these interfaces via constructor/DI, never on the concrete
 * classes directly.
 */

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

/** Money is represented as a plain number in the outlet's base currency unit
 * (e.g. rupees), not paise/cents. All monetary math should be rounded via
 * `roundMoney` before being surfaced to callers/persisted, to avoid floating
 * point drift accumulating across repeated computations. */
export type Money = number;

/** Rounds to 2 decimal places using standard rounding. */
export function roundMoney(value: number): Money {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Shared domain enums
// ---------------------------------------------------------------------------

/** Order channel — determines which tax mode (backward/forward) applies and
 * which settings (e.g. container charge auto-apply) are relevant. */
export type OrderChannel = 'dine_in' | 'pickup' | 'delivery' | 'swiggy' | 'zomato';

// ---------------------------------------------------------------------------
// TaxService
// ---------------------------------------------------------------------------

export type TaxMode = 'backward' | 'forward';

export interface TaxComputeInput {
  outletId: string;
  channel: OrderChannel;
  /** For backward (tax-inclusive) channels this is the tax-inclusive
   * subtotal (item prices already include tax). For forward (tax-exclusive)
   * channels this is the tax-exclusive subtotal. */
  subtotalAmount: Money;
}

export interface TaxBreakdownLine {
  taxId: string;
  title: string;
  ratePercent: number;
  amount: Money;
}

export interface TaxComputeResult {
  mode: TaxMode;
  totalRatePercent: number;
  /** Subtotal net of tax (price excluding tax) regardless of mode — for
   * backward mode this is derived by extraction, for forward mode it equals
   * the input subtotal. */
  netBeforeTax: Money;
  taxAmount: Money;
  /** Final tax-inclusive amount for this subtotal. */
  totalWithTax: Money;
  breakdown: TaxBreakdownLine[];
}

export interface TaxService {
  computeTax(input: TaxComputeInput): Promise<TaxComputeResult>;
}

// ---------------------------------------------------------------------------
// SettingsService
// ---------------------------------------------------------------------------
// NOTE (integration fix, see docs-integration/interface-audit.md #1/#2):
// This file used to REDECLARE OutletBillingSettingsShape/OutletPrintSettingsShape
// from scratch, and drifted from the real shapes in
// services/settings/src/types.ts (most notably `highlight_orderid_mode`,
// declared here as `boolean` vs the real `'none'|'background'|'border'`
// string enum). To guarantee there is exactly one definition of each type,
// these are now re-exports of the real settings-service types, kept under
// their original `...Shape` names so existing imports (e.g.
// services/orders/src/index.ts) do not need to change.

export type {
  OutletBillingSettings as OutletBillingSettingsShape,
  OutletPrintSettings as OutletPrintSettingsShape,
  SettingsService,
  ContainerChargeMode,
  DiscountCalcBasis,
  HighlightOrderIdMode,
} from '../../settings/src/types';

// ---------------------------------------------------------------------------
// PrintingService
// ---------------------------------------------------------------------------
// NOTE (integration fix, see docs-integration/interface-audit.md #1): this
// file used to redeclare a thinner `PrintingService` interface
// (`renderKot(order: PrintableOrder, ...)`) that did not match the real
// `services/printing/src/PrintingService.ts` implementation, whose
// `KotRenderInput`/`BillRenderInput` carry many fields (taxBreakdown,
// discountAmount, containerCharge, deliveryCharge, serviceCharge,
// isReprint, ...) that `PrintableOrder` never had. Rather than rewrite the
// printing service's rendering logic to a thinner shape, the real
// `PrintingService` interface/`PrintDocument` type are re-exported here as
// the canonical ones, and a new `services/printing/src/adapters.ts`
// converts orders' own `PrintableOrder` projection into the real
// `KotRenderInput`/`BillRenderInput` before calling into PrintingService.

export type {
  PrintDocument as PrintDocumentShape,
  PrintLine as PrintDocumentLine,
  PrintDocumentType,
  PrintLineStyle,
  KotRenderInput,
  BillRenderInput,
  PrintableOrderItem as PrintRenderOrderItem,
  PrintingService,
} from '../../printing/src/types';

/**
 * OrdersService's own simplified projection of `Order`/`OrderItem` — NOT
 * passed directly to `PrintingService` any more. See
 * `services/printing/src/adapters.ts` (`toKotRenderInput`/
 * `toBillRenderInput`) for the conversion into the real
 * `KotRenderInput`/`BillRenderInput` shapes.
 */
export interface PrintableOrderItem {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  isCancelled?: boolean;
  isModified?: boolean;
  isDeleted?: boolean;
  isPrepared?: boolean;
}

export interface PrintableOrder {
  orderId: string;
  outletId: string;
  channel: OrderChannel;
  kotNo?: number;
  billNo?: number;
  tableNo?: string | null;
  isDuplicatePrint?: boolean;
  items: PrintableOrderItem[];
  subtotalAmount: Money;
  taxAmount: Money;
  totalAmount: Money;
  createdAt: string;
}
