// Error reporting (v4): every error a person runs into reaches the admin app (POST api.ghotlyai.in/errors).
//
// Sources: errors shown in the UI (store.setError), React crashes (ErrorBoundary), uncaught renderer errors and
// rejections, and main-process crashes forwarded over IPC. Reports are de-duplicated (same message: once a minute),
// sent in batches of up to 10, and kept in localStorage while offline (at most 30) so they go out on the next start.
// Provider keys are scrubbed here before anything leaves the PC; the server scrubs again.
import { API_BASE, currentToken } from "./api";

export interface ErrorInput {
  kind?: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

const QUEUE_KEY = "ghostly:error-queue";
const MAX_QUEUE = 30;
const DEDUPE_MS = 60_000;
const FLUSH_DELAY_MS = 3_000;

const recent = new Map<string, number>();
let queue: Record<string, unknown>[] = load();
let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

const SECRET = /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}|\bgsk_[A-Za-z0-9]{12,}|\bAIza[0-9A-Za-z_-]{20,}|\bxai-[A-Za-z0-9]{12,}|\bnvapi-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\bgh1\.[A-Za-z0-9._-]{20,}|\b[a-f0-9]{32,}\b/gi;

export function scrub(text: string): string {
  return text.replace(SECRET, "[redacted]");
}

function load(): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

function save(): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    /* storage full or unavailable - the in-memory queue still goes out */
  }
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => { timer = null; void flush(); }, FLUSH_DELAY_MS);
}

async function flush(): Promise<void> {
  if (!queue.length) return;
  const batch = queue.slice(0, 10);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = currentToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_BASE}/errors`, {
      method: "POST", headers, body: JSON.stringify({ errors: batch }), signal: AbortSignal.timeout(10000),
    });
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
      queue = queue.slice(batch.length); // delivered (or refused for good - don't retry forever)
      save();
      if (queue.length) schedule();
    } else {
      setTimeout(schedule, 60_000);
    }
  } catch {
    setTimeout(schedule, 60_000); // offline: try again later; the queue is on disk
  }
}

export function reportError(input: ErrorInput): void {
  try {
    const message = scrub(String(input.message || "").trim()).slice(0, 2000);
    if (!message) return;
    const key = `${input.kind || "error"}|${message}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - DEDUPE_MS) return;
    recent.set(key, now);
    if (recent.size > 200) recent.clear();
    let version = "";
    try { version = window.ghostly.getVersion(); } catch { /* preload missing */ }
    queue.push({
      source: "app",
      kind: (input.kind || "error").slice(0, 80),
      message,
      stack: scrub(String(input.stack || "")).slice(0, 8000),
      context: { ...(input.context || {}), at: new Date().toISOString() },
      app_version: version,
      platform: "windows",
    });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    save();
    schedule();
  } catch {
    /* reporting must never cause an error of its own */
  }
}

export function reportException(err: unknown, kind = "Exception", context?: Record<string, unknown>): void {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err ?? "unknown"));
  reportError({ kind: e.name && e.name !== "Error" ? e.name : kind, message: e.message, stack: e.stack, context });
}

/** Once, at start-up: uncaught renderer errors, unhandled rejections, main-process crashes, and the saved queue. */
export function installErrorReporting(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (ev) => {
    if (ev.error || ev.message) reportException(ev.error || ev.message, "UncaughtError", { file: ev.filename, line: ev.lineno });
  });
  window.addEventListener("unhandledrejection", (ev) => reportException(ev.reason, "UnhandledRejection"));
  try {
    window.ghostly.onMainError?.((e) => reportError({ kind: `Main:${e.kind}`, message: e.message, stack: e.stack }));
    window.ghostly.getPendingMainErrors?.().then((list) => {
      for (const e of list || []) reportError({ kind: `Main:${e.kind}`, message: e.message, stack: e.stack });
    }).catch(() => {});
  } catch {
    /* an older preload without the main-error bridge */
  }
  if (queue.length) schedule();
}
