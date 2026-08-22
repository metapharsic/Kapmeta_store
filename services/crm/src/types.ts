/**
 * CRM domain types.
 *
 * PII NOTE: `phone` and `address` are personally identifiable information.
 * - Access to Customer records (and any endpoint/query surfacing them) must
 *   be role-gated (e.g. outlet manager / owner roles only) — not exposed to
 *   generic staff logins.
 * - There is no bulk export of customer data in v1 (no CSV/API dump of the
 *   full customer list). Any future export feature must go through a
 *   separate privacy/compliance review before shipping.
 */

export interface Customer {
  id: string;
  outletId: string;
  phone: string;
  name: string | null;
  address: string | null;
  locality: string | null;
  createdAt: string;
}

export interface CustomerOrderSummary {
  customerId: string;
  orderCount: number;
  totalSpend: number;
  lastOrderAt: string;
}
