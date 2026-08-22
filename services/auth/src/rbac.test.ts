import { describe, it, expect } from "vitest";
import { PrismaRbacChecker } from "./rbac";

// Minimal fake mimicking the subset of PrismaClient that checkPermission /
// listPermissions actually touch: userRole.findMany with the
// role -> rolePermissions -> permission include shape. Follows the same
// hand-rolled-fake convention used in rbac-security.test.ts and
// prisma-inventory-repository.test.ts (no real DB, no Prisma mocking lib).
function makeFakePrisma(userRoles: unknown[]) {
  return {
    userRole: {
      findMany: async () => userRoles,
    },
  } as any;
}

function role(name: string, actions: string[]) {
  return {
    role: {
      name,
      rolePermissions: actions.map((action) => ({ permission: { action } })),
    },
  };
}

describe("PrismaRbacChecker.checkPermission", () => {
  it("allows when an outlet-scoped grant includes the permission", async () => {
    const prisma = makeFakePrisma([
      { outletId: "outlet-1", ...role("MANAGER", ["order.void", "order.read"]) },
    ]);
    const rbac = new PrismaRbacChecker(prisma);

    const result = await rbac.checkPermission({ userId: "u-1", outletId: "outlet-1", action: "order.void" });

    expect(result).toEqual({ allowed: true });
  });

  it("allows when an org-wide grant (outletId null) includes the permission", async () => {
    const prisma = makeFakePrisma([
      { outletId: null, ...role("SUPER_ADMIN", ["order.void", "payment.refund"]) },
    ]);
    const rbac = new PrismaRbacChecker(prisma);

    const result = await rbac.checkPermission({ userId: "u-admin", outletId: "any-outlet", action: "payment.refund" });

    expect(result).toEqual({ allowed: true });
  });

  it("denies with a reason string when no matching role grants the action", async () => {
    const prisma = makeFakePrisma([
      { outletId: "outlet-1", ...role("CASHIER", ["order.create", "order.read"]) },
    ]);
    const rbac = new PrismaRbacChecker(prisma);

    const result = await rbac.checkPermission({ userId: "u-cashier", outletId: "outlet-1", action: "order.void" });

    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toBe("no role at this outlet grants 'order.void'");
  });

  it("denies when the user has no UserRole rows at all", async () => {
    const prisma = makeFakePrisma([]);
    const rbac = new PrismaRbacChecker(prisma);

    const result = await rbac.checkPermission({ userId: "u-none", outletId: "outlet-1", action: "order.read" });

    expect(result.allowed).toBe(false);
  });
});

describe("PrismaRbacChecker.listPermissions", () => {
  it("returns deduped role names and permission actions across multiple UserRole rows", async () => {
    const prisma = makeFakePrisma([
      { outletId: "outlet-1", ...role("CASHIER", ["order.create", "order.read"]) },
      { outletId: null, ...role("SUPER_ADMIN", ["order.read", "payment.refund"]) },
      { outletId: "outlet-1", ...role("CASHIER", ["order.create", "order.read"]) }, // duplicate row
    ]);
    const rbac = new PrismaRbacChecker(prisma);

    const result = await rbac.listPermissions("u-1", "outlet-1");

    expect(result.roles.sort()).toEqual(["CASHIER", "SUPER_ADMIN"]);
    expect(result.permissions.sort()).toEqual(["order.create", "order.read", "payment.refund"]);
  });

  it("returns empty roles/permissions when the user has no grants", async () => {
    const prisma = makeFakePrisma([]);
    const rbac = new PrismaRbacChecker(prisma);

    const result = await rbac.listPermissions("u-none", "outlet-1");

    expect(result).toEqual({ roles: [], permissions: [] });
  });
});
