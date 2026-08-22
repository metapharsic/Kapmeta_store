# menu

Categories, items, variants, modifiers, availability, channel mapping. Publishes menu.item_availability_changed.

## What's built

- `src/availability-service.ts` — `setAvailability` with optimistic-concurrency version check (matches `ItemAvailability.version` in schema).
- `src/stores/prisma-availability-repository.ts` — `PrismaAvailabilityRepository`, version-guarded `updateMany`.
- `src/menu-catalog-repository.ts` — `PrismaMenuCatalogRepository`: create category, create item, list by category.

## What's NOT built

- Modifier group/option CRUD (schema models exist: `ModifierGroup`, `ModifierOption`, `MenuItemModifierGroup` — no service code yet).
- Channel item mapping wiring into `@kapmeta/integration-hub`'s `ChannelItemMapping` model.
- HTTP entrypoint into `apps/api`.
- Bulk enable/disable, audit history (source doc §8.2 lists both).

See docs/03-architecture/high-level-design.md for module boundaries.
