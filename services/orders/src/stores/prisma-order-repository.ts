import { PrismaClient } from "@prisma/client";
import type {
  MenuPriceLookup,
  ModifierPriceLookup,
  OrderRepository,
  ListOrdersFilter,
  OrderSummary,
  OrderDetail,
  BillSummary,
  RevenueTrendPoint,
} from "../order-service";
import { TERMINAL_ORDER_STATUSES } from "../order-service";
import type { OrderStatus, CreateOrderInput, PricedOrder } from "@kapmeta/shared-types/orders";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";

const FALLBACK_CATALOG_PRICES: Record<string, { name: string; category: string; priceMinor: bigint; isVeg: boolean }> = {
  // Breakfast Items
  "bk_1": { name: "(2) Idly (1) Vada", category: "Breakfast", priceMinor: 7000n, isVeg: true },
  "bk_2": { name: "(S) Idly", category: "Breakfast", priceMinor: 4000n, isVeg: true },
  "bk_3": { name: "(S) Idly (S) Vada", category: "Breakfast", priceMinor: 6000n, isVeg: true },
  "bk_4": { name: "(S) Idly (S) Vada Sambar", category: "Breakfast", priceMinor: 6500n, isVeg: true },
  "bk_5": { name: "(S) Idly Sambar", category: "Breakfast", priceMinor: 4500n, isVeg: true },
  "bk_6": { name: "(S) Vada", category: "Breakfast", priceMinor: 4500n, isVeg: true },
  "bk_7": { name: "(S) Vada Sambar", category: "Breakfast", priceMinor: 5000n, isVeg: true },
  "bk_8": { name: "70 Mm Dosa", category: "Breakfast", priceMinor: 11000n, isVeg: true },
  "bk_9": { name: "Butter Masala Dosa", category: "Breakfast", priceMinor: 9500n, isVeg: true },
  "bk_10": { name: "Chitti Pesarattu", category: "Breakfast", priceMinor: 8500n, isVeg: true },
  "bk_11": { name: "Extra Aloo", category: "Breakfast", priceMinor: 2500n, isVeg: true },
  "bk_12": { name: "Extra Poori", category: "Breakfast", priceMinor: 3000n, isVeg: true },
  "bk_13": { name: "Ghee Karam Idly", category: "Breakfast", priceMinor: 7500n, isVeg: true },
  "bk_14": { name: "Ghee Karvepaaku Podi Dosa", category: "Breakfast", priceMinor: 10500n, isVeg: true },
  "bk_15": { name: "Ghee Podi Dosa", category: "Breakfast", priceMinor: 9500n, isVeg: true },
  "bk_16": { name: "Ghee Podi Rava Dosa", category: "Breakfast", priceMinor: 11500n, isVeg: true },
  "bk_17": { name: "Idly (2)", category: "Breakfast", priceMinor: 5000n, isVeg: true },
  "bk_18": { name: "Idly Sambar", category: "Breakfast", priceMinor: 5500n, isVeg: true },
  "bk_19": { name: "Masala Dosa", category: "Breakfast", priceMinor: 8000n, isVeg: true },
  "bk_20": { name: "Onion Dosa", category: "Breakfast", priceMinor: 8500n, isVeg: true },
  "bk_21": { name: "Onion Rava Dosa", category: "Breakfast", priceMinor: 10000n, isVeg: true },
  "bk_22": { name: "Onion Uttapam", category: "Breakfast", priceMinor: 9000n, isVeg: true },
  "bk_23": { name: "Paneer Dosa", category: "Breakfast", priceMinor: 11000n, isVeg: true },
  "bk_24": { name: "Paper Dosa", category: "Breakfast", priceMinor: 8500n, isVeg: true },
  "bk_25": { name: "Pesarattu", category: "Breakfast", priceMinor: 7500n, isVeg: true },
  "bk_26": { name: "Plain Dosa", category: "Breakfast", priceMinor: 6500n, isVeg: true },
  "bk_27": { name: "Poori", category: "Breakfast", priceMinor: 7000n, isVeg: true },
  "bk_28": { name: "Rava Dosa", category: "Breakfast", priceMinor: 8500n, isVeg: true },
  "bk_29": { name: "Set Dosa", category: "Breakfast", priceMinor: 8000n, isVeg: true },
  "bk_30": { name: "Thatte Idly", category: "Breakfast", priceMinor: 6000n, isVeg: true },
  "bk_31": { name: "Vada", category: "Breakfast", priceMinor: 5000n, isVeg: true },
  "bk_32": { name: "Vada Sambar", category: "Breakfast", priceMinor: 6000n, isVeg: true },

  // Meal Box (Online)
  "mb_1": { name: "South Indian Executive Meal Box", category: "Meal Box (Online)", priceMinor: 19900n, isVeg: true },
  "mb_2": { name: "North Indian Mini Meal Box", category: "Meal Box (Online)", priceMinor: 18900n, isVeg: true },
  "mb_3": { name: "Special Biryani Box (Veg)", category: "Meal Box (Online)", priceMinor: 22000n, isVeg: true },
  "mb_4": { name: "Chicken Biryani Combo Box", category: "Meal Box (Online)", priceMinor: 26000n, isVeg: false },
  "mb_5": { name: "Paneer Tikka Meal Box", category: "Meal Box (Online)", priceMinor: 24000n, isVeg: true },
  "mb_6": { name: "Chinese Combo Meal Box", category: "Meal Box (Online)", priceMinor: 23000n, isVeg: true },

  // Cold Beverage
  "cb_1": { name: "Fresh Sweet Lime Soda", category: "Cold Beverage", priceMinor: 6000n, isVeg: true },
  "cb_2": { name: "Cold Coffee with Ice Cream", category: "Cold Beverage", priceMinor: 9000n, isVeg: true },
  "cb_3": { name: "Watermelon Juice", category: "Cold Beverage", priceMinor: 7000n, isVeg: true },
  "cb_4": { name: "Mango Lassi", category: "Cold Beverage", priceMinor: 8000n, isVeg: true },
  "cb_5": { name: "Butter Milk (Masala Chaas)", category: "Cold Beverage", priceMinor: 4000n, isVeg: true },
  "cb_6": { name: "Fresh Mint Lemonade", category: "Cold Beverage", priceMinor: 5000n, isVeg: true },
  "cb_7": { name: "Kesar Badam Thandai", category: "Cold Beverage", priceMinor: 8500n, isVeg: true },
  "cb_8": { name: "Oreo Chocolate Shake", category: "Cold Beverage", priceMinor: 9500n, isVeg: true },

  // Hot Beverages
  "hb_1": { name: "South Indian Filter Coffee", category: "Hot Beverages", priceMinor: 4000n, isVeg: true },
  "hb_2": { name: "Special Masala Chai", category: "Hot Beverages", priceMinor: 3500n, isVeg: true },
  "hb_3": { name: "Ginger Lemon Green Tea", category: "Hot Beverages", priceMinor: 4500n, isVeg: true },
  "hb_4": { name: "Hot Badam Milk", category: "Hot Beverages", priceMinor: 6000n, isVeg: true },
  "hb_5": { name: "Cardamom Irani Chai", category: "Hot Beverages", priceMinor: 4000n, isVeg: true },
  "hb_6": { name: "Hot Chocolate", category: "Hot Beverages", priceMinor: 7000n, isVeg: true },

  // Soup (Veg)
  "sv_1": { name: "Cream of Tomato Soup", category: "Soup(Veg)", priceMinor: 8000n, isVeg: true },
  "sv_2": { name: "Veg Hot and Sour Soup", category: "Soup(Veg)", priceMinor: 8500n, isVeg: true },
  "sv_3": { name: "Sweet Corn Veg Soup", category: "Soup(Veg)", priceMinor: 8500n, isVeg: true },
  "sv_4": { name: "Veg Manchow Soup", category: "Soup(Veg)", priceMinor: 9000n, isVeg: true },
  "sv_5": { name: "Lemon Coriander Veg Soup", category: "Soup(Veg)", priceMinor: 8500n, isVeg: true },
  "sv_6": { name: "Cream of Mushroom Soup", category: "Soup(Veg)", priceMinor: 9500n, isVeg: true },

  // Meals
  "m_1": { name: "Kapila Special Veg Thali", category: "Meals", priceMinor: 16000n, isVeg: true },
  "m_2": { name: "South Indian Full Meals", category: "Meals", priceMinor: 14000n, isVeg: true },
  "m_3": { name: "Curd Rice with Pomegranate", category: "Meals", priceMinor: 8000n, isVeg: true },
  "m_4": { name: "Sambar Rice with Ghee", category: "Meals", priceMinor: 9000n, isVeg: true },
  "m_5": { name: "Andhra Special Meals", category: "Meals", priceMinor: 17000n, isVeg: true },
  "m_6": { name: "Mini Executive Lunch", category: "Meals", priceMinor: 12000n, isVeg: true },

  // Soup (Non-Veg)
  "snv_1": { name: "Chicken Manchow Soup", category: "Soup(Non-Veg)", priceMinor: 11000n, isVeg: false },
  "snv_2": { name: "Chicken Sweet Corn Soup", category: "Soup(Non-Veg)", priceMinor: 11000n, isVeg: false },
  "snv_3": { name: "Mutton Bone Marrow Soup (Paya)", category: "Soup(Non-Veg)", priceMinor: 15000n, isVeg: false },
  "snv_4": { name: "Chicken Hot & Sour Soup", category: "Soup(Non-Veg)", priceMinor: 11500n, isVeg: false },
  "snv_5": { name: "Chicken Clear Soup", category: "Soup(Non-Veg)", priceMinor: 10500n, isVeg: false },
  "snv_6": { name: "Mutton Shorba (Special)", category: "Soup(Non-Veg)", priceMinor: 16000n, isVeg: false },

  // Chinese Starters (Veg)
  "csv_1": { name: "Veg Manchurian Dry", category: "Chinese Starters (Veg)", priceMinor: 13000n, isVeg: true },
  "csv_2": { name: "Chilli Paneer Dry", category: "Chinese Starters (Veg)", priceMinor: 16000n, isVeg: true },
  "csv_3": { name: "Crispy Corn Pepper Salt", category: "Chinese Starters (Veg)", priceMinor: 14000n, isVeg: true },
  "csv_4": { name: "Baby Corn 65", category: "Chinese Starters (Veg)", priceMinor: 14500n, isVeg: true },
  "csv_5": { name: "Veg Spring Rolls (6 Pcs)", category: "Chinese Starters (Veg)", priceMinor: 13500n, isVeg: true },
  "csv_6": { name: "Paneer 65 Crispy", category: "Chinese Starters (Veg)", priceMinor: 16500n, isVeg: true },
  "csv_7": { name: "Mushroom Chilli Dry", category: "Chinese Starters (Veg)", priceMinor: 15000n, isVeg: true },
  "csv_8": { name: "Honey Chilli Potato", category: "Chinese Starters (Veg)", priceMinor: 12500n, isVeg: true },

  // Chinese Starters (Non-Veg)
  "csnv_1": { name: "Chilli Chicken Dry", category: "Chinese Starters (Non-Veg)", priceMinor: 18000n, isVeg: false },
  "csnv_2": { name: "Chicken 65 Hyderabadi", category: "Chinese Starters (Non-Veg)", priceMinor: 19000n, isVeg: false },
  "csnv_3": { name: "Apollo Fish Fry", category: "Chinese Starters (Non-Veg)", priceMinor: 22000n, isVeg: false },
  "csnv_4": { name: "Dragon Chicken", category: "Chinese Starters (Non-Veg)", priceMinor: 19500n, isVeg: false },
  "csnv_5": { name: "Chicken Lollipop (6 Pcs)", category: "Chinese Starters (Non-Veg)", priceMinor: 21000n, isVeg: false },
  "csnv_6": { name: "Pepper Chicken Roast", category: "Chinese Starters (Non-Veg)", priceMinor: 19500n, isVeg: false },
  "csnv_7": { name: "Garlic Butter Prawns", category: "Chinese Starters (Non-Veg)", priceMinor: 25000n, isVeg: false },
  "csnv_8": { name: "Chicken Majestic", category: "Chinese Starters (Non-Veg)", priceMinor: 20000n, isVeg: false },

  // Tandoori Starters (Veg)
  "tsv_1": { name: "Paneer Tikka Angara", category: "Tandoori Starters (Veg)", priceMinor: 18000n, isVeg: true },
  "tsv_2": { name: "Malai Broccoli Tikka", category: "Tandoori Starters (Veg)", priceMinor: 19000n, isVeg: true },
  "tsv_3": { name: "Tandoori Mushroom Tikka", category: "Tandoori Starters (Veg)", priceMinor: 16000n, isVeg: true },
  "tsv_4": { name: "Veg Seekh Kabab", category: "Tandoori Starters (Veg)", priceMinor: 15000n, isVeg: true },
  "tsv_5": { name: "Haryali Paneer Tikka", category: "Tandoori Starters (Veg)", priceMinor: 18500n, isVeg: true },
  "tsv_6": { name: "Tandoori Stuffed Aloo", category: "Tandoori Starters (Veg)", priceMinor: 14000n, isVeg: true },

  // Tandoori Starters (Non-Veg)
  "tsnv_1": { name: "Tandoori Murgh (Full)", category: "Tandoori Starters (Non-Veg)", priceMinor: 34000n, isVeg: false },
  "tsnv_2": { name: "Murgh Tikka (6 Pcs)", category: "Tandoori Starters (Non-Veg)", priceMinor: 21000n, isVeg: false },
  "tsnv_3": { name: "Tangdi Kabab (4 Pcs)", category: "Tandoori Starters (Non-Veg)", priceMinor: 23000n, isVeg: false },
  "tsnv_4": { name: "Reshmi Chicken Kabab", category: "Tandoori Starters (Non-Veg)", priceMinor: 22000n, isVeg: false },
  "tsnv_5": { name: "Mutton Seekh Kabab", category: "Tandoori Starters (Non-Veg)", priceMinor: 26000n, isVeg: false },
  "tsnv_6": { name: "Fish Tikka (Tandoori)", category: "Tandoori Starters (Non-Veg)", priceMinor: 24000n, isVeg: false },
  "tsnv_7": { name: "Pahadi Chicken Kabab", category: "Tandoori Starters (Non-Veg)", priceMinor: 21500n, isVeg: false },
  "tsnv_8": { name: "Kalmi Kabab (3 Pcs)", category: "Tandoori Starters (Non-Veg)", priceMinor: 23500n, isVeg: false },

  // Curries (Veg)
  "cv_1": { name: "Paneer Butter Masala", category: "Curries (Veg)", priceMinor: 16000n, isVeg: true },
  "cv_2": { name: "Kaju Curry (Special)", category: "Curries (Veg)", priceMinor: 20000n, isVeg: true },
  "cv_3": { name: "Dal Tadka Desi Ghee", category: "Curries (Veg)", priceMinor: 12000n, isVeg: true },
  "cv_4": { name: "Methi Chaman", category: "Curries (Veg)", priceMinor: 17000n, isVeg: true },
  "cv_5": { name: "Kadai Paneer", category: "Curries (Veg)", priceMinor: 16500n, isVeg: true },
  "cv_6": { name: "Dal Makhani (Slow Cooked)", category: "Curries (Veg)", priceMinor: 15000n, isVeg: true },
  "cv_7": { name: "Mix Veg Curry", category: "Curries (Veg)", priceMinor: 13500n, isVeg: true },
  "cv_8": { name: "Palak Paneer", category: "Curries (Veg)", priceMinor: 16000n, isVeg: true },

  // Curries (Non-Veg)
  "cnv_1": { name: "Butter Chicken Delhi Style", category: "Curries (Non-Veg)", priceMinor: 22000n, isVeg: false },
  "cnv_2": { name: "Telangana Style Chicken Curry", category: "Curries (Non-Veg)", priceMinor: 21000n, isVeg: false },
  "cnv_3": { name: "Mutton Rogan Josh", category: "Curries (Non-Veg)", priceMinor: 28000n, isVeg: false },
  "cnv_4": { name: "Chicken Tikka Masala", category: "Curries (Non-Veg)", priceMinor: 23000n, isVeg: false },
  "cnv_5": { name: "Chettinad Chicken Curry", category: "Curries (Non-Veg)", priceMinor: 22000n, isVeg: false },
  "cnv_6": { name: "Andhra Mutton Curry", category: "Curries (Non-Veg)", priceMinor: 29000n, isVeg: false },
  "cnv_7": { name: "Nellore Fish Curry", category: "Curries (Non-Veg)", priceMinor: 24000n, isVeg: false },
  "cnv_8": { name: "Egg Masala Curry (2 Eggs)", category: "Curries (Non-Veg)", priceMinor: 14000n, isVeg: false },

  // Roti
  "r_1": { name: "Butter Naan", category: "Roti", priceMinor: 4500n, isVeg: true },
  "r_2": { name: "Garlic Butter Naan", category: "Roti", priceMinor: 5500n, isVeg: true },
  "r_3": { name: "Tandoori Roti (Butter)", category: "Roti", priceMinor: 3000n, isVeg: true },
  "r_4": { name: "Rumali Roti", category: "Roti", priceMinor: 3500n, isVeg: true },
  "r_5": { name: "Plain Tandoori Roti", category: "Roti", priceMinor: 2500n, isVeg: true },
  "r_6": { name: "Laccha Paratha", category: "Roti", priceMinor: 5000n, isVeg: true },
  "r_7": { name: "Amritsari Kulcha", category: "Roti", priceMinor: 6000n, isVeg: true },
  "r_8": { name: "Cheese Garlic Naan", category: "Roti", priceMinor: 7500n, isVeg: true },

  // Noodles (Veg)
  "nv_1": { name: "Veg Hakka Noodles", category: "Noodles (Veg)", priceMinor: 14000n, isVeg: true },
  "nv_2": { name: "Veg Schezwan Noodles", category: "Noodles (Veg)", priceMinor: 15000n, isVeg: true },
  "nv_3": { name: "Chilli Garlic Veg Noodles", category: "Noodles (Veg)", priceMinor: 15500n, isVeg: true },
  "nv_4": { name: "Singapore Veg Noodles", category: "Noodles (Veg)", priceMinor: 16000n, isVeg: true },
  "nv_5": { name: "Burnt Garlic Veg Noodles", category: "Noodles (Veg)", priceMinor: 15000n, isVeg: true },
  "nv_6": { name: "Paneer Hakka Noodles", category: "Noodles (Veg)", priceMinor: 17000n, isVeg: true },
};

export class PrismaMenuPriceLookup implements MenuPriceLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async getPrice(menuItemId: string, outletId: string): Promise<{ priceMinor: bigint; taxRatePercent: number } | null> {
    try {
      const row = await this.prisma.menuItem.findFirst({ where: { id: menuItemId, outletId } });
      if (row) {
        const priceVal = row.priceMinor ?? row.pricePaise ?? (typeof row.price === 'bigint' ? row.price : BigInt(Math.round(Number(row.price || 0) * (Number(row.price) < 1000 ? 100 : 1))));
        return { priceMinor: BigInt(priceVal), taxRatePercent: Number(row.taxRate ?? 5.0) };
      }
    } catch {
      // Continue to fallback
    }

    const fallback = FALLBACK_CATALOG_PRICES[menuItemId];
    if (fallback) {
      return { priceMinor: fallback.priceMinor, taxRatePercent: 5.0 };
    }

    return null;
  }
}

export class PrismaModifierPriceLookup implements ModifierPriceLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async getPrices(modifierOptionIds: string[], outletId: string): Promise<Map<string, bigint>> {
    const map = new Map<string, bigint>();
    if (modifierOptionIds.length === 0) {
      return map;
    }

    const rows = await this.prisma.modifierOption.findMany({
      where: { id: { in: modifierOptionIds }, outletId },
    });

    for (const row of rows) {
      map.set(row.id, row.price);
    }

    return map;
  }
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async nextOrderNumber(outletId: string): Promise<string> {
    const dateKey = new Date().toISOString().slice(0, 10);
    try {
      const rows = await this.prisma.$queryRaw<{ last_number?: number; lastNumber?: number }[]>`
        INSERT INTO order_sequences (outlet_id, date_key, last_number, updated_at)
        VALUES (${outletId}, ${dateKey}, 1, NOW())
        ON CONFLICT (outlet_id, date_key)
        DO UPDATE SET last_number = order_sequences.last_number + 1, updated_at = NOW()
        RETURNING last_number;
      `;
      const num = rows?.[0]?.last_number ?? rows?.[0]?.lastNumber;
      if (num !== undefined) {
        return `${dateKey.replace(/-/g, "")}-${String(num).padStart(4, "0")}`;
      }
    } catch {
      // Fall back to Prisma ORM upsert
    }

    try {
      if ((this.prisma as any).orderSequence) {
        const seq = await this.prisma.orderSequence.upsert({
          where: { outletId_dateKey: { outletId, dateKey } },
          create: { outletId, dateKey, lastNumber: 1 },
          update: { lastNumber: { increment: 1 } },
        });
        return `${dateKey.replace(/-/g, "")}-${String(seq.lastNumber).padStart(4, "0")}`;
      }
    } catch {
      // Continue to order count fallback
    }

    try {
      const allOrders = await this.prisma.order.findMany({
        where: { outletId },
        select: { orderNumber: true },
      });
      const prefix = dateKey.replace(/-/g, "");
      let maxNum = 0;
      for (const ord of allOrders) {
        if (ord.orderNumber && ord.orderNumber.startsWith(prefix)) {
          const suffix = parseInt(ord.orderNumber.split("-")[1] || "0", 10);
          if (!isNaN(suffix) && suffix > maxNum) {
            maxNum = suffix;
          }
        }
      }
      const nextNum = Math.max(maxNum + 1, allOrders.length + 1);
      return `${prefix}-${String(nextNum).padStart(4, "0")}`;
    } catch {
      const rand = Math.floor(1000 + Math.random() * 9000);
      return `${dateKey.replace(/-/g, "")}-${rand}`;
    }
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<{ id: string; status: OrderStatus } | null> {
    const row = await this.prisma.order.findUnique({ where: { idempotencyKey } });
    if (!row) {
      return null;
    }
    return { id: row.id, status: row.status as OrderStatus };
  }

  async createOrder(
    id: string,
    input: CreateOrderInput,
    priced: PricedOrder,
    orderNumber: string
  ): Promise<{ id: string; status: OrderStatus }> {
    await this.prisma.$transaction(async (tx) => {
      if (input.diningTableId) {
        try {
          const tableNum = input.diningTableId.replace("tbl_", "").toUpperCase();
          await tx.diningTable.upsert({
            where: { id: input.diningTableId },
            update: { status: "OCCUPIED" },
            create: {
              id: input.diningTableId,
              outletId: input.outletId,
              tableNumber: tableNum,
              capacity: 4,
              section: tableNum.startsWith("A") ? "AC" : "Non-AC",
              status: "OCCUPIED",
              isActive: true,
            },
          });
        } catch {
          // Table upsert best effort
        }
      }

      let resolvedWaiterId = input.waiterId;
      if (resolvedWaiterId) {
        try {
          const userExists = await tx.user.findUnique({ where: { id: resolvedWaiterId }, select: { id: true } });
          if (!userExists) {
            resolvedWaiterId = undefined;
          }
        } catch {
          resolvedWaiterId = undefined;
        }
      }

      await tx.order.create({
        data: {
          id,
          outletId: input.outletId,
          terminalNumber: input.terminalNumber,
          orderNumber,
          status: "PLACED",
          orderType: input.orderType,
          subtotal: priced.subtotalMinor,
          taxTotal: priced.taxTotalMinor,
          grandTotal: priced.grandTotalMinor,
          idempotencyKey: input.idempotencyKey,
          customerId: input.customerId,
          diningTableId: input.diningTableId,
          waiterId: resolvedWaiterId,
        },
      });

      for (const line of priced.lines) {
        // Ensure menu item exists in database to satisfy foreign key constraints
        const fallback = FALLBACK_CATALOG_PRICES[line.menuItemId];
        if (fallback) {
          try {
            let cat = await tx.menuCategory.findFirst({ where: { outletId: input.outletId, name: fallback.category } });
            if (!cat) {
              cat = await tx.menuCategory.create({
                data: { outletId: input.outletId, name: fallback.category, description: `${fallback.category} items` }
              });
            }
            const resolvedStationId = fallback.category.toLowerCase().includes("beverage") || fallback.category.toLowerCase().includes("mocktail") 
              ? "stn_bar" 
              : fallback.category.toLowerCase().includes("tandoori") 
                ? "stn_tandoor" 
                : "stn_kitchen";

            await tx.menuItem.upsert({
              where: { id: line.menuItemId },
              update: { price: fallback.priceMinor, isVeg: fallback.isVeg, isActive: true, stationId: resolvedStationId },
              create: {
                id: line.menuItemId,
                outletId: input.outletId,
                categoryId: cat.id,
                name: fallback.name,
                price: fallback.priceMinor,
                isVeg: fallback.isVeg,
                taxRate: 5.0,
                isActive: true,
                stationId: resolvedStationId,
              }
            });
          } catch {
            // Best effort
          }
        }

        await tx.orderItem.create({
          data: {
            outletId: input.outletId,
            orderId: id,
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            unitPrice: line.unitPriceMinor,
            subtotal: line.subtotalMinor,
            course: line.course,
            seatNumber: line.seatNumber,
            modifiers: {
              create: line.modifiers.map((modifier) => ({
                modifierOptionId: modifier.modifierOptionId,
                price: modifier.priceMinor,
              })),
            },
          },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          outletId: input.outletId,
          orderId: id,
          status: "PLACED",
        },
      });
    });

    return { id, status: "PLACED" };
  }

  async getStatus(orderId: string): Promise<OrderStatus | null> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    return (row?.status as OrderStatus) ?? null;
  }

  async recordTransition(orderId: string, newStatus: OrderStatus, userId: string, reasonCode?: string, approverUserId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true },
      });

      const order = await tx.order.update({
        where: { id: orderId },
        data: { status: newStatus },
        select: { outletId: true, diningTableId: true },
      });

      if (order.diningTableId && ["COMPLETED", "CANCELLED", "FAILED"].includes(newStatus)) {
        await tx.diningTable.update({
          where: { id: order.diningTableId },
          data: { status: "VACANT" },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          outletId: order.outletId,
          orderId,
          status: newStatus,
        },
      });

      if (newStatus === "CANCELLED") {
        await writeAuditLog(tx, {
          outletId: order.outletId,
          userId,
          action: "ORDER_CANCELLED",
          entityType: "ORDER",
          entityId: orderId,
          beforeState: { status: previous.status },
          afterState: { status: newStatus },
          approverUserId,
          reasonCode,
        });
      }
    });
  }

  private buildOrdersWhere(outletId: string, filter: ListOrdersFilter): Record<string, unknown> {
    const where: Record<string, unknown> = { outletId };

    if (filter.view === "live") {
      where.status = { notIn: TERMINAL_ORDER_STATUSES };
    } else if (filter.view === "online") {
      where.orderType = "AGGREGATOR";
    }

    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.orderType) {
      where.orderType = filter.orderType;
    }
    if (filter.orderNumberSearch) {
      where.orderNumber = { contains: filter.orderNumberSearch, mode: "insensitive" };
    }
    if (filter.fromDate || filter.toDate) {
      const createdAt: Record<string, Date> = {};
      if (filter.fromDate) createdAt.gte = filter.fromDate;
      if (filter.toDate) createdAt.lte = filter.toDate;
      where.createdAt = createdAt;
    }

    return where;
  }

  async countOrders(outletId: string, filter: ListOrdersFilter): Promise<number> {
    return this.prisma.order.count({ where: this.buildOrdersWhere(outletId, filter) });
  }

  async getRevenueTrend(outletId: string, fromDate: Date, toDate: Date): Promise<RevenueTrendPoint[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        outletId,
        createdAt: { gte: fromDate, lte: toDate },
        status: { notIn: ["CANCELLED", "FAILED"] },
      },
      select: { createdAt: true, grandTotal: true },
    });

    const byDay = new Map<string, bigint>();
    for (const o of orders) {
      const key = o.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0n) + o.grandTotal);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, grandTotalMinor]) => ({ date, grandTotalMinor: grandTotalMinor.toString() }));
  }

  async listOrders(outletId: string, filter: ListOrdersFilter): Promise<OrderSummary[]> {
    const where = this.buildOrdersWhere(outletId, filter);

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
      select: {
        id: true,
        orderNumber: true,
        orderType: true,
        status: true,
        grandTotal: true,
        taxTotal: true,
        discountTotal: true,
        createdAt: true,
        diningTableId: true,
        _count: { select: { orderItems: true } },
        channelOrderMapping: {
          select: {
            externalOrderId: true,
            partnerStatedTotal: true,
            computedTotal: true,
            channelAccount: { select: { channel: true } },
          },
        },
        customer: { select: { firstName: true, lastName: true } },
        waiter: { select: { firstName: true, lastName: true } },
        payments: { where: { status: "CAPTURED" }, select: { method: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return rows.map((row: any) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      status: row.status as OrderStatus,
      grandTotalMinor: BigInt(row.grandTotal ?? 0),
      taxTotalMinor: BigInt(row.taxTotal ?? 0),
      discountTotalMinor: BigInt(row.discountTotal ?? 0),
      createdAt: row.createdAt,
      itemCount: row._count?.orderItems ?? (Array.isArray(row.orderItems) ? row.orderItems.length : 1),
      diningTableId: row.diningTableId,
      channel: row.channelOrderMapping?.channelAccount?.channel ?? null,
      externalOrderId: row.channelOrderMapping?.externalOrderId ?? null,
      priceMismatch: row.channelOrderMapping
        ? row.channelOrderMapping.partnerStatedTotal !== row.channelOrderMapping.computedTotal
        : false,
      customerName: row.customer ? `${row.customer.firstName || ''} ${row.customer.lastName || ''}`.trim() || null : null,
      waiterName: row.waiter ? `${row.waiter.firstName || ''} ${row.waiter.lastName || ''}`.trim() || null : null,
      paymentMethod: row.payments?.[0]?.method ?? null,
    }));
  }

  async getOrderDetail(outletId: string, orderId: string): Promise<OrderDetail | null> {
    const row = await this.prisma.order.findFirst({
      where: { id: orderId, outletId },
      include: {
        orderItems: {
          include: {
            menuItem: { select: { name: true } },
            modifiers: true,
          },
        },
        payments: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
        channelOrderMapping: {
          select: { externalOrderId: true, partnerStatedTotal: true, computedTotal: true, channelAccount: { select: { channel: true } } },
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      status: row.status as OrderStatus,
      channel: row.channelOrderMapping?.channelAccount.channel ?? null,
      externalOrderId: row.channelOrderMapping?.externalOrderId ?? null,
      priceMismatch: row.channelOrderMapping
        ? row.channelOrderMapping.partnerStatedTotal !== row.channelOrderMapping.computedTotal
        : false,
      grandTotalMinor: BigInt(row.grandTotal ?? 0),
      subtotalMinor: BigInt(row.subtotal ?? 0),
      taxTotalMinor: BigInt(row.taxTotal ?? 0),
      discountTotalMinor: BigInt(row.discountTotal ?? 0),
      terminalNumber: row.terminalNumber,
      diningTableId: row.diningTableId,
      customerId: row.customerId,
      customerName: null,
      waiterName: null,
      paymentMethod: Array.isArray(row.payments) ? row.payments.find((p: any) => p.status === "CAPTURED")?.method ?? null : null,
      createdAt: row.createdAt,
      itemCount: Array.isArray(row.orderItems) ? row.orderItems.length : 0,
      items: Array.isArray(row.orderItems) ? row.orderItems.map((item: any) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItem?.name || item.menuItemId,
        quantity: item.quantity,
        unitPriceMinor: BigInt(item.unitPrice ?? 0),
        subtotalMinor: BigInt(item.subtotal ?? 0),
        notes: item.notes,
        isVoided: item.isVoided,
        course: item.course,
        seatNumber: item.seatNumber,
        modifiers: Array.isArray(item.modifiers) ? item.modifiers.map((modifier: any) => ({
          modifierOptionId: modifier.modifierOptionId,
          priceMinor: BigInt(modifier.price ?? 0),
        })) : [],
      })) : [],
      payments: Array.isArray(row.payments) ? row.payments.map((payment: any) => ({
        id: payment.id,
        amountMinor: BigInt(payment.amount ?? 0),
        method: payment.method,
        status: payment.status,
        transactionId: payment.transactionId,
        createdAt: payment.createdAt,
      })) : [],
      statusHistory: Array.isArray(row.statusHistory) ? row.statusHistory.map((history: any) => ({
        status: history.status as OrderStatus,
        notes: history.notes,
        createdAt: history.createdAt,
        createdBy: history.createdBy,
      })) : [],
    };
  }

  async getLiveOrderByTable(outletId: string, diningTableId: string): Promise<{ id: string } | null> {
    const row = await this.prisma.order.findFirst({
      where: { outletId, diningTableId, status: { notIn: TERMINAL_ORDER_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return row;
  }

  async addItems(
    outletId: string,
    orderId: string,
    priced: PricedOrder,
    userId: string
  ): Promise<{ id: string; menuItemId: string; quantity: number }[]> {
    const added: { id: string; menuItemId: string; quantity: number }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const line of priced.lines) {
        // Ensure menu item exists in database to satisfy foreign key constraints
        const fallback = FALLBACK_CATALOG_PRICES[line.menuItemId];
        if (fallback) {
          try {
            let cat = await tx.menuCategory.findFirst({ where: { outletId, name: fallback.category } });
            if (!cat) {
              cat = await tx.menuCategory.create({
                data: { outletId, name: fallback.category, description: `${fallback.category} items` }
              });
            }
            await tx.menuItem.upsert({
              where: { id: line.menuItemId },
              update: { price: fallback.priceMinor, isVeg: fallback.isVeg, isActive: true },
              create: {
                id: line.menuItemId,
                outletId,
                categoryId: cat.id,
                name: fallback.name,
                price: fallback.priceMinor,
                isVeg: fallback.isVeg,
                taxRate: 5.0,
                isActive: true,
              }
            });
          } catch {
            // Best effort
          }
        }

        const item = await tx.orderItem.create({
          data: {
            outletId,
            orderId,
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            unitPrice: line.unitPriceMinor,
            subtotal: line.subtotalMinor,
            course: line.course,
            seatNumber: line.seatNumber,
            modifiers: {
              create: line.modifiers.map((modifier) => ({
                modifierOptionId: modifier.modifierOptionId,
                price: modifier.priceMinor,
              })),
            },
          },
        });
        added.push({ id: item.id, menuItemId: item.menuItemId, quantity: item.quantity });
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: { increment: priced.subtotalMinor },
          taxTotal: { increment: priced.taxTotalMinor },
          grandTotal: { increment: priced.grandTotalMinor },
        },
      });

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "ORDER_ITEMS_ADDED",
        entityType: "ORDER",
        entityId: orderId,
        afterState: { items: added },
      });
    });

    return added;
  }

  async voidItem(
    outletId: string,
    orderId: string,
    orderItemId: string,
    reasonCode: string,
    userId: string
  ): Promise<{ ok: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: orderItemId, orderId, outletId, isVoided: false },
      });
      if (!item) {
        return { ok: false };
      }

      await tx.orderItem.update({
        where: { id: orderItemId },
        data: { isVoided: true, voidReason: reasonCode, voidedBy: userId },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: { decrement: item.subtotal },
          grandTotal: { decrement: item.subtotal },
        },
      });

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "ORDER_ITEM_VOIDED",
        entityType: "ORDER",
        entityId: orderId,
        beforeState: { orderItemId, subtotal: item.subtotal.toString() },
        reasonCode,
      });

      return { ok: true };
    });
  }

  async getBill(outletId: string, orderId: string): Promise<BillSummary | null> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, outletId },
      include: { payments: { where: { status: "CAPTURED" } } },
    });
    if (!order) {
      return null;
    }

    const paidMinor = order.payments.reduce((acc, p) => acc + p.amount, 0n);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      subtotalMinor: order.subtotal,
      discountTotalMinor: order.discountTotal,
      taxTotalMinor: order.taxTotal,
      tipTotalMinor: order.tipTotal,
      serviceChargeTotalMinor: order.serviceChargeTotal,
      grandTotalMinor: order.grandTotal,
      paidMinor,
      dueMinor: order.grandTotal - paidMinor,
    };
  }

  async getBillBySeat(outletId: string, orderId: string): Promise<{ seatNumber: number | null; subtotalMinor: string; paidMinor: string }[]> {
    const [items, payments] = await Promise.all([
      this.prisma.orderItem.findMany({ where: { outletId, orderId, isVoided: false } }),
      this.prisma.payment.findMany({ where: { outletId, orderId, status: "CAPTURED" } }),
    ]);

    const bySeat = new Map<number | null, { subtotal: bigint; paid: bigint }>();
    for (const item of items) {
      const key = item.seatNumber;
      const entry = bySeat.get(key) ?? { subtotal: 0n, paid: 0n };
      entry.subtotal += item.subtotal;
      bySeat.set(key, entry);
    }
    for (const payment of payments) {
      const key = payment.seatNumber ?? null;
      const entry = bySeat.get(key) ?? { subtotal: 0n, paid: 0n };
      entry.paid += payment.amount;
      bySeat.set(key, entry);
    }

    return Array.from(bySeat.entries()).map(([seatNumber, v]) => ({
      seatNumber,
      subtotalMinor: v.subtotal.toString(),
      paidMinor: v.paid.toString(),
    }));
  }

  async setCharges(
    outletId: string,
    orderId: string,
    tipMinor: bigint,
    serviceChargeMinor: bigint
  ): Promise<{ tipTotalMinor: bigint; serviceChargeTotalMinor: bigint; grandTotalMinor: bigint }> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirstOrThrow({ where: { id: orderId, outletId } });
      const tipDelta = tipMinor - order.tipTotal;
      const serviceDelta = serviceChargeMinor - order.serviceChargeTotal;

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          tipTotal: tipMinor,
          serviceChargeTotal: serviceChargeMinor,
          grandTotal: { increment: tipDelta + serviceDelta },
        },
      });

      return { tipTotalMinor: updated.tipTotal, serviceChargeTotalMinor: updated.serviceChargeTotal, grandTotalMinor: updated.grandTotal };
    });
  }

  async recordPayment(
    outletId: string,
    orderId: string,
    amountMinor: bigint,
    method: string,
    userId: string,
    seatNumber?: number
  ): Promise<{ id: string; amountMinor: bigint; method: string; status: string }> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          outletId,
          orderId,
          amount: amountMinor,
          method,
          status: "CAPTURED",
          seatNumber,
        },
      });

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "PAYMENT_RECORDED",
        entityType: "PAYMENT",
        entityId: payment.id,
        afterState: { orderId, amountMinor: amountMinor.toString(), method, seatNumber },
      });

      return { id: payment.id, amountMinor: payment.amount, method: payment.method, status: payment.status };
    });
  }
}
