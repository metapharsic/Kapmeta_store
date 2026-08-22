import { describe, it, expect, vi } from "vitest";
import { RbacSecurityGuard } from "./rbac-security-guard";

describe("RBAC Security & Negative Authorization Suite", () => {
  it("strictly denies Cashier from executing manager order.void", async () => {
    const mockPrisma = {
      userRole: {
        findFirst: async () => ({ userId: "u-cashier", outletId: "outlet-1" }),
        findMany: async () => [
          {
            role: {
              name: "CASHIER",
              rolePermissions: [
                { permission: { action: "order.create" } },
                { permission: { action: "order.read" } },
                { permission: { action: "payment.capture" } },
              ],
            },
          },
        ],
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    } as any;

    const guard = new RbacSecurityGuard(mockPrisma);
    const auth = await guard.authorize("u-cashier", "outlet-1", "order.void");

    expect(auth.authorized).toBe(false);
    expect(auth.reason).toContain("no role at this outlet grants 'order.void'");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("strictly denies Kitchen user from executing payment.capture", async () => {
    const mockPrisma = {
      userRole: {
        findFirst: async () => ({ userId: "u-chef", outletId: "outlet-1" }),
        findMany: async () => [
          {
            role: {
              name: "KITCHEN_USER",
              rolePermissions: [
                { permission: { action: "kot.read" } },
                { permission: { action: "kot.status.update" } },
              ],
            },
          },
        ],
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-2" }),
      },
    } as any;

    const guard = new RbacSecurityGuard(mockPrisma);
    const auth = await guard.authorize("u-chef", "outlet-1", "payment.capture");

    expect(auth.authorized).toBe(false);
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("blocks cross-tenant access and logs security incident when user accesses foreign outlet", async () => {
    const mockPrisma = {
      userRole: {
        // User has role only at outlet-1, not outlet-foreign
        findFirst: async () => null,
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-breach" }),
      },
    } as any;

    const guard = new RbacSecurityGuard(mockPrisma);
    const auth = await guard.authorize("u-user1", "outlet-foreign", "order.read");

    expect(auth.authorized).toBe(false);
    expect(auth.reason).toBe("TENANT_OUTLET_BOUNDARY_VIOLATION");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SECURITY_VIOLATION_TENANT_BREACH",
          entityId: "outlet-foreign",
        }),
      })
    );
  });

  it("permits Super Admin with org-wide grant (outletId: null) across any outlet", async () => {
    const mockPrisma = {
      userRole: {
        findFirst: async () => ({ userId: "u-admin", outletId: null }),
        findMany: async () => [
          {
            role: {
              name: "SUPER_ADMIN",
              rolePermissions: [
                { permission: { action: "order.create" } },
                { permission: { action: "order.void" } },
                { permission: { action: "payment.refund" } },
              ],
            },
          },
        ],
      },
      auditLog: {
        create: vi.fn(),
      },
    } as any;

    const guard = new RbacSecurityGuard(mockPrisma);
    const auth = await guard.authorize("u-admin", "any-outlet-id", "order.void");

    expect(auth.authorized).toBe(true);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
