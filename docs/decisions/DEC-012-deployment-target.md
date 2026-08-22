# DEC-012: Deployment Target — Cloud Provider, Region, Orchestration

**ID:** DEC-012
**Status:** OPEN
**Owner:** IT
**Raised by:** Solution Architect
**Due:** Week 3
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** Phase 0 decision register, [`../ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §4
**Traced by:** `infra/`, `DEP-INT-*`, CI/CD pipeline, DR plan, DEC-011 segmentation requirement

---

## Question

Which cloud provider, which region, and which compute model (managed containers vs self-managed Kubernetes vs managed PaaS) does the platform deploy to for R1?

## Context

The application is a **modular monolith** — one deployable, domain modules in `services/` owning their own tables, no cross-module table reads (protocol §4). That boundary exists so modules can be extracted later; it does *not* mean we need microservice-grade orchestration on day one. R1 is a single deployable plus PostgreSQL plus a queue plus object storage.

Forces:

- **Data residency.** Customer PII under DPDP and statutory financial records point strongly at an India region. This is not settled until DEC-011 and DEC-010 land, but choosing a non-India region and reversing it means a live database migration with downtime across every outlet.
- **DEC-011 dependency.** If PCI scope lands wider than SAQ-A, network segmentation becomes a hard requirement and pushes toward a model with first-class network policy. At SAQ-A this constraint disappears.
- **DEC-002 dependency.** If offline POS is required, the edge story (sync endpoints, conflict resolution) matters more than the orchestration story.
- **Team size.** Kubernetes is an operating-model decision, not a technology one. Running it is roughly a permanent 0.5-1.0 FTE unless it is fully managed and kept boring.
- Nothing about the application code changes between these options if we keep it twelve-factor. What changes is who is on call and for what.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Managed container service, India region, managed PostgreSQL.** (AWS ECS Fargate + RDS, or equivalent on Azure/GCP.) No cluster to operate. Multi-AZ database, object storage for invoice documents. | Lowest ops burden; ~10 person-days to stand up; steady-state infra cost lowest of the three | Vendor-specific service definitions; a later move to another provider means rewriting deployment config (not application code). Limited fine-grained network policy if PCI scope widens | Mostly — application is portable; infra-as-code is not |
| B | **Managed Kubernetes, India region.** (EKS/AKS/GKE + managed PostgreSQL.) Cluster we configure, control plane we do not. | ~25-30 person-days to stand up properly (ingress, secrets, autoscaling, observability, upgrade runbook); ongoing 0.5 FTE minimum | Real risk of the platform team spending R1 on cluster work instead of product. Upgrade cadence is a recurring, non-negotiable obligation. Justified only if we expect actual service extraction within 12-18 months | Yes, but sunk effort is not recovered |
| C | **Self-managed Kubernetes or VMs, on-premise / colocation.** | Highest — hardware, network, patching, backup, physical security; ~60+ person-days plus recurring | Only defensible if a residency or contractual requirement forbids public cloud. Introduces DR as a fully self-owned problem. Restaurant POS uptime expectations against a self-run DR plan is a poor trade | No, practically |
| D | **Defer to Week 6; develop against Docker Compose locally.** | Zero now | CI/CD, secrets management, environment parity and the DEC-011 segmentation question all stall. Teams build local-only assumptions that surface as integration defects later. Deferral is cheap for ~2-3 weeks and expensive after that | Yes, while nothing is deployed |

## Impact If Wrong

- **Wrong region:** a residency finding after go-live requires migrating a live PostgreSQL instance holding statutory invoices and every outlet's operational data across regions. That is a scheduled outage during which no outlet can bill, plus a re-point of every integration endpoint the aggregators and gateway hold on their side (partner-side changes have multi-week lead times per RSK-11).
- **Kubernetes chosen without the need:** R1 delivery slips by the ~25-30 days of setup plus the ongoing drag, and the first production incident is a cluster incident rather than an application one — meaning the people who can fix it are the two who understand the ingress config, not the team.
- **Managed-container chosen when segmentation was required:** if DEC-011 lands at wider PCI scope, the compliance boundary cannot be drawn with the network primitives available, and the platform is re-hosted mid-build.
- **Deferred too long:** invoice document storage, secrets management (Vault or provider-native — the security framework says "Vault / Secrets Manager", which is two different decisions) and backup/PITR configuration all stay unbuilt, and none of them are things to first configure the week before go-live.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| Infrastructure / `infra/` | Everything — IaC, environments, networking, backup policy | 5 |
| CI/CD | Deployment stage of the pipeline; environment promotion; migration execution in shared environments (protocol rule 8) | 3 |
| Security | Secrets management mechanism selection; segmentation design | 2 |
| Finance / documents | Invoice document storage target and retention tiering (interacts with DEC-010 cold storage) | 1 |
| Operations | Runbook, DR/RTO/RPO targets, monitoring stack | 2 |

## Recommendation

**Option A — managed container service in an India region, managed PostgreSQL with multi-AZ and PITR — conditional on DEC-011 landing at minimal PCI scope.**

Reasoning:

- The architecture is one deployable. Kubernetes solves problems we do not currently have, and its costs (setup, upgrades, on-call expertise) are recurring and paid in R1 delivery time. If service extraction happens later, the module boundary in protocol §4 is what makes it possible — not the orchestrator we chose two years earlier.
- Region is the one genuinely irreversible element here and should be settled even if the compute model is left open for another sprint. Pick India now; there is no scenario where it is the wrong answer and several where anything else is.
- Managed PostgreSQL is worth insisting on: the gapless invoice-numbering design in [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) depends on transactional correctness and reliable PITR. Self-managing that database is uncompensated risk.
- If DEC-011 lands wider, revisit *this* packet rather than working around it — a compliance boundary drawn on the wrong primitives is worse than a later migration.

IT owns provider selection, including any existing enterprise agreement or credit arrangement that engineering has no visibility into and that may legitimately override all of the above.

---

## Decision

**Decided:**
**Rationale:**
**Approved by:**
**Date:**

## Consequences

*To be completed on sign-off. Anticipated:*

- Fixes the region for the life of the data. Region changes after production data exists are outage events, not migrations.
- Determines the secrets management mechanism, and therefore how every service reads configuration.
- Sets DR capability: RTO/RPO become functions of the managed database tier chosen, and quoting a recovery objective to the business commits to that tier's cost.
- Provider-specific IaC is written once; a later provider change discards it. The application code stays portable only if we resist provider-native application services (queues, functions) in favour of portable equivalents — an explicit ongoing discipline, not a default.

## Follow-Up

- [ ] ADR raised (structural): ADR-NNNN — deployment topology and environment model
- [ ] [`DECISION-LOG.md`](DECISION-LOG.md) updated
- [ ] Downstream artifacts updated: `infra/`, `DEP-INT-*`, [`../12-operations/runbook.md`](../12-operations/runbook.md)
- [ ] RTO/RPO targets agreed with Ops and written into the runbook
- [ ] Backup and PITR verified by an actual restore test, not by configuration review
- [ ] Cross-check against DEC-011 segmentation outcome and DEC-002 offline outcome
- [ ] Affected teams notified: Engineering, Security, Ops
- [ ] Estimate re-baselined if scope changed
