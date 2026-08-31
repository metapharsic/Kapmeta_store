# Admin Full Sync Implementation Plan

**Goal:** Eliminate all gaps in admin pipeline. Single source of truth for all admin features.

**Scope:** 8 phases, ~40 files, 18-22 days estimated work.

---

## Architecture Decision: Migrate to Real Tables

**Current Problem:**
- 86/stock, inventory (ingredients/recipes/vendors/POs), channel status, cash drawer all write to `AuditLog` only
- GET endpoints rebuild state from audit history (slow, duplicate-prone)
- Orders don't read stock, no BOM deduction, reports drift from UI

**Decision:**
Use schema tables that already exist or add minimal new ones. Audit log stays for history/compliance, not primary store.

**Tables to activate:**
- `item_availability` (already in schema, line 726-741) - 86 and stock
- Real inventory domain tables (need migration to add `ingredients`, `recipes`, `vendors`, `purchase_orders`)
- `ChannelItemMapping` (line 502-515) + `item_availability.channel_id` for aggregator status
- New: `cash_drawer_shifts`, `petty_cash_entries` OR expand existing finance tables

---

## Phase 1: RBAC Alignment (2-3 days)

**Files:**
- `db/seeds/seed_permissions.sql` - add missing permissions
- `kapmeta/seed.ts` - ensure permissions match SQL seed
- `apps/api/src/routes/user-management.ts` - fix gate, add outlet scope
- `apps/api/src/routes/inventory.ts` - change gate to `inventory.read`
- `apps/pos-web/components/Nav.tsx` - align permission checks
- `apps/pos-web/pages/inventory.tsx` - align page guard
- `apps/pos-web/pages/user-management.tsx` - align page guard
- `apps/pos-web/pages/finance.tsx` - align page guard

**Changes:**

### 1.1 Add Missing Permissions to SQL Seed
```sql
-- db/seeds/seed_permissions.sql (append to v_perms array)
'finance.report', 'finance.cash_drawer.manage', 'finance.petty_cash.record',
'inventory.read', 'inventory.write', 'inventory.stock.deduct',
'users.manage', 'users.read', 'roles.manage'
```

### 1.2 Fix User Management Gate
```typescript
// apps/api/src/routes/user-management.ts
const USER_MANAGEMENT_PERMISSION = "users.manage"; // was: menu.category.manage
```

### 1.3 Add Outlet Scope to GET /users
```typescript
// apps/api/src/routes/user-management.ts:26
const users = await prisma.user.findMany({
  where: {
    userRoles: {
      some: {
        outletId: req.auth!.outletId  // ADD THIS
      }
    }
  },
  // ... rest unchanged
});
```

### 1.4 Fix Inventory Permission Gates
```typescript
// apps/api/src/routes/inventory.ts
// Change all requirePermission("inventory.read") and requirePermission("inventory.write")
// Keep as is - already correct in code
```

### 1.5 Align Nav Permission Checks
```typescript
// apps/pos-web/components/Nav.tsx
// Finance link: change to "finance.report" OR "report.read" (pick one standard)
// Inventory link: change to "inventory.read"
// User Management link: change to "users.manage"
```

**Verification:**
- Run both seeds (SQL + kapmeta/seed.ts)
- Login as non-admin, verify Finance/Inventory/Users visible only with correct permissions
- Verify /users returns only outlet-scoped users

---

## Phase 2: Single 86 Pipeline (3-4 days)

**Problem:** 
- Header uses `PUT /menu/availability/:id` (doesn't exist)
- Inventory page uses `PATCH /menu/items/:menuItemId/availability` (correct)
- Both write audit log only
- POS ignores stock, uses hardcoded 100

**Solution:**
Activate `item_availability` table, unify to one endpoint, connect order lines to stock deduction.

**Files:**
- `services/menu/src/stores/prisma-availability-repository.ts` - rewrite to use `item_availability`
- `apps/api/src/routes/menu.ts` - expose unified endpoint
- `apps/pos-web/components/ItemToggleModal.tsx` - fix path
- `services/orders/src/order-service.ts` - add stock deduction on settle
- `db/migrations/` - add migration if `item_availability` needs columns

**Changes:**

### 2.1 Rewrite PrismaAvailabilityRepository
```typescript
// services/menu/src/stores/prisma-availability-repository.ts
export class PrismaAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(menuItemId: string, outletId: string): Promise<AvailabilityState | null> {
    const row = await this.prisma.item_availability.findFirst({
      where: {
        item_id: menuItemId,
        outlet_id: outletId,
        channel_id: "POS" // dine-in default
      }
    });

    if (!row) {
      return {
        menuItemId,
        outletId,
        isStocked: true,
        stockQty: 100,
        version: 1
      };
    }

    return {
      menuItemId,
      outletId,
      isStocked: row.state === "ON",
      stockQty: 100, // from item_availability or separate stock table
      version: row.version
    };
  }

  async updateIfVersionMatches(...): Promise<boolean> {
    // Optimistic lock on version
    const result = await this.prisma.item_availability.updateMany({
      where: {
        item_id: menuItemId,
        outlet_id: outletId,
        channel_id: "POS",
        version: expectedVersion
      },
      data: {
        state: isStocked ? "ON" : "OFF",
        version: { increment: 1 },
        updated_at: new Date(),
        updated_by: userId
      }
    });

    if (result.count === 0) {
      // No row matched version - stale. Try upsert if it's first write.
      await this.prisma.item_availability.upsert({
        where: {
          item_id_channel_id: {
            item_id: menuItemId,
            channel_id: "POS"
          }
        },
        update: {
          state: isStocked ? "ON" : "OFF",
          version: { increment: 1 }
        },
        create: {
          outlet_id: outletId,
          item_id: menuItemId,
          channel_id: "POS",
          state: isStocked ? "ON" : "OFF",
          version: 1
        }
      });
    }

    // Write audit for compliance
    await this.prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "UPDATE",
        entityType: "MENU_ITEM_86",
        entityId: menuItemId,
        beforeState: { isStocked: !isStocked },
        afterState: { isStocked, stockQty, version: expectedVersion + 1 },
        createdAt: new Date()
      }
    });

    return true;
  }

  async listByOutlet(outletId: string): Promise<AvailabilityListItem[]> {
    const items = await this.prisma.menuItem.findMany({
      where: { outletId, isActive: true },
      include: {
        category: true,
        availability: {
          where: { channel_id: "POS" }
        }
      }
    });

    return items.map(item => {
      const avail = item.availability[0];
      return {
        menuItemId: item.id,
        outletId,
        isStocked: avail ? avail.state === "ON" : true,
        stockQty: 100, // TODO: from stock table
        version: avail?.version ?? 1,
        categoryName: item.category?.name ?? "General",
        name: item.name,
        priceMinor: String(Math.round(Number(item.price || 0) * 100)),
        isVeg: item.isVeg
      };
    });
  }
}
```

### 2.2 Unify Menu Routes
```typescript
// apps/api/src/routes/menu.ts (add/update)
router.get("/availability", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  const outletId = req.auth!.outletId;
  const availabilityRepo = new PrismaAvailabilityRepository(prisma);
  const list = await availabilityRepo.listByOutlet(outletId);
  res.status(200).json(list);
});

router.patch("/items/:menuItemId/availability", requireAuth, requirePermission("menu.86.toggle"), async (req: AuthedRequest, res) => {
  const { menuItemId } = req.params;
  const { isStocked, stockQty, version } = req.body;
  
  const availabilityRepo = new PrismaAvailabilityRepository(prisma);
  const success = await availabilityRepo.updateIfVersionMatches(
    menuItemId,
    req.auth!.outletId,
    version ?? 1,
    isStocked,
    stockQty ?? (isStocked ? 100 : 0),
    req.auth!.userId
  );

  if (!success) {
    return res.status(409).json({ error: "Version conflict" });
  }

  const updated = await availabilityRepo.get(menuItemId, req.auth!.outletId);
  res.status(200).json(updated);
});
```

### 2.3 Fix Header Item Toggle Path
```typescript
// apps/pos-web/components/ItemToggleModal.tsx:56
const res = await authedFetch(`/menu/items/${item.id}/availability`, {
  method: "PATCH", // was PUT
  body: JSON.stringify({
    isStocked: nextStocked,
    stockQty: nextStocked ? 100 : 0,
    version: item.version || 1  // ADD version for optimistic lock
  }),
});
```

### 2.4 Stock Deduction on Order Settlement
```typescript
// services/orders/src/order-service.ts (add to settleOrder or createOrder)
async settleOrder(orderId: string, ...): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    // ... existing settle logic ...

    // Deduct stock for each line
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true }
    });

    for (const line of order.orderItems) {
      if (line.isVoided) continue;

      // Deduct from item_availability or separate stock table
      await tx.item_availability.updateMany({
        where: {
          item_id: line.menuItemId,
          outlet_id: order.outletId,
          channel_id: "POS"
        },
        data: {
          // TODO: add stockQty column to item_availability
          // OR use separate stock_ledger table
          updated_at: new Date()
        }
      });
    }
  });
}
```

**Migration Needed:**
```sql
-- db/migrations/00XX_add_stock_to_item_availability.sql
ALTER TABLE item_availability ADD COLUMN stock_qty INTEGER DEFAULT 100;
```

**Verification:**
- Toggle item OFF in header modal
- Reload inventory page - shows OFF
- POS billing checks availability before adding to cart
- Settle order decrements stock

---

## Phase 3: Inventory Domain Tables (4-5 days)

**Problem:** Ingredients, recipes, vendors, POs all write audit log only. GET duplicates rows.

**Solution:** Add real tables, persist there, audit for history.

**Files:**
- `db/migrations/00XX_create_inventory_tables.sql` - new migration
- `services/inventory/src/stores/prisma-inventory-repository.ts` - new repo
- `apps/api/src/routes/inventory.ts` - rewrite to use real tables
- `services/orders/src/order-service.ts` - BOM deduction

**Changes:**

### 3.1 Create Inventory Tables Migration
```sql
-- db/migrations/00XX_create_inventory_tables.sql
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(255) NOT NULL,
  unit_of_measure VARCHAR(50) NOT NULL,
  unit_cost_minor BIGINT NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 500,
  current_stock_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  menu_item_id UUID REFERENCES menu_items(id),
  name VARCHAR(255) NOT NULL,
  yield_portions DECIMAL(8,2) NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  payment_terms VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  po_number VARCHAR(50) NOT NULL,
  total_amount_minor BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  UNIQUE(outlet_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity DECIMAL(12,3) NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  total_minor BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingredients_outlet ON ingredients(outlet_id);
CREATE INDEX idx_recipes_outlet ON recipes(outlet_id);
CREATE INDEX idx_recipes_menu_item ON recipes(menu_item_id);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);
CREATE INDEX idx_vendors_outlet ON vendors(outlet_id);
CREATE INDEX idx_purchase_orders_outlet ON purchase_orders(outlet_id);
CREATE INDEX idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_purchase_order_items_po ON purchase_order_items(po_id);
```

### 3.2 Rewrite Inventory Routes
```typescript
// apps/api/src/routes/inventory.ts - INGREDIENTS
inventoryRouter.get("/ingredients", requireAuth, requirePermission("inventory.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const ingredients = await prisma.ingredients.findMany({
      where: { outlet_id: outletId, is_active: true },
      orderBy: { name: "asc" }
    });

    res.status(200).json(ingredients.map(ing => ({
      id: ing.id,
      name: ing.name,
      unitOfMeasure: ing.unit_of_measure,
      reorderLevel: ing.reorder_level,
      unitCost: Number(ing.unit_cost_minor) / 100,
      currentStock: Number(ing.current_stock_qty),
      createdAt: ing.created_at.toISOString()
    })));
  } catch (error: any) {
    console.error("Error listing ingredients:", error);
    res.status(500).json({ error: error.message });
  }
});

inventoryRouter.post("/ingredients", requireAuth, requirePermission("inventory.write"), async (req: AuthedRequest, res) => {
  const { name, unitOfMeasure, reorderLevel, unitCost, currentStock } = req.body;

  if (!name || !unitOfMeasure || reorderLevel === undefined || unitCost === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const ingredient = await prisma.ingredients.create({
      data: {
        outlet_id: outletId,
        name: String(name).trim(),
        unit_of_measure: String(unitOfMeasure).trim(),
        reorder_level: Number(reorderLevel),
        unit_cost_minor: Math.round(Number(unitCost) * 100),
        current_stock_qty: Number(currentStock ?? 0),
        created_by: userId,
        updated_by: userId
      }
    });

    // Audit log for compliance
    await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "CREATE",
        entityType: "INVENTORY_INGREDIENT",
        entityId: ingredient.id,
        afterState: { name: ingredient.name, unitOfMeasure: ingredient.unit_of_measure },
        createdAt: new Date()
      }
    });

    res.status(201).json({
      id: ingredient.id,
      name: ingredient.name,
      unitOfMeasure: ingredient.unit_of_measure,
      reorderLevel: ingredient.reorder_level,
      unitCost: Number(ingredient.unit_cost_minor) / 100,
      currentStock: Number(ingredient.current_stock_qty)
    });
  } catch (error: any) {
    console.error("Error creating ingredient:", error);
    res.status(500).json({ error: error.message });
  }
});

// Similar rewrites for /recipes, /vendors, /purchase-orders
```

### 3.3 BOM Deduction on Order Settlement
```typescript
// services/orders/src/order-service.ts
async settleOrder(orderId: string, ...): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    // ... existing settle ...

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true }
    });

    for (const line of order.orderItems) {
      if (line.isVoided) continue;

      // Find recipe for this menu item
      const recipe = await tx.recipes.findFirst({
        where: {
          menu_item_id: line.menuItemId,
          outlet_id: order.outletId,
          is_active: true
        },
        include: { recipe_ingredients: true }
      });

      if (!recipe) continue;

      // Deduct each ingredient
      for (const recipeIng of recipe.recipe_ingredients) {
        const consumedQty = Number(recipeIng.quantity) * Number(line.quantity);

        await tx.ingredients.update({
          where: { id: recipeIng.ingredient_id },
          data: {
            current_stock_qty: { decrement: consumedQty },
            updated_at: new Date()
          }
        });

        // Audit stock deduction
        await tx.auditLog.create({
          data: {
            outletId: order.outletId,
            action: "UPDATE",
            entityType: "INVENTORY_STOCK_DEDUCTION",
            entityId: recipeIng.ingredient_id,
            afterState: { orderId, qty: consumedQty },
            createdAt: new Date()
          }
        });
      }
    }
  });
}
```

**Verification:**
- Create ingredient "Tomato 500g ₹50"
- Create recipe "Pasta" with 200g tomato
- Sell 1 Pasta
- Check ingredient stock: 300g remaining

---

## Phase 4: Channel Item Status Real Tables (2-3 days)

**Problem:** Synthetic `acc-swiggy` IDs, hardcoded outlet UUID, not using `ChannelItemMapping`.

**Solution:** Use `ChannelItemMapping` + `item_availability.channel_id`.

**Files:**
- `services/integration-hub/src/stores/prisma-channel-item-status-repository.ts`
- `apps/api/src/routes/integration.ts`
- `apps/pos-web/pages/channel-availability.tsx`

**Changes:**

### 4.1 Rewrite Channel Status Repository
```typescript
// services/integration-hub/src/stores/prisma-channel-item-status-repository.ts
export class PrismaChannelItemStatusRepository implements ChannelItemStatusRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listMappings(outletId: string, channel?: string) {
    // Get real connected accounts
    const accounts = await this.prisma.channelAccount.findMany({
      where: { outletId, is_active: true },
      include: { integration: true }
    });

    if (accounts.length === 0) {
      return []; // No connected aggregators
    }

    const targetAccounts = channel
      ? accounts.filter(acc => acc.integration.code.toUpperCase() === channel.toUpperCase())
      : accounts;

    const menuItems = await this.prisma.menuItem.findMany({
      where: { outletId, isActive: true },
      include: { category: true }
    });

    const result: Array<{
      mappingId: string;
      channelAccountId: string;
      channel: string;
      menuItemId: string;
      name: string;
      onlineDisplayName: string | null;
      categoryName: string;
      isAvailable: boolean;
      version: number;
    }> = [];

    for (const account of targetAccounts) {
      for (const item of menuItems) {
        // Check if mapping exists
        const mapping = await this.prisma.channelItemMapping.findFirst({
          where: {
            channelAccountId: account.id,
            item_id: item.id
          }
        });

        // Check availability
        const avail = await this.prisma.item_availability.findFirst({
          where: {
            item_id: item.id,
            outlet_id: outletId,
            channel_id: account.id // Use account ID as channel identifier
          }
        });

        result.push({
          mappingId: mapping?.id ?? `${item.id}-${account.id}`,
          channelAccountId: account.id,
          channel: account.integration.code.toUpperCase(),
          menuItemId: item.id,
          name: item.name,
          onlineDisplayName: item.name, // TODO: from mapping
          categoryName: item.category?.name ?? "General",
          isAvailable: avail ? avail.state === "ON" : true,
          version: avail?.version ?? 1
        });
      }
    }

    return result;
  }

  async updateIfVersionMatches(mappingId: string, expectedVersion: number, isAvailable: boolean): Promise<boolean> {
    // Parse real mapping ID (UUID) instead of synthetic
    const mapping = await this.prisma.channelItemMapping.findUnique({
      where: { id: mappingId },
      include: { channelAccount: true }
    });

    if (!mapping) return false;

    // Update item_availability with real channel ID
    const result = await this.prisma.item_availability.updateMany({
      where: {
        item_id: mapping.item_id,
        outlet_id: mapping.outlet_id,
        channel_id: mapping.channelAccountId,
        version: expectedVersion
      },
      data: {
        state: isAvailable ? "ON" : "OFF",
        version: { increment: 1 },
        updated_at: new Date()
      }
    });

    if (result.count === 0) {
      // Upsert if first time
      await this.prisma.item_availability.upsert({
        where: {
          item_id_channel_id: {
            item_id: mapping.item_id,
            channel_id: mapping.channelAccountId
          }
        },
        update: {
          state: isAvailable ? "ON" : "OFF",
          version: { increment: 1 }
        },
        create: {
          outlet_id: mapping.outlet_id,
          item_id: mapping.item_id,
          channel_id: mapping.channelAccountId,
          state: isAvailable ? "ON" : "OFF",
          version: 1
        }
      });
    }

    // Audit
    await this.prisma.auditLog.create({
      data: {
        outletId: mapping.outlet_id,
        action: "UPDATE",
        entityType: "CHANNEL_ITEM_AVAILABILITY",
        entityId: mapping.item_id,
        afterState: { channel: mapping.channelAccount.integration_id, isAvailable, version: expectedVersion + 1 },
        createdAt: new Date()
      }
    });

    return true;
  }
}
```

**Verification:**
- Connect Swiggy account
- Toggle item OFF for Swiggy
- Check `ChannelItemMapping` has real UUID mapping
- Check `item_availability` has row with `channel_id` = account UUID

---

## Phase 5-8: Remaining Phases (abbreviated)

### Phase 5: Header Ops (2 days)
- Store online toggle: persist in `ChannelAccount.is_active`
- Implement `POST /notifications/read-all`
- Remove hardcoded alert fixtures in `PetPoojaHeader.tsx`

### Phase 6: Finance Real Ledger (3 days)
- Create `cash_drawer_shifts`, `petty_cash_entries` tables
- Remove hardcoded ₹2,000 opening
- Ledger from real entries, not audit scan

### Phase 7: Dashboard Resilience (1 day)
- Split `/admin` fetchReports into independent calls
- Catch leakage error separately, don't blank whole dashboard

### Phase 8: Mount/Delete Dead Surfaces (1 day)
- Mount `services/admin` routes OR delete service + contracts
- Delete `apps/admin-web` stub

---

## Testing Strategy

**Unit:**
- Each repository CRUD (ingredients, recipes, vendors, POs, availability)
- Stock deduction calculation
- Version conflict detection

**Integration:**
- Full 86 flow: Header toggle → Inventory shows OFF → POS blocks add
- Order settle → ingredient stock decrements
- Channel toggle → mapping persists → aggregator sees change

**E2E:**
- Admin dashboard loads all cards independently
- Permission gates work: non-admin sees only allowed screens
- Multi-terminal: toggle in terminal A, shows in terminal B

---

## Migration Path

1. Run Phase 1 (RBAC) first - low risk, enables proper testing
2. Run Phase 2 (86) + Phase 3 (inventory) together - both touch stock
3. Run Phase 4 (channel) independently
4. Run Phase 5-8 in sequence

**Rollback:** Each phase writes audit log. Can rebuild state from audit if needed.

---

## Files Modified Summary

**Database:**
- `db/migrations/00XX_add_stock_to_item_availability.sql`
- `db/migrations/00XX_create_inventory_tables.sql`
- `db/migrations/00XX_create_cash_drawer_tables.sql`
- `db/seeds/seed_permissions.sql`

**Services:**
- `services/menu/src/stores/prisma-availability-repository.ts` - rewrite
- `services/inventory/src/stores/prisma-inventory-repository.ts` - new
- `services/integration-hub/src/stores/prisma-channel-item-status-repository.ts` - rewrite
- `services/orders/src/order-service.ts` - add stock deduction
- `services/finance/src/cash-drawer-service.ts` - new

**API:**
- `apps/api/src/routes/menu.ts` - unify 86 endpoints
- `apps/api/src/routes/inventory.ts` - real table CRUD
- `apps/api/src/routes/finance.ts` - real cash drawer endpoints
- `apps/api/src/routes/user-management.ts` - outlet scope + gate fix
- `apps/api/src/routes/notifications.ts` - add /read-all
- `apps/api/src/app.ts` - mount /admin routes OR delete service

**UI:**
- `apps/pos-web/components/ItemToggleModal.tsx` - fix path
- `apps/pos-web/components/Nav.tsx` - permission alignment
- `apps/pos-web/components/PetPoojaHeader.tsx` - persist store toggle
- `apps/pos-web/pages/admin.tsx` - independent fetch
- `apps/pos-web/pages/inventory.tsx` - gate fix
- `apps/pos-web/pages/user-management.tsx` - gate fix
- `apps/pos-web/pages/finance.tsx` - gate fix + real ledger

**Prisma Schema:**
- `kapmeta/schema.prisma` - add inventory tables to model definitions

---

## Risk Areas

**High:**
- Stock deduction: wrong calculation = inventory drift
- Version conflicts: concurrent toggles need retry logic
- Migration: existing audit data needs backfill

**Medium:**
- Permission changes: users locked out if seeds diverge
- Channel mapping: Swiggy/Zomato IDs must match real external IDs

**Low:**
- Header toggle path: UI only, doesn't affect data
- Dashboard fetch: already working, just making it resilient

---

## Success Criteria

- [ ] Toggle item 86 in header → shows in inventory page
- [ ] Sell 1 dish → ingredient stock decrements by recipe amount
- [ ] Create ingredient → GET returns same row (no duplicate)
- [ ] Toggle Swiggy item OFF → `ChannelItemMapping` has UUID, not synthetic
- [ ] Non-admin user → only sees screens with granted permissions
- [ ] Leakage report 403 → dashboard still shows GST/occupancy/invoices
- [ ] Cash drawer opening = DB value, not hardcoded ₹2,000
- [ ] GET /users returns only current outlet users

---

## Open Questions

1. **Stock quantity storage:** Add column to `item_availability` OR separate `stock_ledger` table?
   - Recommendation: Separate `stock_ledger` for audit trail, `item_availability.current_stock_qty` for fast read

2. **Cash drawer tables:** Expand existing `order_payments` OR new `cash_drawer_shifts`?
   - Recommendation: New tables - cleaner separation of order payments vs drawer reconciliation

3. **services/admin mounting:** Mount OR delete?
   - Recommendation: Mount if contracts match API, delete if they don't - contracts describe unmounted endpoints

4. **Channel external IDs:** How to match Swiggy item ID when creating mapping?
   - Recommendation: Admin UI for manual mapping first, auto-sync later via webhook

---

## Timeline Estimate

| Phase | Days | Dependencies |
|-------|------|--------------|
| 1. RBAC | 2-3 | None - run first |
| 2. 86 Pipeline | 3-4 | Phase 1 complete |
| 3. Inventory Tables | 4-5 | Phase 2 complete (stock model) |
| 4. Channel Status | 2-3 | None - independent |
| 5. Header Ops | 2 | None - independent |
| 6. Finance Ledger | 3 | None - independent |
| 7. Dashboard | 1 | None - independent |
| 8. Admin Service | 1 | None - independent |

**Parallelizable:** Phases 4, 5, 6, 7, 8 can run concurrently after Phase 1-3 done.

**Sequential critical path:** Phase 1 → 2 → 3 (9-12 days)

**Total:** 18-22 days (1 developer, no blockers)

---

## Next Steps After Plan Approval

1. Create migrations (00XX_add_stock_to_item_availability.sql, 00XX_create_inventory_tables.sql)
2. Update Prisma schema, run `prisma generate`
3. Start Phase 1: RBAC alignment
4. Test each phase before moving to next
5. Document breaking changes for users (permission names changed, endpoints moved)
