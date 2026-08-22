export class TaxEngine {
  // Calculates 5% GST (2.5% CGST + 2.5% SGST)
  // Returns amounts in minor units (BIGINT)
  static calculateStatutoryTaxes(subTotalMinor: bigint) {
    // Math.round on bigints is tricky, so we do (subtotal * 25) / 1000 for 2.5%
    const cgstMinor = (subTotalMinor * 25n) / 1000n;
    const sgstMinor = (subTotalMinor * 25n) / 1000n;
    
    return {
      subTotal: subTotalMinor,
      cgst: cgstMinor,
      sgst: sgstMinor,
      grandTotal: subTotalMinor + cgstMinor + sgstMinor
    };
  }
}
