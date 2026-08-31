import { API_BASE, DEFAULT_OUTLET_ID, getAdminTokens } from "./auth.helper";

export async function apiRequest<T = any>(
  endpoint: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    token?: string;
    outletId?: string;
  } = {}
): Promise<{ status: number; ok: boolean; data: T; error?: any }> {
  let token = options.token;
  if (!token) {
    const session = await getAdminTokens();
    token = session.accessToken;
  }

  const outletId = options.outletId || DEFAULT_OUTLET_ID;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Outlet-Id": outletId,
    ...(options.headers || {}),
  };

  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: res.status,
    ok: res.ok,
    data,
    error: res.ok ? undefined : data,
  };
}
