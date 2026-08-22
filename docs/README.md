# Documentation

## 👉 New here? Read [`START-HERE.md`](START-HERE.md) first.

It gives the system overview, the reading order for your role, what is blocked and by what, and the checklist you complete before writing code.

---

## Entry-Point Documents

| Doc | Read it when |
|-----|-------------|
| [`START-HERE.md`](START-HERE.md) | Day 1. Before anything else. |
| [`ENGINEERING-PROTOCOL.md`](ENGINEERING-PROTOCOL.md) | Before your first PR. The rules for shipping code here. |
| [`ONBOARDING.md`](ONBOARDING.md) | Day 1-5. Setup, first order trace, first contribution. |
| [`MODULE-MAP.md`](MODULE-MAP.md) | "Where does my module live and what blocks it?" |
| [`GLOSSARY.md`](GLOSSARY.md) | Any time a domain term is ambiguous. |
| [`FAQ.md`](FAQ.md) | "Why is it done this way?" |

---

## Artifact Folders

Governed by [`ARTIFACT-REGISTRY.md`](ARTIFACT-REGISTRY.md) — the ID scheme and traceability contract.

| Folder | Contains | Index |
|--------|----------|-------|
| [`checkpoints/`](checkpoints/) | `CP-` phase gates with verifiable exit criteria | [CHECKPOINTS.md](checkpoints/CHECKPOINTS.md) |
| [`decisions/`](decisions/) | `DEC-` register, live log, template | [DECISION-LOG.md](decisions/DECISION-LOG.md) |
| [`mappings/`](mappings/) | `MAP-` source→feature, req→impl, screen→endpoint, event→consumer | [README](mappings/README.md) |
| [`workflows/`](workflows/) | `WF-` every business and technical process | [README](workflows/README.md) |
| [`dependencies/`](dependencies/) | `DEP-` external, internal, technical | [README](dependencies/README.md) |
| [`ui-ux-artifacts/`](ui-ux-artifacts/) | `UX-` screens, components, states, tokens | [README](ui-ux-artifacts/README.md) |
| [`database/`](database/) | `DB-` object catalogue, mapping tables, ERD, naming | [README](database/README.md) |

## Phase Documentation

| Folder | Contents | Owner |
|--------|----------|-------|
| [`00-governance`](00-governance/) | Charter, RACI, DoR/DoD, risk register, change control, estimates | Product Owner |
| [`01-discovery`](01-discovery/) | Decision register, gap analysis, source traceability | BA |
| [`02-requirements`](02-requirements/) | Functional specs per module, stories, acceptance criteria | BA |
| [`03-architecture`](03-architecture/) | HLD, tech stack, module boundaries, NFRs | Solution Architect |
| [`04-design`](04-design/) | Design system, screen inventory, interaction states | UX |
| [`05-database`](05-database/) | Schema reference, design rules, constraints, partitioning | DBA |
| [`06-api`](06-api/) | API standards, versioning, error model, idempotency | Backend Lead |
| [`07-integration`](07-integration/) | Aggregator/payment/printer adapters, retry, reconciliation | Integration Lead |
| [`08-security`](08-security/) | RBAC matrix, threat model, audit logging, compliance | Security |
| [`09-testing`](09-testing/) | Test strategy, coverage matrix, E2E scenarios, UAT | QA Lead |
| [`10-devops`](10-devops/) | Environments, CI/CD, observability, backup/DR | DevOps |
| [`11-rollout`](11-rollout/) | Pilot plan, waves, training, rollback, go-live | PMO |
| [`12-operations`](12-operations/) | Runbook, SLOs, incident response, [logging standard](12-operations/LOGGING-STANDARD.md), [**troubleshooting**](12-operations/troubleshooting/) | SRE |
| [`adr`](adr/) | Architecture Decision Records | Architect |
| [`templates`](templates/) | ADR, user story templates | All |

---

## Document Rules

1. Every doc carries **Owner**, **Status** (`DRAFT` / `REVIEW` / `APPROVED` / `PROPOSED`), **Version**, **Last Updated**.
2. `DECISION REQUIRED` or `PROPOSED` blocks development on that item. Escalate; do not guess.
3. Requirements trace to a source page or to a Phase 0 decision ID.
4. Schema and API contract changes need a merged ADR before implementation.
5. Docs change in the same PR as the code they describe. A doc that lies is worse than no doc.
