# Menu & Catalog — Functional Spec

**Source:** pages 6-27 · **Coverage:** 80% · **Status:** DRAFT

## Availability States

| State | Source | Behavior (requires confirmation) |
|-------|--------|----------------------------------|
| **ON** | Explicit | Orderable on all mapped channels |
| **OFF** | Explicit | Blocks new orders; existing orders stay valid and fulfillable |
| **Partial Changes** | Explicit | Channel-specific configuration divergence — some channels synced, some not |
| **Unscheduled** | Explicit | No active availability schedule rule |

State is per `(item, channel)`. An item ON internally but not yet synced to Swiggy shows as *Partial*.

## Catalogue Structure

20+ categories, 150+ documented items:

Breakfast (14+: Idly, Dosa, Uttapam variants) · Meal Boxes – Online (8) · Rice Bowls – Online (6) · Beverages (hot/cold) · Soups (veg/non-veg) · Starters (Chinese/Tandoori, veg/non-veg) · Curries (15+ veg, 10+ non-veg) · Biryani (9 variants) · Noodles · Roti · Rice · Desserts · Juices · Milkshakes.

Seed data lives in `db/seeds/`.

## Channel Sync Flow

```
Admin changes item availability
        ↓
Validate permission + channel mapping
        ↓
Store change with version number
        ↓
Generate channel-specific payload (Swiggy / Zomato / other)
        ↓
Queue for async processing
        ↓
Adapter sends to external channel (IDEMPOTENT)
        ↓
Persist response + update sync status
        ↓
UI shows Synchronized / Failed / Pending + retry + audit trail
```

Version numbers guarantee ordering: a stale sync response never overwrites a newer local state.

## Requirements

- Item variants (size/portion) and modifier groups with min/max selection rules
- Channel-specific pricing and channel-specific item naming
- Scheduled availability windows (e.g. breakfast 07:00-11:00, outlet timezone)
- Bulk operations: enable/disable category, bulk price update — all audited
- Every price and status change writes to `audit_logs`

## Open Decisions

DEC-007 (which channels), DEC-004 (tax per item category), DEC-001 (per-outlet menu overrides).
