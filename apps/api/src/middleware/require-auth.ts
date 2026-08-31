import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, PrismaRbacChecker } from "@kapmeta/auth";
import { prisma } from "../prisma";

const rbac = new PrismaRbacChecker(prisma);

const JWT_SECRET_ENV = process.env.JWT_SECRET;
if (!JWT_SECRET_ENV) {
  throw new Error("JWT_SECRET not set");
}
const JWT_SECRET: string = JWT_SECRET_ENV;

export interface AuthedRequest extends Request {
  auth?: { userId: string; outletId: string };
}

// Verifies the Bearer access token and attaches { userId, outletId } to the
// request. Per security-framework.md: outlet_id is resolved from the
// session/token, never from the request body — routes must read
// req.auth.outletId, not req.body.outletId, once this runs.
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }

  const token = header.slice("Bearer ".length);
  const claims = verifyAccessToken(token, JWT_SECRET);
  if (!claims) {
    res.status(401).json({ error: "invalid or expired token" });
    return;
  }

  const outletId = claims.outletIds[0];
  if (!outletId) {
    res.status(403).json({ error: "token carries no outlet grant" });
    return;
  }

  req.auth = { userId: claims.sub, outletId };
  next();
}

// Direct check for routes whose required permission depends on request body
// content (e.g. order status transitions — CANCELLED needs order.void,
// everything else needs order.create), where the static middleware factory
// below can't decide the action in advance.
export async function checkPermissionDirect(userId: string, outletId: string, action: string) {
  return rbac.checkPermission({ userId, outletId, action });
}

// Composed with requireAuth: requireAuth first (sets req.auth), then this
// checks the specific permission action against RolePermission data.
// 403 on deny — never a silent pass-through.
export function requirePermission(action: string) {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }

    const result = await rbac.checkPermission({
      userId: req.auth.userId,
      outletId: req.auth.outletId,
      action,
    });

    if (!result.allowed) {
      res.status(403).json({ error: result.reason });
      return;
    }

    next();
  };
}
