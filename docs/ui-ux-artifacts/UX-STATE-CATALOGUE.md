# UX-STA — State Catalogue

**ID:** UX-STA · **Status:** APPROVED · **Owner:** UX · **Version:** 1.0 · **Updated:** 2026-08-09
**Traces to:** ENGINEERING-PROTOCOL §5 · **Traced by:** every `UX-SCR-*`, every component test

---

## The Six Mandatory States

Every screen and every data-bound component implements all six. A screen missing any of them is not `SPECIFIED` and cannot pass CP-01.

| # | State | Trigger | Requirement |
|---|-------|---------|-------------|
| 1 | **Empty** | Query succeeded, zero results | Explain why it is empty and what to do next. Never a blank panel. |
| 2 | **Loading** | Request in flight | Skeleton over spinner where layout is known. Never a layout jump on arrival. |
| 3 | **Success** | Data present | — |
| 4 | **Validation error** | Client or server rejected input | Field-level, next to the field, states how to fix it |
| 5 | **Server error** | 5xx, timeout, network | Retry control + correlation ID. Never lose user input. |
| 6 | **Permission denied** | 403 | State that access is denied and who to ask. Never a blank screen or a silent redirect. |

---

## State Details

### 1. Empty

| Case | Message pattern |
|------|----------------|
| No orders yet today | "No orders yet. Orders appear here as they're placed." |
| Filter matches nothing | "No orders match these filters." + clear-filters action |
| Feature not configured | "No kitchen stations configured." + link to configuration (if permitted) |

Distinguish **"nothing exists yet"** from **"your filter hid everything."** They need opposite actions and confusing them wastes real time during service.

### 2. Loading

- Skeleton matching final layout where the shape is known
- Spinner only for indeterminate short waits
- Optimistic update where safe (KOT item done); **never** optimistic for money
- Slow request (>3 s): say so rather than appearing frozen

### 4. Validation Error

- Inline, adjacent to the field, not a summary at the top
- Says how to fix it: "Quantity must be 1-99", not "Invalid input"
- Server codes localize from `code`, never display the raw `message` (which is written for operators — see [`../06-api/api-standards.md`](../06-api/api-standards.md))
- Never clear other fields on a validation failure

### 5. Server Error

- Retry control, always
- Correlation ID displayed and copyable — this is what makes a support call solvable
- **Preserve user input.** A 12-item cart lost to a network blip is unacceptable.
- Never expose a stack trace or SQL text

### 6. Permission Denied

- Explicit: "You don't have permission to cancel orders. Ask an outlet manager."
- Where an elevation flow exists (manager override), offer it
- Do not pretend the feature does not exist — an operator who cannot find a button they were trained on will assume the system is broken

---

## POS-Specific States

Beyond the six:

| State | Trigger | Requirement |
|-------|---------|-------------|
| **Offline / degraded** | Network lost | **Honest.** Say what will and will not save. Provisional per DEC-002. |
| **Sync pending** | Queued write not confirmed | Visible per-item, not a global banner |
| **Sync failed** | Write rejected after retries | Blocking, actionable, never silently dropped |
| **Elevation required** | Action needs manager approval | Inline approval prompt, not a dead-end |
| **Printer unavailable** | Hardware failure | Warning; order flow continues (`WF-KOT-01`) |

**The offline state is the most dangerous UI in the system.** An operator who believes an order saved when it did not will serve food that was never recorded. Whatever DEC-002 decides, this state must never be ambiguous.

---

## Anti-Patterns

| Do not | Because |
|--------|---------|
| Show a blank panel while loading | Indistinguishable from an empty result or a crash |
| Use a toast for a blocking error | Toasts disappear; the operator missed it and moved on |
| Silently retry a payment | Double capture |
| Hide a permission-denied action with no explanation | Operator assumes the system is broken |
| Reset a form on server error | Punishes the user for our failure |
| Use colour alone for status | Fails for colour-blind users and in kitchen glare |

---

## Test Requirement

Per ENGINEERING-PROTOCOL §5, every UI component ships with tests covering all six states. Storybook stories double as the visual spec — one story per state, named for the state.
