// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "./password";
import type { LoginCredentials, LoginFailure, AuthenticatedUser } from "@kapmeta/shared-types/auth";

export class PrismaUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({ where: { email } });
  }

  async createUser(email: string, plaintextPassword: string, firstName: string, lastName: string) {
    const passwordHash = await hashPassword(plaintextPassword);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, firstName, lastName },
    });
    const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async verifyCredentials(
    credentials: LoginCredentials,
    outletId: string | null | undefined
  ): Promise<{ user: AuthenticatedUser } | { failure: LoginFailure["reason"] }> {
    const user = await this.prisma.user.findFirst({ where: { email: credentials.email } });

    // Not-found and wrong-password both return INVALID_CREDENTIALS to avoid
    // leaking whether an email is registered (enumeration/timing safety).
    if (!user) {
      return { failure: "INVALID_CREDENTIALS" };
    }

    if (!user.isActive) {
      return { failure: "USER_INACTIVE" };
    }

    const passwordValid = await verifyPassword(credentials.password, user.passwordHash);
    if (!passwordValid) {
      return { failure: "INVALID_CREDENTIALS" };
    }

    // Determine which outlet to use
    let targetOutletId: string;

    if (outletId) {
      targetOutletId = outletId!;
    } else {
      // No outlet specified, find user's first available outlet
      const userRole = await this.prisma.userRole.findFirst({
        where: { userId: user.id },
      });

      if (!userRole) {
        return { failure: "NO_OUTLET_ACCESS" };
      }

      if (userRole.outletId) {
        // User has specific outlet access
        targetOutletId = userRole.outletId!;
      } else {
        // User has org-wide access, get first active outlet
        const firstOutlet = await this.prisma.outlet.findFirst({
          where: { isActive: true },
        });
        if (!firstOutlet) {
          return { failure: "NO_OUTLET_ACCESS" };
        }
        targetOutletId = firstOutlet.id;
      }
    }

    // Verify the user has access to the target outlet
    const hasAccess = await this.prisma.userRole.findFirst({
      where: {
        userId: user.id,
        OR: [
          { outletId: targetOutletId },
          { outletId: null } // org-wide access
        ]
      },
    });

    if (!hasAccess) {
      return { failure: "NO_OUTLET_ACCESS" };
    }

    return {
      user: {
        userId: user.id,
        email: user.email,
        outletId: targetOutletId!,
      },
    };
  }
}
