import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

// Refresh tokens are high-entropy random values (crypto.randomBytes via
// generateRefreshToken in jwt.ts), so SHA-256 is the correct hash here —
// unlike passwords, there's no offline-guessing risk to defend against with
// a slow hash like bcrypt. Schema column is tokenHash; the raw token never
// touches the database.
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface SessionRecord {
  id: string;
  userId: string;
  outletId: string;
  expiresAt: Date;
}

export class PrismaSessionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    userId: string,
    outletId: string,
    refreshToken: string,
    expiresAt: Date,
    userAgent?: string,
    ipAddress?: string
  ): Promise<SessionRecord> {
    const session = await this.prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        outletId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    return {
      id: session.id,
      userId: session.userId,
      outletId: session.outletId || "",
      expiresAt: session.expiresAt,
    };
  }

  async findByToken(refreshToken: string): Promise<SessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });

    if (!session || session.expiresAt < new Date() || session.revokedAt !== null) {
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      outletId: session.outletId || "",
      expiresAt: session.expiresAt,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
