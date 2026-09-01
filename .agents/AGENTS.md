# Workspace Agent Rules — KapMeta POS Platform

## 1. No Hardcoded Business Data & Mandatory User Ingestion Provision

1. **Zero Hardcoded Business Literals:**
   Never hardcode business entities (e.g. menu items, categories, recipes, ingredient lists, prices, table numbers, tax slabs, customer records, outlets, user credentials) as static constants/literals in source code for "demo", "stub", or "default" purposes.

2. **Always Provide User Data Ingestion Mechanisms:**
   Every module and workflow that requires business/operational data MUST provide an accessible mechanism for the user or administrator to insert, edit, and manage that data:
   - **Database Seeds & CLI Tools:** Dynamic seed scripts (e.g. `scripts/seed-dynamic-data.ts` or `db/seeds/`) accepting custom parameters or configuration files.
   - **Web Management UI:** Admin or POS interfaces (`apps/admin-web`, `apps/pos-web`) allowing direct form entry into DB tables.
   - **API Ingestion Endpoints:** REST endpoints supporting standard CRUD creation of all business entities.
   - **Structured Artifacts:** Documented user-fillable templates or data schemas.

3. **Data Integrity & Storage Standards:**
   - Currency amounts must always be ingested and stored in **integer minor units (`BIGINT` paise/cents)**.
   - Multi-tenant tenant boundaries must always enforce **`outlet_id NOT NULL`**.
   - Primary keys generated on client/ingestion interfaces must utilize **UUIDv7**.

---

## 2. Multi-Agent Boundaries & Architecture

- **Domain Isolation:** Services in `services/*` own their specific database domain tables. Never execute cross-module direct table reads.
- **Gateway Scoping:** API Gateway in `apps/api` resolves `outlet_id` from authenticated JWT session tokens and propagates `X-Correlation-Id`.
- **Append-Only Audits:** All privileged operations (cancellations, overrides, refunds, 86 toggles) must write an immutable audit log record within the same database transaction.
- **Dynamic User Ingestion Mandate:** If any business data is fed statically/hardcoded for defaults, fallback, or initialization, the module MUST provide a mechanism (e.g. a seed config file, interactive form, or REST API endpoint) allowing the user to insert and customize that data dynamically in database tables at all times.

