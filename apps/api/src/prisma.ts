import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { kapmetaPrisma?: PrismaClient };

export const prisma = globalForPrisma.kapmetaPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.kapmetaPrisma = prisma;
}
