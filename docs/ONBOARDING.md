# Developer Onboarding

Target: productive first commit by day 5.

---

## Day 1 — Understand the System

- [ ] Read [`START-HERE.md`](START-HERE.md)
- [ ] Read [`00-governance/project-charter.md`](00-governance/project-charter.md)
- [ ] Read [`01-discovery/decision-register.md`](01-discovery/decision-register.md) — know what is still open
- [ ] Read [`03-architecture/high-level-design.md`](03-architecture/high-level-design.md)
- [ ] Skim [`GLOSSARY.md`](GLOSSARY.md)
- [ ] Read [`ENGINEERING-PROTOCOL.md`](ENGINEERING-PROTOCOL.md)
- [ ] Get access: repo, ticket tracker, staging DB (read-only), monitoring dashboards, secrets manager

**Checkpoint:** you can explain, without looking, why `outlet_id` is on every table and why money is never a float.

---

## Day 2 — Local Environment

```bash
git clone <repo> && cd Kapmeta
cp .env.example .env
```

Prerequisites: Node 20, Docker, PostgreSQL 16 client.

```bash
docker compose up -d          # postgres, redis, queue, minio
npm install
npm run db:migrate
npm run db:seed               # 150+ item catalogue, one pilot outlet
npm run dev
```

| Service | URL |
|---------|-----|
| API | http://localhost:3000 |
| POS UI | http://localhost:3001 |
| Admin UI | http://localhost:3002 |
| Storybook | http://localhost:6006 |

Verify:

```bash
npm run test:unit
npm run contracts:validate
```

**Checkpoint:** seeded menu visible in the admin UI; test suite green.

---

## Day 3 — Trace One Order End to End

Do this by hand. It is the fastest way to internalize the system.

1. Log in as a POS operator (seeded credentials in `db/seeds/README.md`)
2. Place a dine-in order with a modifier
3. Watch the KOT appear on the kitchen board
4. Mark items done → order goes READY
5. Settle payment → invoice generated
6. Find the order in All Orders; open its status history
7. Find the matching rows in `audit_logs`
8. Find the order in the dashboard KPI numbers

Then read the code path for the same flow: API handler → orders service → KOT generation → event publish.

**Checkpoint:** you can name every table touched by one dine-in order.

---

## Day 4 — Read Your Module

- [ ] Your module's doc in [`02-requirements/`](02-requirements/)
- [ ] Its section in [`05-database/schema-reference.md`](05-database/schema-reference.md)
- [ ] Its OpenAPI spec in `contracts/openapi/`
- [ ] Its README in `services/<module>/`
- [ ] Its open `DEC-xxx` blockers
- [ ] Existing ADRs in [`adr/`](adr/)

Pair with the module owner for an hour. Ask what has already been decided informally but not yet written down — then write it down.

---

## Day 5 — First Contribution

Pick a `good-first-issue`. Follow the workflow in [`ENGINEERING-PROTOCOL.md`](ENGINEERING-PROTOCOL.md) §2 exactly, including the parts that feel like overhead — the ADR, the spec update, the audit row. The habits matter more than the ticket.

---

## Common Setup Problems

| Symptom | Cause | Fix |
|---------|-------|-----|
| `db:migrate` fails on extension | `pgcrypto` / `citext` unavailable | Use the `postgres:16` image, not a stripped Alpine variant |
| Empty menu after seed | Seeds ran before migrations | `npm run db:reset` |
| 403 on every API call | Missing `X-Outlet-Id`, or outlet not granted to your user | Check `user_roles` for your seeded user |
| Webhook tests fail locally | No tunnel for inbound callbacks | Use the fixture-based tests; live webhooks are staging-only |
| KOT board does not update | WebSocket blocked by proxy | Falls back to polling; check console |

---

## Who To Ask

| Topic | Role |
|-------|------|
| Requirement unclear | Business Analyst |
| Architecture / module boundary | Solution Architect |
| Schema / query performance | DBA |
| API contract | Backend Lead |
| Auth, audit, compliance | Security Engineer |
| Aggregator / payment integration | Integration Lead |
| Environments, CI, deploys | DevOps |
| Scope, priority | Product Owner |

Asking beats guessing, particularly on tax, money, and permissions.
