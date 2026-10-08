import { useStore } from "../store/useStore";

// Account backup of API keys.
//
// When a user presses "Test" on an API key (Settings, or the setup wizard), the key and the test
// result are also saved — encrypted on the server — to their Ghotly AI account:
//
//   PUT {VITE_API_URL}/api-keys   Authorization: Bearer <Google idToken>
//
// This is strictly best-effort and runs in the background. It never delays or changes the Test
// result, never throws, and never logs a key: the only things that may reach the console are the
// provider id and an HTTP status.

export const KEY_SYNC_PROVIDERS = ["groq", "gemini", "openrouter", "nvidia", "openai", "anthropic", "grok", "deepgram"] as const;

export interface KeySyncInput {
  provider: string;
  apiKey: string;
  status: "valid" | "invalid";
  /** The short message the Test button showed, e.g. "Gemini Key Valid! 🔵". */
  message?: string;
  /** The model that was selected when the key was tested (omitted when there isn't one). */
  model?: string;
}

export interface KeySyncResult {
  state: "saved" | "skipped" | "failed";
  /**
   * skipped: no-user | empty-key | bad-key-format | bad-status | unsupported-provider | no-api-url | insecure-api-url | recently-saved
   * failed:  auth (401) | blocked (403) | rejected (400) | not-found (404) | rate-limited (429) | server (5xx)
   *          | network | timeout | bad-response | http-<status> | unexpected
   */
  reason?: string;
  /** Last four characters of the key — the only part of it that is ever echoed anywhere. */
  last4?: string;
}

/** Test-only knobs (the defaults are what ships). */
export interface KeySyncOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
}

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;
const DEDUPE_WINDOW_MS = 60_000;
const MESSAGE_MAX = 120;

// Same rule the server enforces: real provider keys are 8–512 printable ASCII characters, no spaces.
// Anything else is a paste accident, so it is not sent at all.
const KEY_FORMAT = /^[\x21-\x7e]{8,512}$/;

// ── In-memory only. Nothing here is ever persisted or logged. ───────────────────────────────────
// What was last saved successfully per (user, provider): enough to tell "same key, same result,
// pressed Test again" from a real change, without keeping the key itself around.
const recentlySaved = new Map<string, { fingerprint: string; status: string; at: number }>();
// Identical saves that are still in flight share one request.
const inFlight = new Map<string, Promise<KeySyncResult>>();

/** Forgets what was synced (used by tests; also handy after logout). */
export function resetKeySyncCache(): void {
  recentlySaved.clear();
  inFlight.clear();
}

const skip = (reason: string, last4?: string): KeySyncResult => ({ state: "skipped", reason, ...(last4 ? { last4 } : {}) });
const fail = (reason: string): KeySyncResult => ({ state: "failed", reason });

function apiBase(): string {
  try {
    const raw = import.meta.env.VITE_API_URL;
    return typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
  } catch {
    return ""; // not running under Vite
  }
}

// A key must never travel in clear text: HTTPS only (plain http is accepted for a local dev server).
function isSecureBase(base: string): boolean {
  try {
    const u = new URL(base);
    return u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

// SHA-256 via SubtleCrypto (needs a secure context). If that isn't available the fallback is a
// plain non-cryptographic hash: the value only ever tells "same key as before" and stays in memory.
async function fingerprint(key: string): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest("SHA-256", new TextEncoder().encode(key));
      return "s:" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* fall through */ }
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return "f:" + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

let cachedVersion: string | undefined;
function appVersion(): string {
  if (cachedVersion === undefined) {
    try {
      cachedVersion = String(window.ghostly.getVersion() || "");
    } catch {
      cachedVersion = "";
    }
  }
  return cachedVersion;
}

function platformName(): string {
  try {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("windows")) return "windows";
    if (ua.includes("mac")) return "macos";
    if (ua.includes("linux")) return "linux";
  } catch { /* fall through */ }
  return "windows";
}

// The message comes from the key test and can in principle echo provider/IPC error text, so make
// sure the key itself can never ride along inside it.
function cleanMessage(raw: unknown, key: string): string {
  let m = typeof raw === "string" ? raw : "";
  if (key && m.includes(key)) m = m.split(key).join("…" + key.slice(-4));
  m = m.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return m.length > MESSAGE_MAX ? m.slice(0, MESSAGE_MAX - 1) + "…" : m;
}

type Outcome = { kind: "http"; status: number; json: any } | { kind: "network"; timedOut: boolean };

async function putOnce(url: string, idToken: string, body: string, timeoutMs: number): Promise<Outcome> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body,
      signal: controller.signal,
      // A redirect would re-send the body (the key) to wherever it points. This API never redirects.
      redirect: "error",
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* the body is optional */ }
    return { kind: "http", status: res.status, json };
  } catch {
    return { kind: "network", timedOut };
  } finally {
    clearTimeout(timer);
  }
}

// One retry, after a pause, and only for failures that can plausibly be transient: the network
// dropped / timed out, or the server answered 5xx. A 400/401/403/404/429 will not fix itself.
async function putWithRetry(url: string, idToken: string, body: string, timeoutMs: number, retryDelayMs: number): Promise<Outcome> {
  let outcome = await putOnce(url, idToken, body, timeoutMs);
  if (outcome.kind === "network" || outcome.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    outcome = await putOnce(url, idToken, body, timeoutMs);
  }
  return outcome;
}

function toResult(outcome: Outcome, localLast4: string): KeySyncResult {
  if (outcome.kind === "network") return fail(outcome.timedOut ? "timeout" : "network");
  const { status, json } = outcome;
  if (status >= 200 && status < 300) {
    // "Saved" must be true: a proxy / captive portal can answer 200 with something else entirely.
    if (json?.ok !== true) return fail("bad-response");
    return { state: "saved", last4: typeof json.last4 === "string" && json.last4.length <= 4 ? json.last4 : localLast4 };
  }
  if (status === 401) return fail("auth");
  if (status === 403) return fail("blocked");
  if (status === 400) return fail("rejected");
  if (status === 404) return fail("not-found");
  if (status === 429) return fail("rate-limited");
  if (status >= 500) return fail("server");
  return fail(`http-${status}`);
}

async function run(input: KeySyncInput, opts: KeySyncOptions): Promise<KeySyncResult> {
  const provider = String(input.provider || "").trim().toLowerCase();
  if (!(KEY_SYNC_PROVIDERS as readonly string[]).includes(provider)) return skip("unsupported-provider");

  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (!apiKey) return skip("empty-key");
  if (!KEY_FORMAT.test(apiKey)) return skip("bad-key-format");
  if (input.status !== "valid" && input.status !== "invalid") return skip("bad-status");

  const user = useStore.getState().user;
  if (!user?.idToken) return skip("no-user");

  const base = apiBase();
  if (!base) return skip("no-api-url");
  if (!isSecureBase(base)) return skip("insecure-api-url");

  const last4 = apiKey.slice(-4);
  const fp = await fingerprint(apiKey);
  const cacheKey = `${user.userId}|${provider}`;

  const now = Date.now();
  for (const [k, v] of recentlySaved) if (now - v.at >= DEDUPE_WINDOW_MS) recentlySaved.delete(k);
  const prev = recentlySaved.get(cacheKey);
  if (prev && prev.fingerprint === fp && prev.status === input.status) return skip("recently-saved", last4);

  const flightKey = `${cacheKey}|${fp}|${input.status}`;
  const pending = inFlight.get(flightKey);
  if (pending) return pending;

  const send = (async (): Promise<KeySyncResult> => {
    const model = typeof input.model === "string" ? input.model.trim().slice(0, 100) : "";
    const body = JSON.stringify({
      provider,
      apiKey,
      status: input.status,
      message: cleanMessage(input.message, apiKey),
      ...(model ? { model } : {}),
      appVersion: appVersion(),
      platform: platformName(),
    });
    const outcome = await putWithRetry(`${base}/api-keys`, user.idToken, body, opts.timeoutMs ?? TIMEOUT_MS, opts.retryDelayMs ?? RETRY_DELAY_MS);
    const result = toResult(outcome, last4);
    if (result.state === "saved") {
      recentlySaved.set(cacheKey, { fingerprint: fp, status: input.status, at: Date.now() });
    } else {
      // Provider + HTTP status only — never the key, the body or the server's error text.
      console.warn("[keySync] backup failed:", provider, outcome.kind === "http" ? `HTTP ${outcome.status}` : result.reason);
    }
    return result;
  })();

  inFlight.set(flightKey, send);
  try {
    return await send;
  } finally {
    inFlight.delete(flightKey);
  }
}

/**
 * Saves a tested key to the signed-in user's account. Resolves — never rejects — with what happened:
 *  - "saved":   the server confirmed the save
 *  - "skipped": nothing was sent (not signed in, empty / malformed key, nothing changed since the last save…)
 *  - "failed":  it could not be saved right now (the next Test tries again)
 */
export async function syncApiKey(input: KeySyncInput, opts: KeySyncOptions = {}): Promise<KeySyncResult> {
  try {
    return await run(input, opts);
  } catch {
    return fail("unexpected");
  }
}

// ── What the UI shows next to the Test result ───────────────────────────────────────────────────

export interface KeySyncBadge {
  kind: "saved" | "failed";
  /** Tooltip explaining a failure. */
  hint?: string;
}

/** null = show nothing. A save skipped because the very same result is already saved counts as saved. */
export function toSyncBadge(result: KeySyncResult): KeySyncBadge | null {
  if (result.state === "saved" || (result.state === "skipped" && result.reason === "recently-saved")) return { kind: "saved" };
  if (result.state !== "failed") return null;
  switch (result.reason) {
    case "auth": return { kind: "failed", hint: "Your login has expired — sign in again to back up keys." };
    case "blocked": return { kind: "failed", hint: "This account can't back up keys right now." };
    case "rate-limited": return { kind: "failed", hint: "Too many saves for this provider — try again a little later." };
    default: return { kind: "failed", hint: "Couldn't reach your Ghotly AI account. It will try again the next time you press Test." };
  }
}
