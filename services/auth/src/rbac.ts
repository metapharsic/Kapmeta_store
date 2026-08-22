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
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const roleNames = new Set<string>();
    const actions = new Set<string>();
    for (const userRole of userRoles) {
      roleNames.add(userRole.role.name);
      for (const rolePermission of userRole.role.rolePermissions) {
        actions.add(rolePermission.permission.action);
      }
    }

    return { roles: [...roleNames], permissions: [...actions] };
  }

  async checkPermission(check: PermissionCheck): Promise<PermissionCheckResult> {
    // outletId is nullable on UserRole: NULL means an organization-wide grant
    // (e.g. Super Admin), not "no outlet." Match the specific outlet AND
    // any org-wide grant — an outlet-scoped-only query would silently deny
    // every org-wide role.
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId: check.userId,
        OR: [{ outletId: check.outletId }, { outletId: null }],
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const allowed = userRoles.some((userRole) =>
      userRole.role.rolePermissions.some(
        (rolePermission) => rolePermission.permission.action === check.action
      )
    );

    if (allowed) {
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
