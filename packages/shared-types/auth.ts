// Contract shared by services/auth core and every consumer (apps/api middleware,
// other services doing permission checks). DEC-011 (approved): server-side JWT
// claims mapping roles to permissions, HTTPS transit, DB audit logs.

export interface JwtClaims {
  sub: string; // user id
  outletIds: string[]; // outlets this token's session is scoped to
  sessionId: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  outletId: string; // active outlet for this request, resolved from session — never from request body (threat model: security-framework.md)
}

// Permission action strings follow "<resource>.<verb>" (e.g. "order.create"),
// per the Permission model's own comment in kapmeta/schema.prisma.
export type PermissionAction = string;

export interface PermissionCheck {
  userId: string;
  outletId: string;
  action: PermissionAction;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string; // populated on denial, for audit logging
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO timestamp
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  ok: true;
  user: AuthenticatedUser;
  tokens: TokenPair;
}

export interface LoginFailure {
  ok: false;
  reason: "INVALID_CREDENTIALS" | "USER_INACTIVE" | "NO_OUTLET_ACCESS";
}
