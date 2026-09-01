# KapMeta POS Platform — State Machines & Transition Rules

**For:** Gemini, Claude & AI Coding Agents  

---

## 1. Order State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Items added to cart
    DRAFT --> CONFIRMED : Send to Kitchen / KOT fired
    CONFIRMED --> PREPARING : Chef accepts ticket on KDS
    PREPARING --> READY : Kitchen marks cooking finished
    READY --> COMPLETED : Bill Settled & Paid
    DRAFT --> CANCELLED : Void before KOT
    CONFIRMED --> CANCELLED : Manager Override + Audit Log
    PREPARING --> CANCELLED : Manager Override + Audit Log + Kitchen Notification
    COMPLETED --> [*]
    CANCELLED --> [*]
```

### Transition Invariants:
1. Moving from `DRAFT` to `CONFIRMED` fires the `order.confirmed` event and creates kitchen tickets.
2. An order cannot transition to `COMPLETED` unless full settlement is recorded in `Payment` equal to `totalAmount`.
3. Any transition to `CANCELLED` from `CONFIRMED` or `PREPARING` requires privileged authorization and writes an `AuditLog` entry in the same transaction.

---

## 2. Kitchen KOT Ticket State Machine

```mermaid
stateDiagram-v2
    [*] --> QUEUED : Order confirmed by cashier
    QUEUED --> PREPARING : Station chef starts cooking
    PREPARING --> READY : Station chef completes cooking
    READY --> SERVED : Waiter delivers order to table
    QUEUED --> CANCELLED : Order cancelled
    PREPARING --> CANCELLED : Order cancelled
    SERVED --> [*]
    CANCELLED --> [*]
```

---

## 3. Dine-In Table State Machine

```mermaid
stateDiagram-v2
    [*] --> VACANT : Initial state / Table cleared
    VACANT --> OCCUPIED : Guest seated / Draft created
    OCCUPIED --> BILLED : Invoice generated / Bill printed
    BILLED --> DIRTY : Payment settled
    DIRTY --> VACANT : Waiter / Busser clears table
```
