# User Story: <ID> — <Title>

**Module:** <menu | orders | kitchen | finance | …>
**Source trace:** <source page N | DEC-NNN | new>
**Priority:** Critical | High | Medium | Low

## Story

As a **<role>**, I want **<capability>**, so that **<outcome>**.

## Acceptance Criteria

```gherkin
Scenario: <name>
  Given <precondition>
  When <action>
  Then <observable result>
```

## Rules & Validation

| Field | Type | Required | Validation |
|-------|------|----------|------------|

## Permissions

Which roles may perform this. Outlet scoping. Audit requirement (yes/no + what is recorded).

## UI States

Empty · loading · success · validation error · server error · permission denied.

## Non-Functional

Latency target · concurrency · offline behavior (per DEC-002).

## Dependencies

Blocked by: <story / decision IDs>

## Definition of Ready checklist

See `docs/00-governance/definition-of-ready-done.md`.
