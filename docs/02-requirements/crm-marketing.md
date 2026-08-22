# CRM & Marketing — Functional Spec

**Source:** navigation bar only · **Coverage:** 0% · **Status:** DRAFT · **Blocks on:** DEC-009, DEC-010, DEC-011

The source document exposes a CRM entry in the navigation bar and nothing else. Every requirement below is **PROPOSED** — none of it is evidenced. Release scope **R3**. Treat this file as a proposal to be confirmed, not as captured requirements.

Tables owned by this module: `customers`, `customer_addresses`, `customer_tags`, `loyalty_accounts`.

## Customer Identity

Phone number is the primary identifier. Email is optional and non-unique in practice (shared family accounts, aggregator placeholder addresses).

| Field | Rule |
|-------|------|
| `phone` | E.164, normalized on write. Unique per organization — **not** per outlet (DEC-001) |
| `email` | Optional, lowercased, not unique |
| `name` | Optional. POS operators frequently skip it; the record must be valid without it |
| `outlet_id` | First-seen outlet. Does **not** scope visibility — see below |

Customer records are organization-scoped, orders are outlet-scoped. If DEC-001 lands on single-outlet, this distinction collapses and the merge rules below become dead code. Do not implement ahead of DEC-001.

Aggregator orders arrive with masked or proxy phone numbers. Those must be stored as channel-local identities and **never** normalized into the organization customer index — a proxy number is recycled across customers and would merge unrelated people.

### Deduplication & Merge

```
Inbound customer identity
        ↓
Normalize phone (E.164) → exact match on phone?
        ↓ yes                          ↓ no
Attach to existing customer      Create customer
        ↓
Conflicting name/email? → record on profile, do not overwrite silently
```

Merge rules when two records are confirmed to be the same person:

| Aspect | Rule |
|--------|------|
| Trigger | Manual, by an authorized user. No automatic merge on fuzzy name/email similarity |
| Direction | Survivor is the older `customer_id`; loser is soft-deleted with `merged_into_id` |
| Orders | Re-pointed to the survivor. Order history is never rewritten, only re-parented |
| Addresses / tags | Union. Duplicate addresses deduplicated by normalized text + geo |
| Loyalty | Balances summed. Requires an explicit adjustment ledger row per source account, not a silent balance write |
| Audit | One audit row per merge, in the same transaction, per [`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) rule 7 |
| Reversal | Not supported. Merge is one-way; a wrong merge is corrected by manual data fix under change control |

Merge is a privileged action. It rewrites the ownership of financial history and must be restricted to Outlet Manager and above.

## Customer Profile & Order History

Profile view aggregates, per customer:

- Contact details, consent flags, tags, loyalty balance
- Saved addresses (`customer_addresses`), with a default per order type
- Order history: date, outlet, channel, order type, item lines, total, status
- Derived metrics (see [CRM KPIs](#crm-kpis))

Order history is read through the Orders module API. **No direct reads of order tables** — module boundary per protocol §4. History includes cancelled and refunded orders, flagged as such; hiding them makes lifetime value silently wrong.

Order history is filtered by the outlets the requesting session is granted. A Super Admin sees the full history; an Outlet Manager sees only their outlet's orders on the same customer record.

## Segmentation & Tags

`customer_tags` holds two kinds of tag:

| Type | Assigned by | Example | Recomputed |
|------|-------------|---------|------------|
| Manual | User | `vip`, `complaint-open`, `corporate` | Never |
| Derived | System rule | `lapsed-90d`, `high-frequency`, `first-order` | On a schedule; rule version stored with the tag |

A segment is a saved query over customer attributes, tags and order-derived metrics. Segments are evaluated at send time, not at save time — a campaign targets who qualifies now, not who qualified when the segment was authored. Segment size must be shown before a campaign can be scheduled.

Derived tag rules depend on the KPI formulas in DEC-009. Until those are signed off, derived tags are not implementable without guessing.

## Loyalty Models

All four models below are candidates. **None is selected.** This is a decision gap — it needs a new DEC row; it is not covered by any existing one.

| Model | Mechanic | Pros | Cons | Ledger complexity |
|-------|----------|------|------|-------------------|
| **Points** | Earn N points per currency unit, redeem against bill | Familiar; fine-grained; partial redemption | Points are a financial liability that must be reported; expiry policy required; redemption interacts with tax and discount stacking (DEC-004, DEC-008) | High — append-only ledger, balance never stored as a mutable scalar |
| **Visits** | Nth visit free / discounted | Trivial to explain; no liability valuation | Gameable by splitting bills; no relation to spend; weak for high-AOV outlets | Low |
| **Tiered** | Silver/Gold/Platinum from rolling spend, tier grants benefits | Drives frequency at the top end; no direct liability | Tier demotion is a customer-relations problem; needs a rolling window definition (DEC-009) | Medium |
| **Cashback** | Percentage returned as store credit | Directly measurable; simple to communicate | Store credit is a real liability with statutory implications; refund interaction is messy | High |

Constraints that apply whichever model is chosen:

- `loyalty_accounts` holds the account; balance is derived from an append-only ledger. Never `UPDATE balance`.
- Accrual happens on order `COMPLETED`, not on `PLACED`. See the state machine in [`orders.md`](orders.md).
- Refund of an order reverses its accrual against the **original** business day, consistent with the refund rule in [`orders.md`](orders.md).
- Redemption is a discount and therefore routes through the pricing engine, not a separate code path (DEC-008).
- Earn/burn rates are outlet-configurable only if DEC-001 lands multi-outlet.

## Campaigns

| Type | Consent basis | Hard requirements |
|------|---------------|-------------------|
| SMS | Explicit opt-in, stored with timestamp and source | Sender ID and template registration per local telecom regulation; transactional vs promotional classification; quiet hours |
| Email | Explicit opt-in | One-click unsubscribe header; bounce and complaint suppression list |
| Push | Device-level permission + app-level opt-in | Token invalidation handling; no PII in the notification payload |

Non-negotiable:

- **No consent, no send.** Consent is checked at send time per channel, per customer. A stale segment snapshot is not consent.
- **Opt-out is honored within the send pipeline**, not only at the UI. An opt-out recorded mid-campaign suppresses remaining sends.
- Opt-out is per channel, and never expires. Re-opt-in requires a new explicit action.
- Transactional messages (order confirmation, OTP, invoice) are **not** campaigns and are exempt from marketing opt-out. This distinction must be enforced by message class in code, not by convention.
- Every send writes a delivery record: customer, channel, template, provider message ID, status. Message body content is retained per DEC-010; recipient contact details are not written to application logs (protocol rule 10).
- Sends are idempotent per `(campaign_id, customer_id, channel)`. A retried batch must not double-send.

Campaign execution is asynchronous and rate-limited by provider quota. Failure of one recipient never fails the batch.

## Feedback & Ratings

- Capture: post-order prompt (SMS/email link or app), and manual entry by staff for walk-in verbal feedback.
- Payload: rating (integer scale, scale definition pending), optional free text, order reference, outlet, channel.
- Free-text feedback is customer-authored content and may contain PII incidentally. It inherits the same retention and environment rules as the rest of this module.
- Aggregator ratings are read-only mirrors where the aggregator API exposes them. They are not merged into internal averages — different populations, different scales.
- Feedback is never editable after submission. Staff response is a separate linked record.

## CRM KPIs

| KPI | Definition (proposed) | Depends on |
|-----|----------------------|-----------|
| Repeat rate | Customers with ≥2 qualifying orders ÷ customers with ≥1, over a window | Which order states qualify (DEC-009) |
| Order frequency | Qualifying orders ÷ active customers, per period | Definition of "active"; window length (DEC-009) |
| Average spend | Net sales attributable to the customer ÷ qualifying order count | Net sales tax treatment (DEC-009) |
| Lifetime value | Cumulative net sales, less refunds, over the customer's full history | Net sales definition; whether LTV is historic-only or predictive (DEC-009) |

Every number here is a function of the net sales definition, which is **not settled**. Publishing CRM KPIs before DEC-009 is signed off guarantees CRM dashboards disagree with the finance dashboards in [`reporting.md`](reporting.md). Do not build them first and reconcile later.

CRM KPIs must be computed by the same shared pricing/aggregation code as reporting — protocol §4, one place per business rule.

## PII & Consent

Customer data in this module is PII. This is the highest-risk data the platform holds after payment data.

- **Consent** is stored per purpose (marketing SMS, marketing email, push, data retention beyond statutory minimum) with timestamp, source, and the version of the notice accepted. A single global "opted in" boolean is not sufficient.
- **No PII in logs.** Structured logs carry `customer_id` only — never phone, email, name, or address. Protocol rule 10.
- **No PII in lower environments.** Non-production databases use synthetic or irreversibly masked data. Restoring a production dump into staging is prohibited.
- **Access to customer contact details is a distinct permission** (`customers.pii.read`), not implied by `customers.read`. Bulk export is separately permissioned, audited, and rate-limited.
- **Retention** per DEC-010, per entity. Feedback text, delivery records and customer profiles will likely have different periods.
- Encryption at rest for contact columns is expected; the mechanism (column-level vs storage-level) is a DEC-011 output.

### Open issue: erasure vs statutory retention

A right-to-erasure request conflicts directly with the statutory obligation to retain invoices, which contain customer identity. These cannot both be satisfied by deleting the customer row.

The likely resolution is: erase or tokenize the CRM profile, retain the invoice record with the identity fields it is legally required to carry, and break the link between them. That resolution is **not approved**. It is named here so it is not discovered during a live erasure request. Owner: Legal, via DEC-010 and DEC-011.

## Open Decisions

| ID | Blocks |
|----|--------|
| DEC-009 | Every CRM KPI, all derived tags, loyalty accrual windows |
| DEC-010 | Retention per entity; the erasure/invoice conflict above |
| DEC-011 | PII handling obligations, consent model, encryption approach, export controls |
| DEC-001 | Whether customers and loyalty balances are organization-wide or outlet-local |
| DEC-008 | How loyalty redemption stacks with discounts and promotions |
| *new* | **Loyalty model selection.** No existing DEC covers it. Raise one before R3 planning. |
