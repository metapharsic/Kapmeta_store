# Database

**ID:** DB-INDEX · **Status:** DRAFT · **Owner:** DBA · **Version:** 1.0 · **Updated:** 2026-08-08

Complete catalogue of every database object, mapped to the requirement that authorized it.

---

## Files

| ID | File | Contains |
|----|------|----------|
| `DB-CAT` | [objects/DB-OBJECT-CATALOGUE.md](objects/DB-OBJECT-CATALOGUE.md) | Every table, view, index, constraint, sequence, trigger, function, type, extension, partition |
| `DB-MAP-TBL` | [mappings/DB-MAP-table-to-module.md](mappings/DB-MAP-table-to-module.md) | Table → owning module → requirement → source |
| `DB-MAP-COL` | [mappings/DB-MAP-column-conventions.md](mappings/DB-MAP-column-conventions.md) | Standard columns on every table, types, naming |
| `DB-ERD` | [ERD.md](ERD.md) | Entity relationships by schema group |
| `DB-STD` | [NAMING-STANDARD.md](NAMING-STANDARD.md) | Naming rules for every object type |

Related: [`../05-database/schema-reference.md`](../05-database/schema-reference.md) (design rules), `db/migrations/` (the actual DDL).

---

## The Nine Design Rules

Repeated here because they are violated by accident, not by intent:

1. **UUID primary keys** — safe for distributed integrations
2. **Immutable transactions** — append status history, never destructively update orders/payments
3. **Audit columns on every table** — `created_at`, `updated_at`, `created_by`, `updated_by`
4. **`outlet_id` on every operational table** from day one, even at single-outlet launch (DEC-001)
5. **Money as `BIGINT` minor units** + `currency CHAR(3)`. Never `FLOAT`, `REAL`, or `DOUBLE PRECISION`.
6. **Transactional integrity** — order + payment + inventory mutations commit together
7. **Index every FK** plus high-selectivity filters (`outlet_id, status, created_at`)
8. **Migration-only schema change** — no manual production DDL, ever
9. **Retention/archival** for high-volume audit and event tables (monthly partitions)

---

## Object Count

| Type | Count | Status |
|------|-------|--------|
| Tables | 63 | 7 built (migration 0001), 56 planned |
| Enums | 14 | planned |
| Views | 8 | planned |
| Materialized views | 5 | planned |
| Functions | 6 | planned |
| Triggers | 4 | planned |
| Partitioned tables | 4 | planned |
| Extensions | 2 | built |

---

## Rule

**Every object in the database appears in the catalogue, and every catalogue entry traces to a requirement.**

An object present in the database but absent from the catalogue is unauthorized schema — either map it or drop it. A catalogue entry with no upstream requirement means someone made a business decision in a migration file.
