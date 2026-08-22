import { PrismaClient } from "@prisma/client";

export class CustomerManager {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async getCustomerById(outletId: string, id: string) {
    return await this.prisma.customer.findUnique({
      where: { id, outletId }
    });
  }

  // Paginated, searchable customer directory. search matches a substring of
  // firstName, lastName, or phone (case-insensitive on name fields).
  async listCustomers(outletId: string, options: { search?: string; limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const search = options.search?.trim();

    const where = {
      outletId,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { customers, total, limit, offset };
  }

  async createCustomer(outletId: string, data: { firstName: string, lastName?: string, phone: string, email?: string }) {
    return await this.prisma.customer.create({
      data: {
        outletId,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
      }
    });
  }

  // DPDP Act Compliance: PII Erasure
  async anonymizeCustomer(outletId: string, id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id, outletId }
    });

    if (!customer) {
      throw new Error("Customer not found");
    }

    return await this.prisma.customer.update({
      where: { id },
      data: {
        firstName: "ANONYMIZED",
        lastName: "USER",
        phone: `ANON-${id.substring(0,8)}`,
        email: `anon-${id.substring(0,8)}@erased.local`,
        loyaltyPoints: 0
      }
    });
  }
}
