import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// ============================================================================
// IN-MEMORY FALLBACK DB & SMART PRISMA CLIENT FOR PETPOOJA POS
// ============================================================================

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_OUTLET_ID = "11111111-1111-1111-1111-111111111111";

// Helper for generating UUIDs
export function genId(): string {
  return crypto.randomUUID();
}

// Memory database tables
class TableStore<T extends { id?: string }> {
  private items: Map<string, T> = new Map();

  constructor(initialItems: T[] = []) {
    for (const item of initialItems) {
      const id = item.id || genId();
      (item as any).id = id;
      this.items.set(id, { ...item });
    }
  }

  private resolveRelation(item: any, relKey: string): any {
    if (!item) return null;
    if (item[relKey] !== undefined) return item[relKey];

    if (relKey === "diningTable" && memoryDb?.diningTable) {
      if (!item.diningTableId) return null;
      return (
        memoryDb.diningTable.items.get(item.diningTableId) ||
        Array.from(memoryDb.diningTable.items.values()).find(
          (t: any) =>
            t.id?.toLowerCase() === item.diningTableId?.toLowerCase() ||
            t.tableNumber?.toLowerCase() === item.diningTableId?.toLowerCase() ||
            `tbl_${t.tableNumber?.toLowerCase()}` === item.diningTableId?.toLowerCase()
        ) ||
        null
      );
    }
    if (relKey === "order" && memoryDb?.order) {
      if (!item.orderId) return null;
      return memoryDb.order.items.get(item.orderId) || null;
    }
    if (relKey === "menuItem" && memoryDb?.menuItem) {
      if (!item.menuItemId) return null;
      return memoryDb.menuItem.items.get(item.menuItemId) || null;
    }
    if (relKey === "category" && memoryDb?.menuCategory) {
      if (!item.categoryId) return null;
      return memoryDb.menuCategory.items.get(item.categoryId) || null;
    }
    if (relKey === "user" && memoryDb?.user) {
      if (!item.userId) return null;
      return memoryDb.user.items.get(item.userId) || null;
    }
    if (relKey === "role" && memoryDb?.role) {
      if (!item.roleId) return null;
      return memoryDb.role.items.get(item.roleId) || null;
    }
    if (relKey === "station" && memoryDb?.station) {
      if (!item.stationId) return null;
      return memoryDb.station.items.get(item.stationId) || null;
    }
    if (relKey === "organization" && memoryDb?.organization) {
      if (!item.organizationId) return null;
      return memoryDb.organization.items.get(item.organizationId) || null;
    }
    if (relKey === "outlet" && memoryDb?.outlet) {
      if (!item.outletId) return null;
      return memoryDb.outlet.items.get(item.outletId) || null;
    }
    return null;
  }

  private matchesCondition(item: any, condition: any): boolean {
    if (!condition || typeof condition !== "object") return true;
    if (!item) return false;

    for (const [key, val] of Object.entries(condition)) {
      if (key === "OR" && Array.isArray(val)) {
        const matchesAny = val.some((subCond) => this.matchesCondition(item, subCond));
        if (!matchesAny) return false;
        continue;
      }
      if (key === "AND" && Array.isArray(val)) {
        const matchesAll = val.every((subCond) => this.matchesCondition(item, subCond));
        if (!matchesAll) return false;
        continue;
      }
      if (key === "NOT") {
        if (Array.isArray(val)) {
          const matchesAnyNot = val.some((subCond) => this.matchesCondition(item, subCond));
          if (matchesAnyNot) return false;
        } else if (this.matchesCondition(item, val)) {
          return false;
        }
        continue;
      }

      let itemVal = item[key];
      if (itemVal === undefined) {
        // Compound keys support: e.g. key is "outletId_dateKey"
        // and condition is { outletId: "...", dateKey: "..." }
        if (key.includes("_") && typeof val === "object" && val !== null && !Array.isArray(val)) {
          const allCompoundMatch = Object.entries(val).every(([subKey, subVal]) => {
            return item[subKey] !== undefined && this.matchesCondition(item, { [subKey]: subVal });
          });
          if (allCompoundMatch) {
            continue;
          } else {
            return false;
          }
        }
        const rel = this.resolveRelation(item, key);
        if (rel !== null) {
          itemVal = rel;
        }
      }

      if (val === null || val === undefined) {
        if (itemVal !== null && itemVal !== undefined) return false;
      } else if (typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
        const valObj = val as any;
        const opKeys = ["in", "notIn", "equals", "not", "contains", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "mode"];
        const hasOperator = Object.keys(valObj).some((k) => opKeys.includes(k));

        if (hasOperator) {
          const isInsensitive = valObj.mode === "insensitive";
          if ("in" in valObj && Array.isArray(valObj.in)) {
            const inList = isInsensitive ? valObj.in.map((x: any) => String(x).toLowerCase()) : valObj.in;
            const target = isInsensitive ? String(itemVal ?? "").toLowerCase() : itemVal;
            if (!inList.includes(target)) return false;
          }
          if ("notIn" in valObj && Array.isArray(valObj.notIn)) {
            const notInList = isInsensitive ? valObj.notIn.map((x: any) => String(x).toLowerCase()) : valObj.notIn;
            const target = isInsensitive ? String(itemVal ?? "").toLowerCase() : itemVal;
            if (!notInList.includes(target)) return false;
          }
          if ("equals" in valObj) {
            if (isInsensitive) {
              if (String(itemVal ?? "").toLowerCase() !== String(valObj.equals ?? "").toLowerCase()) return false;
            } else if (itemVal !== valObj.equals) {
              return false;
            }
          }
          if ("not" in valObj) {
            if (typeof valObj.not === "object" && valObj.not !== null) {
              if (this.matchesCondition(itemVal, valObj.not)) return false;
            } else if (isInsensitive) {
              if (String(itemVal ?? "").toLowerCase() === String(valObj.not ?? "").toLowerCase()) return false;
            } else if (itemVal === valObj.not) {
              return false;
            }
          }
          if ("contains" in valObj) {
            const needle = String(valObj.contains).toLowerCase();
            const haystack = String(itemVal ?? "").toLowerCase();
            if (!haystack.includes(needle)) return false;
          }
          if ("startsWith" in valObj) {
            const needle = String(valObj.startsWith).toLowerCase();
            const haystack = String(itemVal ?? "").toLowerCase();
            if (!haystack.startsWith(needle)) return false;
          }
          if ("endsWith" in valObj) {
            const needle = String(valObj.endsWith).toLowerCase();
            const haystack = String(itemVal ?? "").toLowerCase();
            if (!haystack.endsWith(needle)) return false;
          }
          if ("gt" in valObj && !(itemVal > valObj.gt)) return false;
          if ("gte" in valObj && !(itemVal >= valObj.gte)) return false;
          if ("lt" in valObj && !(itemVal < valObj.lt)) return false;
          if ("lte" in valObj && !(itemVal <= valObj.lte)) return false;
        } else {
          if (!itemVal || typeof itemVal !== "object") return false;
          if (!this.matchesCondition(itemVal, val)) return false;
        }
      } else if (val instanceof Date) {
        if (!itemVal || new Date(itemVal).getTime() !== val.getTime()) return false;
      } else {
        if (itemVal !== val) return false;
      }
    }
    return true;
  }

  async findMany(args?: {
    where?: any;
    include?: any;
    select?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  }): Promise<T[]> {
    let result = Array.from(this.items.values());

    if (args?.where) {
      result = result.filter((item) => this.matchesCondition(item, args.where));
    }

    if (args?.orderBy) {
      const orderBys = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
      result.sort((a, b) => {
        for (const order of orderBys) {
          for (const [key, dir] of Object.entries(order)) {
            const aVal = (a as any)[key];
            const bVal = (b as any)[key];
            if (aVal < bVal) return dir === "desc" ? 1 : -1;
            if (aVal > bVal) return dir === "desc" ? -1 : 1;
          }
        }
        return 0;
      });
    }

    if (args?.skip) {
      result = result.slice(args.skip);
    }
    if (args?.take) {
      result = result.slice(0, args.take);
    }

    return result.map((item) => this.applyIncludeAndSelect(item, args?.include, args?.select));
  }

  async findUnique(args: { where: any; include?: any; select?: any }): Promise<T | null> {
    const list = await this.findMany({ where: args.where, include: args.include, select: args.select });
    return list[0] ?? null;
  }

  async findUniqueOrThrow(args: { where: any; include?: any; select?: any }): Promise<T> {
    const result = await this.findUnique(args);
    if (!result) throw new Error("Record not found (findUniqueOrThrow)");
    return result;
  }

  async findFirst(args?: {
    where?: any;
    include?: any;
    select?: any;
    orderBy?: any;
  }): Promise<T | null> {
    const list = await this.findMany(args);
    return list[0] ?? null;
  }

  async create(args: { data: any; include?: any; select?: any }): Promise<T> {
    const id = args.data.id || (args.data.outletId && args.data.dateKey ? `${args.data.outletId}_${args.data.dateKey}` : genId());
    const now = new Date();
    const item: any = {
      ...args.data,
      id,
      createdAt: args.data.createdAt || now,
      updatedAt: now,
    };
    this.items.set(id, item);
    return this.applyIncludeAndSelect(item, args.include, args.select);
  }

  async createMany(args: { data: any[] }): Promise<{ count: number }> {
    for (const d of args.data) {
      await this.create({ data: d });
    }
    return { count: args.data.length };
  }

  async update(args: { where: any; data: any; include?: any; select?: any }): Promise<T> {
    const existing = await this.findUnique({ where: args.where });
    if (!existing) {
      throw new Error(`Record not found for update in table`);
    }
    const resolvedData: any = {};
    for (const [key, val] of Object.entries(args.data || {})) {
      if (val && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
        if ("increment" in val && typeof (val as any).increment === "number") {
          resolvedData[key] = (Number((existing as any)[key]) || 0) + (val as any).increment;
          continue;
        }
        if ("decrement" in val && typeof (val as any).decrement === "number") {
          resolvedData[key] = (Number((existing as any)[key]) || 0) - (val as any).decrement;
          continue;
        }
        if ("set" in val) {
          resolvedData[key] = (val as any).set;
          continue;
        }
      }
      resolvedData[key] = val;
    }
    const updated = {
      ...existing,
      ...resolvedData,
      updatedAt: new Date(),
    };
    this.items.set((updated as any).id || (existing as any).id, updated);
    return this.applyIncludeAndSelect(updated, args.include, args.select);
  }

  async updateMany(args: { where: any; data: any }): Promise<{ count: number }> {
    const list = await this.findMany({ where: args.where });
    for (const item of list) {
      await this.update({ where: { id: item.id }, data: args.data });
    }
    return { count: list.length };
  }

  async delete(args: { where: any }): Promise<T> {
    const existing = await this.findUnique({ where: args.where });
    if (!existing) {
      throw new Error(`Record not found for delete`);
    }
    this.items.delete(existing.id!);
    return existing;
  }

  async deleteMany(args?: { where?: any }): Promise<{ count: number }> {
    const list = await this.findMany(args);
    for (const item of list) {
      this.items.delete(item.id!);
    }
    return { count: list.length };
  }

  async upsert(args: {
    where: any;
    create: any;
    update: any;
    include?: any;
    select?: any;
  }): Promise<T> {
    const existing = await this.findUnique({ where: args.where });
    if (existing) {
      return this.update({ where: args.where, data: args.update, include: args.include, select: args.select });
    } else {
      return this.create({ data: args.create, include: args.include, select: args.select });
    }
  }

  async count(args?: { where?: any }): Promise<number> {
    const list = await this.findMany({ where: args?.where });
    return list.length;
  }

  async aggregate(args?: any): Promise<any> {
    const list = await this.findMany({ where: args?.where });
    const result: any = { _count: list.length, _sum: {}, _avg: {} };
    if (args?._sum) {
      for (const key of Object.keys(args._sum)) {
        result._sum[key] = list.reduce((acc, cur) => acc + (Number((cur as any)[key]) || 0), 0);
      }
    }
    return result;
  }

  async groupBy(args?: any): Promise<any[]> {
    const list = await this.findMany({ where: args?.where });
    return list;
  }

  private applyIncludeAndSelect(item: any, include?: any, select?: any): any {
    let result = { ...item };

    const allRels = { ...(include || {}) };
    if (select) {
      for (const [k, v] of Object.entries(select)) {
        if (typeof v === "object" && v !== null) {
          allRels[k] = v;
        }
      }
    }

    for (const [relKey, relOptions] of Object.entries(allRels)) {
      if (!relOptions) continue;
      const subInclude = typeof relOptions === "object" ? (relOptions as any).include : undefined;
      const subSelect = typeof relOptions === "object" ? (relOptions as any).select : undefined;
      const subWhere = typeof relOptions === "object" ? (relOptions as any).where : undefined;
      const subTake = typeof relOptions === "object" ? (relOptions as any).take : undefined;

      if (relKey === "role" && memoryDb.role) {
        const role = memoryDb.role.items.get(item.roleId);
        result.role = role ? memoryDb.role.applyIncludeAndSelect(role, subInclude, subSelect) : null;
      } else if (relKey === "rolePermissions" && memoryDb.rolePermission) {
        result.rolePermissions = Array.from(memoryDb.rolePermission.items.values())
          .filter((rp: any) => rp.roleId === item.id)
          .map((rp: any) => memoryDb.rolePermission.applyIncludeAndSelect(rp, subInclude, subSelect));
      } else if (relKey === "permission" && memoryDb.permission) {
        result.permission = memoryDb.permission.items.get(item.permissionId) || null;
      } else if (relKey === "userRoles" && memoryDb.userRole) {
        result.userRoles = Array.from(memoryDb.userRole.items.values()).filter((ur: any) => ur.userId === item.id);
      } else if (relKey === "organization" && memoryDb.organization) {
        result.organization = memoryDb.organization.items.get(item.organizationId) || null;
      } else if (relKey === "orders" && memoryDb.order) {
        let ordersList = Array.from(memoryDb.order.items.values()).filter(
          (o: any) =>
            o.diningTableId === item.id ||
            o.diningTableId?.toLowerCase() === item.id?.toLowerCase() ||
            o.diningTableId?.toLowerCase() === item.tableNumber?.toLowerCase() ||
            o.diningTableId?.toLowerCase() === `tbl_${item.tableNumber?.toLowerCase()}`
        );
        if (subWhere) {
          ordersList = ordersList.filter((o: any) => memoryDb.order.matchesCondition(o, subWhere));
        }
        ordersList.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (subTake && typeof subTake === "number") {
          ordersList = ordersList.slice(0, subTake);
        }
        result.orders = ordersList.map((o: any) => memoryDb.order.applyIncludeAndSelect(o, subInclude, subSelect));
      } else if (relKey === "orderItems" && memoryDb.orderItem) {
        result.orderItems = Array.from(memoryDb.orderItem.items.values())
          .filter((oi: any) => oi.orderId === item.id)
          .map((oi: any) => memoryDb.orderItem.applyIncludeAndSelect(oi, subInclude, subSelect));
      } else if (relKey === "items" && memoryDb.menuItem) {
        result.items = Array.from(memoryDb.menuItem.items.values()).filter((mi: any) => mi.categoryId === item.id);
      } else if (relKey === "category" && memoryDb.menuCategory) {
        result.category = memoryDb.menuCategory.items.get(item.categoryId) || null;
      } else if (relKey === "kotItems" && memoryDb.kotItem) {
        result.kotItems = Array.from(memoryDb.kotItem.items.values())
          .filter((ki: any) => ki.kotTicketId === item.id)
          .map((ki: any) => memoryDb.kotItem.applyIncludeAndSelect(ki, subInclude, subSelect));
      } else if (relKey === "kotTickets" && memoryDb.kotTicket) {
        result.kotTickets = Array.from(memoryDb.kotTicket.items.values())
          .filter((kt: any) => kt.orderId === item.id)
          .map((kt: any) => memoryDb.kotTicket.applyIncludeAndSelect(kt, subInclude, subSelect));
      } else if (relKey === "menuItem" && memoryDb.menuItem) {
        const mi = memoryDb.menuItem.items.get(item.menuItemId);
        result.menuItem = mi ? memoryDb.menuItem.applyIncludeAndSelect(mi, subInclude, subSelect) : null;
      } else if (relKey === "station" && memoryDb.station) {
        const station = memoryDb.station.items.get(item.stationId);
        result.station = station ? memoryDb.station.applyIncludeAndSelect(station, subInclude, subSelect) : null;
      } else if (relKey === "order" && memoryDb.order) {
        const order = memoryDb.order.items.get(item.orderId);
        result.order = order ? memoryDb.order.applyIncludeAndSelect(order, subInclude, subSelect) : null;
      } else if (relKey === "diningTable" && memoryDb.diningTable) {
        const tbl =
          memoryDb.diningTable.items.get(item.diningTableId) ||
          Array.from(memoryDb.diningTable.items.values()).find(
            (t: any) =>
              t.id?.toLowerCase() === item.diningTableId?.toLowerCase() ||
              t.tableNumber?.toLowerCase() === item.diningTableId?.toLowerCase() ||
              `tbl_${t.tableNumber?.toLowerCase()}` === item.diningTableId?.toLowerCase()
          );
      } else if (relKey === "customer" && memoryDb.customer) {
        const cust = memoryDb.customer.items.get(item.customerId);
        result.customer = cust ? memoryDb.customer.applyIncludeAndSelect(cust, subInclude, subSelect) : null;
      } else if (relKey === "waiter" && memoryDb.user) {
        const w = memoryDb.user.items.get(item.waiterId);
        result.waiter = w ? memoryDb.user.applyIncludeAndSelect(w, subInclude, subSelect) : null;
      } else if (relKey === "payments" && memoryDb.payment) {
        result.payments = Array.from(memoryDb.payment.items.values())
          .filter((p: any) => p.orderId === item.id)
          .map((p: any) => memoryDb.payment.applyIncludeAndSelect(p, subInclude, subSelect));
      } else if (relKey === "availabilities") {
        result.availabilities = [];
      }
    }

    if (select) {
      const selected: any = {};
      for (const [k, v] of Object.entries(select)) {
        if (v) selected[k] = result[k];
      }
      return selected;
    }

    return result;
  }
}

// Initial seed data
const ALL_PERMISSIONS = [
  "order.create", "order.read", "order.update", "order.void", "order.settle", "order.discount",
  "table.manage", "table.session.open", "table.session.close", "table.transfer",
  "menu.read", "menu.item.manage", "menu.category.manage", "menu.86.toggle",
  "kitchen.kds.view", "kitchen.kot.status", "kitchen.bump",
  "kot.read", "kot.status.update", "kot.create",
  "inventory.read", "inventory.manage", "inventory.po.create", "inventory.po.approve", "inventory.grn.create",
  "crm.read", "crm.write",
  "finance.read", "finance.expense.create", "finance.ledger.manage",
  "report.read", "report.financial.read",
  "settings.manage", "users.manage", "roles.manage", "outlets.manage",
];

const hashedPassword123 = bcrypt.hashSync("password123", 10);
const hashedPin1234 = bcrypt.hashSync("1234", 10);

const defaultRoles = [
  { id: "role-super-admin", name: "SUPER_ADMIN", description: "Full enterprise access" },
  { id: "role-cashier", name: "CASHIER", description: "Front desk billing cashier" },
  { id: "role-kitchen", name: "KITCHEN_USER", description: "Kitchen display staff" },
  { id: "role-waiter", name: "WAITER", description: "Floor captain / waiter" },
  { id: "role-manager", name: "OUTLET_MANAGER", description: "Outlet operations manager" },
  { id: "role-inventory", name: "INVENTORY_USER", description: "Store & stock manager" },
  { id: "role-finance", name: "FINANCE_USER", description: "Accounting & ledger manager" },
];

const defaultPermissions = ALL_PERMISSIONS.map((action, idx) => ({
  id: `perm-${idx + 1}`,
  action,
  description: `Permission for ${action}`,
}));

const defaultRolePermissions: any[] = [];
// SUPER_ADMIN gets all permissions
for (const p of defaultPermissions) {
  defaultRolePermissions.push({ id: `rp-admin-${p.id}`, roleId: "role-super-admin", permissionId: p.id });
}
// CASHIER permissions
const cashierActions = [
  "order.create", "order.read", "order.update", "order.settle", "order.discount",
  "table.manage", "table.session.open", "table.session.close",
  "menu.read", "menu.86.toggle", "report.read",
  "kot.read", "kot.status.update", "kot.create",
  "kitchen.kds.view", "kitchen.kot.status"
];
for (const p of defaultPermissions.filter((dp) => cashierActions.includes(dp.action))) {
  defaultRolePermissions.push({ id: `rp-cashier-${p.id}`, roleId: "role-cashier", permissionId: p.id });
}
// KITCHEN permissions
const kitchenActions = [
  "kitchen.kds.view", "kitchen.kot.status", "kitchen.bump",
  "kot.read", "kot.status.update", "kot.create",
  "menu.read", "menu.86.toggle", "report.read"
];
for (const p of defaultPermissions.filter((dp) => kitchenActions.includes(dp.action))) {
  defaultRolePermissions.push({ id: `rp-kitchen-${p.id}`, roleId: "role-kitchen", permissionId: p.id });
}
// WAITER permissions
const waiterActions = [
  "order.create", "order.read", "order.update",
  "table.manage", "table.session.open", "table.transfer",
  "menu.read", "menu.86.toggle",
  "kot.read", "kot.status.update", "kot.create",
  "kitchen.kds.view", "kitchen.kot.status"
];
for (const p of defaultPermissions.filter((dp) => waiterActions.includes(dp.action))) {
  defaultRolePermissions.push({ id: `rp-waiter-${p.id}`, roleId: "role-waiter", permissionId: p.id });
}

const defaultUsers = [
  {
    id: "user-admin",
    email: "admin@hotelkapila.com",
    passwordHash: hashedPassword123,
    pinHash: hashedPin1234,
    firstName: "Abdul",
    lastName: "Mannan",
    phone: "+91 9876543210",
    isActive: true,
  },
  {
    id: "user-cashier",
    email: "cashier@hotelkapila.com",
    passwordHash: hashedPassword123,
    pinHash: hashedPin1234,
    firstName: "Kapila",
    lastName: "Cashier",
    phone: "+91 9876543211",
    isActive: true,
  },
  {
    id: "user-chef",
    email: "chef@hotelkapila.com",
    passwordHash: hashedPassword123,
    pinHash: hashedPin1234,
    firstName: "Head",
    lastName: "Chef",
    phone: "+91 9876543212",
    isActive: true,
  },
  {
    id: "user-waiter",
    email: "waiter@hotelkapila.com",
    passwordHash: hashedPassword123,
    pinHash: hashedPin1234,
    firstName: "Floor",
    lastName: "Captain",
    phone: "+91 9876543213",
    isActive: true,
  },
];

const defaultUserRoles = [
  { id: "ur-1", userId: "user-admin", roleId: "role-super-admin", outletId: null }, // Org-wide grant
  { id: "ur-2", userId: "user-cashier", roleId: "role-cashier", outletId: DEFAULT_OUTLET_ID },
  { id: "ur-3", userId: "user-chef", roleId: "role-kitchen", outletId: DEFAULT_OUTLET_ID },
  { id: "ur-4", userId: "user-waiter", roleId: "role-waiter", outletId: DEFAULT_OUTLET_ID },
];

const defaultOrg = {
  id: DEFAULT_ORG_ID,
  name: "Hotel Kapila Hospitality Group",
  taxNumber: "36AAACH7412K1Z9",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const defaultOutlet = {
  id: DEFAULT_OUTLET_ID,
  organizationId: DEFAULT_ORG_ID,
  name: "Hotel Kapila",
  code: "NZB-01",
  address: "Pragathi Nagar, Central Nizamabad, Telangana 503001",
  timezone: "Asia/Kolkata",
  currency: "INR",
  dayStartTime: "06:00",
  isActive: true,
  fssaiNumber: "13622011000145",
  upiVpa: "hotelkapila@icici",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const defaultTables = [
  { id: "tbl-01", outletId: DEFAULT_OUTLET_ID, tableNumber: "T-01", capacity: 4, section: "Indoor AC", status: "VACANT", isActive: true },
  { id: "tbl-02", outletId: DEFAULT_OUTLET_ID, tableNumber: "T-02", capacity: 4, section: "Indoor AC", status: "VACANT", isActive: true },
  { id: "tbl-03", outletId: DEFAULT_OUTLET_ID, tableNumber: "T-03", capacity: 6, section: "Indoor AC", status: "VACANT", isActive: true },
  { id: "tbl-04", outletId: DEFAULT_OUTLET_ID, tableNumber: "T-04", capacity: 2, section: "Indoor AC", status: "VACANT", isActive: true },
  { id: "tbl-05", outletId: DEFAULT_OUTLET_ID, tableNumber: "T-05", capacity: 4, section: "Terrace Lounge", status: "VACANT", isActive: true },
  { id: "tbl-06", outletId: DEFAULT_OUTLET_ID, tableNumber: "T-06", capacity: 8, section: "Family Section", status: "VACANT", isActive: true },
  { id: "tbl-07", outletId: DEFAULT_OUTLET_ID, tableNumber: "B1", capacity: 2, section: "Bar", status: "VACANT", isActive: true },
  { id: "tbl-08", outletId: DEFAULT_OUTLET_ID, tableNumber: "B2", capacity: 2, section: "Bar", status: "VACANT", isActive: true },
  { id: "tbl-09", outletId: DEFAULT_OUTLET_ID, tableNumber: "B3", capacity: 4, section: "Bar", status: "VACANT", isActive: true },
  { id: "tbl-10", outletId: DEFAULT_OUTLET_ID, tableNumber: "B4", capacity: 4, section: "Bar", status: "VACANT", isActive: true },
  { id: "tbl-11", outletId: DEFAULT_OUTLET_ID, tableNumber: "B5", capacity: 6, section: "Bar", status: "VACANT", isActive: true },
  { id: "tbl-12", outletId: DEFAULT_OUTLET_ID, tableNumber: "B6", capacity: 4, section: "Bar", status: "VACANT", isActive: true },
];

const defaultCategories = [
  { id: "cat-1", outletId: DEFAULT_OUTLET_ID, name: "Biryani (Non-Veg)", sortOrder: 1, isActive: true },
  { id: "cat-2", outletId: DEFAULT_OUTLET_ID, name: "Biryani (Veg)", sortOrder: 2, isActive: true },
  { id: "cat-3", outletId: DEFAULT_OUTLET_ID, name: "Tandoori Starters (Non-Veg)", sortOrder: 3, isActive: true },
  { id: "cat-4", outletId: DEFAULT_OUTLET_ID, name: "Chinese Starters (Veg)", sortOrder: 4, isActive: true },
  { id: "cat-5", outletId: DEFAULT_OUTLET_ID, name: "Curries (Non-Veg)", sortOrder: 5, isActive: true },
  { id: "cat-6", outletId: DEFAULT_OUTLET_ID, name: "Roti & Breads", sortOrder: 6, isActive: true },
  { id: "cat-7", outletId: DEFAULT_OUTLET_ID, name: "Cold Beverage", sortOrder: 7, isActive: true },
  { id: "cat-8", outletId: DEFAULT_OUTLET_ID, name: "MOCKTAILS", sortOrder: 8, isActive: true },
];

const defaultMenuItems = [
  {
    id: "mi-1",
    outletId: DEFAULT_OUTLET_ID,
    categoryId: "cat-1",
    name: "Hotel Kapila Special Chicken Biryani (Boneless)",
    shortName: "Spl Chk Biryani",
    description: "Nizamabad signature boneless fried chicken masala over dum basmati rice.",
    price: 340,
    pricePaise: 34000,
    priceMinor: 34000,
    isVeg: false,
    taxRate: 5.0,
    isActive: true,
    isAvailable: true,
    stockQty: 50,
  },
  {
    id: "mi-2",
    outletId: DEFAULT_OUTLET_ID,
    categoryId: "cat-2",
    name: "Hyderabadi Paneer Dum Biryani",
    shortName: "Paneer Biryani",
    description: "Fragrant saffron basmati rice layered with spiced paneer cubes and herbs.",
    price: 280,
    pricePaise: 28000,
    priceMinor: 28000,
    isVeg: true,
    taxRate: 5.0,
    isActive: true,
    isAvailable: true,
    stockQty: 35,
  },
  {
    id: "mi-3",
    outletId: DEFAULT_OUTLET_ID,
    categoryId: "cat-3",
    name: "Murgh Malai Tikka",
    shortName: "Malai Tikka",
    description: "Creamy cashew and cardamom marinated chicken morsels grilled in tandoor.",
    price: 320,
    pricePaise: 32000,
    priceMinor: 32000,
    isVeg: false,
    taxRate: 5.0,
    isActive: true,
    isAvailable: true,
    stockQty: 40,
  },
  {
    id: "mi-4",
    outletId: DEFAULT_OUTLET_ID,
    categoryId: "cat-8",
    name: "Kapila Electric Blue Lagoon",
    shortName: "Blue Lagoon",
    description: "Blue curacao, fresh lime, sprite and crushed ice.",
    price: 160,
    pricePaise: 16000,
    priceMinor: 16000,
    isVeg: true,
    taxRate: 5.0,
    isActive: true,
    isAvailable: true,
    stockQty: 100,
  },
  {
    id: "mi-5",
    outletId: DEFAULT_OUTLET_ID,
    categoryId: "cat-6",
    name: "Butter Naan",
    shortName: "Butter Naan",
    description: "Traditional tandoor baked bread topped with rich dairy butter.",
    price: 60,
    pricePaise: 6000,
    priceMinor: 6000,
    isVeg: true,
    taxRate: 5.0,
    isActive: true,
    isAvailable: true,
    stockQty: 200,
  },
  {
    id: "mi-6",
    outletId: DEFAULT_OUTLET_ID,
    categoryId: "cat-5",
    name: "Butter Chicken Masala",
    shortName: "Butter Chicken",
    description: "Slow-cooked boneless tandoori chicken in creamy rich tomato gravy.",
    price: 360,
    pricePaise: 36000,
    priceMinor: 36000,
    isVeg: false,
    taxRate: 5.0,
    isActive: true,
    isAvailable: true,
    stockQty: 45,
  },
];

const defaultIngredients = [
  { id: "ing-1", outletId: DEFAULT_OUTLET_ID, name: "Aged Basmati Rice", unitOfMeasure: "kg", currentStock: 150.0, reorderLevel: 30.0, unitCostPaise: 11000 },
  { id: "ing-2", outletId: DEFAULT_OUTLET_ID, name: "Fresh Chicken (Boneless)", unitOfMeasure: "kg", currentStock: 45.0, reorderLevel: 15.0, unitCostPaise: 24000 },
  { id: "ing-3", outletId: DEFAULT_OUTLET_ID, name: "Fresh Paneer", unitOfMeasure: "kg", currentStock: 20.0, reorderLevel: 5.0, unitCostPaise: 32000 },
  { id: "ing-4", outletId: DEFAULT_OUTLET_ID, name: "Pure Desi Ghee", unitOfMeasure: "l", currentStock: 25.0, reorderLevel: 5.0, unitCostPaise: 65000 },
];

const defaultStations = [
  { id: "stn_kitchen", outletId: DEFAULT_OUTLET_ID, name: "Main Kitchen", printerIp: null, slaWarningSeconds: 600, slaBreachSeconds: 900, isActive: true },
  { id: "stn_bar", outletId: DEFAULT_OUTLET_ID, name: "Bar / Beverages", printerIp: null, slaWarningSeconds: 300, slaBreachSeconds: 600, isActive: true },
  { id: "stn_tandoor", outletId: DEFAULT_OUTLET_ID, name: "Tandoor", printerIp: null, slaWarningSeconds: 900, slaBreachSeconds: 1200, isActive: true },
];

export const memoryDb: Record<string, TableStore<any>> = {
  user: new TableStore(defaultUsers),
  userRole: new TableStore(defaultUserRoles),
  role: new TableStore(defaultRoles),
  rolePermission: new TableStore(defaultRolePermissions),
  permission: new TableStore(defaultPermissions),
  session: new TableStore([]),
  organization: new TableStore([defaultOrg]),
  outlet: new TableStore([defaultOutlet]),
  diningTable: new TableStore(defaultTables),
  diningTableSession: new TableStore([]),
  station: new TableStore(defaultStations),
  menuCategory: new TableStore(defaultCategories),
  menuItem: new TableStore(defaultMenuItems),
  menuSubcategory: new TableStore([]),
  menuItemVariant: new TableStore([]),
  modifierGroup: new TableStore([]),
  modifierOption: new TableStore([]),
  itemModifierGroup: new TableStore([]),
  order: new TableStore([]),
  orderItem: new TableStore([]),
  orderPayment: new TableStore([]),
  orderAuditLog: new TableStore([]),
  orderSequence: new TableStore([]),
  orderStatusHistory: new TableStore([]),
  kotTicket: new TableStore([]),
  kotItem: new TableStore([]),
  customer: new TableStore([]),
  crmCustomer: new TableStore([]),
  loyalty: new TableStore([]),
  inventoryItem: new TableStore(defaultIngredients),
  ingredient: new TableStore(defaultIngredients),
  recipe: new TableStore([]),
  supplier: new TableStore([]),
  purchaseOrder: new TableStore([]),
  goodsReceivedNote: new TableStore([]),
  campaign: new TableStore([]),
  coupon: new TableStore([]),
  discountRule: new TableStore([]),
  ledgerAccount: new TableStore([]),
  journalEntry: new TableStore([]),
  expense: new TableStore([]),
  waiter: new TableStore([]),
  kdsStation: new TableStore([]),
  notification: new TableStore([]),
  userQuickLink: new TableStore([]),
  auditLog: new TableStore([]),
  channelIntegration: new TableStore([]),
  syncLog: new TableStore([]),
};

// Create a proxy that behaves like PrismaClient but uses memoryDb tables
export function createMemoryPrismaClient(): any {
  let proxyInstance: any;
  const handler: ProxyHandler<any> = {
    get(target, prop: string) {
      if (prop === "$transaction") {
        return async (cb: (tx: any) => Promise<any>) => {
          if (typeof cb === "function") {
            return cb(proxyInstance);
          }
          if (Array.isArray(cb)) {
            return Promise.all(cb);
          }
          return cb;
        };
      }
      if (prop === "$queryRaw" || prop === "$executeRaw") {
        return async () => [];
      }
      if (prop in memoryDb) {
        return memoryDb[prop];
      }
      // Check case-insensitive variations (e.g. kOTTicket vs kotTicket)
      const lowerProp = typeof prop === "string" ? prop.toLowerCase() : "";
      const match = Object.keys(memoryDb).find((k) => k.toLowerCase() === lowerProp);
      if (match) {
        return memoryDb[match];
      }
      // If table doesn't exist yet, lazily create one
      if (typeof prop === "string" && !prop.startsWith("$") && !prop.startsWith("_")) {
        memoryDb[prop] = new TableStore([]);
        return memoryDb[prop];
      }
      return target[prop];
    },
  };
  proxyInstance = new Proxy({}, handler);
  return proxyInstance;
}

// Global exported instance
export const prisma = createMemoryPrismaClient();
export default prisma;
