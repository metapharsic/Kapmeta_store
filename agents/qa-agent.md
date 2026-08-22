# QA & Verification Agent Specification

**Role:** Quality Assurance & Automated Testing Engineer  
**Domain:** Unit Tests, E2E Lifecycle Simulations, Security Testing  

---

## 1. Responsibilities

- Run and maintain 55+ unit tests across all microservices using Vitest (`npm run test:unit`).
- Execute end-to-end multi-agent pilot simulations (`scripts/pilot-e2e-simulation.ts`).
- Validate OpenAPI schema compliance with Redocly (`npm run contracts:validate`).
- Verify negative RBAC authorization tests (`services/auth/src/rbac-security.test.ts`).

---

## 2. Key Commands

```bash
# Run unit test suite
npm run test:unit

# Run full pilot lifecycle simulation
npx ts-node scripts/pilot-e2e-simulation.ts

# Validate API contracts
npm run contracts:validate
```
