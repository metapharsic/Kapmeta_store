import { Router } from "express";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { PrismaClient } from "@prisma/client";

export const inventoryRouter = Router();
const prisma = new PrismaClient();

// List ingredients for active outlet
inventoryRouter.get("/ingredients", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const ingredients = await (prisma as any).ingredients.findMany({
      where: { outlet_id: outletId, is_active: true },
      orderBy: { name: "asc" },
    });

    res.status(200).json(ingredients.map((ing: any) => ({
      id: ing.id,
      name: ing.name,
      unitOfMeasure: ing.unit_of_measure,
      reorderLevel: ing.reorder_level,
      unitCost: Number(ing.unit_cost_minor) / 100,
      currentStock: Number(ing.current_stock_qty),
      createdAt: ing.created_at.toISOString(),
    })));
  } catch (error: any) {
    console.error("Error listing ingredients:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create an ingredient
inventoryRouter.post("/ingredients", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const name = req.body.name;
  const unitOfMeasure = req.body.unitOfMeasure || req.body.unit;
  const reorderLevel = req.body.reorderLevel !== undefined ? req.body.reorderLevel : req.body.minThreshold;
  const unitCost = req.body.unitCost !== undefined ? req.body.unitCost : (req.body.costPerUnitMinor !== undefined ? req.body.costPerUnitMinor / 100 : undefined);
  const currentStock = req.body.currentStock !== undefined ? Number(req.body.currentStock) : 0;

  if (!name || !unitOfMeasure || reorderLevel === undefined || unitCost === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const ingredient = await (prisma as any).ingredients.create({
      data: {
        outlet_id: outletId,
        name: String(name).trim(),
        unit_of_measure: String(unitOfMeasure).trim(),
        reorder_level: Number(reorderLevel),
        unit_cost_minor: Math.round(Number(unitCost) * 100),
        current_stock_qty: Number(currentStock),
        created_by: userId,
        updated_by: userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "CREATE",
        entityType: "INVENTORY_INGREDIENT",
        entityId: ingredient.id,
        afterState: { name: ingredient.name, unitOfMeasure: ingredient.unit_of_measure },
        createdAt: new Date(),
      },
    });

    res.status(201).json({
      id: ingredient.id,
      name: ingredient.name,
      unitOfMeasure: ingredient.unit_of_measure,
      reorderLevel: ingredient.reorder_level,
      unitCost: Number(ingredient.unit_cost_minor) / 100,
      currentStock: Number(ingredient.current_stock_qty),
    });
  } catch (error: any) {
    console.error("Error creating ingredient:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update ingredient stock
inventoryRouter.patch("/ingredients/:id", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const ingredientId = req.params.id;
  const qty = Number(req.body.quantity || req.body.qty || 0);

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const existing = await (prisma as any).ingredients.findFirst({
      where: { id: ingredientId, outlet_id: outletId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Ingredient not found" });
    }

    const newStock = Number(existing.current_stock_qty) + qty;

    await (prisma as any).ingredients.update({
      where: { id: ingredientId },
      data: {
        current_stock_qty: newStock,
        updated_at: new Date(),
        updated_by: userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "UPDATE",
        entityType: "INVENTORY_INGREDIENT",
        entityId: ingredientId,
        beforeState: { currentStock: Number(existing.current_stock_qty) },
        afterState: { currentStock: newStock },
        createdAt: new Date(),
      },
    });

    res.status(200).json({ success: true, currentStock: newStock });
  } catch (error: any) {
    console.error("Error updating ingredient:", error);
    res.status(500).json({ error: error.message });
  }
});

// Deduct stock
inventoryRouter.post("/stock/deduct", requireAuth, requirePermission("inventory.stock.deduct"), async (req: AuthedRequest, res) => {
  const { ingredientId, quantity } = req.body;

  if (!ingredientId || quantity === undefined) {
    return res.status(400).json({ error: "Missing ingredientId or quantity" });
  }

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const existing = await (prisma as any).ingredients.findFirst({
      where: { id: ingredientId, outlet_id: outletId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Ingredient not found" });
    }

    const newStock = Number(existing.current_stock_qty) - Number(quantity);

    await (prisma as any).ingredients.update({
      where: { id: ingredientId },
      data: {
        current_stock_qty: newStock,
        updated_at: new Date(),
        updated_by: userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "DEDUCT",
        entityType: "INVENTORY_INGREDIENT",
        entityId: ingredientId,
        beforeState: { currentStock: Number(existing.current_stock_qty) },
        afterState: { currentStock: newStock },
        createdAt: new Date(),
      },
    });

    res.status(200).json({ success: true, currentStock: newStock });
  } catch (error: any) {
    console.error("Error deducting stock:", error);
    res.status(500).json({ error: error.message });
  }
});

// List recipes
inventoryRouter.get("/recipes", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const recipes = await (prisma as any).recipes.findMany({
      where: { outlet_id: outletId, is_active: true },
      include: {
        recipe_ingredients: {
          include: {
            ingredients: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    res.status(200).json(recipes.map((rec: any) => ({
      id: rec.id,
      name: rec.name,
      menuItemId: rec.menu_item_id,
      yieldPortions: Number(rec.yield_portions),
      ingredients: rec.recipe_ingredients.map((ri: any) => ({
        ingredientId: ri.ingredient_id,
        ingredientName: ri.ingredients.name,
        quantity: Number(ri.quantity),
        unit: ri.ingredients.unit_of_measure,
      })),
    })));
  } catch (error: any) {
    console.error("Error listing recipes:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a recipe
inventoryRouter.post("/recipes", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const { name, menuItemId, ingredients, yieldPortions } = req.body;

  if (!name || !ingredients || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: "Missing name or ingredients" });
  }

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const recipe = await (prisma as any).recipes.create({
      data: {
        outlet_id: outletId,
        name: String(name).trim(),
        menu_item_id: menuItemId || null,
        yield_portions: Number(yieldPortions || 1),
        created_by: userId,
        updated_by: userId,
      },
    });

    for (const ing of ingredients) {
      await (prisma as any).recipe_ingredients.create({
        data: {
          recipe_id: recipe.id,
          ingredient_id: ing.ingredientId,
          quantity: Number(ing.quantity),
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "CREATE",
        entityType: "INVENTORY_RECIPE",
        entityId: recipe.id,
        afterState: { name, menuItemId, ingredients },
        createdAt: new Date(),
      },
    });

    res.status(201).json({ id: recipe.id, name, menuItemId, ingredients });
  } catch (error: any) {
    console.error("Error creating recipe:", error);
    res.status(500).json({ error: error.message });
  }
});

// List vendors
inventoryRouter.get("/vendors", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const vendors = await (prisma as any).vendors.findMany({
      where: { outlet_id: outletId, is_active: true },
      orderBy: { name: "asc" },
    });

    res.status(200).json(vendors.map((v: any) => ({
      id: v.id,
      name: v.name,
      contactName: v.contact_name,
      contactPhone: v.contact_phone,
      contactEmail: v.contact_email,
      paymentTerms: v.payment_terms,
    })));
  } catch (error: any) {
    console.error("Error listing vendors:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a vendor
inventoryRouter.post("/vendors", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const { name, contactName, contactPhone, contactEmail, paymentTerms } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Missing vendor name" });
  }

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const vendor = await (prisma as any).vendors.create({
      data: {
        outlet_id: outletId,
        name: String(name).trim(),
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        contact_email: contactEmail || null,
        payment_terms: paymentTerms || null,
        created_by: userId,
        updated_by: userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "CREATE",
        entityType: "INVENTORY_VENDOR",
        entityId: vendor.id,
        afterState: { name, contactName, contactPhone, contactEmail, paymentTerms },
        createdAt: new Date(),
      },
    });

    res.status(201).json({
      id: vendor.id,
      name: vendor.name,
      contactName: vendor.contact_name,
      contactPhone: vendor.contact_phone,
      contactEmail: vendor.contact_email,
      paymentTerms: vendor.payment_terms
    });
  } catch (error: any) {
    console.error("Error creating vendor:", error);
    res.status(500).json({ error: error.message });
  }
});

// List purchase orders
inventoryRouter.get("/purchase-orders", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const orders = await (prisma as any).purchase_orders.findMany({
      where: { outlet_id: outletId },
      include: {
        vendors: true,
        purchase_order_items: {
          include: {
            ingredients: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    res.status(200).json(orders.map((po: any) => ({
      id: po.id,
      poNumber: po.po_number,
      vendorId: po.vendor_id,
      vendorName: po.vendors.name,
      items: po.purchase_order_items.map((poi: any) => ({
        ingredientId: poi.ingredient_id,
        ingredientName: poi.ingredients.name,
        quantity: Number(poi.quantity),
        unitPrice: Number(poi.unit_price_minor) / 100,
        total: Number(poi.total_minor) / 100,
      })),
      totalAmount: Number(po.total_amount_minor) / 100,
      status: po.status,
      createdAt: po.created_at.toISOString(),
    })));
  } catch (error: any) {
    console.error("Error listing purchase orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a purchase order
inventoryRouter.post("/purchase-orders", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const { vendorId, items } = req.body;

  if (!vendorId || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: "Missing vendorId or items" });
  }

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    // Generate PO number
    const count = await (prisma as any).purchase_orders.count({
      where: { outlet_id: outletId },
    });
    const poNumber = `PO-${String(count + 1).padStart(6, "0")}`;

    const total = items.reduce((sum: number, it: any) => sum + Number(it.unitPrice || 0) * Number(it.quantity || 0), 0);

    const po = await (prisma as any).purchase_orders.create({
      data: {
        outlet_id: outletId,
        vendor_id: vendorId,
        po_number: poNumber,
        total_amount_minor: Math.round(total * 100),
        status: "DRAFT",
        created_by: userId,
        updated_by: userId,
      },
    });

    for (const item of items) {
      const unitPriceMinor = Math.round(Number(item.unitPrice) * 100);
      const qty = Number(item.quantity);
      await (prisma as any).purchase_order_items.create({
        data: {
          po_id: po.id,
          ingredient_id: item.ingredientId,
          quantity: qty,
          unit_price_minor: unitPriceMinor,
          total_minor: unitPriceMinor * qty,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "CREATE",
        entityType: "INVENTORY_PURCHASE_ORDER",
        entityId: po.id,
        afterState: { vendorId, items, totalAmount: total, status: "DRAFT" },
        createdAt: new Date(),
      },
    });

    res.status(201).json({ id: po.id, poNumber, vendorId, items, totalAmount: total, status: "DRAFT" });
  } catch (error: any) {
    console.error("Error creating purchase order:", error);
    res.status(500).json({ error: error.message });
  }
});
