// Shared client-side auth state for pos-web. No hardcoded users/roles/permissions
// anywhere here — everything comes from the real POST /auth/login and
// GET /auth/me responses (apps/api/src/routes/auth.ts).
import { useEffect, useState } from "react";

export function getApiBase(): string {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    return `${window.location.protocol}//${window.location.hostname}:4001`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
}

export function getWsBase(): string {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.hostname}:4001/ws`;
  }
  return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4001/ws";
}

export const API_BASE = "http://localhost:4001";
export const WS_BASE = "ws://localhost:4001/ws";
export const STORAGE_KEY = "kapmeta_pos_session";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  userId: string;
  email: string;
  outletId: string;
  sessionId?: string;
}

export interface MeOutlet {
  id: string;
  name: string;
  address: string | null;
  fssaiNumber: string | null;
  upiVpa: string | null;
  taxNumber: string | null;
}

export interface MeResponse {
  userId: string;
  email: string;
  name: string;
  outletId: string;
  roles: string[];
  permissions: string[];
  outlet: MeOutlet | null;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

// Decodes the (unsigned-here, already-trusted-because-we-just-received-it-over-TLS)
// JWT payload to recover the sessionId claim for logout — the login response
// itself doesn't echo session.id, and we must not invent one.
function decodeSessionIdFromToken(accessToken: string): string | undefined {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return undefined;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json);
    return typeof claims.sessionId === "string" ? claims.sessionId : undefined;
  } catch {
    return undefined;
  }
}

export function getSession(): { accessToken: string; userId: string; email: string; outletId: string } | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored: StoredSession = JSON.parse(raw);
    if (!stored.accessToken) return null;
    return {
      accessToken: stored.accessToken,
      userId: stored.userId,
      email: stored.email,
      outletId: stored.outletId,
    };
  } catch {
    return null;
  }
}

function getStoredSessionFull(): StoredSession | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function login(
  email: string,
  password: string,
  outletId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, outletId }),
    });

    if (!res.ok) {
      // Clear any stale session data on failed login to avoid stale token issues
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      let error = "LOGIN_FAILED";
      try {
        const body = await res.json();
        if (typeof body.error === "string") error = body.error;
      } catch {
        // ignore parse failure, fall back to generic error
      }
      return { ok: false, error };
    }

    const data = await res.json();
    const stored: StoredSession = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      userId: data.user.userId,
      email: data.user.email,
      outletId: data.user.outletId,
      sessionId: decodeSessionIdFromToken(data.accessToken),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "NETWORK_ERROR" };
  }
}

export async function logout(): Promise<void> {
  const stored = getStoredSessionFull();
  if (stored?.sessionId) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: stored.sessionId }),
      });
    } catch {
      // best-effort — still clear local session below
    }
  }
  if (isBrowser()) {
    window.localStorage.removeItem(STORAGE_KEY);
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
}

export interface OutletSummary {
  id: string;
  name: string;
  code: string;
}

// Real outlets the current user has a UserRole grant for (GET /auth/outlets/mine,
// apps/api/src/routes/auth.ts) — never a hardcoded list per repo CLAUDE.md.
export async function fetchMyOutlets(): Promise<OutletSummary[]> {
  const session = getSession();
  if (!session) return [];
  try {
    const res = await fetch(`${API_BASE}/auth/outlets/mine`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as OutletSummary[];
  } catch {
    return [];
  }
}

// Switches the active outlet without re-prompting for a password: calls
// POST /auth/switch-outlet, which re-validates the caller's real UserRole
// grant server-side and mints a fresh token scoped to the new outlet.
export async function switchOutlet(outletId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession();
  if (!session) return { ok: false, error: "NOT_LOGGED_IN" };
  try {
    const res = await fetch(`${API_BASE}/auth/switch-outlet`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ outletId }),
    });

    if (!res.ok) {
      let error = "SWITCH_FAILED";
      try {
        const body = await res.json();
        if (typeof body.error === "string") error = body.error;
      } catch {
        // ignore parse failure, fall back to generic error
      }
      return { ok: false, error };
    }

    const data = await res.json();
    const stored: StoredSession = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      userId: data.user.userId,
      email: data.user.email,
      outletId: data.user.outletId,
      sessionId: decodeSessionIdFromToken(data.accessToken),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "NETWORK_ERROR" };
  }
}

export async function fetchMe(): Promise<MeResponse | null> {
  const session = getSession();
  if (!session) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}

// Verifies a terminal-unlock PIN against the real User.pinHash server-side
// (POST /auth/verify-pin, apps/api/src/routes/auth.ts). There is no
// client-side accepted PIN value — every attempt round-trips to the API.
export async function verifyPin(pin: string): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/verify-pin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.valid === true;
  } catch {
    return false;
  }
}

export async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const session = getSession();
  const headers = new Headers(options.headers);
  if (session) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const base = getApiBase();
  const finalUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  const res = await fetch(finalUrl, { ...options, headers });

  if (res.status === 401) {
    if (isBrowser()) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.location.href = "/login";
    }
  }

  return res;
}

export function useAuthGuard(requiredPermission?: string): { me: MeResponse | null; loading: boolean } {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const session = getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }

    fetchMe().then((result) => {
      if (cancelled) return;
      if (!result) {
        window.localStorage.removeItem(STORAGE_KEY);
        window.location.href = "/login";
        return;
      }
      if (requiredPermission && !result.permissions.includes(requiredPermission)) {
        if (result.permissions.includes("kot.read")) {
          window.location.href = "/kitchen";
          return;
        }
        if (result.permissions.includes("inventory.stock.adjust")) {
          window.location.href = "/inventory";
          return;
        }
        if (result.permissions.includes("menu.category.manage")) {
          window.location.href = "/admin";
          return;
        }
        setMe(result);
        setLoading(false);
        return;
      }
      setMe(result);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredPermission]);

  return { me, loading };
}
