export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequestOptions {
  base64Image?: string;
  mimeType?: string;
  prompt: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  model: string;
  apiKey: string;
  maxTokens?: number;
  // Previously nothing in the AI-call chain ever had a timeout or abort path
  // that actually reached the real network call — Home.tsx's AbortController
  // only flipped a flag the renderer's own for-await loop polled between
  // chunks, so a stalled connection (degraded network mid-meeting) left
  // isStreaming stuck true forever with no error. Providers now pass this
  // straight into fetch()'s `signal` option.
  signal?: AbortSignal;
}

export interface AIProvider {
  name: string;
  streamSolution(options: AIRequestOptions): AsyncGenerator<string>;
  listModels(): string[];
}

// Marks an error as a rate-limit/quota response (HTTP 429) specifically, as
// opposed to any other failure (invalid key, network error, etc.) — this is
// the one category of error where automatically retrying with a different
// already-configured provider is actually the right move, since the request
// itself was fine and only this provider's quota was exhausted.
export function rateLimitError(message: string): Error {
  const err = new Error(message);
  (err as any).isRateLimit = true;
  return err;
}

export function isRateLimitError(err: unknown): boolean {
  return !!(err && typeof err === "object" && (err as any).isRateLimit === true);
}

// nvidia.ts and anthropic.ts (both proxied through the main process, since
// neither vendor allows direct browser-origin calls) used to throw the raw,
// unparsed HTTP response body straight into the user-facing error banner —
// up to 300 characters of whatever backend JSON/diagnostic text the vendor's
// gateway happened to emit, unlike every fetch-based provider here which
// parses `.error.message` out of a clean JSON error body. This extracts the
// same kind of clean message when possible, falling back to a short generic
// one instead of ever surfacing raw response text.
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
