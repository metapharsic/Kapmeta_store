# ADR-0006: Record Architecture Decisions

**Status:** Accepted · **Date:** 2026-08-08

## Context

The project has ~40% undefined requirements and twelve open Phase 0 decisions. Structural choices made informally will be re-litigated for months.

## Decision

Every structural decision gets an ADR in `docs/adr/`, numbered sequentially, using `docs/templates/adr-template.md`. Schema changes and API contract changes require an ADR merged before implementation.

An approved Phase 0 decision (DEC-xxx) that has architectural consequence gets a corresponding ADR recording how it is implemented.

## Consequences

- Decision history survives team turnover
- Slight overhead per structural change; none for routine work
- Reviewers can reject a PR for missing an ADR
