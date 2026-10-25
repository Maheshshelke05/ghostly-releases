export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export type ProviderName = "groq" | "gemini" | "openrouter" | "nvidia" | "openai" | "anthropic" | "grok";

export interface AIRequestOptions {
  base64Image?: string;
  mimeType?: string;
  prompt: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  model: string;
  apiKey: string;
  maxTokens?: number;
  // Every provider passes this into fetch()'s `signal` (or races its IPC call against it),
  // so a stalled connection fails instead of leaving isStreaming true forever.
  signal?: AbortSignal;
}

export interface AIProvider {
  name: string;
  streamSolution(options: AIRequestOptions): AsyncGenerator<string>;
  listModels(): string[];
}

/** Ceiling for a provider that was never handed a signal. Matches Home.tsx's. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/** Every provider starts with `defaultSignal(options.signal)` so no code path can
 *  reach a real network call without a deadline. */
export function defaultSignal(signal?: AbortSignal): AbortSignal {
  return signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS);
}

/** "rate_limit" = this provider's quota is gone; "retryable" = busy/down/empty right now
 *  (402/503/529/5xx), so another configured provider may answer; "fatal" = bad key, model or request. */
export type ProviderFailure = "rate_limit" | "retryable" | "fatal";

function classifyStatus(status: number): ProviderFailure {
  if (status === 429) return "rate_limit";
  // 402 = OpenRouter "no credits", 408 = upstream timeout, 503 = Google overloaded,
  // 529 = Anthropic overloaded: "not right now", not "your request was wrong".
  if (status === 402 || status === 408 || status === 503 || status === 529 || status >= 500) return "retryable";
  return "fatal";
}

export class ProviderError extends Error {
  readonly status: number;
  readonly failure: ProviderFailure;

  constructor(message: string, status = 0, failure: ProviderFailure = classifyStatus(status)) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.failure = failure;
  }

  get isRateLimit(): boolean {
    return this.failure === "rate_limit";
  }
}

/** HTTP 429: the quota for this provider is exhausted for now. */
export function rateLimitError(message: string, status = 429): ProviderError {
  return new ProviderError(message, status, "rate_limit");
}

/** Builds the right classified error for a non-2xx HTTP response. */
export function httpError(label: string, response: Response, parsed: unknown, detail?: string): ProviderError {
  return new ProviderError(
    `${label} API error: ${detail ?? apiErrorDetail(response, parsed)}`,
    response.status,
  );
}

/** `response.statusText` is empty over HTTP/2, which every AI vendor uses, so falling
 *  back to it alone rendered "Groq API error: " with nothing after it. */
export function apiErrorDetail(response: Response, parsed: unknown): string {
  const body = (parsed as { error?: { message?: string } | string; message?: string } | null)?.error;
  const raw = typeof body === "string" ? body : body?.message ?? (parsed as { message?: string } | null)?.message;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return response.statusText?.trim() || `HTTP ${response.status}`;
}

/** An empty key would be sent as `Authorization: Bearer ` for a guaranteed 401. */
export function requireApiKey(apiKey: string | undefined, label: string, url: string): string {
  const key = (apiKey ?? "").trim();
  if (!key) throw new ProviderError(`${label} API key missing. Add one in API Setup (${url}).`);
  return key;
}

export function isRateLimitError(err: unknown): boolean {
  return err instanceof ProviderError && err.failure === "rate_limit";
}

/** A bare TypeError counts because that is what fetch() rejects with for every transport
 *  failure (TLS reset, DNS, offline); one dead socket says nothing about the next. */
export function isFallbackWorthy(err: unknown): boolean {
  if (err instanceof ProviderError) return err.failure !== "fatal";
  return err instanceof TypeError;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/** One retry with jitter for >= 500. Both proxied providers 5xx constantly under load and
 *  neither streams, so a transient blip would otherwise end the whole answer. */
export async function retryOnServerError<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof ProviderError) || err.status < 500) throw err;
    await sleep(200 + Math.random() * 400, signal);
    return fn();
  }
}

/** Rejects as soon as `signal` aborts, even though `promise` can't be cancelled. */
export function raceSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/** Stops a captive portal or TLS-terminating proxy returning `<html>` with a 200 from
 *  reaching the user as `SyntaxError: Unexpected token '<'`. */
export function parseJsonBody(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const preview = raw.trim().slice(0, 60).replace(/\s+/g, " ");
    throw new ProviderError(
      `${label} returned a non-JSON response${preview ? ` (${preview}…)` : ""} — a network proxy or captive portal may be intercepting the request.`,
    );
  }
}

/** Extracts the same clean `.error.message` the fetch-based providers get, instead of
 *  surfacing up to 300 characters of raw vendor JSON; falls back to a short generic message. */
export function extractApiErrorMessage(rawBody: string, providerLabel: string, status: number): string {
  try {
    const parsed = JSON.parse(rawBody);
    const msg = parsed?.error?.message || parsed?.error?.type || parsed?.message || parsed?.detail;
    if (typeof msg === "string" && msg.trim()) return `${providerLabel} API error: ${msg}`;
  } catch {
    /* not JSON — fall through to generic message */
  }
  return `${providerLabel} API error (status ${status})`;
}

/** One SSE reader for every provider: throws in-band `data:{"error":...}` frames instead of
 *  truncating silently, flushes the trailing partial line, and tolerates `\r\n` / no-space `data:` framing. */
export async function* readSSE(response: Response): AsyncGenerator<Record<string, any>> {
  if (!response.body) throw new ProviderError("The provider returned a streaming response with no readable body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function* frame(line: string): Generator<Record<string, any>> {
    const match = /^data:[ \t]?([\s\S]*)$/.exec(line.replace(/\r$/, ""));
    const raw = match?.[1]?.trim();
    if (!raw || raw === "[DONE]") return;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // keep-alive / comment / partial frame
    }
    if (parsed && typeof parsed === "object" && parsed.error) {
      const err = parsed.error;
      throw new ProviderError(typeof err === "string" ? err : err?.message || "The provider reported an error mid-stream.");
    }
    yield parsed as Record<string, any>;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) yield* frame(line);
    }
    buffer += decoder.decode(); // flush any multi-byte tail, then the last partial line
    for (const line of buffer.split("\n")) yield* frame(line);
  } finally {
    void reader.cancel().catch(() => {});
  }
}