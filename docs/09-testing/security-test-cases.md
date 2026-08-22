# Security Test Cases

**ID:** TST-SEC-01..28 · **Status:** DRAFT · **Owner:** Security Engineer · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** [`../08-security/security-framework.md`](../08-security/security-framework.md), [`../06-api/api-standards.md`](../06-api/api-standards.md), `MAP-EVT`, `WF-INT-01`
**Traced by:** pre-go-live VAPT scope, CI security suite
**Companion:** [`e2e-scenarios.md`](./e2e-scenarios.md)

28 cases. Every one is automatable and runs in CI unless marked **VAPT** (manual / pentest scope).

The two highest-value cases are **TST-SEC-05** (outlet in body must never override the session grant) and **TST-SEC-27** (duplicate webhook creates exactly one order). They are specified at greater depth than the rest.

---

## Test Fixtures

| Fixture | Meaning |
|---|---|
| Outlet A | The outlet the session is granted. |
| Outlet B | A real outlet the session is **not** granted. |
| Outlet Z | A non-existent outlet UUID. |
| `ORD-A-1` | An order belonging to Outlet A. |
| `ORD-B-1` | An order belonging to Outlet B. |
| Roles | One session per row of the RBAC matrix: Super Admin, Outlet Manager, POS Operator, Kitchen User, Menu Admin, Inventory User, Finance User, Auditor. |

**Standing rule:** a 404 for a cross-outlet resource is acceptable and preferred (api-standards: "found but not visible to this outlet"). A 200 is a fail. A 403 that leaks the resource's existence in `details` is a fail.

---

## A. Authorization — Positive / Negative Matrix

### TST-SEC-01 — Correct role, correct outlet (positive control)

**Proves:** the negative cases below fail for the right reason.
**Method:** for each role, call every endpoint the RBAC matrix grants it, with `X-Outlet-Id: A` and a session granted Outlet A.
**Pass:** 2xx for every granted (role, endpoint) pair. Any 403 here invalidates the whole section — the negative results would be false positives.

### TST-SEC-02 — Wrong role, correct outlet

**Proves:** RBAC is enforced server-side, not by hiding buttons.
**Method:** drive the full RBAC matrix as a cross-product. For every (role, endpoint) pair the matrix does **not** grant, issue the request with a valid Outlet A session. Include the specific traps:

| Role | Must be refused |
|---|---|
| POS Operator | `menu.write`, `orders.delete`, post-KOT cancellation, inventory adjustment, reports |
| Kitchen User | order creation, payment capture, menu write |
| Menu Admin | order creation, payment capture, KOT update, inventory |
| Inventory User | orders, payments, menu write |
| Finance User | menu write, KOT update, inventory write |
| Auditor | every write, on every module |

**Pass:** 403 with a stable error `code`. The mutation did not occur (verify by re-reading state, not by trusting the status code). An audit row exists for the failed authorization attempt.
**Also:** requests are refused with the API call alone — no UI involved. A test that passes only through the UI proves nothing.

### TST-SEC-03 — Correct role, wrong outlet

**Proves:** permissions are outlet-scoped, not global.
**Method:** Outlet Manager granted only Outlet A sends `X-Outlet-Id: B` and operates on `ORD-B-1`. Repeat for read, write, cancel, refund, report export.
**Pass:** 403 (header rejected against session grants) or 404 (resource invisible). Never 200. No row in Outlet B changed. Failed attempt audited.

### TST-SEC-04 — Missing / malformed outlet header

**Proves:** outlet context is required, never defaulted.
**Method:** omit `X-Outlet-Id`; send it empty; send Outlet Z; send a non-UUID; send two `X-Outlet-Id` headers with different values.
**Pass:** 400 or 403. Never a silent default to "the user's first outlet", never a fallback to org-wide scope. On duplicate headers, reject — do not pick one.

---

### TST-SEC-05 — Outlet ID in request body vs session grant ★ CRITICAL

**Proves:** the privilege-escalation vector named in the threat model — *"Privilege escalation via outlet switch: outlet ID resolved from session, never from request body."*

This is the single most likely way a user with a legitimate account reads or mutates another outlet's data. It is cheap to introduce (one ORM call that trusts `req.body.outlet_id`) and invisible until exploited.

**Method** — session granted **Outlet A only**. For every mutating endpoint, and for the list/report endpoints, run all variants:

| # | Variant | Request shape | Required behavior |
|---|---|---|---|
| 5a | Body override, matching header | `X-Outlet-Id: A`, body `{"outlet_id": "B", …}` | Body field is **ignored or rejected**. If the write proceeds, the row lands in **Outlet A**. Nothing in Outlet B changes. |
| 5b | Body-only, no header | no `X-Outlet-Id`, body `{"outlet_id": "B"}` | 400/403. The body must never supply outlet context in the header's absence. |
| 5c | Header B, body A, session A | `X-Outlet-Id: B`, body `{"outlet_id": "A"}` | 403. The header is checked against session grants first; a "correct" body value does not rescue an ungranted header. |
| 5d | Nested override | `{"order": {"outlet_id": "B"}}`, `{"items":[{"outlet_id":"B"}]}` | Ignored at every nesting depth. Test nested and array positions explicitly — top-level-only stripping is a common partial fix. |
| 5e | Query-string override | `?outlet_id=B` | Ignored. |
| 5f | Path override | resource path referencing `ORD-B-1` under an Outlet A session | 404. |
| 5g | Mass assignment | body includes `outlet_id`, `organization_id`, `created_by`, `id`, `business_date` | All server-controlled fields ignored; none is assignable from input. |
| 5h | Prototype/`__proto__` and duplicate JSON keys | `{"outlet_id":"A","outlet_id":"B"}` | Parser behavior is deterministic and the result is still Outlet A. |
| 5i | Event emission | any accepted mutation from 5a | Emitted event's envelope `outlet_id` equals the **session** outlet (A), not the body value. |
| 5j | JWT tampering | outlet claim edited in an unsigned/re-signed-with-wrong-key token | 401. Signature verified before claims are read. |
| 5k | Stale grant | grant to Outlet B revoked mid-session, then request Outlet B | 403. `user.role_changed` invalidates the session (MAP-EVT consumer: session invalidation). |

**Pass criteria (all must hold):**

1. No request in any variant reads or writes a single Outlet B row. Verified by direct DB inspection of Outlet B before and after, not by response body.
2. Refusals are 403 (or 404 for cross-outlet reads), never 500 — a 500 means the check is an accident of a downstream constraint, not a control.
3. Every refusal writes a failed-authorization audit row with actor, attempted outlet, endpoint, correlation ID.
4. Accepted requests emit events whose envelope `outlet_id` is the session outlet.
5. The scope is applied at a single choke point (middleware / repository filter). Grep-level evidence that any handler reads `outlet_id` from the request body is a fail **even if the behavioral tests pass** — it means the next handler someone writes will be vulnerable.

**Fail signature to watch for:** a 200 with an empty result set on a cross-outlet read looks like a pass and is not. Assert the query was scoped, not that it happened to return nothing.

---

### TST-SEC-06 — Cross-outlet read via enumeration

**Proves:** IDOR on order/invoice/payment IDs.
**Method:** with an Outlet A session, `GET` UUIDs belonging to Outlet B across orders, invoices, payments, KOTs, stock movements, audit rows.
**Pass:** 404 for all. Response times do not differ measurably between "exists in B" and "does not exist anywhere" — a timing gap is an existence oracle.

### TST-SEC-07 — Cross-outlet write via aggregator webhook

**Proves:** channel accounts are outlet-bound.
**Method:** send Outlet A's channel account a validly-signed payload naming Outlet B.
**Pass:** rejected or bound to Outlet A. A channel account never writes outside its mapped outlet.

### TST-SEC-08 — Reports and exports respect outlet scope

**Proves:** the reporting path uses the same scope as the transactional path.
**Method:** Outlet A Auditor runs every report and export; a manager for A requests a cross-outlet consolidated report.
**Pass:** only Outlet A rows returned. Consolidated views require an org-wide grant (`user_roles.outlet_id IS NULL`) and are refused without one. Export action is audited.

---

## B. OWASP Top 10 (as it applies to this system)

### TST-SEC-09 — A01 Broken Access Control (function level)

**Proves:** admin-only functions are not reachable by non-admins.
**Method:** call user management, role assignment, tax configuration, channel credential, and outlet configuration endpoints from each non-admin role. Include HTTP verb tampering (`GET` on a `POST` route, `X-HTTP-Method-Override`).
**Pass:** 403. Verb override headers are not honored.

### TST-SEC-10 — A02 Cryptographic Failures

**Proves:** transport and storage crypto meet the mandatory controls.
**Method:** scan endpoints for TLS version and cipher suites; attempt plaintext HTTP; inspect DB for card PAN patterns; check password hashing algorithm and cost; check token storage.
**Pass:** TLS 1.2+ only, HTTP redirected or refused, HSTS present, **no PAN anywhere** in DB, logs, or backups (gateway-hosted capture per DEC-011), passwords with a modern KDF.

### TST-SEC-11 — A03 Injection (SQL)

**Proves:** parameterized queries throughout.
**Method:** inject into every string input — order notes, item names, reason codes, customer name/phone, report filters, cursor parameter, search fields. Payloads include `' OR 1=1--`, stacked statements, and time-based blind (`pg_sleep`). Explicitly target the pagination `cursor` (opaque strings invite concatenation) and any dynamic `ORDER BY`.
**Pass:** 400 validation errors or literal storage. No error containing SQL text or a driver stack trace. No measurable delay from time-based payloads.

### TST-SEC-12 — A03 Injection (other channels)

**Proves:** injection is handled on every boundary, not only SQL.
**Method:** ESC-POS control sequences into KOT item names and notes (printer command injection); formula prefixes `=`, `+`, `-`, `@` into any field reaching a CSV export; `${}`/`{{}}` template payloads; log-forging payloads with CRLF into user-controlled fields.
**Pass:** printer output is text only, no control sequences honored; CSV cells are prefix-escaped; no template evaluation; CRLF neutralized so a log line cannot be forged.

### TST-SEC-13 — A03 XSS

**Proves:** output encoding on every boundary.
**Method:** stored XSS via item names, modifier names, order notes, customer names, cancellation reasons, channel-supplied item names from a webhook payload (untrusted external input rendered on the KOT board and POS).
**Pass:** rendered as text everywhere including the KOT display and printed ticket. CSP present and restrictive. No `dangerouslySetInnerHTML`-equivalent on any of these fields.

### TST-SEC-14 — A04 Insecure Design (business logic)

**Proves:** business invariants are server-enforced.
**Method:** negative quantity line; negative or zero `amount_minor`; discount above 100%; discount above the elevation threshold without elevation; refund exceeding capture; price supplied by the client and trusted; illegal status transition (`COMPLETED` → `CONFIRMED`); tax rule missing for an item.
**Pass:** 422/409 for each. Prices and taxes are computed server-side from the catalogue, never accepted from the client. A missing tax rule **rejects the order** — no guessed rate (WF-ORD-01).

### TST-SEC-15 — A05 Security Misconfiguration

**Proves:** the deployed surface is minimal.
**Method:** probe for debug endpoints, stack traces in 500 responses, directory listing, default credentials, verbose `Server`/framework headers, permissive CORS (`*` with credentials), missing security headers, exposed `/actuator`-style or metrics endpoints.
**Pass:** generic error bodies matching the documented error model with a `correlation_id` and nothing else; CORS allowlisted; no default accounts.

### TST-SEC-16 — A06 Vulnerable Components

**Proves:** the CI control from the mandatory-controls list actually blocks.
**Method:** run the dependency scanner; then introduce a known-vulnerable dependency and push.
**Pass:** build **fails** on high/critical. A scanner that reports without failing the build does not satisfy the control.

### TST-SEC-17 — A07 Identification & Authentication Failures

**Proves:** auth controls hold.
**Method:** credential stuffing against a known user; login brute force; password reset token reuse and expiry; session fixation; token replay after logout; refresh token rotation; **MFA required for administrative accounts**; concurrent session handling.
**Pass:** lockout/throttle engages; reset tokens are single-use and short-lived; session ID rotates on login; revoked tokens fail closed; admin login without MFA is impossible.

### TST-SEC-18 — A08 Software & Data Integrity Failures

**Proves:** untrusted input is not deserialized or executed, and webhook origin is verified.
**Method:** webhook with a missing signature, a wrong signature, a valid signature over a mutated body, a valid signature from a non-allowlisted source IP, and a replayed old-timestamp signature.
**Pass:** 401 for each, logged and alerted. Signature verification precedes parsing and precedes persistence-driven side effects. Timestamp skew window enforced so an old capture cannot be replayed.

### TST-SEC-19 — A09 Logging & Monitoring Failures

**Proves:** attacks are visible.
**Method:** execute TST-SEC-02, 03, 05, 17, 18 and then inspect logs and alerts.
**Pass:** every failed authorization, every signature failure, every lockout produces a log entry with correlation ID and raises the configured alert. Silence is a fail. See also section E.

### TST-SEC-20 — A10 SSRF

**Proves:** outbound URLs are not attacker-controlled.
**Method:** set channel callback URLs, webhook targets, printer host/IP, and any image/logo URL to `169.254.169.254`, `127.0.0.1`, `localhost`, internal RFC1918 ranges, and a redirect chain ending at an internal host.
**Pass:** refused by allowlist. Redirects are not followed to private ranges. DNS re-resolution between check and connect does not open a hole.

---

## C. Idempotency Abuse & Replay

### TST-SEC-21 — Idempotency key abuse

**Proves:** the idempotency store cannot be turned into an attack surface.
**Method:**

| Variant | Expectation |
|---|---|
| Same key, same body | Original response replayed. One resource. |
| Same key, different body | 409 (api-standards). No second resource. |
| Same key across **different users** | The second caller does **not** receive the first caller's response body. Keys are scoped per outlet + principal, not global. |
| Same key across different outlets | Isolated. No cross-outlet leak of the stored response. |
| Missing key on a money/order POST | 400. Not silently allowed. |
| Absurdly long or non-UUID key | 400, bounded length. No unbounded storage growth. |
| 10k unique keys from one principal | Rate limited; storage bounded; 24 h TTL actually expires entries. |
| Key reuse after the 24 h window | Documented behavior asserted explicitly. |

**Pass:** all rows hold; in particular the cross-principal case, where a replayed response would leak another user's order data.

### TST-SEC-22 — Payment callback replay

**Proves:** replayed gateway callbacks cannot mint money.
**Method:** capture a legitimate signed callback and replay it 20× — immediately, after 1 h, and after the idempotency window; also replay it against a **different** order ID with the original signature.
**Pass:** exactly one `payments` row and one `payment.captured` event. Cross-order replay is rejected because the signature covers the order reference. See [`e2e-scenarios.md`](./e2e-scenarios.md) TST-E2E-08.

---

## D. Rate Limiting

### TST-SEC-23 — Rate limits per user, per IP, per channel account

**Proves:** the mandatory control "API rate limiting per user and per IP", plus the webhook-specific limit.
**Method:**

| Dimension | Test |
|---|---|
| Per user | Burst past the limit from one principal across several IPs. |
| Per IP | Burst past the limit from one IP across several principals. |
| Per channel account | Flood one channel account's webhook endpoint; confirm other channel accounts are unaffected. |
| Login | Brute force one account, then many accounts from one IP (spray). |
| Export | Repeated report exports — "insider data export … rate-limited" from the threat model. |
| Bypass attempts | `X-Forwarded-For` spoofing, IPv6 alternate forms, case/trailing-slash path variants, HTTP/2 vs 1.1. |

**Pass:** 429 with `RateLimit-*` headers. Limits are enforced server-side and cannot be bypassed by header spoofing. Legitimate load (60 orders/min/outlet, 20 concurrent terminals) is **not** throttled — a limit that breaks the documented sustained load is a fail in the other direction.

---

## E. Audit-Log Completeness

### TST-SEC-24 — Every audited action produces a row

**Proves:** the non-negotiable audited-actions list is complete in practice.
**Method:** perform each action once and assert exactly one audit row with actor, target, before/after, reason where required, correlation ID, timestamp:

| Audited action | Test action |
|---|---|
| Menu price / status change | Toggle availability; change price; bulk-change 60 items → **60 rows** (WF-MNU bulk rule). |
| Order cancellation | Pre-KOT void and post-KOT cancellation — distinct action types. |
| Refund | Partial and full. |
| Permission change | Role grant/revoke → also emits `user.role_changed`. |
| Payment override | Manual override / manager elevation. |
| Inventory adjustment | Manual stock adjustment. |
| Configuration change | Tax rule, station route, channel credential. |
| Failed authorization attempt | Every refusal from TST-SEC-02, 03, 05. |

**Pass:** row count matches action count exactly. Zero silent mutations. A bulk action writing one row for 60 items is a fail.

### TST-SEC-25 — Audit rows are atomic and immutable

**Proves:** "audit rows are written in the same transaction as the mutation; audit tables are append-only".
**Method:**

1. Inject a failure after the mutation but before commit — assert **neither** the mutation nor the audit row persists.
2. Inject a failure in audit-row insertion — assert the mutation rolls back too.
3. As the application DB role, attempt `UPDATE` and `DELETE` on each audit table.
4. Inspect grants directly: `information_schema.role_table_grants` for audit tables.

**Pass:** 1 and 2 leave no partial state. 3 raises permission denied. 4 shows no application role holding `UPDATE`/`DELETE`. An audit row written by an after-commit hook or an async event consumer is a **fail** — it is lossy exactly when it matters most.

---

## F. Secrets & PII

### TST-SEC-26 — Secret exposure and PII in logs

**Proves:** "encrypted secrets via Vault / Secrets Manager — never in env files committed to git", and no production PII in lower environments.

**Method:**

| Surface | Check |
|---|---|
| Repository | Secret scanner over full git **history**, not just HEAD: API keys, channel signing secrets, DB passwords, JWT signing keys, `.env` files. |
| Runtime config | Secrets resolved from the secret manager at runtime; not baked into images, build args, or CI logs. |
| Application logs | JWTs, `Authorization` headers, `Idempotency-Key` values, signing secrets, webhook raw bodies containing customer data — must be redacted. |
| PII in logs | Customer name, phone, email, delivery address must not appear in application logs, error messages, or APM traces. Assert on a real dine-in + delivery + aggregator run. |
| Error responses | Error `message` and `details` never echo a secret or a full PII record; `details[].value` is truncated/masked. |
| Correlation IDs | Present everywhere PII was removed, so an incident is still traceable without the PII. |
| Lower environments | Seeded from `db/seeds/` only. Scan staging DB for production-shaped PII. Any hit is a P0. |
| Backups & exports | Same redaction rules; export files are audited and access-controlled. |
| Raw inbound events | `inbound_events` retains raw channel payloads containing customer PII — assert access is restricted, retention is bounded, and the table is not included in general-purpose exports. |

**Pass:** zero findings in git history; zero secrets and zero PII fields in logs across a full E2E run; staging contains no production PII.
**VAPT:** include this surface in the pre-go-live penetration test.

---

## G. The Duplicate-Webhook Guarantee

### TST-SEC-27 — Duplicate webhook creates exactly one order ★ CRITICAL

**Proves:** the threat-model control *"replayed webhook creating duplicate orders → idempotency key + unique constraint on external event ID"*, and that the control is in the **database**, not in application logic.

An aggregator retrying a webhook is not an attack — it is normal, guaranteed behavior of at-least-once delivery. It is listed as a threat because a forged or replayed delivery has the same shape as a legitimate retry, and the only thing separating "resilient" from "duplicate orders in production every busy evening" is where the uniqueness check lives.

**Method**

| # | Step | Required behavior |
|---|---|---|
| 27a | Send one signed webhook | 200. One order, one KOT set per station, one `channel.order_received`, one `order.placed`. |
| 27b | Resend the byte-identical webhook | 200 returning the **prior result** — the original order's identifiers. Not a 409, not a new order. |
| 27c | Resend with the same `external_event_id` but a mutated body and a valid signature over the mutation | Rejected as a duplicate; the **first** order is authoritative. A second body must never overwrite the first. |
| 27d | Fire 10 identical webhooks **concurrently** | Exactly 1 order. This is the case application-level dedupe fails. |
| 27e | Fire 50 concurrent, across 5 channel accounts, 10 duplicates each | Exactly 5 orders. Constraint is `(channel_account_id, external_event_id)` — same event ID under different accounts is not a duplicate. |
| 27f | Inspect how 27d's losers failed | Unique-violation on `uq_inbound_events_external`. A `SELECT`-then-`INSERT` application check is a **fail** even when the resulting count is 1. |
| 27g | Inspect `inbound_events` | Every delivery persisted as a raw row (WF-INT-01 step 3 precedes step 4). Persistence is not deduped; **processing** is. |
| 27h | Redeliver `order.placed` to `kitchen` | One KOT per order+station. No second ticket — the dish is not cooked twice. |
| 27i | Redeliver `order.placed` to `inventory` | No double deduction; `stock_movements` carries the source event ID. |
| 27j | Redeliver `order.placed` to `reporting` | Totals unchanged; summaries recomputed, not incremented. |
| 27k | Replay from the persisted raw event after a manual fix | No second order (WF-INT-03 replay safety). |
| 27l | Duplicate with an invalid signature | 401 **before** dedupe logic runs. Authentication precedes idempotency. |
| 27m | Duplicate naming a different outlet than the channel account's mapping | Refused or bound to the mapped outlet — see TST-SEC-07. |
| 27n | Kill the process between raw persistence and order creation, then redeliver | Recovers to exactly one order. A crash window must not produce zero orders or two. |

**Pass criteria (all must hold):**

1. Order count for the `external_order_id` is exactly 1 in every variant, including 27d and 27n.
2. KOT ticket count is exactly one per station; stock movement count is exactly one per ingredient.
3. Duplicate responses are **success** responses carrying the original identifiers — a duplicate is a normal condition, not an error.
4. The enforcement is a database unique constraint. Evidence required: the constraint exists, and the concurrent losers fail on it.
5. No duplicate path bypasses signature verification.
6. Every duplicate delivery is logged with the correlation ID, so retry storms are observable.

**Fail signature:** a green test with application-level dedupe. It passes under test concurrency and fails at 60 orders/min when two workers interleave. Assert the constraint, not just the count.

**Cross-reference:** [`e2e-scenarios.md`](./e2e-scenarios.md) TST-E2E-07 covers the functional half; this case covers the adversarial and concurrency half.

### TST-SEC-28 — Forged aggregator webhook

**Proves:** signature verification plus source IP allowlist (threat model row 1).
**Method:** unsigned; signed with a wrong key; signed with another channel account's key; valid signature from a non-allowlisted IP; allowlisted IP with no signature; signature over a truncated body; downgraded/absent signature algorithm; `X-Forwarded-For` spoofing to appear allowlisted.
**Pass:** 401 for all, logged and alerted. **Both** controls are required — neither alone is sufficient. No order created, no KOT, no raw event processed (though the raw delivery may be recorded for forensics).

---

## Coverage Summary

| Area | Cases |
|---|---|
| Authorization matrix & outlet scoping | TST-SEC-01..08 |
| OWASP Top 10 | TST-SEC-09..20 |
| Idempotency abuse & replay | TST-SEC-21..22 |
| Rate limiting | TST-SEC-23 |
| Audit-log completeness | TST-SEC-24..25 |
| Secrets & PII | TST-SEC-26 |
| Webhook duplication & forgery | TST-SEC-27..28 |

**Exit gate:** all 28 green, zero open critical/high security defects, VAPT complete and remediated, dependency scan clean at high/critical.
