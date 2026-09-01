# Decision Closure — DEC-015 and DEC-017

**Project:** Kapmeta (Restaurant POS, KapMeta-parity clone)
**Reference outlet:** Hotel kapila (single outlet, LAN client-server topology, app v126.0.1)
**Date closed:** 2026-08-21
**Closed by:** Engineering decision review (this document)
**Effect:** Both items move from decision-register.md **Status: Open** to **Status: Provisionally Closed — Engineering may proceed; pending final stakeholder confirmation before production sign-off**. Phase 4-6 (Core POS) hard-gates on DEC-013 through DEC-024 are released for these two items.

---

## DEC-015 — Unified order status enum

### 1. Context and conflicting evidence

Two reference screens exposed order/table state through two different vocabularies:

- **Table View** screen: 5 color-coded table-card states — `Blank`, `Running`, `Printed`, `Paid`, `Running-KOT Table`.
- **Order History** screen: a 4-value legend — `Saved`, `Printed`, `Cancelled`, `Paid`.

The two lists don't line up term-for-term (`Blank` vs. nothing; `Saved` vs. `Running`; `Running-KOT Table` has no Order History counterpart; `Cancelled` has no Table View counterpart), and the DB schema draft, API contracts draft, and both artifact-01 (Table View) and artifact-05 (Order History) requirement docs each modeled these independently pending this decision. Phase 4-6 cannot begin building `orders`/`table_sessions` persistence or the order lifecycle state machine without one canonical enum.

### 2. Resolution reasoning

**Canonical enum — recommended 5-value set:**

`open`, `running`, `printed`, `paid`, `cancelled`

**Mapping table:**

| Source screen | Source value | Canonical `order_status` | Notes |
|---|---|---|---|
| Table View | Blank | `open` | No active order on the table; table is free |
| Table View | Running | `running` | Order in progress, nothing printed yet |
| Table View | Running-KOT Table | `running` + `kot_sent = true` | Sub-state of running, see below |
| Table View | Printed | `printed` | Bill printed, not yet settled |
| Table View | Paid | `paid` | Settled |
| Order History | Saved | `running` | "Saved" is Order History's label for an order that exists but hasn't been billed — semantically identical to Table View's Running |
| Order History | Printed | `printed` | Direct match |
| Order History | Paid | `paid` | Direct match |
| Order History | Cancelled | `cancelled` | Not observable from Table View (a cancelled order vacates the table back to `open`), but must exist as a terminal state for history/reporting and audit trail |

**On "Running-KOT Table": flag, not enum value.** The choice is between (a) a 6th enum value `running_kot`, or (b) a boolean `kot_sent` flag layered on top of `running`. We recommend (b), for three reasons:

- "KOT sent" is not a distinct lifecycle stage — an order is still fundamentally in the "running / not yet billed" phase whether or not a KOT has gone to the kitchen. Treating it as a full enum branch would force every downstream status check (`status = 'running'`) to also account for a sibling value, doubling the number of branches everywhere `running` is tested (billing eligibility, table-color logic, reporting) for no semantic gain.
- KOT issuance is naturally a many-times, non-monotonic event within a single running order (multiple KOT rounds can be sent as items are added), which fits a boolean/counter better than a single enum transition. A boolean also leaves room to later track `kot_count` or `last_kot_sent_at` without touching the status enum.
- It keeps `order_status` a strict, small, linearly-progressing lifecycle (open → running → printed → paid, with cancelled as an off-ramp from open/running), which is the property the billing engine and reporting queries actually need. `kot_sent` is orthogonal metadata, not a lifecycle stage, and modeling it separately keeps the two concerns (order lifecycle vs. kitchen-ticket dispatch) independently testable.

### 3. Decision-register text

> **DEC-015 — Unified order status enum**
> **Status:** Provisionally Closed — Engineering may proceed; pending final stakeholder confirmation before production sign-off.
> **Decision:** A single canonical `order_status` enum — `open`, `running`, `printed`, `paid`, `cancelled` — replaces the two screen-local vocabularies observed in Table View and Order History. Table View's "Running-KOT Table" state is represented as `status = 'running'` with a separate `kot_sent boolean` flag, not as a distinct enum value. This enum is authoritative across `orders.status`, `table_sessions.status`, and all UI status legends/colors.

### 4. Downstream docs requiring update

- `phase-04-06-core-pos.md` — remove/resolve the DEC-015 hard-gate language; reference this closure.
- `artifact-01-table-view.md` — replace the 5-state Table View status description with the canonical enum + `kot_sent` flag; update color-legend mapping.
- `artifact-05-order-history.md` — replace the 4-value Order History legend with the canonical enum mapping (note `Saved` → `running`).
- `db-schema-draft.md` — add `order_status` enum type; update `orders.status` and `table_sessions.status` column definitions; add `kot_sent boolean` (and optionally `kot_count`, `last_kot_sent_at`) to the relevant table (`orders` or a `kot_events` sub-table if per-round tracking is later required).
- `api-contracts-draft.md` — update any request/response schema enumerating order/table status values to the canonical 5-value set; document `kot_sent` in the relevant payloads.
- `sync-architecture-draft.md` — confirm the status enum and `kot_sent` flag are included in the fields synced between server and LAN clients for real-time table-color updates.
- `business-logic-rules-draft.md` — update any rule referencing "Running-KOT Table" or "Saved" as if they were first-class statuses.
- decision-register.md — flip DEC-015 to Provisionally Closed per §3 above.

### 5. Schema impact

```sql
CREATE TYPE order_status AS ENUM (
  'open',       -- table free / no active order
  'running',    -- order active, not yet billed/printed
  'printed',    -- bill printed, awaiting payment
  'paid',       -- settled
  'cancelled'   -- voided
);

ALTER TABLE table_sessions
  ADD COLUMN status order_status NOT NULL DEFAULT 'open';

ALTER TABLE orders
  ADD COLUMN status order_status NOT NULL DEFAULT 'running',
  ADD COLUMN kot_sent boolean NOT NULL DEFAULT false;
```

If multiple KOT rounds per order need individual tracking later (e.g., for kitchen-side reprint or per-round timing), promote `kot_sent` to a `kot_count integer NOT NULL DEFAULT 0` or a separate `order_kot_events` table — out of scope for this closure but noted so the flag isn't treated as permanently single-shot.

---

## DEC-017 — Tax mode scope (backward vs. forward)

### 1. Context and conflicting evidence

The Tax Master screen for Hotel kapila showed **four simultaneous tax rows** in the same outlet configuration:

- CGST 2.5% + SGST 2.5%, labeled "Backward Tax" (applied to dine-in orders)
- CGST[Online] 2.5% + SGST[Online] 2.5%, labeled "Forward Tax" (applied to online/aggregator orders)

Elsewhere in the app, a helper note read: *"Ignore this settings if you are using forward tax configuration for your outlet."* Read in isolation, that note implies tax mode is an outlet-wide either/or toggle — pick backward OR forward, not both — which appears to contradict the screenshot showing both configured at once in a single live outlet.

This conflict blocks the Phase 4-6 billing/tax engine, whose current draft already assumes per-channel branching (dine-in vs. online tax treatment), because DEC-017 was left open pending resolution of whether that assumption is correct.

### 2. Resolution reasoning

We resolve this as **not a contradiction**, and adopt the per-channel model already assumed by the Phase 4-6 draft.

**Why the four-row setup is the true baseline behavior, not an anomaly:** The screenshot is captured evidence from a real, live, validated outlet (Hotel kapila) actively using both backward and forward tax rows at once. Real observed configuration state is stronger evidence than a static help-text string, which is written once and reused across many outlet configurations that may not all apply to this one. When a directly observed data point and a generic UI hint conflict, the observed data point governs.

**Why the helper note doesn't actually contradict this:** The note is most plausibly describing a **legacy or simplified single-mode configuration path** available to outlets that don't need channel differentiation — e.g., a small outlet that only ever takes dine-in, or one that charges the same tax regardless of channel, can set one outlet-level tax mode and skip configuring forward/backward rows individually. Hotel kapila is visibly not that kind of outlet: it has deliberately configured both backward and forward rows, meaning it has already opted into channel-differentiated taxation, which is exactly the case the note tells such outlets to ignore ("ignore this setting if you're using forward tax configuration" reads naturally as "if you've moved to channel-specific configuration, this simpler global toggle doesn't apply to you").

**Recommended data model:** support both, layered:

- An outlet-level default tax-mode setting (for outlets that want one simple mode and never configure per-channel rows).
- Full per-channel tax row support, i.e., tax rows are **channel-scoped by design** (`dine_in`, `online`, and any future channel), which is what Hotel kapila and presumably any outlet using aggregators will need.

This treats the helper note as documenting an edge case for simpler outlets rather than as evidence against the primary architecture, and it matches what the Phase 4-6 tax engine draft already assumes — so no rearchitecting is required.

**Risk assessment:** This is the lower-risk interpretation because it is additive — it fully explains and preserves the observed real-world evidence (the four-row setup keeps working exactly as captured) while still accounting for the helper note as a legitimate, narrower code path for other outlet types. The alternative reading (tax mode is strictly either/or) would require explaining away directly observed production data as a bug or misconfiguration, which is a much larger and less defensible assumption to build a tax engine on.

**Residual caveat:** This is a reasonable, evidence-backed interpretation, not a confirmed fact from KapMeta/the client. It should be explicitly confirmed with the client (or via KapMeta support/documentation) before production sign-off, specifically to verify: (a) whether the outlet-level toggle, when set to "forward tax configuration," actually suppresses/replaces backward rows rather than coexisting with them, and (b) whether any other outlet in scope relies on the single-mode path. However, it is **not a blocker for Phase 4-6 engineering** — the channel-scoped tax row model is a strict superset of the simple single-mode case (a single-mode outlet is just one that only populates one channel's rows, or uses the outlet-level default), so building it now carries no rework risk if the client confirmation later narrows the scope.

### 3. Decision-register text

> **DEC-017 — Tax mode scope (backward vs. forward)**
> **Status:** Provisionally Closed — Engineering may proceed; pending final stakeholder confirmation before production sign-off.
> **Decision:** Tax rows are channel-scoped by design. The data model supports both an outlet-level default tax mode (for outlets not needing channel differentiation) and full per-channel tax rows (backward/dine-in, forward/online, and future channels) for outlets like Hotel kapila that configure both simultaneously. The "ignore this setting if using forward tax configuration" helper note is interpreted as describing the simpler single-mode path for outlets that don't use per-channel rows, not as evidence against the observed four-row configuration. Requires client confirmation before production release; does not block Phase 4-6 engineering.

### 4. Downstream docs requiring update

- `phase-04-06-core-pos.md` — remove/resolve the DEC-017 hard-gate language; note the residual production-sign-off caveat in the phase's exit criteria or a tracked follow-up item.
- `artifact-07-tax-master.md` — document the channel-scoped tax row model and the outlet-level default mode; explain the helper-note interpretation for future readers.
- `artifact-02-*` (whichever screen surfaces the "ignore this setting" helper text — settings/outlet-config screen) — annotate that this toggle applies only to outlets on the simplified single-mode path.
- `db-schema-draft.md` — update the `taxes` table and add/confirm a `tax_channel_rules` (or equivalent) table for channel scoping; add outlet-level default tax-mode column.
- `api-contracts-draft.md` — ensure tax lookup/calculation endpoints accept a channel parameter and document the outlet-default fallback behavior.
- `business-logic-rules-draft.md` — codify the resolution rule: "if per-channel tax rows exist for the outlet, use them; otherwise fall back to the outlet-level default tax mode."
- decision-register.md — flip DEC-017 to Provisionally Closed per §3 above; add a follow-up action item to obtain client confirmation before production go-live.

### 5. Schema impact

```sql
-- Outlet-level default/simple tax mode (used only when no channel-specific rows exist)
ALTER TABLE outlets
  ADD COLUMN default_tax_mode text
    CHECK (default_tax_mode IN ('backward', 'forward'))
    DEFAULT 'backward';

-- Channel-scoped tax rows (primary model)
CREATE TABLE tax_channel_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     uuid NOT NULL REFERENCES outlets(id),
  tax_id        uuid NOT NULL REFERENCES taxes(id),
  channel       text NOT NULL CHECK (channel IN ('dine_in', 'online')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, tax_id, channel)
);

-- taxes table gains (if not already present) a label distinguishing backward/forward
ALTER TABLE taxes
  ADD COLUMN tax_scope text
    CHECK (tax_scope IN ('backward', 'forward'));
```

Resolution logic for the billing engine: for a given outlet and order channel, look up `tax_channel_rules` filtered by `outlet_id` and `channel`; if no rows exist, fall back to `outlets.default_tax_mode` and apply the outlet's `backward`-scoped (or `forward`-scoped) taxes globally. This satisfies both the observed multi-row outlet (Hotel kapila) and any simpler single-mode outlet the helper note is addressing.

---

## Summary

| Item | Status | Blocks Phase 4-6? | Residual action |
|---|---|---|---|
| DEC-015 | Provisionally Closed | No | None — enum and flag design final pending normal QA |
| DEC-017 | Provisionally Closed | No | Client/KapMeta-support confirmation required before production sign-off |

Both decisions are closed for engineering purposes effective 2026-08-21. Phase 4-6 (Core POS) may proceed using the schema and enum definitions specified above.
