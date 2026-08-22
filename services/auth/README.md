# auth

Users, roles, permissions, sessions, MFA. Owns AuthZ evaluation. Publishes user.role_changed.

Per DEC-011 (approved): server-side JWT claims mapping roles to permissions, outlet-scoped RBAC, DB audit logs on critical tables.

## What's built

- `src/password.ts` — bcrypt hash/verify (12 salt rounds).
- `src/jwt.ts` — access-token sign/verify (JWT, secret passed by caller, never read from env here), opaque refresh-token generation.
- `src/session-store.ts` — `PrismaSessionStore` against `Session` model; expired sessions treated as not-found.
- `src/rbac.ts` — `PrismaRbacChecker.checkPermission` resolves `UserRole → Role → RolePermission → Permission` for an outlet-scoped action string; `requirePermission` throw-on-deny helper.
- `src/prisma-user-repository.ts` — `PrismaUserRepository.verifyCredentials` (login, enumeration-safe on not-found vs wrong-password), `createUser`, `findByEmail`.

## What's NOT built

- HTTP entrypoint (login/refresh/logout routes) — `apps/api` exists (`apps/api/src/index.ts`, Express bootstrap) but auth routes aren't wired into it yet.
- MFA (per source doc: "MFA for administrative accounts where supported").
- Secret-manager wiring for the JWT signing secret — currently a caller-supplied parameter, no default source.
- Seeding of `Role`/`Permission`/`RolePermission` rows matching the RBAC matrix in `docs/08-security/security-framework.md` — the matrix is approved but not yet loaded as data (`kapmeta/seed.ts` predates this table's approval, needs a pass).

See docs/03-architecture/high-level-design.md for module boundaries.
