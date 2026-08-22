# PetPooja POS Platform — Multi-Agent Diagnostic & Resolution Protocol

**For:** Gemini, Claude & Autonomous Pair Programming Agents  
**Purpose:** Standardized algorithmic procedure to detect bugs, read logs, trace root causes, apply fixes, run unit tests, and advance checkpoints.

---

## 1. The 5-Step Diagnostic & Resolution Loop

```
┌───────────────────────────────┐
│ 1. SCAN LOGS & CAPTURE ERROR  │  Run `npm run logs:errors`
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│ 2. IDENTIFY DOMAIN & AGENT    │  Determine owning service via `brain/SYSTEM_ARCHITECTURE.md`
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│ 3. TRACE CODE & APPLY FIX     │  Follow invariants (no hardcoded data, minor units, audit logs)
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│ 4. VERIFY WITH AUTOMATED TESTS│  Run `npm run test:unit` & `npm run status`
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│ 5. UPDATE CHECKPOINT PROGRESS │  Run `npm run checkpoint:update <GATE_ID> PASSED`
└───────────────────────────────┘
```

---

## 2. Common Errors & Resolution Playbooks

### Scenario A: `ECONNREFUSED 127.0.0.1:5432`
- **Root Cause:** PostgreSQL daemon is not running on port 5432 or `DATABASE_URL` in `.env` is incorrect.
- **Resolution:** Verify `.env` points to `postgresql://pos:pos@localhost:5432/petpooja` and check local PostgreSQL service.

### Scenario B: `EADDRINUSE 0.0.0.0:4001` or `4444`
- **Root Cause:** Stale Node or Next.js background process still bound to fixed ports.
- **Resolution:** Run `npm run stop:all` (or `.\Stop_PetPooja.bat`) to cleanly terminate orphan processes.

### Scenario C: `PrismaClientKnownRequestError` / Schema Mismatch
- **Root Cause:** Database tables out of sync with `kapmeta/schema.prisma`.
- **Resolution:** Run `npm run db:migrate` to reconcile tables.

### Scenario D: `JWT_SECRET` / 401 Unauthorized Errors
- **Root Cause:** Missing or mismatched `JWT_SECRET` in environment.
- **Resolution:** Ensure `.env` is populated with `JWT_SECRET=dev_jwt_secret_key_minimum_32_characters_long`.
