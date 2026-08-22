import { randomUUID } from 'node:crypto';
import type { RestaurantTable, TableSession, CreateTableInput, TableWithStatus } from './types';
import { deriveTableStatus } from './types';
import type { Repository } from './TablesRepository';
import type { InMemoryTableSessionsRepository } from './TablesRepository';
import type { OrdersService } from '../../orders/src/OrdersService';
import type { OrderChannel } from '../../orders/src/types';

export class TableNotFoundError extends Error {
  constructor(tableId: string) {
    super(`Table not found: ${tableId}`);
    this.name = 'TableNotFoundError';
  }
}

export interface TablesServiceDeps {
  repository: Repository<RestaurantTable> & { findByOutlet(outletId: string): Promise<RestaurantTable[]> };
  sessionsRepository: InMemoryTableSessionsRepository;
  ordersService: OrdersService;
}

export class TablesService {
  private readonly repo: TablesServiceDeps['repository'];
  private readonly sessionsRepo: InMemoryTableSessionsRepository;
  private readonly ordersService: OrdersService;

  constructor(deps: TablesServiceDeps) {
    this.repo = deps.repository;
    this.sessionsRepo = deps.sessionsRepository;
    this.ordersService = deps.ordersService;
  }

  async createTable(input: CreateTableInput): Promise<RestaurantTable> {
    const now = new Date().toISOString();
    const table: RestaurantTable = {
      id: randomUUID(),
      outlet_id: input.outlet_id,
      name: input.name,
      zone: input.zone,
      seating_capacity: input.seating_capacity,
      active_order_id: null,
      created_at: now,
      updated_at: now,
    };
    return this.repo.save(table);
  }

  async getTableOrThrow(tableId: string): Promise<RestaurantTable> {
    const table = await this.repo.findById(tableId);
    if (!table) throw new TableNotFoundError(tableId);
    return table;
  }

  /** Lists all tables in an outlet along with their live derived status. */
  async listTables(outletId: string): Promise<TableWithStatus[]> {
    const tables = await this.repo.findByOutlet(outletId);
    const results: TableWithStatus[] = [];
    for (const table of tables) {
      if (!table.active_order_id) {
        results.push({ ...table, display_status: 'Blank' });
        continue;
      }
      const order = await this.ordersService.getOrderOrThrow(table.active_order_id);
      results.push({
        ...table,
        display_status: deriveTableStatus(order.status, order.kot_sent),
      });
    }
    return results;
  }

  /** Opens a new session on a free table: creates a linked dine_in order
   * and attaches it as the table's active order. */
  async openTableSession(
    tableId: string,
    channel: OrderChannel = 'dine_in',
  ): Promise<{ table: RestaurantTable; session: TableSession; orderId: string }> {
    const table = await this.getTableOrThrow(tableId);
    if (table.active_order_id) {
      throw new Error(`Table ${tableId} already has an active order`);
    }

    const order = await this.ordersService.createOrder({
      outlet_id: table.outlet_id,
      channel,
      table_id: table.id,
    });

    table.active_order_id = order.id;
    table.updated_at = new Date().toISOString();
    const savedTable = await this.repo.save(table);

    const session: TableSession = {
      id: randomUUID(),
      outlet_id: table.outlet_id,
      table_id: table.id,
      order_id: order.id,
      opened_at: new Date().toISOString(),
      closed_at: null,
    };
    const savedSession = await this.sessionsRepo.save(session);

    return { table: savedTable, session: savedSession, orderId: order.id };
  }

  /**
   * "Move KOT/Items" feature from artifact-01: moves all items from the
   * source table's active order onto the destination table's active order
   * (creating one on the destination if it doesn't have one yet), then
   * recalculates totals on both orders. If the source order ends up empty,
   * it is cancelled and the source table is freed.
   */
  async moveKotItems(fromTableId: string, toTableId: string): Promise<{ from: RestaurantTable; to: RestaurantTable }> {
    if (fromTableId === toTableId) {
      throw new Error('Cannot move items to the same table');
    }
    const fromTable = await this.getTableOrThrow(fromTableId);
    const toTable = await this.getTableOrThrow(toTableId);

    if (!fromTable.active_order_id) {
      throw new Error(`Table ${fromTableId} has no active order to move items from`);
    }

    const fromOrder = await this.ordersService.getOrderOrThrow(fromTable.active_order_id);
    if (fromOrder.items.length === 0) {
      throw new Error(`Table ${fromTableId}'s order has no items to move`);
    }

    let toOrderId = toTable.active_order_id;
    if (!toOrderId) {
      const opened = await this.openTableSession(toTableId, fromOrder.channel);
      toOrderId = opened.orderId;
    }

    // Move each item: add an equivalent item to the destination order, then
    // remove it from the source order.
    const itemsToMove = [...fromOrder.items];
    for (const item of itemsToMove) {
      await this.ordersService.addItem(toOrderId, {
        item_id: item.item_id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        notes: item.notes,
      });
      await this.ordersService.removeItem(fromOrder.id, item.id);
    }

    const refreshedFromOrder = await this.ordersService.getOrderOrThrow(fromOrder.id);
    let updatedFromTable = fromTable;
    if (refreshedFromOrder.items.length === 0) {
      if (refreshedFromOrder.status !== 'paid' && refreshedFromOrder.status !== 'cancelled') {
        // Free the order via the state machine rather than a silent field
        // write; open orders can transition straight to cancelled.
        if (refreshedFromOrder.status === 'open') {
          await this.ordersService.transitionStatus(refreshedFromOrder.id, 'cancelled');
        } else {
          await this.ordersService.cancelOrder(refreshedFromOrder.id, 'system:move_kot_items', 'All items moved to another table');
        }
      }
      updatedFromTable = { ...fromTable, active_order_id: null, updated_at: new Date().toISOString() };
      updatedFromTable = await this.repo.save(updatedFromTable);
    }

    const updatedToTable = await this.getTableOrThrow(toTableId);

    return { from: updatedFromTable, to: updatedToTable };
  }

  async closeTableSession(tableId: string): Promise<RestaurantTable> {
    const table = await this.getTableOrThrow(tableId);
    if (!table.active_order_id) {
      throw new Error(`Table ${tableId} has no active session to close`);
    }

    const session = await this.sessionsRepo.findOpenByTableId(tableId);
    if (session) {
      session.closed_at = new Date().toISOString();
      await this.sessionsRepo.save(session);
    }

    const updatedTable: RestaurantTable = {
      ...table,
      active_order_id: null,
      updated_at: new Date().toISOString(),
    };
    return this.repo.save(updatedTable);
  }
}
