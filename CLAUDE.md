# Kapmeta — Project Rules

## No-hardcode data rule (mandatory, all agents)

Never hardcode business data (menu items, prices, roles, permissions, outlets, taxes, sample orders, config values meant to change per-tenant, etc.) directly in source code as literals for "demo" or "default" purposes.

Every place data would otherwise be hardcoded MUST instead have one of:
1. A DB table + seed/migration path (`db/migrations`, `db/seeds`, or Prisma seed) that a user/admin can insert/edit rows into, OR
2. An admin UI / form (artifact or `apps/admin-web` screen) that writes to that DB table, OR
3. Both — DB table is the source of truth, UI is how the user feeds it.

Constants that are truly structural (enum values, status codes, permission keys tied to code paths) are exempt — only *business/content* data is covered by this rule.

When implementing any feature that needs sample/seed data to work end-to-end, always wire a real insert path (API endpoint, admin form, or seed script) instead of inlining arrays/objects of fake data in service code or components.
