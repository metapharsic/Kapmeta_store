import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/require-auth";
import { IngredientManager, ProcurementManager } from "@kapmeta/inventory";

export const inventoryRouter = Router();
const ingredientManager = new IngredientManager(prisma);
const procurementManager = new ProcurementManager(prisma);

// ==================== INGREDIENTS ====================

// List ingredients for active outlet
inventoryRouter.get("/ingredients", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const ingredients = await ingredientManager.listIngredients(req.auth!.outletId);
    res.json(ingredients);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create an ingredient
inventoryRouter.post("/ingredients", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const { name, unitOfMeasure, reorderLevel, unitCost } = req.body;
  if (!name || !unitOfMeasure || reorderLevel === undefined || unitCost === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const ingredient = await ingredientManager.createIngredient(
      req.auth!.outletId,
      name,
      unitOfMeasure,
      Number(reorderLevel),
      Number(unitCost)
    );
    res.status(201).json(ingredient);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RECIPES (BOM) ====================

// List all active recipes with ingredient details
inventoryRouter.get("/recipes", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const recipes = await ingredientManager.listRecipes(req.auth!.outletId);
    res.json(recipes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get recipe for a specific menu item
inventoryRouter.get("/recipes/:menuItemId", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const recipe = await ingredientManager.getRecipeByMenuItem(req.auth!.outletId, req.params.menuItemId);
    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found for this menu item" });
    }
    res.json(recipe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create/Update recipe BOM for a menu item
inventoryRouter.post("/recipes", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const { menuItemId, ingredients } = req.body;
  if (!menuItemId || !ingredients || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: "Missing required fields (menuItemId, ingredients[])" });
  }

  try {
    const recipe = await ingredientManager.createRecipe(req.auth!.outletId, menuItemId, ingredients);
    res.status(201).json(recipe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== VENDORS ====================

// List vendors
inventoryRouter.get("/vendors", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const vendors = await procurementManager.listVendors(req.auth!.outletId);
    res.json(vendors);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create vendor
inventoryRouter.post("/vendors", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const { name, phone, email, taxNumber } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: "Missing required fields (name, phone)" });
  }

  try {
    const vendor = await procurementManager.createVendor(req.auth!.outletId, name, phone, email, taxNumber);
    res.status(201).json(vendor);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PURCHASE ORDERS & GRN ====================

// List Purchase Orders
inventoryRouter.get("/purchase-orders", requireAuth, requirePermission("inventory.po.create"), async (req: AuthedRequest, res) => {
  try {
    const pos = await procurementManager.listPurchaseOrders(req.auth!.outletId);
    res.json(pos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Purchase Order
inventoryRouter.post("/purchase-orders", requireAuth, requirePermission("inventory.po.create"), async (req: AuthedRequest, res) => {
  const { vendorId, items } = req.body;
  if (!vendorId || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: "Missing required fields (vendorId, items[])" });
  }

  try {
    const po = await procurementManager.createPurchaseOrder(req.auth!.outletId, vendorId, items);
    res.status(201).json(po);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Process Goods Received Note (GRN)
inventoryRouter.post("/grn", requireAuth, requirePermission("inventory.grn.create"), async (req: AuthedRequest, res) => {
  const { purchaseOrderId, vendorId, items } = req.body;
  if (!vendorId || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: "Missing required fields (vendorId, items[])" });
  }

  try {
    const grn = await procurementManager.processGoodsReceivedNote(
      req.auth!.outletId,
      purchaseOrderId,
      vendorId,
      items
    );
    res.status(201).json(grn);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
