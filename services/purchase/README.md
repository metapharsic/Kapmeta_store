# purchase

Vendor master, Purchase Orders, Goods Received Notes, 3-way match variance. Phase 8 (R2). DEC-015/016/017/018 approved.

## What's built

- `src/purchase-service.ts` — `createPurchaseOrder` (approval tier via DEC-015 placeholder bands, retrospective-PO reason-code guard per DEC-017), `receiveGoods` (quantity-mismatch always flagged per DEC-016 Option C observe-only).
- `src/stores/prisma-purchase-repository.ts` — `PrismaPurchaseRepository`, atomic PO+items / GRN+items creation.

## What's NOT built

- Approval workflow itself — `approvalTierFor` computes the tier, nothing acts on it (no approve/reject endpoint, `PurchaseOrder.approvedBy`/`approvedAt` never set).
- Price variance bands (DEC-016 is explicitly observe-only for R2 — quantity mismatch is flagged, price bands are not evaluated at all yet).
- Vendor master CRUD (schema exists, no service function creates/lists vendors).
- PO transmission to vendor (DEC-019: email + stored artifact) — not built.
- Finance handoff on match approval (DEC-018: Purchase owns invoice through match, single versioned event to Finance) — the event itself doesn't exist.

## HTTP + RBAC

Wired into `apps/api` at `POST /purchase-orders` (`inventory.po.create`) and `POST /goods-received-notes` (`inventory.grn.create`) — both permission-gated, live-verified 2026-08-09 (cashier correctly 403s, seeded via `kapmeta/seed.ts`).

See docs/03-architecture/high-level-design.md for module boundaries.
