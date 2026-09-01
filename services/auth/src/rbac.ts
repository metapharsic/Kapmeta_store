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

    if (!userRoles || userRoles.length === 0) {
      return { roles: [], permissions: [] };
    }

    const includedRoles = userRoles.map((ur: any) => ur.role).filter(Boolean);
    let roles: any[] = includedRoles;
    let perms: any[] = [];

    if (includedRoles.length > 0) {
      for (const r of includedRoles) {
        if (Array.isArray(r.rolePermissions)) {
          for (const rp of r.rolePermissions) {
            if (rp.permission) perms.push(rp.permission);
          }
        }
      }
    } else {
      const roleIds = userRoles.map((ur: any) => ur.roleId).filter(Boolean);
      roles = this.prisma.role ? await this.prisma.role.findMany({ where: { id: { in: roleIds } } }) : [];
      const rolePerms = this.prisma.rolePermission ? await this.prisma.rolePermission.findMany({ where: { roleId: { in: roleIds } } }) : [];
      const permIds = rolePerms.map((rp: any) => rp.permissionId).filter(Boolean);
      perms = this.prisma.permission ? await this.prisma.permission.findMany({ where: { id: { in: permIds } } }) : [];
    }

    const roleNames = roles.map((r: any) => r.name).filter(Boolean);
    const isSuperAdmin = roles.some(
      (r: any) =>
        r.name === "SUPER_ADMIN" ||
        r.name === "ADMIN" ||
        r.name === "Administrator" ||
        r.code === "ADMIN" ||
        r.code === "SUPER_ADMIN"
    );

    if (isSuperAdmin) {
      const allPerms = this.prisma.permission ? await this.prisma.permission.findMany() : perms;
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

    if (!userRoles || userRoles.length === 0) {
      return {
        allowed: false,
        reason: `no role at this outlet grants '${check.action}'`,
      };
    }

    const includedRoles = userRoles.map((ur: any) => ur.role).filter(Boolean);
    let roles: any[] = includedRoles;
    let perms: any[] = [];

    if (includedRoles.length > 0) {
      for (const r of includedRoles) {
        if (Array.isArray(r.rolePermissions)) {
          for (const rp of r.rolePermissions) {
            if (rp.permission) perms.push(rp.permission);
          }
        }
      }
    } else {
      const roleIds = userRoles.map((ur: any) => ur.roleId).filter(Boolean);
      roles = this.prisma.role ? await this.prisma.role.findMany({ where: { id: { in: roleIds } } }) : [];
      const rolePerms = this.prisma.rolePermission ? await this.prisma.rolePermission.findMany({ where: { roleId: { in: roleIds } } }) : [];
      const permIds = rolePerms.map((rp: any) => rp.permissionId).filter(Boolean);
      perms = this.prisma.permission ? await this.prisma.permission.findMany({ where: { id: { in: permIds } } }) : [];
    }

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
