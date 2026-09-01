import { Router } from "express";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { getPool } from "../../../../services/shared/src/db/Pool";
import { PgTaxRepository } from "../../../../services/tax/src/PgTaxRepository";
import type { OrderChannel } from "../../../../services/tax/src/types";

export const taxSettingsRouter = Router();

function repo(): PgTaxRepository {
  return new PgTaxRepository(getPool());
}

// GET /settings/taxes
taxSettingsRouter.get(
  "/settings/taxes",
  requireAuth,
  requirePermission("settings.read"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const taxes = await repo().listTaxesForOutlet(outletId);
      res.status(200).json(taxes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal error" });
    }
  },
);

// POST /settings/taxes
taxSettingsRouter.post(
  "/settings/taxes",
  requireAuth,
  requirePermission("settings.manage"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const { title, calcType, rate, active } = req.body;

      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title is required" });
      }
      if (calcType !== "percentage") {
        return res.status(400).json({ error: "calcType must be 'percentage'" });
      }
      if (typeof rate !== "number" || !Number.isFinite(rate)) {
        return res.status(400).json({ error: "rate must be a number" });
      }

      const tax = await repo().createTax({
        outletId,
        title,
        calcType,
        rate,
        active: active ?? true,
      });
      res.status(201).json(tax);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal error" });
    }
  },
);

// PATCH /settings/taxes/:id
taxSettingsRouter.patch(
  "/settings/taxes/:id",
  requireAuth,
  requirePermission("settings.manage"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const { id } = req.params;

      // Tenant isolation: confirm the row belongs to this outlet before
      // allowing any mutation — never trust the :id alone.
      const existing = await repo().getTax(id);
      if (!existing || existing.outletId !== outletId) {
        return res.status(404).json({ error: "not found" });
      }

      const { title, calcType, rate, active } = req.body;
      if (calcType != null && calcType !== "percentage") {
        return res.status(400).json({ error: "calcType must be 'percentage'" });
      }

      const patch: Partial<{ title: string; calcType: "percentage"; rate: number; active: boolean }> = {};
      if (title != null) patch.title = title;
      if (calcType != null) patch.calcType = calcType;
      if (rate != null) patch.rate = rate;
      if (active != null) patch.active = active;

      const updated = await repo().updateTax(id, patch);
      if (!updated) return res.status(404).json({ error: "not found" });
      res.status(200).json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal error" });
    }
  },
);

// DELETE /settings/taxes/:id
taxSettingsRouter.delete(
  "/settings/taxes/:id",
  requireAuth,
  requirePermission("settings.manage"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const { id } = req.params;

      const existing = await repo().getTax(id);
      if (!existing || existing.outletId !== outletId) {
        return res.status(404).json({ error: "not found" });
      }

      const deleted = await repo().deleteTax(id);
      if (!deleted) return res.status(404).json({ error: "not found" });
      res.status(204).send();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal error" });
    }
  },
);

const VALID_CHANNELS: OrderChannel[] = ["dine_in", "pickup", "delivery", "swiggy", "zomato"];

function isValidChannel(channel: unknown): channel is OrderChannel {
  return typeof channel === "string" && (VALID_CHANNELS as string[]).includes(channel);
}

// GET /settings/taxes/channel-rules
taxSettingsRouter.get(
  "/settings/taxes/channel-rules",
  requireAuth,
  requirePermission("settings.read"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const channelQuery = req.query.channel;

      if (channelQuery != null) {
        if (!isValidChannel(channelQuery)) {
          return res.status(400).json({ error: "invalid channel" });
        }
        const rule = await repo().getChannelRule(outletId, channelQuery);
        return res.status(200).json(rule ?? null);
      }

      // No channel filter: return the rule for every channel this outlet
      // has configured.
      const rules = (
        await Promise.all(VALID_CHANNELS.map((channel) => repo().getChannelRule(outletId, channel)))
      ).filter((rule): rule is NonNullable<typeof rule> => !!rule);
      res.status(200).json(rules);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal error" });
    }
  },
);

// POST /settings/taxes/channel-rules
taxSettingsRouter.post(
  "/settings/taxes/channel-rules",
  requireAuth,
  requirePermission("settings.manage"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const { channel, mode, taxIds } = req.body;

      if (!isValidChannel(channel)) {
        return res.status(400).json({ error: "invalid channel" });
      }
      if (mode !== "backward" && mode !== "forward") {
        return res.status(400).json({ error: "mode must be 'backward' or 'forward'" });
      }
      if (!Array.isArray(taxIds) || !taxIds.every((t) => typeof t === "string")) {
        return res.status(400).json({ error: "taxIds must be an array of strings" });
      }

      // Ensure every referenced tax row actually belongs to this outlet —
      // never let a client attach another outlet's tax row to a rule.
      const outletTaxes = await repo().listTaxesForOutlet(outletId);
      const outletTaxIds = new Set(outletTaxes.map((t) => t.id));
      if (!taxIds.every((id: string) => outletTaxIds.has(id))) {
        return res.status(400).json({ error: "one or more taxIds do not belong to this outlet" });
      }

      const rule = await repo().createChannelRule({ outletId, channel, mode, taxIds });
      res.status(201).json(rule);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal error" });
    }
  },
);

// PATCH /settings/taxes/channel-rules/:id
taxSettingsRouter.patch(
  "/settings/taxes/channel-rules/:id",
  requireAuth,
  requirePermission("settings.manage"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const { id } = req.params;

      // Rule ids are synthesized as `${outletId}:${channel}` — verify the
      // outlet segment matches the authenticated outlet before touching it.
      const [ruleOutletId] = id.split(":");
      if (ruleOutletId !== outletId) {
        return res.status(404).json({ error: "not found" });
      }

      const { mode, taxIds } = req.body;
      if (mode != null && mode !== "backward" && mode !== "forward") {
        return res.status(400).json({ error: "mode must be 'backward' or 'forward'" });
      }
      if (taxIds != null) {
        if (!Array.isArray(taxIds) || !taxIds.every((t) => typeof t === "string")) {
          return res.status(400).json({ error: "taxIds must be an array of strings" });
        }
        const outletTaxes = await repo().listTaxesForOutlet(outletId);
        const outletTaxIds = new Set(outletTaxes.map((t) => t.id));
        if (!taxIds.every((tid: string) => outletTaxIds.has(tid))) {
          return res.status(400).json({ error: "one or more taxIds do not belong to this outlet" });
        }
      }

      const patch: { mode?: "backward" | "forward"; taxIds?: string[] } = {};
      if (mode != null) patch.mode = mode;
      if (taxIds != null) patch.taxIds = taxIds;

      const updated = await repo().updateChannelRule(id, patch);
      if (!updated) return res.status(404).json({ error: "not found" });
      res.status(200).json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal error" });
    }
  },
);
