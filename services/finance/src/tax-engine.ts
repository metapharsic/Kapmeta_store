export class TaxEngine {
  // Calculates 5% GST (2.5% CGST + 2.5% SGST).
  // Returns amounts in minor units (BIGINT).
  //
  // IMPORTANT: menu prices in this app are tax-INCLUSIVE (see the
  // MenuPriceLookup contract and priceOrder() in
  // services/orders/src/order-service.ts, which backs the tax component out
  // of subtotalMinor rather than adding it on top). This method must use the
  // same inclusive convention — previously it treated subTotalMinor as
  // tax-EXCLUSIVE and added CGST+SGST on top, which made grandTotal here
  // disagree with the real order/invoice grandTotal for the same subtotal
  // (invoice-drift bug). Kept as a BigInt-only backed-out calc so any caller
  // of this preview endpoint agrees with priceOrder().
  static calculateStatutoryTaxes(subTotalMinor: bigint) {
    // 5% inclusive rate, split evenly into 2.5% CGST + 2.5% SGST, backed out
    // of the tax-inclusive subtotal (same back-out formula as priceOrder):
    // net = subtotal * 10000 / 10025, tax = subtotal - net.
    const taxMinor = subTotalMinor - (subTotalMinor * 10000n) / 10025n;
    const cgstMinor = taxMinor / 2n;
    const sgstMinor = taxMinor - cgstMinor;

    return {
      subTotal: subTotalMinor,
      cgst: cgstMinor,
      sgst: sgstMinor,
      // Tax is inclusive — already inside subTotalMinor, so it is not added
      // again here. Matches priceOrder()'s grandTotalMinor = subtotalMinor.
      grandTotal: subTotalMinor
    };
  }
}
