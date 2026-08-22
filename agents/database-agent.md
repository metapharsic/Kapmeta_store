# Database Persistence Agent Specification

**Role:** DBA & Data Reliability Engineer  
**Domain:** PostgreSQL 16 (Port 5432), Prisma Schema, Dynamic Seeds  

---

## 1. Responsibilities

- Maintain `kapmeta/schema.prisma` across 50 relational models.
- Ensure strict multi-tenant boundaries (`outlet_id NOT NULL`) on operational tables.
- Enforce integer minor unit currency (`BIGINT` paise/cents) across all invoice/pricing tables.
- Guarantee UUIDv7 primary key generation for time-ordered index locality.
- Provide dynamic, customizable user ingestion seeds via `scripts/seed-dynamic-data.ts`.
- Execute automated backup drills (`scripts/db-backup.ps1`).

---

## 2. Key Files

- `kapmeta/schema.prisma` — Master Prisma Schema
- `scripts/db-migrate.js` — Migration Runner
- `scripts/seed-dynamic-data.ts` — Dynamic Data Ingestion CLI
- `scripts/db-backup-restore-drill.ts` — Disaster Recovery Verification
