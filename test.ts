import { prisma } from './apps/api/src/db';
import { createOrder, transitionOrder } from './services/orders/src/order-service';
import { PrismaOrderRepository, PrismaMenuPriceLookup } from './services/orders/src/stores/prisma-order-repository';
import { onOrderConfirmed } from './apps/api/src/orchestration/order-lifecycle';

async function main() {
  const repo = new PrismaOrderRepository(prisma);
  const priceLookup = new PrismaMenuPriceLookup(prisma);
  const input = {
    outletId: '11111111-1111-1111-1111-111111111111',
    terminalNumber: 'T-TEST',
    orderType: 'DINE_IN',
    waiterId: 'user-waiter',
    idempotencyKey: 'test-' + Date.now(),
    lines: [
      {
        menuItemId: 'bk_1',
        quantity: 1,
        modifierOptionIds: [],
      }
    ]
  };
  console.log("creating order");
  const created = await createOrder(input, priceLookup, repo);
  console.log("created", created);
  console.log("transitioning order");
  await transitionOrder(created.id, 'CONFIRMED', repo, 'user-waiter');
  console.log("confirming order");
  await onOrderConfirmed(created.id, prisma);
  console.log("done confirmed");
  const kots = await prisma.kOTTicket.findMany({ include: { kotItems: true } });
  console.log('KOTs generated:', JSON.stringify(kots, null, 2));
}
main().catch(console.error);
