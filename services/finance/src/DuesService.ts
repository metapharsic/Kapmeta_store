import { roundMoney, type Money } from '../../shared/src/interfaces';
import type { Repository } from './DuesRepository';
import type { DueLedgerEntry, DueSettlementAudit } from './types';

/**
 * services/orders/src/types.ts has no `payment_type` field on `Order` today
 * — this is part of the PROPOSAL (see README.md). `DuesOrderInput` is the
 * minimal slice of an order this service needs; once orders/src/types.ts
 * grows a real `payment_type` field, `payment_type` here should become
 * `Order['payment_type']` instead of the local literal type below.
 */
export interface DuesOrderInput {
  id: string;
  outlet_id: string;
  payment_type: string;
}

export class DueNotFoundError extends Error {
  constructor(dueId: string) {
    super(`Due ledger entry not found: ${dueId}`);
    this.name = 'DueNotFoundError';
  }
}

export class InvalidPaymentTypeError extends Error {
  constructor(orderId: string, paymentType: string) {
    super(`Order ${orderId} has payment_type "${paymentType}", expected "Due"`);
    this.name = 'InvalidPaymentTypeError';
  }
}

export class DueAlreadySettledError extends Error {
  constructor(dueId: string) {
    super(`Due ledger entry ${dueId} is already fully settled`);
    this.name = 'DueAlreadySettledError';
  }
}

export class InvalidSettlementAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSettlementAmountError';
  }
}

/**
 * DuesService — tracks money owed by a customer against an order paid via
 * the "Due" payment type, and records (partial) settlement against it with
 * an audit trail. In-memory audit log, matching the OrderAuditLog pattern
 * in services/orders.
 */
export class DuesService {
  private readonly auditLog: DueSettlementAudit[] = [];
  private auditSeq = 0;
  private idSeq = 0;

  constructor(private readonly repo: Repository<DueLedgerEntry>) {}

  private nextId(prefix: string): string {
    this.idSeq += 1;
    return `${prefix}_${this.idSeq}`;
  }

  async recordDue(
    order: DuesOrderInput,
    customerPhone: string,
    amount: Money,
  ): Promise<DueLedgerEntry> {
    if (order.payment_type !== 'Due') {
      throw new InvalidPaymentTypeError(order.id, order.payment_type);
    }
    if (amount <= 0) {
      throw new InvalidSettlementAmountError('Due amount must be greater than zero');
    }

    const now = new Date().toISOString();
    const entry: DueLedgerEntry = {
      id: this.nextId('due'),
      outletId: order.outlet_id,
      orderId: order.id,
      customerPhone,
      amount: roundMoney(amount),
      settledAmount: 0,
      status: 'outstanding',
      createdAt: now,
    };

    return this.repo.save(entry);
  }

  async settleDue(
    dueId: string,
    settledAmount: Money,
    actorId: string,
  ): Promise<DueLedgerEntry> {
    const due = await this.repo.findById(dueId);
    if (!due) {
      throw new DueNotFoundError(dueId);
    }
    if (due.status === 'settled') {
      throw new DueAlreadySettledError(dueId);
    }
    if (settledAmount <= 0) {
      throw new InvalidSettlementAmountError('Settlement amount must be greater than zero');
    }

    const balanceBefore = roundMoney(due.amount - due.settledAmount);
    if (settledAmount > balanceBefore) {
      throw new InvalidSettlementAmountError(
        `Settlement amount ${settledAmount} exceeds outstanding balance ${balanceBefore}`,
      );
    }

    const newSettledAmount = roundMoney(due.settledAmount + settledAmount);
    const balanceAfter = roundMoney(due.amount - newSettledAmount);
    const now = new Date().toISOString();

    const updated: DueLedgerEntry = {
      ...due,
      settledAmount: newSettledAmount,
      status: balanceAfter === 0 ? 'settled' : 'outstanding',
      settledAt: balanceAfter === 0 ? now : due.settledAt,
    };

    const saved = await this.repo.save(updated);

    this.auditSeq += 1;
    this.auditLog.push({
      id: `due_audit_${this.auditSeq}`,
      dueId,
      actorId,
      amount: roundMoney(settledAmount),
      balanceBefore,
      balanceAfter,
      createdAt: now,
    });

    return saved;
  }

  async listOutstandingByCustomer(customerPhone: string): Promise<DueLedgerEntry[]> {
    const all = await this.repo.findAll();
    return all.filter(
      (d) => d.customerPhone === customerPhone && d.status === 'outstanding',
    );
  }

  getAuditLog(dueId?: string): DueSettlementAudit[] {
    const entries = dueId ? this.auditLog.filter((a) => a.dueId === dueId) : this.auditLog;
    return entries.map((a) => structuredClone(a));
  }
}
