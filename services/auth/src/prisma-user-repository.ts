import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "./password";
import type { LoginCredentials, LoginFailure, AuthenticatedUser } from "@kapmeta/shared-types/auth";

export class PrismaUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
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
    outletId: string
  ): Promise<{ user: AuthenticatedUser } | { failure: LoginFailure["reason"] }> {
    const user = await this.prisma.user.findUnique({ where: { email: credentials.email } });

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

    // outletId NULL on UserRole means an organization-wide grant — match that
    // too, not just the specific outlet, same reasoning as PrismaRbacChecker.
    const userRole = await this.prisma.userRole.findFirst({
      where: { userId: user.id, OR: [{ outletId }, { outletId: null }] },
    });
    if (!userRole) {
      return { failure: "NO_OUTLET_ACCESS" };
    }

    return {
      user: {
        userId: user.id,
        email: user.email,
        outletId,
      },
    };
  }
}
