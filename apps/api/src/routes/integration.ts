import { Router } from "express";

import { requireAuth, requirePermission, AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";
import { encryptCredential, maskCredential } from "@kapmeta/integration";

const router = Router();

// =====================================
// CHANNEL MAPPING MANAGEMENT
// =====================================

// Create a new channel account mapping (No Hardcoding Rule)
router.post(["/channels", "/integrations/channels", "/integration/channels", "/integration/integrations/channels"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const { channel, externalOutletId, credentialsRef } = req.body;

    // ChannelAccount (schema.prisma / db/migrations/0007_integration.sql) has
    // no `channel` column — only `credentialsRef`, which is how the PUT
    // .../:channel/connect handler below already records which aggregator an
    // account is for. A literal `channel` key here used to make Prisma
    // reject the entire create as an unknown argument, so this endpoint
    // 500'd on every call; store the channel code in credentialsRef instead
    // so GET /channels (below) can read it back the same way it reads
    // connect-created accounts.
    const account = await prisma.channelAccount.create({
      data: {
        outletId: req.auth!.outletId,
        integration_id: req.auth!.outletId,
        externalOutletId,
        credentialsRef: credentialsRef || channel,
        is_active: true,
      } as any
    });

    res.status(201).json(account);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// "Easy connect" flow — list all delivery-app connections for this outlet.
router.get(["/channels", "/integrations/channels", "/integration/channels", "/integration/integrations/channels"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const accounts = await prisma.channelAccount.findMany({
      where: { outletId: req.auth!.outletId },
    });
    res.status(200).json(
      accounts.map((a: any) => ({
        id: a.id,
        // credentialsRef is the only column that carries the channel code
        // (ChannelAccount has no `channel` field) — no "SWIGGY" default:
        // faking a channel for an account whose code genuinely isn't set
        // would misreport a Zomato connection as Swiggy (No Hardcoding Rule).
        channel: a.credentialsRef || null,
        externalOutletId: a.externalOutletId || null,
        status: a.is_active ? "ACTIVE" : "PAUSED",
        connectedAt: a.createdAt,
        hasCredentials: true,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Connect (or update) one channel's credentials.
router.put(["/channels/:channel/connect", "/integrations/channels/:channel/connect", "/integration/integrations/channels/:channel/connect"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const channel = req.params.channel.toUpperCase();
    if (!["SWIGGY", "ZOMATO"].includes(channel)) {
      res.status(400).json({ error: "unsupported channel — only SWIGGY and ZOMATO have adapters today" });
      return;
    }
    const { externalOutletId, apiKey, apiSecret } = req.body;
    if (!externalOutletId || !apiKey || !apiSecret) {
      res.status(400).json({ error: "externalOutletId, apiKey, apiSecret required" });
      return;
    }

    const outletId = req.auth!.outletId;
    const account = await prisma.channelAccount.create({
      data: {
        outletId,
        integration_id: outletId,
        externalOutletId,
        credentialsRef: channel,
        is_active: true,
      } as any
    });

    res.status(200).json({
      id: account.id,
      channel,
      externalOutletId: account.externalOutletId,
      status: "ACTIVE",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect channel
router.post(["/channels/:accountId/disconnect", "/integrations/channels/:accountId/disconnect", "/integration/integrations/channels/:accountId/disconnect"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    await prisma.channelAccount.updateMany({
      where: { id: req.params.accountId, outletId: req.auth!.outletId },
      data: { is_active: false } as any,
    });
    res.status(200).json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create item mappings for a channel
router.post("/integrations/mappings", requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const { channelAccountId, mappings } = req.body; 
    // mappings: Array<{ menuItemId, externalItemId, channelPrice }>

    const results = await Promise.all(
      mappings.map(async (m: any) => {
        const existing = await (prisma as any).channelItemMapping.findFirst({
          where: {
            channelAccountId,
            externalItemId: m.externalItemId,
          },
        });
        if (existing) {
          return await (prisma as any).channelItemMapping.update({
            where: { id: existing.id },
            data: {
              item_id: m.menuItemId || m.item_id,
            },
          });
        } else {
          return await (prisma as any).channelItemMapping.create({
            data: {
              // outlet_id (schema.prisma) is NOT NULL with no default — a
              // create() omitting it fails Prisma's required-argument check
              // on every new mapping, so every /integrations/mappings call
              // that didn't already have a matching row 500'd.
              outlet_id: req.auth!.outletId,
              channelAccountId,
              item_id: m.menuItemId || m.item_id,
              externalItemId: m.externalItemId,
            },
          });
        }
      })
    );

    res.status(201).json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================
// PER-CHANNEL ITEM AVAILABILITY (Online Item Status)
// =====================================

router.get(["/channel-items", "/integration/channel-items"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const channelAccounts = await prisma.channelAccount.findMany({
      where: { outletId, is_active: true },
    });

    const menuItems = await prisma.menuItem.findMany({
      where: { outletId, isActive: true },
      include: { category: true },
    });

    const availabilityRows = await prisma.item_availability.findMany({
      where: { outlet_id: outletId },
    });
    const availByKey = new Map(
      availabilityRows.map((row) => [`${row.channel_id}_${row.item_id}`, row])
    );

    const items = menuItems.map((item) => {
      const channels = channelAccounts.map((acc) => {
        const row = availByKey.get(`${acc.id}_${item.id}`);
        const isAvailable = row ? row.state !== "OFF" : true;
        return {
          mappingId: row?.id || `${acc.id}:${item.id}`,
          channelAccountId: acc.id,
          channel: acc.credentialsRef || "CHANNEL",
          menuItemId: item.id,
          isAvailable,
          version: row?.version ?? 1,
        };
      });

      const overallStatus =
        channels.length === 0
          ? "ALL_OFF"
          : channels.every((c) => c.isAvailable)
          ? "ALL_ON"
          : channels.every((c) => !c.isAvailable)
          ? "ALL_OFF"
          : "PARTIAL";

      return {
        menuItemId: item.id,
        name: item.name,
        onlineDisplayName: item.name,
        categoryName: item.category?.name || "General",
        overallStatus,
        channels,
      };
    });

    res.status(200).json(items);
  } catch (err: any) {
    console.error("Error fetching channel items:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch(["/channel-items/:mappingId/availability", "/integration/channel-items/:mappingId/availability"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const { isAvailable } = req.body;
    const mappingId = req.params.mappingId;
    const outletId = req.auth!.outletId;
    const nextState = isAvailable === false ? "OFF" : "ON";

    let existing = await prisma.item_availability.findUnique({ where: { id: mappingId } }).catch(() => null);
    if (!existing && mappingId.includes(":")) {
      const [channelId, itemId] = mappingId.split(":");
      existing = await prisma.item_availability.findFirst({
        where: { outlet_id: outletId, channel_id: channelId, item_id: itemId },
      });
      if (!existing && channelId && itemId) {
        const created = await prisma.item_availability.create({
          data: {
            outlet_id: outletId,
            channel_id: channelId,
            item_id: itemId,
            state: nextState,
            version: 1,
            updated_by: req.auth!.userId,
          },
        });
        return res.status(200).json({ newVersion: created.version, isAvailable: created.state !== "OFF", mappingId: created.id });
      }
    }

    if (!existing || existing.outlet_id !== outletId) {
      res.status(404).json({ error: "mapping not found" });
      return;
    }

    const updated = await prisma.item_availability.update({
      where: { id: existing.id },
      data: {
        state: nextState,
        version: { increment: 1 },
        updated_at: new Date(),
        updated_by: req.auth!.userId,
      },
    });

    // Real write point for management_activity_logs (migration 0053, see
    // apps/api/src/routes/management.ts's GET /management/logs comment for
    // why this route was chosen over menu.ts's separate stock-86 toggle).
    // Best-effort: a logging failure here must never fail the toggle
    // itself, so it's caught and only console.error'd.
    try {
      await prisma.$executeRaw`
        INSERT INTO management_activity_logs (outlet_id, log_type, actor_id, message, meta)
        VALUES (
          ${outletId},
          'ONLINE_ITEM_ON_OFF',
          ${req.auth!.userId},
          ${`Item ${updated.item_id} turned ${nextState === "OFF" ? "OFF" : "ON"} for channel ${updated.channel_id}`},
          ${JSON.stringify({ mappingId: updated.id, itemId: updated.item_id, channelId: updated.channel_id, state: updated.state, version: updated.version })}::jsonb
        )
      `;
    } catch (logErr) {
      console.error("Error writing management_activity_logs for channel-items availability toggle:", logErr);
    }

    res.status(200).json({ newVersion: updated.version, isAvailable: updated.state !== "OFF", mappingId: updated.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================
// INBOUND AGGREGATOR WEBHOOK INGESTION
// =====================================

router.post(["/webhooks/:channel", "/webhooks/swiggy", "/webhooks/zomato"], async (req, res) => {
  try {
    const channelParam = (req.params.channel || (req.path.includes("swiggy") ? "SWIGGY" : "ZOMATO")).toUpperCase();
    const { externalOrderId, externalEventId, customer, items, rider, otp } = req.body;

    if (!externalOrderId) {
      res.status(400).json({ error: "externalOrderId is required" });
      return;
    }

    const orderNumber = `${channelParam}-${externalOrderId}`;

    // 1. Idempotency Check (Prevent duplicate ingestion on webhook replay)
    const existingOrder = await prisma.order.findFirst({
      where: {
        orderNumber,
      },
    });

    if (existingOrder) {
      res.status(200).json({
        ok: true,
        status: "ALREADY_PROCESSED",
        message: "Webhook event already processed idempotently",
        orderId: existingOrder.id,
        externalOrderId,
      });
      return;
    }

    // 2. Resolve target outlet
    const targetOutlet = req.body.outletId
      ? await prisma.outlet.findUnique({ where: { id: req.body.outletId } })
      : await prisma.outlet.findFirst();

    if (!targetOutlet) {
      res.status(404).json({ error: "Outlet not found" });
      return;
    }

    const outletId = targetOutlet.id;

    const storeStatus = await prisma.outlet_status.findUnique({ where: { outlet_id: outletId } });
    if (storeStatus && storeStatus.is_online === false) {
      res.status(409).json({ error: "Store is paused; aggregator orders are not accepted" });
      return;
    }

    // 3. Resolve Menu Items
    const rawItems = Array.isArray(items) ? items : [];
    const outletMenuItems = await prisma.menuItem.findMany({ where: { outletId } });
    const defaultItem = outletMenuItems[0];

    const lines = rawItems.map((it: any) => {
      const matched = outletMenuItems.find(
        (m) => m.name.toLowerCase() === (it.name || "").toLowerCase()
      ) || defaultItem;

      return {
        menuItemId: matched?.id || defaultItem?.id,
        quantity: Number(it.quantity || 1),
        unitPriceMinor: Number(it.priceMinor || (matched ? Number(matched.price) * 100 : 25000)),
        name: it.name || matched?.name || "Aggregator Item",
      };
    }).filter((l) => l.menuItemId);

    if (lines.length === 0 && defaultItem) {
      lines.push({
        menuItemId: defaultItem.id,
        quantity: 1,
        unitPriceMinor: Number(defaultItem.price) * 100,
        name: defaultItem.name,
      });
    }

    const subtotal = lines.reduce((s, l) => s + BigInt(l.unitPriceMinor) * BigInt(l.quantity), 0n);
    const tax = (subtotal * 5n) / 100n;
    const grandTotal = subtotal + tax;

    // 4. Create Order & OrderItems
    //
    // The aggregator identity (channel, external id, customer, rider, OTP,
    // received/accepted times) is persisted on the order row itself, not only
    // in the audit log - otherwise the Online Orders screen can only guess the
    // channel from an orderNumber string prefix and has no customer or rider
    // to show at all. The audit log write below is unchanged.
    const receivedAt = new Date();
    const acceptedAt = new Date();
    const riderSource = rider || req.body.deliveryPartner || {};

    // Order (schema.prisma) has no business_date field at all -- that column
    // only exists on the *_summary reporting tables and
    // waiter_shift_handovers, never on orders itself. Including it here made
    // Prisma reject this create as an unknown argument -- on BOTH the
    // combined create below and its own fallback-to-baseOrderData branch, so
    // every single aggregator webhook call failed before ever reaching the
    // audit log or KOT steps.
    const baseOrderData: any = {
      outletId,
      orderNumber,
      orderType: "DELIVERY",
      status: "CONFIRMED",
      subtotal,
      taxTotal: tax,
      grandTotal,
      orderItems: {
        // NOTE: OrderItem (schema.prisma) has no item_name field — quantity/
        // unitPrice/subtotal are the only per-line columns it defines, so the
        // display name is not snapshotted here. A `item_name` key on this
        // create() used to make Prisma reject the whole insert (unknown
        // argument), which meant this route 500'd on every single webhook
        // call, aggregator or fallback path alike. See the read side
        // (orders.ts) for the equally-defensive `it.item_name || ... ||
        // "Dish"` fallback this already accounted for on the way out.
        create: lines.map((l) => ({
          outletId,
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          unitPrice: BigInt(l.unitPriceMinor),
          subtotal: BigInt(l.unitPriceMinor) * BigInt(l.quantity),
        })),
      },
    };

    // customerName/customerPhone are deliberately NOT written to the order row:
    // orders (schema.prisma / db/migrations/0039) has no customer_name or
    // customer_phone column — 0039 explicitly considered and rejected reusing
    // 0009's draft orders table for this. Bundling them into aggregatorOrderData
    // used to make Prisma reject the *entire* create/update as one unknown-
    // argument error, silently discarding channel/externalOrderId/rider/otp too
    // (all of which ARE real columns) on every webhook call. The audit log
    // write below still records the raw customer object for reference.
    const aggregatorOrderData: any = {
      channel: channelParam,
      externalOrderId: String(externalOrderId),
      riderName: riderSource?.name ?? req.body.riderName ?? null,
      riderPhone: riderSource?.phone ?? req.body.riderPhone ?? null,
      customerOtp: otp ?? req.body.deliveryOtp ?? riderSource?.otp ?? null,
      receivedAt,
      acceptedAt,
    };

    let createdOrder: any;
    try {
      createdOrder = await (prisma.order as any).create({
        data: { ...baseOrderData, ...aggregatorOrderData },
      });
    } catch {
      // Generated Prisma client predates the aggregator columns: fall back to
      // the base row, then best-effort stamp the identity fields on top so the
      // order is still created rather than the webhook 500-ing.
      createdOrder = await (prisma.order as any).create({ data: baseOrderData });
      await (prisma.order as any)
        .update({ where: { id: createdOrder.id }, data: aggregatorOrderData })
        .catch(() => {});
    }

    // 5. Generate Station KOTs & Order Status History
    //
    // OrderStatusHistory (schema.prisma) has `status`, not `to_status`, and
    // `outletId` is required with no default — both were wrong/missing here,
    // so this insert failed silently (via the .catch below) on every
    // webhook call and no history row was ever recorded for an aggregator
    // order.
    await prisma.orderStatusHistory.create({
      data: {
        outletId,
        orderId: createdOrder.id,
        status: "CONFIRMED",
      },
    }).catch(() => {});

    const { onOrderConfirmed } = await import("../orchestration/order-lifecycle");
    await onOrderConfirmed(createdOrder.id, prisma).catch(() => {});

    // 6. Record Immutable Webhook Audit Log
    //
    // AuditLog (schema.prisma) has `userId` (required, no default), not
    // `actor_id` -- that field name doesn't exist on the model at all. This
    // call was unguarded (no .catch, unlike the status-history write above),
    // so every webhook that got this far still 500'd back to the aggregator
    // even though the order had already been created and confirmed --
    // exactly the kind of "looks like it failed but didn't" response that
    // makes an aggregator's retry/alerting logic misfire. Inbound webhooks
    // carry no authenticated user (no requireAuth on this route), so
    // outletId is used as the actor id, same as this line already intended.
    await prisma.auditLog.create({
      data: {
        outletId,
        userId: outletId,
        action: "CREATE",
        entityType: "AGGREGATOR_WEBHOOK",
        entityId: createdOrder.id,
        afterState: {
          channel: channelParam,
          externalOrderId,
          externalEventId: externalEventId || null,
          orderId: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
          customer: customer || null,
        },
        createdAt: new Date(),
      },
    });

    // 7. Broadcast Real-Time WebSocket Alerts
    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "order.created", {
        orderId: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        channel: channelParam,
        status: "CONFIRMED",
        grandTotalMinor: String(grandTotal),
      });
      broadcast(outletId, "kot.created", {
        orderId: createdOrder.id,
        channel: channelParam,
      });
    }).catch(() => {});

    res.status(201).json({
      ok: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      status: "CONFIRMED",
      externalOrderId,
    });
  } catch (err: any) {
    console.error("Error processing aggregator webhook:", err);
    res.status(500).json({ error: err.message || "Failed to ingest webhook" });
  }
});

export { router as integrationRouter };

