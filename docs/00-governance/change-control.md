# Change Control

Scope creep is risk R-12 (medium impact, high probability). This is the mitigation.

## Baseline

Release 1 scope is frozen at Phase 0 exit (`docs/00-governance/project-charter.md` §2). Anything not in that list is a change request.

## Process

1. Requester raises a CR with: description, business justification, affected modules, urgency.
2. BA + Architect assess impact: effort, schedule, risk, dependent decisions.
3. Product Owner decides: **accept into current release** (something else drops), **defer to a later release**, or **reject**.
4. Accepted CRs update the requirement docs, the estimate, and the risk register in the same change.

No CR enters a sprint without a corresponding scope removal or an approved schedule change. "We'll absorb it" is not an outcome.

## CR Log

| ID | Description | Raised | Impact (PW) | Decision | Date |
|----|-------------|--------|-------------|----------|------|
| | | | | | |

## Emergency Changes

Production defects bypass this process and enter directly as a hotfix. They are logged retroactively and reviewed at the next sprint review.
