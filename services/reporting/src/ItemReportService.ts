import { roundMoney } from '../../shared/src/interfaces';
import type { Repository } from './ReportingRepository';
import type { ItemCategoryGroup, ItemReportResult, ReportOrder, ReportOrderItem } from './types';

export interface ItemReportRepositories {
  orders: Repository<ReportOrder> & {
    findByOutletAndDateRange(outletId: string, dateFrom: string, dateTo: string): Promise<ReportOrder[]>;
  };
  items: Repository<ReportOrderItem> & {
    findByOutletAndDateRange(outletId: string, dateFrom: string, dateTo: string): Promise<ReportOrderItem[]>;
  };
}

/**
 * Part B — Item Report. See docs artifact-08-day-summary-and-item-report.md
 * section B.3/B.4 for the computation spec this mirrors.
 *
 * Soft-delete note: `menu_items.is_active = false` (a menu item retired
 * from the active menu) must NOT exclude that item's historical sales rows
 * from this report — is_active only controls whether the item can be
 * added to *new* orders going forward. Since this report reads from
 * `ReportOrderItem` (a flattened snapshot of what was actually sold,
 * carrying category/name/code as they were at sale time) rather than
 * joining live against a current `menu_items` table, there is no
 * is_active filter applied here at all — a retired item's past sales
 * still show up in the report for the date range they occurred in,
 * by construction. If a live join is introduced later, it must NOT add an
 * `is_active = true` filter to this query.
 */
export class ItemReportService {
  constructor(private readonly repos: ItemReportRepositories) {}

  async computeItemReport(outletId: string, dateFrom: string, dateTo: string): Promise<ItemReportResult> {
    const orders = await this.repos.orders.findByOutletAndDateRange(outletId, dateFrom, dateTo);
    // A.6.3-equivalent for items: exclude cancelled orders' items.
    const cancelledOrderIds = new Set(orders.filter((o) => o.status === 'cancelled').map((o) => o.id));

    const allItems = await this.repos.items.findByOutletAndDateRange(outletId, dateFrom, dateTo);
    const items = allItems.filter((i) => !cancelledOrderIds.has(i.order_id));

    const byCategory = new Map<string, ReportOrderItem[]>();
    for (const item of items) {
      const bucket = byCategory.get(item.category) ?? [];
      bucket.push(item);
      byCategory.set(item.category, bucket);
    }

    const categoryGroups: ItemCategoryGroup[] = [];
    for (const [category, categoryItems] of byCategory.entries()) {
      // Group by item name + code within the category (same item sold
      // across multiple orders rolls up into one row).
      const byItem = new Map<string, { item: string; code: string; qty: number; total: number }>();
      for (const item of categoryItems) {
        const key = `${item.item_name}::${item.code}`;
        const existing = byItem.get(key) ?? { item: item.item_name, code: item.code, qty: 0, total: 0 };
        existing.qty = roundMoney(existing.qty + item.quantity);
        existing.total = roundMoney(existing.total + item.line_total);
        byItem.set(key, existing);
      }

      const rows = Array.from(byItem.values()).map((r) => ({
        category,
        item: r.item,
        code: r.code,
        qty: r.qty,
        total: r.total,
      }));

      const subTotal = {
        qty: roundMoney(rows.reduce((sum, r) => sum + r.qty, 0)),
        total: roundMoney(rows.reduce((sum, r) => sum + r.total, 0)),
      };

      // B.4.1 (implicit): zero-sales categories never appear — a category
      // only exists in `byCategory` if at least one item row landed in it,
      // so there is nothing further to filter here; documented explicitly
      // because it's relied on by a test.
      categoryGroups.push({ category, subTotal, items: rows });
    }

    const grandTotal = {
      qty: roundMoney(categoryGroups.reduce((sum, g) => sum + g.subTotal.qty, 0)),
      total: roundMoney(categoryGroups.reduce((sum, g) => sum + g.subTotal.total, 0)),
    };

    return { grandTotal, byCategory: categoryGroups };
  }
}
