import { PrismaClient } from "@prisma/client";
import { createKot, PrismaKotRepository } from "@kapmeta/kitchen";
import { consumeForOrderLine, PrismaInventoryRepository } from "@kapmeta/inventory";

// Cross-service composition, deliberately kept OUT of services/orders,
// services/kitchen, services/inventory themselves — each service stays
// decoupled per module boundaries (docs/03-architecture/high-level-design.md
// §4). This is the only place that knows "CONFIRMED triggers a KOT" and
// "COMPLETED triggers stock consumption."
//
// Best-effort, not transactional with the status transition itself: the
// order transition has already committed by the time these run (called
// after transitionOrder succeeds in routes/orders.ts). A KOT-creation or
// stock-consumption failure here does NOT roll back the order status —
// it's logged and the order stays in its new status. This mirrors WF-ORD-01's
// note that steps 5-6 are one transaction but 9-12 (of which this is a kin)
// are event-driven and individually retryable. There is no retry queue wired
// up yet — a failure here is currently silent beyond the log line. Flagging
// that explicitly: this is the gap to close before this is production-safe.

export async function onOrderConfirmed(orderId: string, prisma: PrismaClient): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { orderItems: true },
  });
  if (!order) {
    console.error(`onOrderConfirmed: order ${orderId} not found`);
    return;
  }

  try {
    await createKot(
      {
        outletId: order.outletId,
        orderId: order.id,
        lines: order.orderItems.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes ?? undefined,
          course: item.course ?? undefined,
        })),
      },
      new PrismaKotRepository(prisma),
    );
  } catch (err) {
    console.error(`onOrderConfirmed: KOT creation failed for order ${orderId}`, err);
  }
}

export async function onOrderCompleted(orderId: string, prisma: PrismaClient): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { orderItems: true },
  });
  if (!order) {
    console.error(`onOrderCompleted: order ${orderId} not found`);
    return;
  }

  const repo = new PrismaInventoryRepository(prisma);
  for (const item of order.orderItems) {
    try {
      const result = await consumeForOrderLine(
        order.outletId,
        order.id,
        { menuItemId: item.menuItemId, quantity: item.quantity },
        repo,
      );
      if (!result.ok) {
        // Per WF-INV-01: no recipe found never blocks the order — log and continue.
        console.error(`onOrderCompleted: no recipe for menu item ${result.menuItemId} (order ${orderId})`);
      }
    } catch (err) {
      console.error(`onOrderCompleted: stock consumption failed for order ${orderId}, item ${item.menuItemId}`, err);
    }
  }
}
