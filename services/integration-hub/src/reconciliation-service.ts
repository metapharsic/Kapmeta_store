import { checkTotalMismatch } from "./mapping-engine";

export interface ChannelOrderRecord {
  id: string; // ChannelOrderMapping row id
  channelAccountId: string;
  orderId: string;
  externalOrderId: string;
  partnerStatedTotalMinor: bigint;
  computedTotalMinor: bigint;
}

export interface ReconciliationRepository {
  listChannelOrdersInRange(channelAccountId: string, fromDate: Date, toDate: Date): Promise<ChannelOrderRecord[]>;
  recordMismatch(channelAccountId: string, channelOrderMappingId: string, deltaMinor: bigint): Promise<void>;
}

export interface ReconciliationReport {
  channelAccountId: string;
  fromDate: Date;
  toDate: Date;
  totalOrders: number;
  matchedCount: number;
  mismatchedCount: number;
  mismatches: Array<{ channelOrderMappingId: string; externalOrderId: string; deltaMinor: bigint }>;
}

export async function runReconciliation(
  channelAccountId: string,
  fromDate: Date,
  toDate: Date,
  repo: ReconciliationRepository,
): Promise<ReconciliationReport> {
  const orders = await repo.listChannelOrdersInRange(channelAccountId, fromDate, toDate);

  const mismatches: ReconciliationReport["mismatches"] = [];
  let matchedCount = 0;

  for (const order of orders) {
    const { mismatched, deltaMinor } = checkTotalMismatch(order.partnerStatedTotalMinor, order.computedTotalMinor);
    if (mismatched) {
      await repo.recordMismatch(channelAccountId, order.id, deltaMinor);
      mismatches.push({
        channelOrderMappingId: order.id,
        externalOrderId: order.externalOrderId,
        deltaMinor,
      });
    } else {
      matchedCount++;
    }
  }

  return {
    channelAccountId,
    fromDate,
    toDate,
    totalOrders: orders.length,
    matchedCount,
    mismatchedCount: mismatches.length,
    mismatches,
  };
}
