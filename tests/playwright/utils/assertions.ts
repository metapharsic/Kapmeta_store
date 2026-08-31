import { expect } from "@playwright/test";

/**
 * Custom Assertion Helpers for POS & Business Workflows
 */
export class CustomAssertions {
  /**
   * Asserts that a currency amount in minor units (paise) formatted as INR matches expected text
   */
  static assertCurrencyMatches(amountPaise: number, displayedText: string) {
    const rupees = (amountPaise / 100).toFixed(2);
    expect(displayedText).toContain(rupees);
  }

  /**
   * Asserts that an order status matches expected legal state machine transition
   */
  static assertValidStateTransition(currentStatus: string, nextStatus: string) {
    const legalTransitions: Record<string, string[]> = {
      DRAFT: ["PLACED", "CONFIRMED", "CANCELLED"],
      PLACED: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["IN_PREPARATION", "PREPARING", "CANCELLED"],
      PREPARING: ["READY", "CANCELLED"],
      IN_PREPARATION: ["READY", "CANCELLED"],
      READY: ["SERVED", "COMPLETED"],
      SERVED: ["BILLED", "PAID", "COMPLETED"],
      BILLED: ["PAID", "COMPLETED"],
      PAID: ["COMPLETED"],
    };

    const allowed = legalTransitions[currentStatus.toUpperCase()] || [];
    expect(
      allowed.includes(nextStatus.toUpperCase()),
      `Illegal status transition from ${currentStatus} to ${nextStatus}`
    ).toBeTruthy();
  }

  /**
   * Asserts response payload has standard API envelope
   */
  static assertApiSuccess(responseBody: any) {
    expect(responseBody).toBeDefined();
    expect(responseBody.error).toBeUndefined();
  }
}
