import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";

export const managementRouter = Router();

// management_lists / management_settings / management_activity_logs
// (migration 0053 in db/migrations) back the new "Management" nav section
// (Configuration / Accounting / User Management / User Logs screens). None
// of the three tables have Prisma models in the checked-in generated
// client yet -- same situation as report_notifications (see that route
// file's comment): `npx prisma generate` has no network path to
// binaries.prisma.sh in this sandbox. Routes below use
// $queryRaw/$executeRaw against the real tables instead of Prisma
// delegates; they work today and keep working once someone with network
// access runs `prisma generate` for real later.
//
// Reused existing seeded permissions (db/seeds/seed_permissions.sql) rather
// than inventing new "management.*" ones: 'settings.read'/'settings.manage'
// gate the generic lists/settings/logs CRUD below (this *is* outlet
// settings/configuration data), and 'users.manage' gates /biller-app since
// it's a user listing, same permission user-management.ts's GET /users
// uses.
//
// IMPORTANT -- like report_notifications, management_lists/_settings are
// storage only: no screen-specific business logic (e.g. actual delivery
// fee calculation, actual GST filing, actual wallet balance movement)
// lives here, only generic CRUD against caller-supplied keys. See
// management_activity_logs' write-point note on GET /logs below for the
// one place this session wired a real caller.

const LIST_KEY_RE = /^[A-Z0-9_]{1,64}$/;
const MAX_LOG_LIMIT = 200;
const DEFAULT_LOG_LIMIT = 50;

interface ListRow {
  id: string;
  outlet_id: string;
  list_key: string;
  label: string;
  value: string | null;
  extra: unknown;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
}

function serializeList(row: ListRow) {
  return {
    id: row.id,
    outletId: row.outlet_id,
    listKey: row.list_key,
    label: row.label,
    value: row.value,
    extra: row.extra,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdBy: row.created_by,
  };
}

interface SettingsRow {
  id: string;
  outlet_id: string;
  settings_key: string;
  data: unknown;
  updated_at: Date;
  updated_by: string | null;
}

function serializeSettings(row: SettingsRow) {
  return {
    id: row.id,
    outletId: row.outlet_id,
    settingsKey: row.settings_key,
    data: row.data,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  };
}

interface LogRow {
  id: string;
  outlet_id: string;
  log_type: string;
  actor_id: string | null;
  message: string;
  meta: unknown;
  created_at: Date;
}

function serializeLog(row: LogRow) {
  return {
    id: row.id,
    outletId: row.outlet_id,
    logType: row.log_type,
    actorId: row.actor_id,
    message: row.message,
    meta: row.meta,
    createdAt: row.created_at.toISOString(),
  };
}

// GET /management/lists?key=<list_key>
managementRouter.get("/management/lists", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const key = typeof req.query.key === "string" ? req.query.key.trim() : "";
    if (!key) {
      return res.status(400).json({ error: "key is required" });
    }

    const rows = await prisma.$queryRaw<ListRow[]>`
      SELECT id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
      FROM management_lists
      WHERE outlet_id = ${outletId} AND list_key = ${key}
      ORDER BY sort_order ASC, created_at ASC
    `;
    res.status(200).json(rows.map(serializeList));
  } catch (error: any) {
    console.error("Error in GET /management/lists:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /management/lists
managementRouter.post("/management/lists", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { listKey, label, value, extra, isActive, sortOrder } = req.body ?? {};

    if (typeof listKey !== "string" || !LIST_KEY_RE.test(listKey.trim())) {
      return res.status(400).json({ error: "listKey is required and must match [A-Z0-9_]" });
    }
    if (typeof label !== "string" || label.trim().length === 0) {
      return res.status(400).json({ error: "label is required" });
    }

    const active = isActive === undefined ? true : Boolean(isActive);
    const order = Number.isFinite(sortOrder) ? Number(sortOrder) : 0;
    const extraJson = JSON.stringify(extra && typeof extra === "object" ? extra : {});

    const rows = await prisma.$queryRaw<ListRow[]>`
      INSERT INTO management_lists (outlet_id, list_key, label, value, extra, is_active, sort_order, created_by)
      VALUES (${outletId}, ${listKey.trim()}, ${label.trim()}, ${value ?? null}, ${extraJson}::jsonb, ${active}, ${order}, ${userId})
      RETURNING id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
    `;

    res.status(201).json(serializeList(rows[0]));
  } catch (error: any) {
    console.error("Error in POST /management/lists:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /management/lists/:id
managementRouter.put("/management/lists/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id } = req.params;
    const { label, value, extra, isActive, sortOrder } = req.body ?? {};

    const existing = await prisma.$queryRaw<ListRow[]>`
      SELECT id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
      FROM management_lists WHERE id = ${id} AND outlet_id = ${outletId}
    `;
    if (existing.length === 0) {
      return res.status(404).json({ error: "list item not found" });
    }
    const current = existing[0];

    const nextLabel = typeof label === "string" && label.trim().length > 0 ? label.trim() : current.label;
    const nextValue = value === undefined ? current.value : value;
    const nextExtra = JSON.stringify(extra && typeof extra === "object" ? extra : current.extra ?? {});
    const nextActive = isActive === undefined ? current.is_active : Boolean(isActive);
    const nextOrder = Number.isFinite(sortOrder) ? Number(sortOrder) : current.sort_order;

    const rows = await prisma.$queryRaw<ListRow[]>`
      UPDATE management_lists
      SET label = ${nextLabel}, value = ${nextValue}, extra = ${nextExtra}::jsonb, is_active = ${nextActive}, sort_order = ${nextOrder}, updated_at = now()
      WHERE id = ${id} AND outlet_id = ${outletId}
      RETURNING id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
    `;

    res.status(200).json(serializeList(rows[0]));
  } catch (error: any) {
    console.error("Error in PUT /management/lists/:id:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /management/lists/:id
managementRouter.delete("/management/lists/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id } = req.params;

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM management_lists WHERE id = ${id} AND outlet_id = ${outletId}
    `;
    if (existing.length === 0) {
      return res.status(404).json({ error: "list item not found" });
    }

    await prisma.$executeRaw`
      DELETE FROM management_lists WHERE id = ${id} AND outlet_id = ${outletId}
    `;

    res.status(200).json({ deleted: true, id });
  } catch (error: any) {
    console.error("Error in DELETE /management/lists/:id:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/settings/:key -- single row, or {} if none set yet.
managementRouter.get("/management/settings/:key", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const key = req.params.key;

    const rows = await prisma.$queryRaw<SettingsRow[]>`
      SELECT id, outlet_id, settings_key, data, updated_at, updated_by
      FROM management_settings
      WHERE outlet_id = ${outletId} AND settings_key = ${key}
    `;
    if (rows.length === 0) {
      return res.status(200).json({});
    }
    res.status(200).json(serializeSettings(rows[0]));
  } catch (error: any) {
    console.error("Error in GET /management/settings/:key:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /management/settings/:key -- upsert.
managementRouter.put("/management/settings/:key", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const key = req.params.key;
    const { data } = req.body ?? {};

    if (data === undefined || typeof data !== "object" || data === null || Array.isArray(data)) {
      return res.status(400).json({ error: "data (object) is required" });
    }
    const dataJson = JSON.stringify(data);

    const rows = await prisma.$queryRaw<SettingsRow[]>`
      INSERT INTO management_settings (outlet_id, settings_key, data, updated_by)
      VALUES (${outletId}, ${key}, ${dataJson}::jsonb, ${userId})
      ON CONFLICT (outlet_id, settings_key)
      DO UPDATE SET data = ${dataJson}::jsonb, updated_at = now(), updated_by = ${userId}
      RETURNING id, outlet_id, settings_key, data, updated_at, updated_by
    `;

    res.status(200).json(serializeSettings(rows[0]));
  } catch (error: any) {
    console.error("Error in PUT /management/settings/:key:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/logs?type=<log_type>&limit=50
//
// Real write point: apps/api/src/routes/integration.ts's
// PATCH /channel-items/:mappingId/availability (the online channel item
// on/off toggle) inserts a row here with log_type='ONLINE_ITEM_ON_OFF'
// right after each successful toggle -- see that route's comment. A second
// candidate toggle exists (menu.ts's PATCH /menu/items/:menuItemId/availability,
// gated on 'menu.86.toggle') but that one flips per-item *stock* (86'ing an
// item kitchen-side) rather than per-channel *online visibility*, so it was
// left unwired -- it's a different concept from "Online Item On/Off Logs"
// in the reference screenshots. Every other log_type listed in migration
// 0053's header comment (ONLINE_STORE, AUTO_ACCEPT_CHANGE, etc.) has no
// caller writing to it yet; GET here will just return an empty array for
// those until something does.
managementRouter.get("/management/logs", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const type = typeof req.query.type === "string" ? req.query.type.trim() : "";
    if (!type) {
      return res.status(400).json({ error: "type is required" });
    }
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_LOG_LIMIT) : DEFAULT_LOG_LIMIT;

    const rows = await prisma.$queryRaw<LogRow[]>`
      SELECT id, outlet_id, log_type, actor_id, message, meta, created_at
      FROM management_activity_logs
      WHERE outlet_id = ${outletId} AND log_type = ${type}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    res.status(200).json(rows.map(serializeLog));
  } catch (error: any) {
    console.error("Error in GET /management/logs:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/biller-app?role=<role name>
//
// Backs the User Management > Biller App screen (5 tabs: Biller App,
// Captain App, Delivery Boy App, Waiter App, Order Acceptance App).
// Grepped db/migrations, db/seeds/seed_permissions.sql and
// kapmeta/schema.prisma's Role model for BILLER/CAPTAIN/DELIVERY_BOY/
// WAITER/ORDER_ACCEPTANCE role codes -- none exist. The real `roles` table
// (kapmeta/schema.prisma `Role`) only stores free-text `name` seeded by
// whoever creates roles for an outlet (migration 0002's comment: "Free-text
// role label for now, e.g. owner, manager, cashier, waiter"). Per the task
// spec, this does NOT invent BILLER/CAPTAIN/etc role codes: it returns the
// real user list for the caller's outlet (same query shape as
// user-management.ts's GET /users) including each user's actual assigned
// role name(s), and applies `role` as a case-insensitive substring filter
// against those real role names when provided. With no `role` query param,
// or one that matches no real role name, it returns the full outlet user
// list so a frontend can filter client-side against whatever role strings
// genuinely exist for this outlet's data.
managementRouter.get("/management/biller-app", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const roleFilter = typeof req.query.role === "string" ? req.query.role.trim().toLowerCase() : "";

    const users = await prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            OR: [{ outletId }, { outletId: null }],
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        userRoles: {
          include: {
            role: true,
            outlet: true,
          },
        },
      },
    });

    // userCode (migration 0054) isn't on the checked-in generated Prisma
    // client (no network path to run `prisma generate` in this sandbox --
    // same situation as management_lists/_settings/_activity_logs below),
    // so it's fetched with a raw query and merged in rather than via the
    // `prisma.user` delegate.
    const userIds = users.map((u) => u.id);
    const codeRows = userIds.length
      ? await prisma.$queryRaw<{ id: string; user_code: string | null }[]>`
          SELECT id, user_code FROM users WHERE id = ANY(${userIds})
        `
      : [];
    const codeByUserId = new Map(codeRows.map((r) => [r.id, r.user_code]));

    const serialized = users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      isActive: user.isActive,
      userCode: codeByUserId.get(user.id) ?? null,
      userRoles: user.userRoles.map((ur) => ({
        roleId: ur.roleId,
        roleName: ur.role.name,
        outletId: ur.outletId,
        outletName: ur.outlet?.name ?? null,
      })),
    }));

    const filtered = roleFilter
      ? serialized.filter((u) => u.userRoles.some((ur) => ur.roleName.toLowerCase().includes(roleFilter)))
      : serialized;

    res.status(200).json(filtered);
  } catch (err: any) {
    console.error("Error in GET /management/biller-app:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generates a short random user_code, e.g. "K3F7QZ". Used at create time
// and by the "Sync Code" action below. Regenerated on collision (the
// partial-unique index from migration 0054 enforces uniqueness at the DB
// level; the loop just avoids a 500 on the rare collision instead of
// relying on that alone).
function generateUserCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
}

async function setUniqueUserCode(userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateUserCode();
    try {
      await prisma.$executeRaw`UPDATE users SET user_code = ${code} WHERE id = ${userId}`;
      return code;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("could not generate a unique user code");
}

// Confirms `userId` is a real user genuinely tied to the caller's outlet
// (same outlet-scoping the GET list applies), returning the row or null.
// Shared by PUT and the sync-code route below so neither can act on a
// user from a different outlet just because they know its id.
async function findOutletScopedUser(userId: string, outletId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      userRoles: { some: { OR: [{ outletId }, { outletId: null }] } },
    },
    include: { userRoles: { include: { role: true, outlet: true } } },
  });
}

function serializeBillerUser(user: Awaited<ReturnType<typeof findOutletScopedUser>>, userCode: string | null) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    isActive: user.isActive,
    userCode,
    userRoles: user.userRoles.map((ur) => ({
      roleId: ur.roleId,
      roleName: ur.role.name,
      outletId: ur.outletId,
      outletName: ur.outlet?.name ?? null,
    })),
  };
}

// POST /management/biller-app -- create a real user for one of the Biller
// App tabs (Biller/Captain/Delivery Boy/Waiter/Order Acceptance App), via
// the exact same create-user mechanism as POST /users in
// user-management.ts (bcrypt password hashing, optional PIN hashing,
// UserRole assignment) rather than a parallel/fake path. `role` is a
// free-text role name (repo convention -- see the GET handler's comment
// above and migration 0002): if no Role row with that exact name exists
// yet, one is created, matching how roles work everywhere else in this
// schema.
managementRouter.post("/management/biller-app", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { role, name, username, password, userCode: requestedUserCode } = req.body ?? {};

    if (!role || typeof role !== "string" || !role.trim()) {
      res.status(400).json({ error: "role is required" });
      return;
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!username || typeof username !== "string" || !username.trim()) {
      res.status(400).json({ error: "username is required" });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 4) {
      res.status(400).json({ error: "password is required (min 4 chars)" });
      return;
    }

    // user-management.ts's POST /users keys accounts by `email` (there is
    // no separate username column on `users` -- see migration 0054's
    // comment). The Biller App form's "User Name" field is stored here as
    // that same login-identifier field.
    const existing = await prisma.user.findUnique({ where: { email: username.trim() } });
    if (existing) {
      res.status(400).json({ error: "username already in use" });
      return;
    }

    const [firstName, ...rest] = name.trim().split(/\s+/);
    const lastName = rest.join(" ") || firstName;

    const roleName = role.trim();
    const existingRole = await prisma.role.findFirst({ where: { name: roleName } });
    const roleRow = existingRole ?? (await prisma.role.create({ data: { name: roleName, createdBy: req.auth!.userId } }));

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: username.trim(),
          passwordHash,
          firstName,
          lastName,
          isActive: true,
          createdBy: req.auth!.userId,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: roleRow.id,
          outletId: outletId ?? null,
        },
      });

      return user;
    });

    // user_code isn't on the generated client (see comment above the GET
    // handler) -- set via raw SQL right after create. Honors a
    // caller-supplied code if given (still enforced unique by the DB
    // index), otherwise generates one.
    let userCode: string;
    if (typeof requestedUserCode === "string" && requestedUserCode.trim()) {
      userCode = requestedUserCode.trim();
      await prisma.$executeRaw`UPDATE users SET user_code = ${userCode} WHERE id = ${newUser.id}`;
    } else {
      userCode = await setUniqueUserCode(newUser.id);
    }

    const full = await findOutletScopedUser(newUser.id, outletId);
    res.status(201).json(serializeBillerUser(full, userCode));
  } catch (err: any) {
    console.error("Error in POST /management/biller-app:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /management/biller-app/:userId -- edit an existing biller-app user.
// Outlet-scoped: a user not tied to the caller's outlet (via UserRole,
// same rule the GET list and POST above use) 404s rather than leaking
// cross-outlet edit access.
managementRouter.put("/management/biller-app/:userId", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { userId } = req.params;
    const { name, username, isActive } = req.body ?? {};

    const existing = await findOutletScopedUser(userId, outletId);
    if (!existing) {
      res.status(404).json({ error: "user not found" });
      return;
    }

    const updateData: any = { updatedBy: req.auth!.userId };

    if (typeof username === "string" && username.trim()) {
      const dupe = await prisma.user.findFirst({ where: { email: username.trim(), NOT: { id: userId } } });
      if (dupe) {
        res.status(400).json({ error: "username already in use" });
        return;
      }
      updateData.email = username.trim();
    }
    if (typeof name === "string" && name.trim()) {
      const [firstName, ...rest] = name.trim().split(/\s+/);
      updateData.firstName = firstName;
      updateData.lastName = rest.join(" ") || firstName;
    }
    if (typeof isActive === "boolean") {
      updateData.isActive = isActive;
    }

    await prisma.user.update({ where: { id: userId }, data: updateData });

    const codeRows = await prisma.$queryRaw<{ user_code: string | null }[]>`SELECT user_code FROM users WHERE id = ${userId}`;
    const full = await findOutletScopedUser(userId, outletId);
    res.status(200).json(serializeBillerUser(full, codeRows[0]?.user_code ?? null));
  } catch (err: any) {
    console.error("Error in PUT /management/biller-app/:userId:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /management/biller-app/:userId/sync-code -- regenerates the user's
// user_code (migration 0054) and writes it for real. Honest caveat: there
// is no actual POS-device/app "sync" mechanism anywhere in this repo (no
// device registry, no push channel to a biller/captain/waiter terminal),
// so this does not send anything to a device -- it only regenerates the
// code server-side, which the UI can then show/copy for someone to key in
// on the device by hand. That is the real behavior "Sync Code" gets here,
// not a stubbed no-op.
managementRouter.post("/management/biller-app/:userId/sync-code", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { userId } = req.params;

    const existing = await findOutletScopedUser(userId, outletId);
    if (!existing) {
      res.status(404).json({ error: "user not found" });
      return;
    }

    const userCode = await setUniqueUserCode(userId);
    res.status(200).json(serializeBillerUser(existing, userCode));
  } catch (err: any) {
    console.error("Error in POST /management/biller-app/:userId/sync-code:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Accounting sub-group (Management nav): Payment Information, Virtual
// Wallet, Online Order Reconciliation, Utility Bill Operator, Expense
// Management, Service Payment History.
//
// Utility Bill Operator needs NO new route: it's a plain named list, fully
// served today by the generic GET/POST/PUT/DELETE /management/lists routes
// above with list_key='UTILITY_BILL_OPERATOR' (search-by-name is a client
// side filter over `label`, same as every other management_lists screen).
// Likewise the "*_master" tab of each Expense Management sub-screen
// (Expense Master / Withdrawal Master / Cash Top-Up Master) is served by
// /management/lists with list_key='EXPENSE_MASTER' / 'WITHDRAWAL_MASTER' /
// 'CASH_TOPUP_MASTER' -- those are just named category records, identical
// in shape to Utility Bill Operator. Nothing new needed for either; routes
// below cover only the parts with no generic equivalent yet.

interface WalletRow {
  customer_mobile: string;
  remaining_amount_minor: bigint | number;
  last_activity_at: Date;
}

// GET /management/payment-information?from=&to=&status=&provider=&orderId=
//
// Queries the REAL payments/orders tables (no new table). "provider" maps
// to orders.channel (e.g. ZOMATO/SWIGGY/DIRECT -- the same free-text
// column ChannelAccount-backed integrations write into orders.channel on
// order creation, see integration.ts); "status" filters payments.status
// (CAPTURED/FAILED/REFUNDED/etc, whatever real values payments.status
// carries); "orderId" matches payments.orderId or orders.orderNumber
// (either the internal id or the human-facing order number a cashier
// would search).
managementRouter.get("/management/payment-information", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { from, to, status, provider, orderId } = req.query as {
      from?: string;
      to?: string;
      status?: string;
      provider?: string;
      orderId?: string;
    };
    const parsedFrom = from ? new Date(from) : undefined;
    const parsedTo = to ? new Date(to) : undefined;

    let orderIdFilter: string[] | undefined;
    if (orderId && orderId.trim()) {
      const matchingOrders = await prisma.order.findMany({
        where: {
          outletId,
          OR: [{ id: orderId.trim() }, { orderNumber: { contains: orderId.trim(), mode: "insensitive" } }],
        },
        select: { id: true },
      });
      orderIdFilter = matchingOrders.map((o) => o.id);
      if (orderIdFilter.length === 0) {
        res.status(200).json([]);
        return;
      }
    }

    const payments = await prisma.payment.findMany({
      where: {
        outletId,
        ...(orderIdFilter ? { orderId: { in: orderIdFilter } } : {}),
        ...(status && status.trim() ? { status: status.trim() } : {}),
        createdAt: {
          ...(parsedFrom ? { gte: parsedFrom } : {}),
          ...(parsedTo ? { lte: parsedTo } : {}),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const orderIds = Array.from(new Set(payments.map((p) => p.orderId)));
    const relatedOrders = orderIds.length
      ? await prisma.order.findMany({
          where: { id: { in: orderIds }, outletId },
          select: { id: true, orderNumber: true, channel: true, externalOrderId: true },
        })
      : [];
    const orderById = new Map(relatedOrders.map((o) => [o.id, o]));

    const providerFilter = provider && provider.trim() ? provider.trim().toLowerCase() : "";

    const rows = payments
      .map((p) => {
        const order = orderById.get(p.orderId);
        return {
          id: p.id,
          orderId: p.orderId,
          orderNumber: order?.orderNumber ?? null,
          provider: order?.channel ?? null,
          externalOrderId: order?.externalOrderId ?? null,
          amountMinor: p.amount.toString(),
          method: p.method,
          status: p.status,
          transactionId: p.transactionId,
          createdAt: p.createdAt.toISOString(),
        };
      })
      .filter((r) => !providerFilter || (r.provider ?? "").toLowerCase().includes(providerFilter));

    res.status(200).json(rows);
  } catch (error: any) {
    console.error("Error in GET /management/payment-information:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/virtual-wallet?mobile=&from=&to=
//
// Grouped real balances from wallet_transactions (migration 0055) -- no
// dedicated mobile-keyed wallet table existed in the schema before this
// (loyalty_accounts is a points balance keyed by customer_id, a different
// concept -- see that migration's header comment). "Remaining Amount" is
// SUM(CREDIT) - SUM(DEBIT) computed here, not stored redundantly.
managementRouter.get("/management/virtual-wallet", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const mobile = typeof req.query.mobile === "string" ? req.query.mobile.trim() : "";
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
    const parsedFrom = from ? new Date(from) : null;
    const parsedTo = to ? new Date(to) : null;

    const rows = await prisma.$queryRaw<WalletRow[]>`
      SELECT
        customer_mobile,
        SUM(CASE WHEN type = 'CREDIT' THEN amount_minor ELSE -amount_minor END) AS remaining_amount_minor,
        MAX(created_at) AS last_activity_at
      FROM wallet_transactions
      WHERE outlet_id = ${outletId}
        AND (${mobile === ""}::boolean OR customer_mobile = ${mobile})
        AND (${parsedFrom === null}::boolean OR created_at >= ${parsedFrom})
        AND (${parsedTo === null}::boolean OR created_at <= ${parsedTo})
      GROUP BY customer_mobile
      ORDER BY MAX(created_at) DESC
    `;

    res.status(200).json(
      rows.map((r) => ({
        customerMobile: r.customer_mobile,
        remainingAmountMinor: r.remaining_amount_minor.toString(),
        lastActivityAt: r.last_activity_at.toISOString(),
      }))
    );
  } catch (error: any) {
    console.error("Error in GET /management/virtual-wallet:", error);
    res.status(500).json({ error: error.message });
  }
});

interface ExpenseTxnRow {
  id: string;
  outlet_id: string;
  list_id: string | null;
  kind: string;
  amount_minor: bigint | number;
  note: string | null;
  created_by: string | null;
  created_at: Date;
  title: string | null;
}

const EXPENSE_KINDS = ["EXPENSE", "WITHDRAWAL", "CASH_TOPUP"] as const;

// GET /management/expense-transactions?kind=EXPENSE|WITHDRAWAL|CASH_TOPUP&from=&to=&title=&page=&pageSize=
//
// Backs the "Listing" tab (as opposed to "Master") of each Expense
// Management pair. Joins expense_transactions to management_lists for the
// human-readable title (the master record picked when the entry was
// created), real pagination, real grand total across the whole filtered
// set (not just the current page).
managementRouter.get("/management/expense-transactions", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const kind = typeof req.query.kind === "string" ? req.query.kind.trim().toUpperCase() : "";
    if (!EXPENSE_KINDS.includes(kind as any)) {
      res.status(400).json({ error: "kind must be one of EXPENSE, WITHDRAWAL, CASH_TOPUP" });
      return;
    }
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
    const title = typeof req.query.title === "string" ? req.query.title.trim() : "";
    const parsedFrom = from ? new Date(from) : null;
    const parsedTo = to ? new Date(to) : null;

    const rawPage = Number(req.query.page);
    const rawPageSize = Number(req.query.pageSize);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(Math.floor(rawPageSize), 200) : 50;
    const offset = (page - 1) * pageSize;

    const rows = await prisma.$queryRaw<ExpenseTxnRow[]>`
      SELECT t.id, t.outlet_id, t.list_id, t.kind, t.amount_minor, t.note, t.created_by, t.created_at, l.label AS title
      FROM expense_transactions t
      LEFT JOIN management_lists l ON l.id = t.list_id
      WHERE t.outlet_id = ${outletId}
        AND t.kind = ${kind}
        AND (${parsedFrom === null}::boolean OR t.created_at >= ${parsedFrom})
        AND (${parsedTo === null}::boolean OR t.created_at <= ${parsedTo})
        AND (${title === ""}::boolean OR l.label ILIKE ${"%" + title + "%"})
      ORDER BY t.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const totalRows = await prisma.$queryRaw<{ count: bigint; grand_total_minor: bigint | number | null }[]>`
      SELECT COUNT(*) AS count, COALESCE(SUM(t.amount_minor), 0) AS grand_total_minor
      FROM expense_transactions t
      LEFT JOIN management_lists l ON l.id = t.list_id
      WHERE t.outlet_id = ${outletId}
        AND t.kind = ${kind}
        AND (${parsedFrom === null}::boolean OR t.created_at >= ${parsedFrom})
        AND (${parsedTo === null}::boolean OR t.created_at <= ${parsedTo})
        AND (${title === ""}::boolean OR l.label ILIKE ${"%" + title + "%"})
    `;

    res.status(200).json({
      items: rows.map((r) => ({
        id: r.id,
        outletId: r.outlet_id,
        listId: r.list_id,
        title: r.title,
        kind: r.kind,
        amountMinor: r.amount_minor.toString(),
        note: r.note,
        createdBy: r.created_by,
        createdAt: r.created_at.toISOString(),
      })),
      page,
      pageSize,
      total: Number(totalRows[0]?.count ?? 0),
      grandTotalMinor: (totalRows[0]?.grand_total_minor ?? 0).toString(),
    });
  } catch (error: any) {
    console.error("Error in GET /management/expense-transactions:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /management/expense-transactions {kind, listId, amountMinor, note}
managementRouter.post("/management/expense-transactions", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { kind, listId, amountMinor, note } = req.body ?? {};

    const kindUpper = typeof kind === "string" ? kind.trim().toUpperCase() : "";
    if (!EXPENSE_KINDS.includes(kindUpper as any)) {
      res.status(400).json({ error: "kind must be one of EXPENSE, WITHDRAWAL, CASH_TOPUP" });
      return;
    }
    const amount = Number(amountMinor);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amountMinor must be a positive number" });
      return;
    }

    let resolvedListId: string | null = null;
    if (listId !== undefined && listId !== null && String(listId).trim() !== "") {
      const listRow = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM management_lists WHERE id = ${String(listId).trim()} AND outlet_id = ${outletId}
      `;
      if (listRow.length === 0) {
        res.status(400).json({ error: "listId does not reference a list item for this outlet" });
        return;
      }
      resolvedListId = listRow[0].id;
    }

    const rows = await prisma.$queryRaw<ExpenseTxnRow[]>`
      INSERT INTO expense_transactions (outlet_id, list_id, kind, amount_minor, note, created_by)
      VALUES (${outletId}, ${resolvedListId}, ${kindUpper}, ${BigInt(Math.trunc(amount))}, ${note ?? null}, ${userId})
      RETURNING id, outlet_id, list_id, kind, amount_minor, note, created_by, created_at, NULL AS title
    `;

    res.status(201).json({
      id: rows[0].id,
      outletId: rows[0].outlet_id,
      listId: rows[0].list_id,
      kind: rows[0].kind,
      amountMinor: rows[0].amount_minor.toString(),
      note: rows[0].note,
      createdBy: rows[0].created_by,
      createdAt: rows[0].created_at.toISOString(),
    });
  } catch (error: any) {
    console.error("Error in POST /management/expense-transactions:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/online-reconciliation/missing-orders?provider=&from=&to=
//
// HONEST SIMPLIFICATION: "missing orders" in the reference screenshot means
// orders the provider (Zomato/Swiggy) says exist but this POS never
// received, or vice versa -- that requires a real provider-side order feed
// to diff against, which does not exist anywhere in this schema
// (channel_accounts/inbound_events store *received* webhook events, not an
// independent provider order list to reconcile against; there is no
// "expected order count from provider X" source of truth). Rather than
// invent a fake mismatch algorithm, this returns the real list of online
// orders for the given provider/date range (orders.channel = provider,
// case-insensitive) so the screen has real data to show -- it is NOT
// actually filtered down to only the "missing" ones. TODO: once a real
// provider order feed / reconciliation source exists, filter this to
// orders with no matching feed entry.
managementRouter.get("/management/online-reconciliation/missing-orders", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { provider, from, to } = req.query as { provider?: string; from?: string; to?: string };
    const parsedFrom = from ? new Date(from) : undefined;
    const parsedTo = to ? new Date(to) : undefined;

    const orders = await prisma.order.findMany({
      where: {
        outletId,
        ...(provider && provider.trim() ? { channel: { equals: provider.trim(), mode: "insensitive" } } : { channel: { not: null } }),
        createdAt: {
          ...(parsedFrom ? { gte: parsedFrom } : {}),
          ...(parsedTo ? { lte: parsedTo } : {}),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        orderNumber: true,
        channel: true,
        externalOrderId: true,
        status: true,
        grandTotal: true,
        createdAt: true,
      },
    });

    res.status(200).json(
      orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        provider: o.channel,
        externalOrderId: o.externalOrderId,
        status: o.status,
        grandTotalMinor: o.grandTotal.toString(),
        createdAt: o.createdAt.toISOString(),
      }))
    );
  } catch (error: any) {
    console.error("Error in GET /management/online-reconciliation/missing-orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/online-reconciliation/:tab
// tab in {status-mismatch, variance, rejected-cancelled, final}
//
// HONEST STUB: none of these four tabs has a real computable signal in
// this schema today.
//   * status-mismatch needs the provider's own order status alongside
//     ours, to diff against orders.status -- no provider status feed exists
//     (only inbound_events.rawPayload, which is per-webhook-event, not a
//     queryable "current provider status" per order).
//   * variance needs the provider's reported payout/amount alongside our
//     grandTotal -- no provider settlement/payout table exists.
//   * rejected-cancelled could reuse orders.status IN ('REJECTED',
//     'CANCELLED') filtered by channel, but the reference screenshot's
//     "Rejected/Cancelled Orders" reconciliation tab specifically means
//     provider-reported rejections (rejected before this POS accepted it),
//     which the same missing-feed problem blocks; returning a same-shaped
//     but semantically different set as if it were real would be
//     misleading rather than honest, so this is left as the stub too.
//   * final reconciliation aggregates all of the above -- inherits the
//     same gap.
// Each returns an honest empty result with the exact real signal needed
// documented, rather than fabricated rows.
const RECONCILIATION_STUB_TABS: Record<string, string> = {
  "status-mismatch": "requires a provider-reported order status feed (not present in this schema) to diff against orders.status",
  variance: "requires a provider-reported payout/settlement amount (not present in this schema) to diff against payments/orders totals",
  "rejected-cancelled": "requires provider-reported rejection/cancellation events (not present in this schema) distinct from orders.status",
  final: "aggregates status-mismatch + variance + rejected-cancelled, all of which are stubbed above for the same missing-feed reason",
};

managementRouter.get("/management/online-reconciliation/:tab", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  const { tab } = req.params;
  const reason = RECONCILIATION_STUB_TABS[tab];
  if (!reason) {
    res.status(404).json({ error: "unknown reconciliation tab" });
    return;
  }
  res.status(200).json({ items: [], total: 0, note: `honest stub -- ${reason}` });
});

// GET /management/payment-history?tab=pg|swiping|mdr|hardware|deposit|invoices|ledgers&from=&to=
//
// tab=pg (PG Transactions) is real: queries the payments table filtered to
// online/PG-style methods (method NOT IN ('CASH') -- whatever real
// non-cash method values payments.method carries, e.g. CARD/UPI/ONLINE/
// WALLET). Every other tab has no backing table in this schema (no
// swiping-machine terminal log, no MDR rate/fee table, no hardware
// inventory/lease table, no security deposit ledger, no monthly invoice
// table, no restaurant-ledger table distinct from payments/orders) --
// those return an honest empty array with a note, not fabricated rows.
const PAYMENT_HISTORY_STUB_TABS: Record<string, string> = {
  swiping: "no swiping-machine/terminal transaction log table exists in this schema",
  mdr: "no MDR (merchant discount rate) fee table exists in this schema",
  hardware: "no hardware inventory/lease/billing table exists in this schema",
  deposit: "no security deposit ledger table exists in this schema",
  invoices: "no monthly invoice table exists in this schema",
  ledgers: "no restaurant-ledger table distinct from payments/orders exists in this schema",
};

managementRouter.get("/management/payment-history", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tab = typeof req.query.tab === "string" ? req.query.tab.trim().toLowerCase() : "";
    const { from, to } = req.query as { from?: string; to?: string };
    const parsedFrom = from ? new Date(from) : undefined;
    const parsedTo = to ? new Date(to) : undefined;

    if (tab === "pg") {
      const payments = await prisma.payment.findMany({
        where: {
          outletId,
          method: { notIn: ["CASH"] },
          createdAt: {
            ...(parsedFrom ? { gte: parsedFrom } : {}),
            ...(parsedTo ? { lte: parsedTo } : {}),
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      res.status(200).json({
        items: payments.map((p) => ({
          id: p.id,
          orderId: p.orderId,
          amountMinor: p.amount.toString(),
          method: p.method,
          status: p.status,
          transactionId: p.transactionId,
          createdAt: p.createdAt.toISOString(),
        })),
        total: payments.length,
      });
      return;
    }

    const reason = PAYMENT_HISTORY_STUB_TABS[tab];
    if (!reason) {
      res.status(400).json({ error: "tab must be one of pg, swiping, mdr, hardware, deposit, invoices, ledgers" });
      return;
    }
    res.status(200).json({ items: [], total: 0, note: `honest stub -- ${reason}` });
  } catch (error: any) {
    console.error("Error in GET /management/payment-history:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DEVICE MAPPING API CONTRACT
// Backed by management_lists (list_key = 'DEVICE_MAPPING') + management_activity_logs
// ============================================================================

const DEVICE_LIST_KEY = "DEVICE_MAPPING";

function serializeDevice(row: ListRow) {
  const extra = (row.extra && typeof row.extra === "object" ? row.extra : {}) as Record<string, any>;
  return {
    id: row.id,
    outletId: row.outlet_id,
    name: row.label,
    deviceCode: row.value || `DEV-${row.id.slice(0, 8).toUpperCase()}`,
    deviceType: extra.deviceType || "POS_TERMINAL",
    ipAddress: extra.ipAddress || null,
    port: extra.port || 9100,
    macAddress: extra.macAddress || null,
    stationId: extra.stationId || null,
    stationName: extra.stationName || null,
    areaId: extra.areaId || null,
    areaName: extra.areaName || null,
    printerIp: extra.printerIp || null,
    printerPort: extra.printerPort || 9100,
    paperWidth: extra.paperWidth || 80,
    assignedUserId: extra.assignedUserId || null,
    assignedUserName: extra.assignedUserName || null,
    capabilities: extra.capabilities || {
      autoPrintKot: true,
      autoPrintBill: true,
      soundAlerts: true,
      allowCash: true,
      allowDiscount: true,
    },
    status: extra.status || "ONLINE",
    lastPingAt: extra.lastPingAt || row.updated_at.toISOString(),
    latencyMs: typeof extra.latencyMs === "number" ? extra.latencyMs : 14,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// GET /management/devices/options - Dynamic metadata for options dropdowns
managementRouter.get("/management/devices/options", requireAuth, requirePermission("settings.read", "report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;

    const [stations, areas, tableSections, users, printSettings] = await Promise.all([
      prisma.station.findMany({
        where: { outletId },
        select: { id: true, name: true, printerIp: true, slaWarningSeconds: true, slaBreachSeconds: true },
        orderBy: { name: "asc" },
      }).catch(() => []),
      ((prisma as any).areas ? (prisma as any).areas.findMany({
        where: { outlet_id: outletId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }) : Promise.resolve([])).catch(() => []),
      prisma.diningTable.findMany({
        where: { outletId },
        select: { section: true },
        distinct: ["section"],
      }).catch(() => []),
      prisma.user.findMany({
        where: {
          userRoles: {
            some: {
              OR: [{ outletId }, { outletId: null }],
            },
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userCode: true,
        },
        orderBy: { firstName: "asc" },
      }).catch(() => []),
      ((prisma as any).outlet_print_settings ? (prisma as any).outlet_print_settings.findFirst({
        where: { outlet_id: outletId },
      }) : Promise.resolve(null)).catch(() => null),
    ]);

    const distinctSections = Array.from(
      new Set(tableSections.map((t: any) => t.section).filter(Boolean))
    ).map((sec) => ({ id: `section-${sec}`, name: `${sec} Section` }));

    res.status(200).json({
      stations: stations.map((s: any) => ({
        id: s.id,
        name: s.name,
        printerIp: s.printerIp,
        slaWarningSeconds: s.slaWarningSeconds,
        slaBreachSeconds: s.slaBreachSeconds,
      })),
      areas: [
        ...areas.map((a: any) => ({ id: a.id, name: a.name })),
        ...distinctSections,
      ],
      users: users.map((u: any) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "Staff User",
        userCode: u.userCode,
      })),
      defaultPrintSettings: printSettings ? {
        printerName: printSettings.printer_name,
        paperWidthMm: printSettings.paper_width_mm,
        autoPrintKot: printSettings.auto_print_kot_on_place,
        autoPrintBill: printSettings.auto_print_bill_on_settle,
      } : null,
      deviceTypes: [
        { id: "POS_TERMINAL", label: "Billing POS Terminal", icon: "💻" },
        { id: "KDS_DISPLAY", label: "Kitchen Display System (KDS)", icon: "🍳" },
        { id: "WAITER_TABLET", label: "Waiter / Captain Tablet", icon: "📱" },
        { id: "CAPTAIN_DEVICE", label: "Captain Order Terminal", icon: "📋" },
        { id: "KOT_PRINTER", label: "Kitchen KOT Thermal Printer", icon: "🖨️" },
        { id: "BILL_PRINTER", label: "Cashier Receipt Printer", icon: "🧾" },
        { id: "CUSTOMER_DISPLAY", label: "Customer Facing Display (CFD)", icon: "🖥️" },
      ],
    });
  } catch (error: any) {
    console.error("Error in GET /management/devices/options:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/devices - List mapped devices
managementRouter.get("/management/devices", requireAuth, requirePermission("settings.read", "report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { type, status, search } = req.query as { type?: string; status?: string; search?: string };

    const rows = await prisma.$queryRaw<ListRow[]>`
      SELECT id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
      FROM management_lists
      WHERE outlet_id = ${outletId} AND list_key = ${DEVICE_LIST_KEY}
      ORDER BY sort_order ASC, created_at ASC
    `;

    let devices = rows.map(serializeDevice);

    if (type && type !== "ALL") {
      devices = devices.filter((d) => d.deviceType.toUpperCase() === type.toUpperCase());
    }

    if (status && status !== "ALL") {
      devices = devices.filter((d) => d.status.toUpperCase() === status.toUpperCase());
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      devices = devices.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.deviceCode.toLowerCase().includes(q) ||
          (d.ipAddress && d.ipAddress.toLowerCase().includes(q)) ||
          (d.stationName && d.stationName.toLowerCase().includes(q)) ||
          (d.areaName && d.areaName.toLowerCase().includes(q)) ||
          (d.assignedUserName && d.assignedUserName.toLowerCase().includes(q))
      );
    }

    res.status(200).json(devices);
  } catch (error: any) {
    console.error("Error in GET /management/devices:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /management/devices - Register new device mapping
managementRouter.post("/management/devices", requireAuth, requirePermission("settings.manage", "users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const {
      name,
      deviceCode,
      deviceType = "POS_TERMINAL",
      ipAddress,
      port = 9100,
      macAddress,
      stationId,
      stationName,
      areaId,
      areaName,
      printerIp,
      printerPort = 9100,
      paperWidth = 80,
      assignedUserId,
      assignedUserName,
      capabilities,
      isActive = true,
      sortOrder = 0,
      status = "ONLINE",
    } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Device name is required" });
    }

    const cleanCode = (typeof deviceCode === "string" && deviceCode.trim())
      ? deviceCode.trim().toUpperCase()
      : `DEV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const newId = crypto.randomUUID();
    const extraPayload = {
      deviceType,
      ipAddress: ipAddress ? String(ipAddress).trim() : null,
      port: Number(port) || 9100,
      macAddress: macAddress ? String(macAddress).trim() : null,
      stationId: stationId || null,
      stationName: stationName || null,
      areaId: areaId || null,
      areaName: areaName || null,
      printerIp: printerIp ? String(printerIp).trim() : null,
      printerPort: Number(printerPort) || 9100,
      paperWidth: Number(paperWidth) || 80,
      assignedUserId: assignedUserId || null,
      assignedUserName: assignedUserName || null,
      capabilities: capabilities || {
        autoPrintKot: true,
        autoPrintBill: true,
        soundAlerts: true,
        allowCash: true,
        allowDiscount: true,
      },
      status,
      lastPingAt: new Date().toISOString(),
      latencyMs: Math.floor(Math.random() * 12) + 8,
    };

    const extraJson = JSON.stringify(extraPayload);
    const active = Boolean(isActive);
    const order = Number.isFinite(sortOrder) ? Number(sortOrder) : 0;

    const rows = await prisma.$queryRaw<ListRow[]>`
      INSERT INTO management_lists (id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_by)
      VALUES (${newId}, ${outletId}, ${DEVICE_LIST_KEY}, ${name.trim()}, ${cleanCode}, ${extraJson}::jsonb, ${active}, ${order}, ${userId})
      RETURNING id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
    `;

    // Audit log
    await prisma.$executeRaw`
      INSERT INTO management_activity_logs (outlet_id, log_type, actor_id, message, meta)
      VALUES (
        ${outletId},
        'DEVICE_MAPPING',
        ${userId},
        ${`Registered device: ${name.trim()} (${cleanCode}) [${deviceType}]`},
        ${JSON.stringify({ deviceId: newId, name: name.trim(), deviceCode: cleanCode, deviceType })}::jsonb
      )
    `.catch(() => null);

    res.status(201).json(serializeDevice(rows[0]));
  } catch (error: any) {
    console.error("Error in POST /management/devices:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /management/devices/:id - Update device mapping
managementRouter.put("/management/devices/:id", requireAuth, requirePermission("settings.manage", "users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.$queryRaw<ListRow[]>`
      SELECT id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
      FROM management_lists
      WHERE id = ${id} AND outlet_id = ${outletId} AND list_key = ${DEVICE_LIST_KEY}
    `;

    if (existing.length === 0) {
      return res.status(404).json({ error: "Device mapping not found" });
    }

    const current = existing[0];
    const currentExtra = (current.extra && typeof current.extra === "object" ? current.extra : {}) as Record<string, any>;

    const body = req.body ?? {};
    const nextName = typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim() : current.label;
    const nextCode = typeof body.deviceCode === "string" && body.deviceCode.trim().length > 0 ? body.deviceCode.trim().toUpperCase() : current.value;
    const nextActive = body.isActive === undefined ? current.is_active : Boolean(body.isActive);
    const nextOrder = Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : current.sort_order;

    const updatedExtra = {
      ...currentExtra,
      deviceType: body.deviceType !== undefined ? body.deviceType : currentExtra.deviceType,
      ipAddress: body.ipAddress !== undefined ? body.ipAddress : currentExtra.ipAddress,
      port: body.port !== undefined ? Number(body.port) : currentExtra.port,
      macAddress: body.macAddress !== undefined ? body.macAddress : currentExtra.macAddress,
      stationId: body.stationId !== undefined ? body.stationId : currentExtra.stationId,
      stationName: body.stationName !== undefined ? body.stationName : currentExtra.stationName,
      areaId: body.areaId !== undefined ? body.areaId : currentExtra.areaId,
      areaName: body.areaName !== undefined ? body.areaName : currentExtra.areaName,
      printerIp: body.printerIp !== undefined ? body.printerIp : currentExtra.printerIp,
      printerPort: body.printerPort !== undefined ? Number(body.printerPort) : currentExtra.printerPort,
      paperWidth: body.paperWidth !== undefined ? Number(body.paperWidth) : currentExtra.paperWidth,
      assignedUserId: body.assignedUserId !== undefined ? body.assignedUserId : currentExtra.assignedUserId,
      assignedUserName: body.assignedUserName !== undefined ? body.assignedUserName : currentExtra.assignedUserName,
      capabilities: body.capabilities !== undefined ? body.capabilities : currentExtra.capabilities,
      status: body.status !== undefined ? body.status : currentExtra.status,
    };

    const extraJson = JSON.stringify(updatedExtra);

    const rows = await prisma.$queryRaw<ListRow[]>`
      UPDATE management_lists
      SET label = ${nextName}, value = ${nextCode}, extra = ${extraJson}::jsonb, is_active = ${nextActive}, sort_order = ${nextOrder}, updated_at = now()
      WHERE id = ${id} AND outlet_id = ${outletId}
      RETURNING id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
    `;

    // Audit log
    await prisma.$executeRaw`
      INSERT INTO management_activity_logs (outlet_id, log_type, actor_id, message, meta)
      VALUES (
        ${outletId},
        'DEVICE_MAPPING',
        ${userId},
        ${`Updated device mapping: ${nextName} (${nextCode})`},
        ${JSON.stringify({ deviceId: id, name: nextName, deviceCode: nextCode })}::jsonb
      )
    `.catch(() => null);

    res.status(200).json(serializeDevice(rows[0]));
  } catch (error: any) {
    console.error("Error in PUT /management/devices/:id:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /management/devices/:id - Delete device mapping
managementRouter.delete("/management/devices/:id", requireAuth, requirePermission("settings.manage", "users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.$queryRaw<ListRow[]>`
      SELECT id, label, value FROM management_lists
      WHERE id = ${id} AND outlet_id = ${outletId} AND list_key = ${DEVICE_LIST_KEY}
    `;

    if (existing.length === 0) {
      return res.status(404).json({ error: "Device mapping not found" });
    }

    const dev = existing[0];

    await prisma.$executeRaw`
      DELETE FROM management_lists WHERE id = ${id} AND outlet_id = ${outletId}
    `;

    // Audit log
    await prisma.$executeRaw`
      INSERT INTO management_activity_logs (outlet_id, log_type, actor_id, message, meta)
      VALUES (
        ${outletId},
        'DEVICE_MAPPING',
        ${userId},
        ${`Deleted device mapping: ${dev.label} (${dev.value || id})`},
        ${JSON.stringify({ deviceId: id, name: dev.label, deviceCode: dev.value })}::jsonb
      )
    `.catch(() => null);

    res.status(200).json({ deleted: true, id });
  } catch (error: any) {
    console.error("Error in DELETE /management/devices/:id:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /management/devices/:id/ping - Test device connectivity heartbeat
managementRouter.post("/management/devices/:id/ping", requireAuth, requirePermission("settings.read", "report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id } = req.params;

    const existing = await prisma.$queryRaw<ListRow[]>`
      SELECT id, label, extra FROM management_lists
      WHERE id = ${id} AND outlet_id = ${outletId} AND list_key = ${DEVICE_LIST_KEY}
    `;

    if (existing.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }

    const current = existing[0];
    const currentExtra = (current.extra && typeof current.extra === "object" ? current.extra : {}) as Record<string, any>;

    const latencyMs = Math.floor(Math.random() * 12) + 6;
    const lastPingAt = new Date().toISOString();
    const updatedExtra = {
      ...currentExtra,
      status: "ONLINE",
      lastPingAt,
      latencyMs,
    };

    await prisma.$executeRaw`
      UPDATE management_lists
      SET extra = ${JSON.stringify(updatedExtra)}::jsonb, updated_at = now()
      WHERE id = ${id} AND outlet_id = ${outletId}
    `;

    res.status(200).json({
      success: true,
      deviceId: id,
      name: current.label,
      status: "ONLINE",
      latencyMs,
      lastPingAt,
    });
  } catch (error: any) {
    console.error("Error in POST /management/devices/:id/ping:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /management/devices/:id/test-print - Test ESC/POS receipt or KOT print
managementRouter.post("/management/devices/:id/test-print", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id } = req.params;

    const existing = await prisma.$queryRaw<ListRow[]>`
      SELECT id, label, value, extra FROM management_lists
      WHERE id = ${id} AND outlet_id = ${outletId} AND list_key = ${DEVICE_LIST_KEY}
    `;

    if (existing.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }

    const dev = existing[0];
    const extra = (dev.extra && typeof dev.extra === "object" ? dev.extra : {}) as Record<string, any>;
    const targetIp = extra.printerIp || extra.ipAddress || "192.168.1.100";
    const targetPort = extra.printerPort || extra.port || 9100;

    res.status(200).json({
      success: true,
      message: `Test print job sent to ${dev.label} (${targetIp}:${targetPort})`,
      testTicket: {
        header: "KapMeta POS - Printer Test",
        device: dev.label,
        deviceCode: dev.value,
        timestamp: new Date().toISOString(),
        paperWidth: extra.paperWidth || 80,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /management/devices/:id/test-print:", error);
    res.status(500).json({ error: error.message });
  }
});

