# Seeds

Deterministic seed data for DEV / QA / UAT. Never run against production.

| File | Contents |
|------|----------|
| `01_roles_permissions.sql` | Roles + permission codes matching `docs/08-security/security-framework.md` |
| `02_org_outlet.sql` | One organization, one pilot outlet, stations, terminals |
| `03_categories.sql` | 20+ categories from source pages 7-27 |
| `04_menu_items.sql` | 150+ items: Breakfast, Meal Boxes, Rice Bowls, Beverages, Soups, Starters, Curries, Biryani, Noodles, Roti, Rice, Desserts, Juices, Milkshakes |
| `05_taxes_prices.sql` | Tax rules and price lists — placeholder until DEC-004 |
| `06_channel_mapping.sql` | Swiggy/Zomato item mappings for integration testing |
| `07_demo_orders.sql` | Synthetic orders across all states for report and E2E testing |

## Rules

- No real customer PII in any seed file.
- Fixed UUIDs so tests can reference records directly.
- `05_taxes_prices.sql` values are placeholders and must be regenerated once DEC-004 signs off.

```bash
npm run db:seed
```
