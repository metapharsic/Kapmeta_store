# Glossary

Shared vocabulary. Use these terms exactly — in code, tickets, and conversation.

## Organization

| Term | Meaning |
|------|---------|
| **Organization** | The business entity. Owns one or more outlets. |
| **Outlet** | A single restaurant location. The scoping boundary for nearly all data and permissions. |
| **Terminal** | A physical POS device registered to an outlet. |
| **Station** | A kitchen prep point (tandoor, chinese, beverages). KOT tickets route to stations. |
| **Business day** | Trading day, starting at the outlet's configured `day_start_time` — **not** calendar midnight. A 1 a.m. order belongs to the previous business day. |

## Catalog

| Term | Meaning |
|------|---------|
| **Category** | A menu grouping (Breakfast, Biryani, Desserts). |
| **Item** | A sellable menu product. |
| **Variant** | A size/portion of an item (Half / Full). Has its own price. |
| **Modifier** | An add-on or option (extra cheese, no onion), grouped with min/max selection rules. |
| **Availability** | Whether an item can be ordered — held per `(item, channel)`, not globally. |
| **ON / OFF** | Item orderable / not orderable on a channel. OFF blocks new orders; existing orders stay valid. |
| **Partial Changes** | Local state has not fully propagated — some channels synced, some not. |
| **Unscheduled** | No active availability schedule rule for the item. |

## Orders

| Term | Meaning |
|------|---------|
| **Order** | A customer's purchase transaction. |
| **Order type** | `DINE_IN` / `PICKUP` / `DELIVERY`. Determines required fields and fulfillment path. |
| **Channel** | Where the order came from: POS, or an aggregator (Swiggy, Zomato). Distinct from order type. |
| **Status history** | Append-only record of every state transition. Statuses are never overwritten in place. |
| **Void** | Cancelling a line before it reaches the kitchen. |
| **Cancellation** | Cancelling after KOT. Requires elevated permission, a reason code, and an audit row. |
| **Refund** | Returning money for a completed order. Reports against the **original** business day. |

## Kitchen

| Term | Meaning |
|------|---------|
| **KOT** | Kitchen Order Ticket. The unit of work sent to one station. One order can produce several KOTs. |
| **Delta / amendment ticket** | A follow-up ticket for items added or changed after the original KOT. Never a silent replacement. |
| **Reprint** | Re-issuing an existing ticket. Increments a counter, writes an audit row, never creates a new ticket. |

## Money

| Term | Meaning |
|------|---------|
| **Minor units** | Integer smallest currency denomination (paise). All money is stored this way. |
| **Gross sales** | Sum of completed order totals. |
| **Net sales** | Gross − discounts − refunds. Tax treatment pending DEC-009. |
| **AOV** | Average Order Value: net sales ÷ order count. |
| **Capture** | Taking payment. |
| **Settlement** | The channel or gateway actually transferring funds, usually days later. |
| **Reconciliation** | Matching external settlement records against internal orders and payments. Produces an exception report, never an automatic adjustment. |

## Integration

| Term | Meaning |
|------|---------|
| **Aggregator** | A third-party ordering platform (Swiggy, Zomato). |
| **Adapter** | Per-channel code isolating that channel's API from domain modules. |
| **Inbound event** | A raw webhook/poll payload, persisted before processing so it stays replayable. |
| **Idempotency key** | Client- or channel-supplied token guaranteeing a retry does not create a second record. |
| **Correlation ID** | ID propagated across HTTP, queue, and logs to trace one operation end to end. |
| **DLQ** | Dead-letter queue: where repeatedly failing messages go for manual handling. |
| **Mapping** | The link between an external channel item ID and an internal menu item. |

## Process

| Term | Meaning |
|------|---------|
| **DEC-xxx** | A Phase 0 decision. Open DECs block the modules that depend on them. |
| **ADR** | Architecture Decision Record — a written structural decision in `adr/`. |
| **DoR / DoD** | Definition of Ready / Done. Gates for entering and closing a story. |
| **CR** | Change Request — the only route for adding scope after baseline. |
| **Hypercare** | Intensive monitoring immediately after a rollout wave. |
| **VAPT** | Vulnerability Assessment and Penetration Testing. Mandatory before go-live. |

## Easily Confused

| Not the same | Difference |
|--------------|-----------|
| Order type vs channel | A delivery order can come from POS **or** Swiggy. Type is fulfillment; channel is origin. |
| Void vs cancellation | Void is pre-kitchen. Cancellation is post-KOT and needs permission + reason. |
| Capture vs settlement | Capture is now; settlement is when money actually lands. |
| Item OFF vs unscheduled | OFF is a deliberate block. Unscheduled means no schedule rule exists. |
| KOT vs order | One order, potentially many KOTs — one per station. |
