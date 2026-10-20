// The Ghotly AI account backend (api.ghotlyai.in) — one place for its URL, the sign-in token and the plan state.
//
// v4 moved the account API off the AWS Lambda (VITE_API_URL in old builds' .env) onto api.ghotlyai.in. The old
// variable is deliberately NOT read any more, so a stale .env can't point a new build back at the Lambda;
// VITE_GHOSTLY_API_URL overrides the address for a local/staging backend.
//
// Sign-in: Google's ID token (from the website's login page) lasts one hour. The first /subscription answer
// carries `session.token` ("gh1.…", 30 days, refreshed on every /subscription) and adoptSession() swaps it in as
// the stored token, so an app left open all day stays signed in. Every GhostlyAI route accepts either token.
import { useStore } from "../store/useStore";

export const API_BASE = (() => {
  try {
    const raw = import.meta.env.VITE_GHOSTLY_API_URL;
    if (typeof raw === "string" && raw.trim()) return raw.trim().replace(/\/+$/, "");
  } catch {
    /* not running under Vite */
  }
  return "https://api.ghotlyai.in";
})();

export const WEBSITE_URL = "https://www.ghotlyai.in";
export const PRICING_URL = `${WEBSITE_URL}/pricing/`;
export const ACCOUNT_URL = `${WEBSITE_URL}/account/`;

/** What /subscription (and /me/access) say this account may do. */
export interface Access {
  plan: "pro" | "free";
  paid: boolean;
  expires_at: string | null;
  days_left: number | null;
  expired: boolean;
  free_seconds_total: number;
  free_seconds_used: number;
  free_seconds_left: number;
  can_start_session: boolean;
  show_ads: boolean;
}

export interface Plan {
  code: string;
  name: string;
  price_inr: number;
  days: number;
  per_month_inr: number;
}

export function currentToken(): string | null {
  return useStore.getState().user?.idToken || null;
}

/** Swaps the stored sign-in token for the backend's 30-day session token when an answer carries one. */
export async function adoptSession(data: any): Promise<void> {
  const token = data?.session?.token;
  const user = useStore.getState().user;
  if (typeof token !== "string" || !token.startsWith("gh1.") || !user || user.idToken === token) return;
  const next = { ...user, idToken: token };
  useStore.getState().setUser(next);
  try {
    await window.ghostly.saveUser(next);
  } catch {
    /* kept in memory; the next /subscription stores it again */
  }
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** JSON call to the account backend with the signed-in token. Throws ApiError for a non-2xx answer. */
export async function apiFetch<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; timeoutMs?: number; token?: string | null; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = opts.token !== undefined ? opts.token : currentToken();
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, String(data?.error || data?.detail || `Server error (${res.status})`), data);
  return data as T;
}

export function formatMinutes(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `0:${String(r).padStart(2, "0")}`;
}
