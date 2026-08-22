import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { JwtClaims } from "@kapmeta/shared-types/auth";

// secret is always sourced from a parameter, never process.env — caller (apps/api eventually) sources it from config/secret-manager.
export function signAccessToken(
  claims: Omit<JwtClaims, "iat" | "exp">,
  secret: string,
  expiresInSeconds = 900
): string {
  return jwt.sign(claims, secret, { expiresIn: expiresInSeconds });
}

export function verifyAccessToken(token: string, secret: string): JwtClaims | null {
  try {
    return jwt.verify(token, secret) as JwtClaims;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
