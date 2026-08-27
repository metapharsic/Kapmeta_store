import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/require-auth";
import { CustomerManager, LoyaltyEngine } from "@kapmeta/crm";

export const crmRouter = Router();
const prisma = new PrismaClient();
const customerManager = new CustomerManager(prisma);
const loyaltyEngine = new LoyaltyEngine(prisma);

// Create Customer
crmRouter.post("/customers", requireAuth, requirePermission("crm.write"), async (req: AuthedRequest, res) => {
  let firstName = req.body.firstName;
  let lastName = req.body.lastName;
  const phone = req.body.phone;
  const email = req.body.email;

  if (!firstName && req.body.name) {
    const parts = String(req.body.name).trim().split(" ");
    firstName = parts[0];
    lastName = parts.slice(1).join(" ") || undefined;
  }

  if (!firstName || !phone) {
    return res.status(400).json({ error: "Missing required fields: firstName/name, phone" });
  }

  try {
    const customer = await customerManager.createCustomer(req.auth!.outletId, { firstName, lastName, phone, email });
    res.status(201).json(customer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List Customers (paginated, searchable directory)
crmRouter.get("/customers", requireAuth, requirePermission("crm.read"), async (req: AuthedRequest, res) => {
  try {
    const { search, limit, offset } = req.query;
    const result = await customerManager.listCustomers(req.auth!.outletId, {
      search: typeof search === "string" ? search : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
    });
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Customer
crmRouter.get("/customers/:id", requireAuth, requirePermission("crm.read"), async (req: AuthedRequest, res) => {
  try {
    const customer = await customerManager.getCustomerById(req.auth!.outletId, req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.status(200).json(customer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Anonymize Customer (DPDP)
crmRouter.post("/customers/:id/anonymize", requireAuth, requirePermission("crm.anonymize"), async (req: AuthedRequest, res) => {
  try {
    const customer = await customerManager.anonymizeCustomer(req.auth!.outletId, req.params.id);
    res.status(200).json(customer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Redeem Loyalty Points
crmRouter.post("/loyalty/redeem", requireAuth, requirePermission("crm.write"), async (req: AuthedRequest, res) => {
  const { customerId, points } = req.body;
  if (!customerId || points === undefined) {
    return res.status(400).json({ error: "Missing required fields: customerId, points" });
  }

  try {
    const customer = await loyaltyEngine.redeemPoints(req.auth!.outletId, customerId, Number(points));
    res.status(200).json(customer);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
