import { PrismaClient } from "@prisma/client";
import type { PermissionCheck, PermissionCheckResult } from "@kapmeta/shared-types/auth";

export class PrismaRbacChecker {
  constructor(private readonly prisma: PrismaClient) {}

  // Flat list of every permission action string granted to a user at the
  // given outlet, via outlet-scoped UserRoles OR org-wide UserRoles
  // (outletId null) — same OR-matching as checkPermission. Also returns the
  // distinct role names held, for surfacing "who am I" info to the client.
  async listPermissions(
    userId: string,
    outletId: string
  ): Promise<{ roles: string[]; permissions: string[] }> {
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [{ outletId }, { outletId: null }],
      },
    });

    if (userRoles.length === 0) {
      return { roles: [], permissions: [] };
    }

    const roleIds = userRoles.map((ur) => ur.roleId);
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
    });

    const rolePerms = await this.prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
    });

    const permIds = rolePerms.map((rp) => rp.permissionId);
    const perms = await this.prisma.permission.findMany({
      where: { id: { in: permIds } },
    });

    const roleNames = roles.map((r) => r.name);
    const isSuperAdmin = roles.some(
      (r: any) =>
        r.name === "SUPER_ADMIN" ||
        r.name === "ADMIN" ||
        r.name === "Administrator" ||
        r.code === "ADMIN" ||
        r.code === "SUPER_ADMIN"
    );

    if (isSuperAdmin) {
      const allPerms = await this.prisma.permission.findMany();
      const allActions = allPerms.map((p: any) => p.code || p.action).filter(Boolean);
      return { roles: [...new Set(roleNames)], permissions: [...new Set(allActions)] };
    }

    const actions = perms.map((p: any) => p.code || p.action).filter(Boolean);

    return { roles: [...new Set(roleNames)], permissions: [...new Set(actions)] };
  }

  async checkPermission(check: PermissionCheck): Promise<PermissionCheckResult> {
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId: check.userId,
        OR: [{ outletId: check.outletId }, { outletId: null }],
      },
    });

    if (userRoles.length === 0) {
      return {
        allowed: false,
        reason: `no role at this outlet grants '${check.action}'`,
      };
    }

    const roleIds = userRoles.map((ur) => ur.roleId);
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
    });

    const isSuperAdmin = roles.some(
      (r: any) =>
        r.name === "SUPER_ADMIN" ||
        r.name === "ADMIN" ||
        r.name === "Administrator" ||
        r.code === "ADMIN" ||
        r.code === "SUPER_ADMIN"
    );

    if (isSuperAdmin) {
      return { allowed: true };
    }

    const rolePerms = await this.prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
    });

    const permIds = rolePerms.map((rp) => rp.permissionId);
    const perms = await this.prisma.permission.findMany({
      where: { id: { in: permIds } },
    });

    const hasPermission = perms.some((p: any) => (p.code || p.action) === check.action);

    if (hasPermission) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `no role at this outlet grants '${check.action}'`,
    };
  }
}

export function requirePermission(result: PermissionCheckResult): void {
  if (!result.allowed) {
    throw new Error(result.reason);
  }
}
