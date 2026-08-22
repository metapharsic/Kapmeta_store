/**
 * Finance domain types (dues ledger + chart of accounts).
 *
 * PROPOSAL: no screenshot evidence exists for a finance module beyond
 * "Due Payment" appearing as a payment type in one screenshot. This entire
 * package — DueLedgerEntry, ChartOfAccount, settlement/audit flow — is a
 * proposed design filling the gap between that one artifact and a working
 * dues-tracking feature. See README.md.
 */

import type { Money } from '../../shared/src/interfaces';

export type DueStatus = 'outstanding' | 'settled';

export interface DueLedgerEntry {
  id: string;
  outletId: string;
  orderId: string;
  customerPhone: string;
  /** Original amount recorded as due at order time. */
  amount: Money;
  /** Total amount settled so far, across one or more partial settlements. */
  settledAmount: Money;
  status: DueStatus;
  createdAt: string;
  settledAt?: string;
}

export type AccountType = 'asset' | 'liability' | 'income' | 'expense';

export interface ChartOfAccount {
  id: string;
  outletId: string;
  code: string;
  name: string;
  type: AccountType;
}

export interface DueSettlementAudit {
  id: string;
  dueId: string;
  actorId: string;
  amount: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: string;
}
