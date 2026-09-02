import { Router } from "express";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";
import { getItemMarginReport, PrismaReportingRepository } from "@kapmeta/reporting";

export const inventoryRouter = Router();

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
  const currentStock = req.body.currentStock !== undefined ? Number(req.body.currentStock) : (req.body.initialStock !== undefined ? Number(req.body.initialStock) : (req.body.stock !== undefined ? Number(req.body.stock) : 0));

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

    // Lookup menu items for names
    const menuItemIds = recipes.map((r: any) => r.menu_item_id).filter(Boolean);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
    });
    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    res.status(200).json(recipes.map((rec: any) => {
      const mi = menuItemMap.get(rec.menu_item_id);
      const mappedIngredients = (rec.recipe_ingredients || []).map((ri: any) => ({
        id: ri.id,
        ingredientId: ri.ingredient_id,
        ingredientName: ri.ingredients?.name || "Ingredient",
        quantity: Number(ri.quantity),
        yieldPercent: 100,
        unit: ri.ingredients?.unit_of_measure || "g",
        ingredient: {
          id: ri.ingredient_id,
          name: ri.ingredients?.name || "Ingredient",
          unitOfMeasure: ri.ingredients?.unit_of_measure || "g",
          reorderLevel: Number(ri.ingredients?.reorder_level || 0),
          unitCost: Number(ri.ingredients?.unit_cost_minor || 0) / 100,
          currentStock: Number(ri.ingredients?.current_stock_qty || 0),
        },
      }));

      return {
        id: rec.id,
        name: rec.name || (mi?.name ? `${mi.name} Recipe` : "Dish Recipe"),
        menuItemId: rec.menu_item_id,
        version: 1,
        isActive: rec.is_active ?? true,
        yieldPortions: Number(rec.yield_portions || 1),
        menuItem: mi ? {
          id: mi.id,
          name: mi.name,
          priceMinor: Math.round(Number(mi.price || 0) * 100).toString(),
          isVeg: mi.isVeg,
        } : { id: rec.menu_item_id, name: rec.name || "Dish", priceMinor: "0", isVeg: true },
        recipeIngredients: mappedIngredients,
        ingredients: mappedIngredients,
      };
    }));
  } catch (error: any) {
    console.error("Error listing recipes:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a recipe / BOM
inventoryRouter.post("/recipes", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  let { name, menuItemId, ingredients, yieldPortions } = req.body;

  if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: "Please provide at least one ingredient for the recipe BOM" });
  }

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    if (!name && menuItemId) {
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: menuItemId, outletId },
      });
      name = menuItem?.name || "Recipe BOM";
    } else if (!name) {
      name = "Recipe BOM";
    }

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
          ingredient_id: ing.ingredientId || ing.id,
          quantity: Number(ing.quantity || 1),
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

// Update a recipe / BOM
inventoryRouter.patch("/recipes/:id", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const recipeId = req.params.id;
  const { name, yieldPortions, ingredients } = req.body;

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const existing = await (prisma as any).recipes.findFirst({
      where: { id: recipeId, outlet_id: outletId, is_active: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    const data: any = { updated_at: new Date(), updated_by: userId };
    if (name !== undefined) data.name = String(name).trim();
    if (yieldPortions !== undefined) data.yield_portions = Number(yieldPortions);

    const updated = await (prisma as any).recipes.update({
      where: { id: recipeId },
      data,
    });

    if (Array.isArray(ingredients)) {
      await (prisma as any).recipe_ingredients.deleteMany({ where: { recipe_id: recipeId } });
      for (const ing of ingredients) {
        await (prisma as any).recipe_ingredients.create({
          data: {
            recipe_id: recipeId,
            ingredient_id: ing.ingredientId || ing.id,
            quantity: Number(ing.quantity || 1),
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "UPDATE",
        entityType: "INVENTORY_RECIPE",
        entityId: recipeId,
        beforeState: { name: existing.name, yieldPortions: Number(existing.yield_portions) },
        afterState: { name: updated.name, yieldPortions: Number(updated.yield_portions), ingredients },
        createdAt: new Date(),
      },
    });

    res.status(200).json({ id: updated.id, name: updated.name, yieldPortions: Number(updated.yield_portions) });
  } catch (error: any) {
    console.error("Error updating recipe:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete (soft) a recipe / BOM.
// Soft-delete via is_active=false: recipes already carry an is_active flag
// (GET /recipes filters on it), and even though no other table FKs to
// recipes today, keeping the row preserves historical BOM/costing context
// for orders/reports that referenced this recipe while it was active.
inventoryRouter.delete("/recipes/:id", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const recipeId = req.params.id;

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const existing = await (prisma as any).recipes.findFirst({
      where: { id: recipeId, outlet_id: outletId, is_active: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    await (prisma as any).recipes.update({
      where: { id: recipeId },
      data: { is_active: false, updated_at: new Date(), updated_by: userId },
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "DELETE",
        entityType: "INVENTORY_RECIPE",
        entityId: recipeId,
        beforeState: { name: existing.name, isActive: true },
        afterState: { isActive: false },
        createdAt: new Date(),
      },
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error deleting recipe:", error);
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

// Update a vendor
inventoryRouter.patch("/vendors/:id", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const vendorId = req.params.id;
  const { name, contactName, contactPhone, contactEmail, paymentTerms } = req.body;

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const existing = await (prisma as any).vendors.findFirst({
      where: { id: vendorId, outlet_id: outletId, is_active: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const data: any = { updated_at: new Date(), updated_by: userId };
    if (name !== undefined) data.name = String(name).trim();
    if (contactName !== undefined) data.contact_name = contactName || null;
    if (contactPhone !== undefined) data.contact_phone = contactPhone || null;
    if (contactEmail !== undefined) data.contact_email = contactEmail || null;
    if (paymentTerms !== undefined) data.payment_terms = paymentTerms || null;

    const updated = await (prisma as any).vendors.update({
      where: { id: vendorId },
      data,
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "UPDATE",
        entityType: "INVENTORY_VENDOR",
        entityId: vendorId,
        beforeState: {
          name: existing.name,
          contactName: existing.contact_name,
          contactPhone: existing.contact_phone,
          contactEmail: existing.contact_email,
          paymentTerms: existing.payment_terms,
        },
        afterState: { name: updated.name, contactName: updated.contact_name, contactPhone: updated.contact_phone, contactEmail: updated.contact_email, paymentTerms: updated.payment_terms },
        createdAt: new Date(),
      },
    });

    res.status(200).json({
      id: updated.id,
      name: updated.name,
      contactName: updated.contact_name,
      contactPhone: updated.contact_phone,
      contactEmail: updated.contact_email,
      paymentTerms: updated.payment_terms,
    });
  } catch (error: any) {
    console.error("Error updating vendor:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete (soft) a vendor.
// Soft-delete via is_active=false: purchase_orders.vendor_id has an onDelete:
// NoAction FK to vendors, so a hard delete would throw a raw DB constraint
// error for any vendor with PO history (draft or otherwise) instead of a
// clean API response — and vendors already carries an is_active flag that
// GET /vendors filters on, so soft-delete is the consistent, safe default
// regardless of whether this particular vendor has POs yet.
inventoryRouter.delete("/vendors/:id", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const vendorId = req.params.id;

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const existing = await (prisma as any).vendors.findFirst({
      where: { id: vendorId, outlet_id: outletId, is_active: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    await (prisma as any).vendors.update({
      where: { id: vendorId },
      data: { is_active: false, updated_at: new Date(), updated_by: userId },
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "DELETE",
        entityType: "INVENTORY_VENDOR",
        entityId: vendorId,
        beforeState: { name: existing.name, isActive: true },
        afterState: { isActive: false },
        createdAt: new Date(),
      },
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error deleting vendor:", error);
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

// POST /inventory/purchase-orders/:id/receive - Receive goods (GRN) and increment ingredient stock in DB
inventoryRouter.post("/purchase-orders/:id/receive", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const poId = req.params.id;

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const po = await (prisma as any).purchase_orders.findFirst({
      where: { id: poId, outlet_id: outletId },
      include: {
        purchase_order_items: {
          include: { ingredients: true },
        },
        vendors: true,
      },
    });

    if (!po) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    if (po.status === "RECEIVED") {
      return res.status(400).json({ error: "Purchase order has already been received" });
    }

    const requested = Array.isArray(req.body.items) ? req.body.items as { ingredientId: string; quantity: number }[] : null;
    const receivedItems: any[] = [];
    let allComplete = true;

    for (const item of po.purchase_order_items) {
      const already = Number(item.received_qty || 0);
      const ordered = Number(item.quantity || 0);
      const remaining = Math.max(0, ordered - already);
      const requestedRow = requested?.find((r) => r.ingredientId === item.ingredient_id);
      const addQty = requested ? Number(requestedRow?.quantity || 0) : remaining;
      if (addQty <= 0) {
        if (already < ordered) allComplete = false;
        continue;
      }
      const applied = Math.min(addQty, remaining);
      if (applied < remaining || already + applied < ordered) allComplete = false;

      const ingredient = await prisma.ingredients.findUnique({
        where: { id: item.ingredient_id },
      });
      if (!ingredient) continue;

      const previousStock = Number(ingredient.current_stock_qty || 0);
      const newStock = previousStock + applied;
      await prisma.ingredients.update({
        where: { id: ingredient.id },
        data: {
          current_stock_qty: newStock,
          updated_at: new Date(),
          updated_by: userId,
        },
      });
      await prisma.purchase_order_items.update({
        where: { id: item.id },
        data: { received_qty: already + applied },
      });
      receivedItems.push({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        addedQty: applied,
        previousStock,
        newStock,
        unit: ingredient.unit_of_measure,
      });
    }

    const nextStatus = allComplete ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await prisma.purchase_orders.update({
      where: { id: poId },
      data: {
        status: nextStatus,
        updated_at: new Date(),
        updated_by: userId,
      },
    });

    // Write GRN Audit Log
    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "UPDATE",
        entityType: "INVENTORY_GRN",
        entityId: poId,
        beforeState: { status: po.status },
        afterState: { status: nextStatus, receivedItems, poNumber: po.po_number, vendorName: po.vendors?.name },
        createdAt: new Date(),
      },
    });

    res.status(200).json({
      ok: true,
      message: `Goods for ${po.po_number} received. Status ${nextStatus}.`,
      poNumber: po.po_number,
      status: nextStatus,
      receivedItems,
    });
  } catch (error: any) {
    console.error("Error receiving purchase order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update a DRAFT purchase order (vendor, items). Once a PO has moved past
// DRAFT (PARTIALLY_RECEIVED/RECEIVED/CANCELLED) its items may already have
// received_qty applied to real stock, so editing them after that point would
// desync the PO from what was actually received. Only DRAFT is editable.
inventoryRouter.patch("/purchase-orders/:id", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const poId = req.params.id;
  const { vendorId, items } = req.body;

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const existing = await (prisma as any).purchase_orders.findFirst({
      where: { id: poId, outlet_id: outletId },
      include: { purchase_order_items: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Purchase order not found" });
    }
    if (existing.status !== "DRAFT") {
      return res.status(400).json({ error: `Cannot edit a purchase order with status ${existing.status}. Only DRAFT purchase orders can be edited.` });
    }

    const data: any = { updated_at: new Date(), updated_by: userId };
    if (vendorId !== undefined) data.vendor_id = vendorId;

    let total = Number(existing.total_amount_minor) / 100;
    if (Array.isArray(items)) {
      total = items.reduce((sum: number, it: any) => sum + Number(it.unitPrice || 0) * Number(it.quantity || 0), 0);
      data.total_amount_minor = Math.round(total * 100);
    }

    const updated = await (prisma as any).purchase_orders.update({
      where: { id: poId },
      data,
    });

    if (Array.isArray(items)) {
      await (prisma as any).purchase_order_items.deleteMany({ where: { po_id: poId } });
      for (const item of items) {
        const unitPriceMinor = Math.round(Number(item.unitPrice) * 100);
        const qty = Number(item.quantity);
        await (prisma as any).purchase_order_items.create({
          data: {
            po_id: poId,
            ingredient_id: item.ingredientId,
            quantity: qty,
            unit_price_minor: unitPriceMinor,
            total_minor: unitPriceMinor * qty,
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "UPDATE",
        entityType: "INVENTORY_PURCHASE_ORDER",
        entityId: poId,
        beforeState: { vendorId: existing.vendor_id, totalAmount: Number(existing.total_amount_minor) / 100 },
        afterState: { vendorId: updated.vendor_id, items, totalAmount: total },
        createdAt: new Date(),
      },
    });

    res.status(200).json({ id: updated.id, poNumber: updated.po_number, vendorId: updated.vendor_id, items, totalAmount: total, status: updated.status });
  } catch (error: any) {
    console.error("Error updating purchase order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel a purchase order that has not been received (partially or fully).
// Once any receive has landed, real ingredient stock has already been
// incremented from it, so cancelling at that point could not honestly
// reverse the effect without a separate stock-reversal decision — out of
// scope here. Only DRAFT (never received) POs may be cancelled.
inventoryRouter.post("/purchase-orders/:id/cancel", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const poId = req.params.id;

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const existing = await (prisma as any).purchase_orders.findFirst({
      where: { id: poId, outlet_id: outletId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Purchase order not found" });
    }
    if (existing.status !== "DRAFT") {
      return res.status(400).json({ error: `Cannot cancel a purchase order with status ${existing.status}. Only DRAFT purchase orders (nothing received yet) can be cancelled.` });
    }

    const updated = await (prisma as any).purchase_orders.update({
      where: { id: poId },
      data: { status: "CANCELLED", updated_at: new Date(), updated_by: userId },
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "UPDATE",
        entityType: "INVENTORY_PURCHASE_ORDER",
        entityId: poId,
        beforeState: { status: existing.status },
        afterState: { status: "CANCELLED" },
        createdAt: new Date(),
      },
    });

    res.status(200).json({ id: updated.id, poNumber: updated.po_number, status: updated.status });
  } catch (error: any) {
    console.error("Error cancelling purchase order:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /inventory/availability/export - Export 86 item availability list
inventoryRouter.get("/availability/export", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const category = req.query.category as string;

    const items = await prisma.menuItem.findMany({
      where: {
        outletId,
        ...(category && category !== "All" ? { category: { name: category } } : {}),
      },
      include: {
        category: true,
      },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    });

    res.status(200).json(
      items.map((it) => ({
        id: it.id,
        name: it.name,
        code: (it as any).code || "",
        category: it.category?.name || "General",
        priceMinor: Math.round(Number(it.price || 0) * 100),
        priceFormatted: `₹${Number(it.price || 0).toFixed(2)}`,
        isVeg: it.isVeg,
        isStocked: it.isActive ?? true,
        status: (it.isActive ?? true) ? "IN_STOCK" : "86_OUT_OF_STOCK",
      }))
    );
  } catch (error: any) {
    console.error("Error exporting availability:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper for formatting minor units (paise) to Indian currency string
function formatInrMinor(minor: bigint | number | string): string {
  const num = typeof minor === "bigint" ? Number(minor) : Number(minor || 0);
  const rupees = Math.round(num / 100);
  return rupees.toLocaleString("en-IN");
}

// GET /inventory/dashboard/summary - Aggregate all metrics for the Inventory Dashboard
inventoryRouter.get("/dashboard/summary", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const now = new Date();
    const queryMonth = Number(req.query.month) || (now.getMonth() + 1);
    const queryYear = Number(req.query.year) || now.getFullYear();

    // 1. Raw Materials & Recipes counts
    const [ingCountRes, recCountRes] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT 
           count(*)::int as count, 
           coalesce(sum(current_stock_qty * unit_cost_minor), 0)::bigint as total_worth_minor,
           coalesce(sum(case when current_stock_qty <= reorder_level then 1 else 0 end), 0)::int as low_stock_count
         FROM ingredients 
         WHERE outlet_id = $1 AND is_active = true`,
        outletId
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT count(*)::int as count FROM recipes WHERE outlet_id = $1 AND is_active = true`,
        outletId
      ),
    ]);

    const totalRawMaterials = ingCountRes[0]?.count || 0;
    const totalRecipes = recCountRes[0]?.count || 0;
    const totalWorthMinor = BigInt(ingCountRes[0]?.total_worth_minor || 0);
    const lowStockCount = ingCountRes[0]?.low_stock_count || 0;
    const lowStockPercent = totalRawMaterials > 0 ? Math.round((lowStockCount / totalRawMaterials) * 100) : 0;

    // 2. Low stock alert items
    const lowStockItems = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, unit_of_measure as unit, current_stock_qty as "currentStock", reorder_level as "reorderLevel"
       FROM ingredients 
       WHERE outlet_id = $1 AND is_active = true AND current_stock_qty <= reorder_level 
       ORDER BY current_stock_qty ASC 
       LIMIT 8`,
      outletId
    );

    const lowStockAlerts = lowStockItems.map((item: any) => {
      const stock = Number(item.currentStock);
      const estDays = Math.max(1, Math.min(30, Math.round(stock / 5) || 1));
      return {
        id: item.id,
        name: item.name,
        currentStock: stock,
        unit: item.unit,
        reorderLevel: Number(item.reorderLevel),
        daysRemaining: estDays,
        category: item.unit === "ml" || item.unit === "l" ? "Beverages" : "Groceries",
      };
    });

    // 3. Category distribution
    const categoryRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT unit_of_measure as category, count(*)::int as count, coalesce(sum(current_stock_qty * unit_cost_minor), 0)::bigint as value_minor
       FROM ingredients
       WHERE outlet_id = $1 AND is_active = true
       GROUP BY unit_of_measure
       ORDER BY count DESC`,
      outletId
    );

    // 4. Daily Stock Closing Tracker for given month
    const closings = await prisma.$queryRawUnsafe<any[]>(
      `SELECT closing_date as "closingDate", status, total_items_checked as "totalItemsChecked"
       FROM daily_stock_closings
       WHERE outlet_id = $1 AND EXTRACT(MONTH FROM closing_date) = $2 AND EXTRACT(YEAR FROM closing_date) = $3`,
      outletId,
      queryMonth,
      queryYear
    );

    const daysInMonth = new Date(queryYear, queryMonth, 0).getDate();
    const todayDate = now.getDate();
    const isCurrentMonth = queryMonth === (now.getMonth() + 1) && queryYear === now.getFullYear();

    const closingMap = new Map<number, string>();
    for (const c of closings) {
      const d = new Date(c.closingDate).getDate();
      closingMap.set(d, c.status);
    }

    let daysUpdated = 0;
    let daysMissed = 0;
    const dayProgress = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const status = closingMap.get(day);
      let dayStatus: "UPDATED" | "MISSED" | "TODAY" | "UPCOMING" = "UPCOMING";
      if (status === "UPDATED") {
        dayStatus = "UPDATED";
        daysUpdated++;
      } else if (isCurrentMonth && day === todayDate) {
        dayStatus = "TODAY";
      } else if (isCurrentMonth && day < todayDate) {
        dayStatus = "MISSED";
        daysMissed++;
      } else if (!isCurrentMonth && queryYear < now.getFullYear()) {
        dayStatus = "MISSED";
        daysMissed++;
      }
      dayProgress.push({ day, status: dayStatus });
    }

    const elapsedDays = isCurrentMonth ? Math.max(1, todayDate) : daysInMonth;
    const updateAccuracy = Math.min(100, Math.round((daysUpdated / elapsedDays) * 100));

    // 5. Stock Purchases & Pending Payments
    const purchaseAggRes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 
         coalesce(sum(total_amount_minor), 0)::bigint as total_purchase_minor,
         coalesce(sum(case when payment_status != 'PAID' then (total_amount_minor - paid_amount_minor) else 0 end), 0)::bigint as pending_payment_minor
       FROM stock_purchases
       WHERE outlet_id = $1`,
      outletId
    );

    const totalPurchaseMinor = BigInt(purchaseAggRes[0]?.total_purchase_minor || 0);
    const pendingPaymentMinor = BigInt(purchaseAggRes[0]?.pending_payment_minor || 0);

    // 6. Supplier breakdown
    const supplierRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 
         v.id, 
         v.name, 
         coalesce(sum(sp.total_amount_minor), 0)::bigint as current_purchase_minor,
         coalesce(sum(case when sp.payment_status != 'PAID' then (sp.total_amount_minor - sp.paid_amount_minor) else 0 end), 0)::bigint as pending_payment_minor
       FROM vendors v
       LEFT JOIN stock_purchases sp ON sp.vendor_id = v.id AND sp.outlet_id = $1
       WHERE v.outlet_id = $1 AND v.is_active = true
       GROUP BY v.id, v.name
       ORDER BY current_purchase_minor DESC
       LIMIT 6`,
      outletId
    );

    // 7. Ingredient Price Trends -- real chronological unit costs paid on the
    // ingredient's most recent stock purchases (oldest to newest). Ingredients
    // with no purchase history yet fall back to a single real data point (the
    // ingredient's current unit cost), never a fabricated series.
    const priceTrendIngredients = await prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id, i.name, i.unit_cost_minor as "unitCostMinor",
              (SELECT array_agg(recent.uc ORDER BY recent.inv_date ASC)
               FROM (
                 SELECT spi.unit_cost_minor as uc, sp.invoice_date as inv_date
                 FROM stock_purchase_items spi
                 JOIN stock_purchases sp ON sp.id = spi.purchase_id
                 WHERE spi.ingredient_id = i.id AND sp.outlet_id = $1
                 ORDER BY sp.invoice_date DESC
                 LIMIT 6
               ) recent) as "priceHistoryMinor"
       FROM ingredients i
       WHERE i.outlet_id = $1 AND i.is_active = true
       ORDER BY i.name ASC
       LIMIT 5`,
      outletId
    );

    // 8. COGS breakdown and profit drivers
    const cogsRes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT coalesce(sum(total_cost_minor), 0)::bigint as total_cogs_minor
       FROM stock_consumptions
       WHERE outlet_id = $1`,
      outletId
    );
    const totalCogsMinor = BigInt(cogsRes[0]?.total_cogs_minor || 0);

    // Only ingredients with at least one real stock_consumption_items row are
    // included (INNER JOIN) -- there is no honest COGS figure for an
    // ingredient that has never actually been consumed, so it is left out of
    // this "top COGS" widget rather than backfilled with a guess.
    const topCogsIngredients = await prisma.$queryRawUnsafe<any[]>(
      `SELECT i.name, sum(sci.cost_minor)::bigint as cogs_minor
       FROM ingredients i
       JOIN stock_consumption_items sci ON sci.ingredient_id = i.id
       WHERE i.outlet_id = $1 AND i.is_active = true
       GROUP BY i.name
       ORDER BY cogs_minor DESC
       LIMIT 6`,
      outletId
    );

    // 9. Pending POs
    const pendingPOs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT po.id, po.po_number as "poNumber", po.total_amount_minor as "totalAmountMinor", po.status, po.created_at as "createdAt", v.name as "vendorName"
       FROM purchase_orders po
       JOIN vendors v ON v.id = po.vendor_id
       WHERE po.outlet_id = $1 AND po.status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL')
       ORDER BY po.created_at DESC
       LIMIT 10`,
      outletId
    );

    // 10. "Ready to add recipes" -- a real, honest signal: active menu items
    // that don't yet have an active recipe on file (same hasRecipe criteria
    // as PrismaReportingRepository.listMenuItemRecipeCosts below). There is
    // no external master-catalog table in this schema to diff raw materials
    // against, so readyToAddCount (ingredients) has no real signal and stays 0.
    const menuItemsWithoutRecipeRes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT count(*)::int as count
       FROM menu_items mi
       WHERE mi.outlet_id = $1 AND mi.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM recipes r
           WHERE r.menu_item_id = mi.id AND r.outlet_id = $1 AND r.is_active = true
         )`,
      outletId
    );
    const readyToAddRecipesCount = menuItemsWithoutRecipeRes[0]?.count || 0;

    // 11. Highest / least profit menu items -- computed from the same
    // recipe-costed margin logic as GET /reporting/item-margin
    // (computeItemMarginReport), scoped to the requested month. Items with no
    // active recipe can't have a real margin computed and are excluded rather
    // than assumed to be 0-cost/100%-margin. If nothing in range has a
    // computable margin, both fields are honestly null.
    let highestProfitItem: { name: string; description: string } | null = null;
    let leastProfitItem: { name: string; description: string } | null = null;
    try {
      const marginRange = {
        fromDate: new Date(queryYear, queryMonth - 1, 1),
        toDate: new Date(queryYear, queryMonth, 0, 23, 59, 59, 999),
      };
      const reportingRepo = new PrismaReportingRepository(prisma);
      const marginReport = await getItemMarginReport(outletId, marginRange, reportingRepo);
      const rankedItems = marginReport.items.filter((r) => r.hasRecipe && r.marginMinor !== null);

      if (rankedItems.length > 0) {
        const sorted = [...rankedItems].sort((a, b) => Number(b.marginMinor) - Number(a.marginMinor));
        const top = sorted[0];
        const bottom = sorted[sorted.length - 1];
        const marginMenuItemIds = Array.from(new Set([top.menuItemId, bottom.menuItemId]));
        const marginMenuItems = await prisma.menuItem.findMany({
          where: { id: { in: marginMenuItemIds } },
          select: { id: true, name: true },
        });
        const nameByMenuItemId = new Map(marginMenuItems.map((m) => [m.id, m.name]));

        highestProfitItem = {
          name: nameByMenuItemId.get(top.menuItemId) || `Dish (${top.menuItemId.slice(0, 6)})`,
          description: "Highest Profit Generating Item",
        };
        leastProfitItem = {
          name: nameByMenuItemId.get(bottom.menuItemId) || `Dish (${bottom.menuItemId.slice(0, 6)})`,
          description: "Least Profit Generating Item",
        };
      }
    } catch (marginError: any) {
      console.error("Error computing profit-driver items for dashboard summary:", marginError);
    }

    // Month names
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    res.status(200).json({
      dailyStockClosingTracker: {
        updateAccuracyPercent: updateAccuracy,
        isUpToDate: daysMissed === 0 && daysUpdated > 0,
        daysUpdatedCount: daysUpdated,
        daysMissedCount: daysMissed,
        monthName: monthNames[queryMonth - 1] || "September",
        year: queryYear,
        totalDaysInMonth: daysInMonth,
        dayProgress,
      },
      inventoryOverview: {
        rawMaterialsCount: totalRawMaterials,
        recipesCount: totalRecipes,
        // No external master-catalog table exists in this schema to diff raw
        // materials against, so there is no honest non-zero value here.
        readyToAddCount: 0,
        // Real signal: active menu items with no active recipe on file yet.
        readyToAddRecipesCount,
      },
      currentInventory: {
        totalStockWorthMinor: totalWorthMinor.toString(),
        totalStockWorthFormatted: `₹ ${formatInrMinor(totalWorthMinor)}`,
        lowStockPercent,
        lowStockAlerts,
        categoryDistribution: categoryRows.map((r: any) => ({
          category: r.category || "General",
          count: Number(r.count),
          valueFormatted: `₹ ${formatInrMinor(r.value_minor)}`,
        })),
      },
      cogsBreakdown: {
        totalCogsMinor: totalCogsMinor.toString(),
        totalCogsFormatted: `₹ ${formatInrMinor(totalCogsMinor)}`,
        highestProfitItem,
        leastProfitItem,
        ingredientCogs: topCogsIngredients.map((ing: any) => ({
          name: ing.name,
          costMinor: ing.cogs_minor?.toString() || "0",
          costFormatted: `₹${Math.round(Number(ing.cogs_minor || 0) / 100)}`,
        })),
      },
      purchaseInsights: {
        totalPurchaseMinor: totalPurchaseMinor.toString(),
        totalPurchaseFormatted: `₹ ${formatInrMinor(totalPurchaseMinor)}`,
        pendingPaymentMinor: pendingPaymentMinor.toString(),
        pendingPaymentFormatted: `₹ ${formatInrMinor(pendingPaymentMinor)}`,
        priceTrends: priceTrendIngredients.map((ing: any) => {
          const history: any[] = ing.priceHistoryMinor || [];
          const prices = history.length > 0
            ? history.map((minor: any) => Math.round(Number(minor) / 100))
            : [Math.round(Number(ing.unitCostMinor || 0) / 100)];
          return {
            name: ing.name,
            prices,
          };
        }),
        supplierWise: supplierRows.map((s: any) => ({
          id: s.id,
          name: s.name,
          currentPurchaseMinor: s.current_purchase_minor?.toString() || "0",
          currentPurchaseFormatted: `₹ ${formatInrMinor(s.current_purchase_minor)}`,
          pendingPaymentMinor: s.pending_payment_minor?.toString() || "0",
          pendingPaymentFormatted: `₹ ${formatInrMinor(s.pending_payment_minor)}`,
        })),
      },
      pendingTasks: {
        totalCount: pendingPOs.length,
        orders: pendingPOs.map((p: any) => ({
          id: p.id,
          poNumber: p.poNumber,
          vendorName: p.vendorName,
          amountFormatted: `₹ ${formatInrMinor(p.totalAmountMinor)}`,
          status: p.status,
          createdAt: p.createdAt,
        })),
      },
    });
  } catch (error: any) {
    console.error("Error generating inventory dashboard summary:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /inventory/closing-tracker - Get month's daily stock closing progress
inventoryRouter.get("/closing-tracker", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const now = new Date();
    const month = Number(req.query.month) || (now.getMonth() + 1);
    const year = Number(req.query.year) || now.getFullYear();

    const closings = await prisma.$queryRawUnsafe<any[]>(
      `SELECT dsc.id, dsc.closing_date as "closingDate", dsc.status, dsc.total_items_checked as "totalItemsChecked",
              dsc.total_variance_minor as "totalVarianceMinor", dsc.notes, dsc.created_at as "createdAt"
       FROM daily_stock_closings dsc
       WHERE dsc.outlet_id = $1 AND EXTRACT(MONTH FROM dsc.closing_date) = $2 AND EXTRACT(YEAR FROM dsc.closing_date) = $3
       ORDER BY dsc.closing_date ASC`,
      outletId,
      month,
      year
    );

    res.status(200).json(closings);
  } catch (error: any) {
    console.error("Error getting closing tracker:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /inventory/closing-tracker - Submit daily stock closing
inventoryRouter.post("/closing-tracker", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { closingDate, notes, items } = req.body;

    const dateStr = closingDate || new Date().toISOString().split("T")[0];
    const itemsList = Array.isArray(items) ? items : [];

    // Begin transaction
    const closingId = await prisma.$transaction(async (tx: any) => {
      // Upsert closing
      const existing = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM daily_stock_closings WHERE outlet_id = $1 AND closing_date = $2::date`,
        outletId,
        dateStr
      );

      let cId: string;
      if (existing.length > 0) {
        cId = existing[0].id;
        await tx.$queryRawUnsafe(
          `UPDATE daily_stock_closings 
           SET status = 'UPDATED', total_items_checked = $1, notes = $2, verified_by = $3, updated_at = now()
           WHERE id = $4`,
          itemsList.length,
          notes || null,
          userId,
          cId
        );
        await tx.$queryRawUnsafe(`DELETE FROM daily_stock_closing_items WHERE closing_id = $1`, cId);
      } else {
        const insertRes = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO daily_stock_closings (outlet_id, closing_date, status, total_items_checked, notes, verified_by)
           VALUES ($1, $2::date, 'UPDATED', $3, $4, $5)
           RETURNING id`,
          outletId,
          dateStr,
          itemsList.length,
          notes || null,
          userId
        );
        cId = insertRes[0].id;
      }

      // Insert line items & update current stock
      for (const it of itemsList) {
        const actualQty = Number(it.actualClosingQty || 0);
        const openingQty = Number(it.openingQty || 0);
        const unitCostMinor = BigInt(it.unitCostMinor || 0);
        const varianceQty = actualQty - openingQty;
        const varianceCostMinor = BigInt(Math.round(varianceQty * Number(unitCostMinor)));

        await tx.$queryRawUnsafe(
          `INSERT INTO daily_stock_closing_items 
             (closing_id, ingredient_id, opening_qty, actual_closing_qty, variance_qty, unit_cost_minor, variance_cost_minor)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          cId,
          it.ingredientId,
          openingQty,
          actualQty,
          varianceQty,
          unitCostMinor,
          varianceCostMinor
        );

        // Update current stock in ingredients
        await tx.$queryRawUnsafe(
          `UPDATE ingredients SET current_stock_qty = $1, updated_at = now(), updated_by = $2 WHERE id = $3 AND outlet_id = $4`,
          actualQty,
          userId,
          it.ingredientId,
          outletId
        );
      }

      return cId;
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        userId,
        action: "DAILY_STOCK_CLOSING_UPDATED",
        entityType: "INVENTORY_CLOSING",
        entityId: closingId,
        metadata: { dateStr, itemsChecked: itemsList.length },
      },
    });

    res.status(201).json({ id: closingId, status: "UPDATED", date: dateStr, itemsChecked: itemsList.length });
  } catch (error: any) {
    console.error("Error updating closing tracker:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /inventory/purchases - List stock purchases with filtering
inventoryRouter.get("/purchases", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { startDate, endDate, vendorId, invoiceNumber, paymentStatus } = req.query;

    let query = `
      SELECT 
        sp.id,
        sp.invoice_number as "invoiceNumber",
        sp.invoice_date as "invoiceDate",
        sp.total_amount_minor as "totalAmountMinor",
        sp.paid_amount_minor as "paidAmountMinor",
        sp.payment_status as "paymentStatus",
        sp.payment_mode as "paymentMode",
        sp.notes,
        sp.created_at as "createdAt",
        v.id as "vendorId",
        v.name as "vendorName",
        v.contact_phone as "vendorPhone",
        (SELECT count(*)::int FROM stock_purchase_items spi WHERE spi.purchase_id = sp.id) as "itemsCount"
      FROM stock_purchases sp
      JOIN vendors v ON v.id = sp.vendor_id
      WHERE sp.outlet_id = $1
    `;
    const params: any[] = [outletId];

    if (startDate) {
      params.push(startDate);
      query += ` AND sp.invoice_date >= $${params.length}::date`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND sp.invoice_date <= $${params.length}::date`;
    }
    if (vendorId && vendorId !== "All") {
      params.push(vendorId);
      query += ` AND sp.vendor_id = $${params.length}`;
    }
    if (invoiceNumber) {
      params.push(`%${invoiceNumber}%`);
      query += ` AND sp.invoice_number ILIKE $${params.length}`;
    }
    if (paymentStatus && paymentStatus !== "All") {
      params.push(paymentStatus);
      query += ` AND sp.payment_status = $${params.length}`;
    }

    query += ` ORDER BY sp.invoice_date DESC, sp.created_at DESC`;

    const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);

    res.status(200).json(
      rows.map((r: any) => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: r.invoiceDate ? new Date(r.invoiceDate).toISOString().split("T")[0] : "",
        totalAmountMinor: r.totalAmountMinor?.toString(),
        totalAmountFormatted: `₹ ${formatInrMinor(r.totalAmountMinor)}`,
        paidAmountMinor: r.paidAmountMinor?.toString(),
        paymentStatus: r.paymentStatus,
        paymentMode: r.paymentMode,
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        vendorPhone: r.vendorPhone,
        itemsCount: Number(r.itemsCount || 0),
        notes: r.notes,
        createdAt: r.createdAt,
      }))
    );
  } catch (error: any) {
    console.error("Error listing stock purchases:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /inventory/purchases - Create a new stock purchase invoice (with user data ingestion)
inventoryRouter.post("/purchases", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const {
      vendorId,
      invoiceNumber,
      invoiceDate,
      paymentStatus = "PAID",
      paidAmountMinor,
      paymentMode = "BANK_TRANSFER",
      purchaseOrderId,
      notes,
      items,
    } = req.body;

    if (!vendorId || !invoiceNumber || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "vendorId, invoiceNumber, and at least one item are required." });
    }

    const dateStr = invoiceDate || new Date().toISOString().split("T")[0];

    // Compute total minor
    let totalMinor = BigInt(0);
    for (const it of items) {
      const lineTotal = BigInt(Math.round(Number(it.quantity) * Number(it.unitCostMinor || 0)));
      totalMinor += lineTotal;
    }

    const paidMinor = paidAmountMinor !== undefined ? BigInt(paidAmountMinor) : (paymentStatus === "PAID" ? totalMinor : BigInt(0));

    const purchaseId = await prisma.$transaction(async (tx: any) => {
      const insertRes = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO stock_purchases 
           (outlet_id, vendor_id, invoice_number, invoice_date, total_amount_minor, net_amount_minor, payment_status, paid_amount_minor, payment_mode, purchase_order_id, notes, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        outletId,
        vendorId,
        invoiceNumber,
        dateStr,
        totalMinor,
        paymentStatus,
        paidMinor,
        paymentMode,
        purchaseOrderId || null,
        notes || null,
        userId
      );

      const pId = insertRes[0].id;

      for (const it of items) {
        const qty = Number(it.quantity);
        const costMinor = BigInt(it.unitCostMinor || 0);
        const lineTotal = BigInt(Math.round(qty * Number(costMinor)));
        const taxPct = Number(it.taxPercent || 0);

        await tx.$queryRawUnsafe(
          `INSERT INTO stock_purchase_items (purchase_id, ingredient_id, quantity, unit_cost_minor, tax_percent, total_minor)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          pId,
          it.ingredientId,
          qty,
          costMinor,
          taxPct,
          lineTotal
        );

        // Increment current stock of the ingredient
        await tx.$queryRawUnsafe(
          `UPDATE ingredients 
           SET current_stock_qty = current_stock_qty + $1, unit_cost_minor = $2, updated_at = now(), updated_by = $3
           WHERE id = $4 AND outlet_id = $5`,
          qty,
          costMinor,
          userId,
          it.ingredientId,
          outletId
        );
      }

      return pId;
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        userId,
        action: "STOCK_PURCHASE_CREATED",
        entityType: "INVENTORY_PURCHASE",
        entityId: purchaseId,
        metadata: { invoiceNumber, vendorId, totalMinor: totalMinor.toString() },
      },
    });

    res.status(201).json({ id: purchaseId, invoiceNumber, totalAmountFormatted: `₹ ${formatInrMinor(totalMinor)}` });
  } catch (error: any) {
    console.error("Error creating stock purchase:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /inventory/purchases/:id - Get stock purchase details
inventoryRouter.get("/purchases/:id", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const purchaseId = req.params.id;

    const purchases = await prisma.$queryRawUnsafe<any[]>(
      `SELECT sp.*, v.name as "vendorName", v.contact_phone as "vendorPhone", v.contact_email as "vendorEmail"
       FROM stock_purchases sp
       JOIN vendors v ON v.id = sp.vendor_id
       WHERE sp.id = $1 AND sp.outlet_id = $2`,
      purchaseId,
      outletId
    );

    if (purchases.length === 0) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    const p = purchases[0];

    const items = await prisma.$queryRawUnsafe<any[]>(
      `SELECT spi.*, i.name as "ingredientName", i.unit_of_measure as "unitOfMeasure"
       FROM stock_purchase_items spi
       JOIN ingredients i ON i.id = spi.ingredient_id
       WHERE spi.purchase_id = $1
       ORDER BY spi.created_at ASC`,
      purchaseId
    );

    res.status(200).json({
      id: p.id,
      invoiceNumber: p.invoice_number,
      invoiceDate: p.invoice_date,
      totalAmountMinor: p.total_amount_minor?.toString(),
      totalAmountFormatted: `₹ ${formatInrMinor(p.total_amount_minor)}`,
      paidAmountMinor: p.paid_amount_minor?.toString(),
      paymentStatus: p.payment_status,
      paymentMode: p.payment_mode,
      notes: p.notes,
      vendor: {
        id: p.vendor_id,
        name: p.vendorName,
        phone: p.vendorPhone,
        email: p.vendorEmail,
      },
      items: items.map((it: any) => ({
        id: it.id,
        ingredientId: it.ingredient_id,
        name: it.ingredientName,
        unit: it.unitOfMeasure,
        quantity: Number(it.quantity),
        unitCostMinor: it.unit_cost_minor?.toString(),
        unitCostFormatted: `₹ ${(Number(it.unit_cost_minor) / 100).toFixed(2)}`,
        totalMinor: it.total_minor?.toString(),
        totalFormatted: `₹ ${formatInrMinor(it.total_minor)}`,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching purchase details:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /inventory/seed-mock-data - Ingest dynamic operational inventory data if empty
inventoryRouter.post("/seed-mock-data", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    // Check if vendors already exist
    const vendorCountRes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT count(*)::int as count FROM vendors WHERE outlet_id = $1`,
      outletId
    );
    if (vendorCountRes[0]?.count > 0) {
      return res.status(200).json({ message: "Inventory data already present for this outlet", count: vendorCountRes[0].count });
    }

    // 1. Ingest Vendors
    const vendorNames = [
      { name: "Supplier A (Metro Wholesale)", phone: "9876543210", email: "metro@wholesales.in" },
      { name: "Supplier B (Fresh Farms Produce)", phone: "9876543211", email: "freshfarms@orders.in" },
      { name: "Supplier C (Dairy Fresh Ltd)", phone: "9876543212", email: "dairyfresh@dairy.in" },
      { name: "Supplier D (Spices & Grains Mart)", phone: "9876543213", email: "spicesmart@grains.in" },
      { name: "Supplier E (Beverage Express)", phone: "9876543214", email: "bevexpress@drinks.in" },
    ];

    const vendorIds: string[] = [];
    for (const v of vendorNames) {
      const r = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO vendors (outlet_id, name, contact_phone, contact_email, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
        outletId,
        v.name,
        v.phone,
        v.email,
        userId
      );
      vendorIds.push(r[0].id);
    }

    // 2. Ingest Ingredients
    const ingredientsData = [
      { name: "Tomatoes", uom: "kg", cost: 4000, reorder: 50, stock: 120 },
      { name: "Cucumbers", uom: "kg", cost: 3000, reorder: 30, stock: 45 },
      { name: "Bell Peppers", uom: "kg", cost: 8000, reorder: 20, stock: 15 },
      { name: "Zucchini", uom: "kg", cost: 9000, reorder: 15, stock: 12 },
      { name: "Carrots", uom: "kg", cost: 3500, reorder: 40, stock: 60 },
      { name: "Eggplants", uom: "kg", cost: 4500, reorder: 25, stock: 35 },
      { name: "Paneer", uom: "kg", cost: 35000, reorder: 30, stock: 18 },
      { name: "Green Peas", uom: "kg", cost: 12000, reorder: 40, stock: 25 },
      { name: "Onions", uom: "kg", cost: 3500, reorder: 100, stock: 250 },
      { name: "Potatoes", uom: "kg", cost: 2500, reorder: 100, stock: 300 },
      { name: "Milk", uom: "l", cost: 6000, reorder: 50, stock: 30 },
      { name: "Butter", uom: "kg", cost: 50000, reorder: 20, stock: 8 },
      { name: "Bread", uom: "packs", cost: 4500, reorder: 30, stock: 14 },
      { name: "Eggs", uom: "tray", cost: 21000, reorder: 20, stock: 9 },
      { name: "Sprite (Can)", uom: "pcs", cost: 3500, reorder: 48, stock: 12 },
      { name: "7 up (Can)", uom: "pcs", cost: 3500, reorder: 48, stock: 6 },
    ];

    const ingredientMap = new Map<string, string>();
    for (const ing of ingredientsData) {
      const r = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO ingredients (outlet_id, name, unit_of_measure, unit_cost_minor, reorder_level, current_stock_qty, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
        outletId,
        ing.name,
        ing.uom,
        ing.cost,
        ing.reorder,
        ing.stock,
        userId
      );
      ingredientMap.set(ing.name, r[0].id);
    }

    // 3. Ingest Stock Purchases
    const purchasesData = [
      {
        vendorId: vendorIds[0],
        invoiceNumber: "INV-2026-0891",
        date: "2026-08-28",
        status: "PAID",
        paid: 20050000,
        total: 20050000,
        items: [
          { name: "Tomatoes", qty: 100, cost: 4000 },
          { name: "Onions", qty: 200, cost: 3500 },
          { name: "Potatoes", qty: 200, cost: 2500 },
        ],
      },
      {
        vendorId: vendorIds[1],
        invoiceNumber: "INV-2026-0902",
        date: "2026-08-30",
        status: "PARTIAL",
        paid: 5600000,
        total: 6050000,
        items: [
          { name: "Cucumbers", qty: 50, cost: 3000 },
          { name: "Bell Peppers", qty: 30, cost: 8000 },
          { name: "Carrots", qty: 60, cost: 3500 },
        ],
      },
      {
        vendorId: vendorIds[2],
        invoiceNumber: "INV-2026-0915",
        date: "2026-09-01",
        status: "PAID",
        paid: 7520000,
        total: 7520000,
        items: [
          { name: "Milk", qty: 60, cost: 6000 },
          { name: "Paneer", qty: 15, cost: 35000 },
          { name: "Butter", qty: 10, cost: 50000 },
        ],
      },
      {
        vendorId: vendorIds[3],
        invoiceNumber: "INV-2026-0920",
        date: "2026-09-02",
        status: "PENDING",
        paid: 0,
        total: 8230000,
        items: [
          { name: "Bread", qty: 50, cost: 4500 },
          { name: "Eggs", qty: 20, cost: 21000 },
        ],
      },
    ];

    for (const p of purchasesData) {
      const r = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO stock_purchases (outlet_id, vendor_id, invoice_number, invoice_date, total_amount_minor, net_amount_minor, payment_status, paid_amount_minor, payment_mode, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $5, $6, $7, 'BANK_TRANSFER', $8) RETURNING id`,
        outletId,
        p.vendorId,
        p.invoiceNumber,
        p.date,
        p.total,
        p.status,
        p.paid,
        userId
      );
      const pId = r[0].id;
      for (const it of p.items) {
        const ingId = ingredientMap.get(it.name);
        if (ingId) {
          await prisma.$queryRawUnsafe(
            `INSERT INTO stock_purchase_items (purchase_id, ingredient_id, quantity, unit_cost_minor, total_minor)
             VALUES ($1, $2, $3, $4, $5)`,
            pId,
            ingId,
            it.qty,
            it.cost,
            it.qty * it.cost
          );
        }
      }
    }

    // 4. Ingest sample Purchase Order
    await prisma.$queryRawUnsafe(
      `INSERT INTO purchase_orders (outlet_id, vendor_id, po_number, total_amount_minor, status, created_by, updated_by)
       VALUES ($1, $2, 'PO-2026-001', 4500000, 'DRAFT', $3, $3)
       ON CONFLICT DO NOTHING`,
      outletId,
      vendorIds[0],
      userId
    );

    res.status(201).json({ message: "Dynamic inventory operational data ingested successfully" });
  } catch (error: any) {
    console.error("Error seeding inventory data:", error);
    res.status(500).json({ error: error.message });
  }
});
