import { describe, it, expect, vi } from "vitest";
import { CustomerManager } from "./customer-manager";

// Fake PrismaClient — only the surface CustomerManager touches. listCustomers
// runs findMany + count in parallel (Promise.all), so both must be stubbed.
function makeFakePrisma(customers: any[]) {
  return {
    customer: {
      findMany: vi.fn(async ({ where, take, skip }: any) => {
        const search: string | undefined = where?.OR?.[2]?.phone?.contains;
        let rows = customers.filter((c) => c.outletId === where.outletId);
        if (search) {
          const s = search.toLowerCase();
          rows = rows.filter(
            (c) =>
              c.firstName.toLowerCase().includes(s) ||
              (c.lastName ?? "").toLowerCase().includes(s) ||
              c.phone.includes(search)
          );
        }
        return rows.slice(skip, skip + take);
      }),
      count: vi.fn(async ({ where }: any) => {
        const search: string | undefined = where?.OR?.[2]?.phone?.contains;
        let rows = customers.filter((c) => c.outletId === where.outletId);
        if (search) {
          const s = search.toLowerCase();
          rows = rows.filter(
            (c) =>
              c.firstName.toLowerCase().includes(s) ||
              (c.lastName ?? "").toLowerCase().includes(s) ||
              c.phone.includes(search)
          );
        }
        return rows.length;
      }),
    },
  } as any;
}

describe("CustomerManager.listCustomers", () => {
  const customers = [
    { id: "1", outletId: "o1", firstName: "Alice", lastName: "Smith", phone: "1111111111" },
    { id: "2", outletId: "o1", firstName: "Bob", lastName: "Jones", phone: "2222222222" },
    { id: "3", outletId: "o1", firstName: "Alicia", lastName: "Brown", phone: "3333333333" },
    { id: "4", outletId: "o2", firstName: "Zoe", lastName: "Other", phone: "4444444444" },
  ];

  it("returns only customers for the given outlet with default pagination", async () => {
    const manager = new CustomerManager(makeFakePrisma(customers));
    const result = await manager.listCustomers("o1");

    expect(result.total).toBe(3);
    expect(result.customers).toHaveLength(3);
    expect(result.customers.every((c: any) => c.outletId === "o1")).toBe(true);
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(0);
  });

  it("filters by search substring across firstName/lastName/phone", async () => {
    const manager = new CustomerManager(makeFakePrisma(customers));
    const result = await manager.listCustomers("o1", { search: "Alic" });

    expect(result.total).toBe(2);
    expect(result.customers.map((c: any) => c.id).sort()).toEqual(["1", "3"]);
  });

  it("applies limit/offset pagination and clamps limit to [1, 100]", async () => {
    const manager = new CustomerManager(makeFakePrisma(customers));
    const page1 = await manager.listCustomers("o1", { limit: 2, offset: 0 });
    const page2 = await manager.listCustomers("o1", { limit: 2, offset: 2 });

    expect(page1.customers).toHaveLength(2);
    expect(page2.customers).toHaveLength(1);
    expect(page1.total).toBe(3);

    const clamped = await manager.listCustomers("o1", { limit: 1000 });
    expect(clamped.limit).toBe(100);

    const clampedLow = await manager.listCustomers("o1", { limit: 0 });
    expect(clampedLow.limit).toBe(1);
  });
});
