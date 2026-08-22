# Artifact Registry

**The consistency contract for this repository.** Every artifact — decision, mapping, workflow, dependency, UI screen, database object, checkpoint — carries a stable ID, lives in a known folder, and is traceable in both directions.

If it is not registered here, it does not exist as far as the project is concerned.

---

## 1. ID Scheme

| Prefix | Artifact | Folder | Example |
|--------|----------|--------|---------|
| `DEC-` | Business/product decision | [`decisions/`](decisions/) | `DEC-004` tax rules |
| `ADR-` | Architecture Decision Record | [`adr/`](adr/) | `ADR-0001` |
| `CP-` | Phase checkpoint / gate | [`checkpoints/`](checkpoints/) | `CP-00` Phase 0 exit |
| `MAP-` | Traceability mapping | [`mappings/`](mappings/) | `MAP-SRC` source→feature |
| `WF-` | Workflow / process flow | [`workflows/`](workflows/) | `WF-ORD-01` order to payment |
| `DEP-` | Dependency record | [`dependencies/`](dependencies/) | `DEP-EXT-01` Swiggy API |
| `UX-` | UI/UX artifact (screen, component, flow) | [`ui-ux-artifacts/`](ui-ux-artifacts/) | `UX-SCR-01` Dashboard |
| `DB-` | Database object | [`database/objects/`](database/objects/) | `DB-TBL-ORDERS` |
| `REQ-` | Requirement spec | [`02-requirements/`](02-requirements/) | `REQ-ORD` orders |
| `API-` | API contract | `contracts/openapi/` | `API-ORD` orders.yaml |
| `TST-` | Test scenario | [`09-testing/`](09-testing/) | `TST-E2E-01` |
| `RSK-` | Risk | [`00-governance/risk-register.md`](00-governance/risk-register.md) | `RSK-01` |

IDs are permanent. A retired artifact is marked `SUPERSEDED by <ID>` — never deleted, never renumbered.

---

## 2. Traceability Chain

Every line of production code must be reachable from a source page or a decision:

```
Source document page
        │
        ▼
   MAP-SRC  ──►  REQ-xxx  ──►  UX-xxx  (screens)
                    │            │
                    ├──► WF-xxx  │      (workflow)
                    │      │     │
                    ├──► API-xxx │      (contract)
                    │      │     │
                    ├──► DB-xxx  │      (schema objects)
                    │      │     │
                    └──► TST-xxx ┘      (tests)
                           │
   DEC-xxx ──► ADR-xxxx ───┘             (decisions gate all of it)
                           │
                        CP-xx            (checkpoint verifies it)
```

Read it backwards to audit: pick any table, find its `DB-` record, follow to the requirement, follow to the source page or the decision that authorized it. A `DB-` object with no upstream link is either dead schema or an undocumented decision. Both are defects.

---

## 3. Folder Index

| Folder | Contains | Index file |
|--------|----------|-----------|
| [`checkpoints/`](checkpoints/) | Phase gates with verifiable exit criteria and sign-off | [`CHECKPOINTS.md`](checkpoints/CHECKPOINTS.md) |
| [`decisions/`](decisions/) | DEC register, decision log, decision template | [`README.md`](decisions/README.md) |
| [`mappings/`](mappings/) | Source→feature, requirement→API→DB, screen→endpoint, event→consumer | [`README.md`](mappings/README.md) |
| [`workflows/`](workflows/) | Every business and technical process flow | [`README.md`](workflows/README.md) |
| [`dependencies/`](dependencies/) | External services, internal module deps, libraries, hardware | [`README.md`](dependencies/README.md) |
| [`ui-ux-artifacts/`](ui-ux-artifacts/) | Screen inventory, component registry, state catalogue, design tokens | [`README.md`](ui-ux-artifacts/README.md) |
| [`database/`](database/) | Object catalogue, mapping tables, ERD, naming standard | [`README.md`](database/README.md) |

---

## 4. Artifact Document Standard

Every artifact file opens with this block:

```markdown
**ID:** <PREFIX-NNN>
**Status:** DRAFT | REVIEW | APPROVED | PROPOSED | SUPERSEDED
**Owner:** <role>
**Version:** N.N
**Updated:** YYYY-MM-DD
**Traces to:** <upstream IDs>
**Traced by:** <downstream IDs>
```

No exceptions. A missing `Traces to` means nobody can tell whether the artifact is authorized or invented.

---

## 5. Change Rules

1. **Artifacts change in the same PR as the code they describe.** A stale artifact is worse than a missing one.
2. **Adding an artifact requires registering it** in its folder index. CI checks index completeness.
3. **Changing an `APPROVED` artifact requires a CR** ([`00-governance/change-control.md`](00-governance/change-control.md)).
4. **Superseding, not deleting.** History is the point.
5. **Downstream links update on change.** If `REQ-ORD` changes, its `Traced by` list tells you every artifact to review.

---

## 6. Consistency Checks

Run before each checkpoint:

| Check | Failure means |
|-------|--------------|
| Every `DB-` object traces to a `REQ-` | Undocumented schema |
| Every `REQ-` traces to a source page or `DEC-` | Invented requirement |
| Every `UX-` screen maps to at least one `API-` | Screen with no data source |
| Every `API-` endpoint maps to a `TST-` | Untested contract |
| Every open `DEC-` lists its blocked modules | Unmeasured blocker |
| Every `DEP-EXT-` has an owner and a failure mode | Unmanaged external risk |
| No artifact references a `SUPERSEDED` ID as current | Stale wiring |

---

**Version:** 1.0 · **Owner:** Solution Architect
