import { describe, it, expect } from 'vitest';
import { TablesService } from '../src/TablesService';
import { InMemoryTablesRepository, InMemoryTableSessionsRepository } from '../src/TablesRepository';
import { OrdersService } from '../../orders/src/OrdersService';
import { InMemoryOrdersRepository } from '../../orders/src/OrdersRepository';
import { FakeTaxService, FakeSettingsService, FakePrintingService } from '../../orders/test/fakes';

function makeTablesService() {
  const ordersService = new OrdersService({
    repository: new InMemoryOrdersRepository(),
    taxService: new FakeTaxService(),
    settingsService: new FakeSettingsService(),
    printingService: new FakePrintingService(),
  });
  const tablesService = new TablesService({
    repository: new InMemoryTablesRepository(),
    sessionsRepository: new InMemoryTableSessionsRepository(),
    ordersService,
  });
  return { tablesService, ordersService };
}

describe('TablesService.createTable / listTables', () => {
  it('creates a table and lists it as Blank when no active order', async () => {
    const { tablesService } = makeTablesService();
    await tablesService.createTable({
      outlet_id: 'outlet_1',
      name: 'T1',
      zone: 'AC',
      seating_capacity: 4,
    });

    const tables = await tablesService.listTables('outlet_1');
    expect(tables.length).toBe(1);
    expect(tables[0].display_status).toBe('Blank');
  });
});

describe('TablesService.openTableSession', () => {
  it('links a new order to the table and reflects order status live', async () => {
    const { tablesService, ordersService } = makeTablesService();
    const table = await tablesService.createTable({
      outlet_id: 'outlet_1',
      name: 'T1',
      zone: 'AC',
      seating_capacity: 4,
    });

    const { orderId } = await tablesService.openTableSession(table.id);

    await ordersService.addItem(orderId, {
      item_id: 'menu_item_1',
      item_name: 'Paneer Tikka',
      quantity: 1,
      unit_price: 100,
    });
    await ordersService.transitionStatus(orderId, 'running');

    let tables = await tablesService.listTables('outlet_1');
    expect(tables[0].display_status).toBe('Running');

    await ordersService.printKot(orderId); // sets kot_sent true
    tables = await tablesService.listTables('outlet_1');
    expect(tables[0].display_status).toBe('Running-KOT');

    await ordersService.transitionStatus(orderId, 'printed');
    tables = await tablesService.listTables('outlet_1');
    expect(tables[0].display_status).toBe('Printed');

    await ordersService.transitionStatus(orderId, 'paid');
    tables = await tablesService.listTables('outlet_1');
    expect(tables[0].display_status).toBe('Paid');
  });

  it('rejects opening a session on a table that already has one', async () => {
    const { tablesService } = makeTablesService();
    const table = await tablesService.createTable({
      outlet_id: 'outlet_1',
      name: 'T1',
      zone: 'AC',
      seating_capacity: 4,
    });
    await tablesService.openTableSession(table.id);
    await expect(tablesService.openTableSession(table.id)).rejects.toThrow();
  });
});

describe('TablesService.moveKotItems', () => {
  it('transfers items from one table to another and frees the source table', async () => {
    const { tablesService, ordersService } = makeTablesService();
    const tableA = await tablesService.createTable({
      outlet_id: 'outlet_1',
      name: 'A1',
      zone: 'AC',
      seating_capacity: 2,
    });
    const tableB = await tablesService.createTable({
      outlet_id: 'outlet_1',
      name: 'B1',
      zone: 'NonAC',
      seating_capacity: 2,
    });

    const { orderId: orderAId } = await tablesService.openTableSession(tableA.id);
    await ordersService.addItem(orderAId, {
      item_id: 'menu_item_1',
      item_name: 'Paneer Tikka',
      quantity: 2,
      unit_price: 100,
    });

    const { from, to } = await tablesService.moveKotItems(tableA.id, tableB.id);

    expect(from.active_order_id).toBeNull();

    const toOrder = await ordersService.getOrderOrThrow(to.active_order_id as string);
    expect(toOrder.items.length).toBe(1);
    expect(toOrder.items[0].item_id).toBe('menu_item_1');
    expect(toOrder.subtotal_amount).toBe(200);

    const tables = await tablesService.listTables('outlet_1');
    const tableAResult = tables.find((t) => t.id === tableA.id);
    const tableBResult = tables.find((t) => t.id === tableB.id);
    expect(tableAResult?.display_status).toBe('Blank');
    expect(tableBResult?.display_status).toBe('Blank'); // destination order still 'open' until KOT/running
  });

  it('rejects moving items from a table with no active order', async () => {
    const { tablesService } = makeTablesService();
    const tableA = await tablesService.createTable({
      outlet_id: 'outlet_1',
      name: 'A1',
      zone: 'AC',
      seating_capacity: 2,
    });
    const tableB = await tablesService.createTable({
      outlet_id: 'outlet_1',
      name: 'B1',
      zone: 'AC',
      seating_capacity: 2,
    });
    await expect(tablesService.moveKotItems(tableA.id, tableB.id)).rejects.toThrow();
  });
});

describe('TablesService.closeTableSession', () => {
  it('frees the table and closes the session', async () => {
    const { tablesService } = makeTablesService();
    const table = await tablesService.createTable({
      outlet_id: 'outlet_1',
      name: 'T1',
      zone: 'AC',
      seating_capacity: 4,
    });
    await tablesService.openTableSession(table.id);

    const closed = await tablesService.closeTableSession(table.id);
    expect(closed.active_order_id).toBeNull();
  });
});
