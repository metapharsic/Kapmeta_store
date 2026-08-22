import type { ReportOrder, ReportOrderItem, ReportOrderPayment } from './types';

/**
 * Generic repository interface, matching the placeholder pattern used by
 * `services/orders/src/OrdersRepository.ts` — kept generic so a real
 * Postgres-backed implementation can later replace the in-memory ones
 * without changing service logic.
 */
export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

function inRange(businessDate: string, dateFrom: string, dateTo: string): boolean {
  return businessDate >= dateFrom && businessDate <= dateTo;
}

/**
 * In-memory orders repository for reporting. NOT for production use — see
 * `services/orders/src/OrdersRepository.ts` InMemoryOrdersRepository for
 * the pattern this mirrors.
 */
export class InMemoryReportOrdersRepository implements Repository<ReportOrder> {
  private readonly store = new Map<string, ReportOrder>();

  async findById(id: string): Promise<ReportOrder | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<ReportOrder[]> {
    return Array.from(this.store.values()).map((o) => structuredClone(o));
  }

  async findByOutletAndDateRange(outletId: string, dateFrom: string, dateTo: string): Promise<ReportOrder[]> {
    return Array.from(this.store.values())
      .filter((o) => o.outlet_id === outletId && inRange(o.business_date, dateFrom, dateTo))
      .map((o) => structuredClone(o));
  }

  async save(entity: ReportOrder): Promise<ReportOrder> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryReportOrderPaymentsRepository implements Repository<ReportOrderPayment> {
  private readonly store = new Map<string, ReportOrderPayment>();

  async findById(id: string): Promise<ReportOrderPayment | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<ReportOrderPayment[]> {
    return Array.from(this.store.values()).map((p) => structuredClone(p));
  }

  async findByOrderId(orderId: string): Promise<ReportOrderPayment[]> {
    return Array.from(this.store.values())
      .filter((p) => p.order_id === orderId)
      .map((p) => structuredClone(p));
  }

  async save(entity: ReportOrderPayment): Promise<ReportOrderPayment> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryReportOrderItemsRepository implements Repository<ReportOrderItem> {
  private readonly store = new Map<string, ReportOrderItem>();

  async findById(id: string): Promise<ReportOrderItem | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<ReportOrderItem[]> {
    return Array.from(this.store.values()).map((i) => structuredClone(i));
  }

  async findByOutletAndDateRange(outletId: string, dateFrom: string, dateTo: string): Promise<ReportOrderItem[]> {
    return Array.from(this.store.values())
      .filter((i) => i.outlet_id === outletId && inRange(i.business_date, dateFrom, dateTo))
      .map((i) => structuredClone(i));
  }

  async save(entity: ReportOrderItem): Promise<ReportOrderItem> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
