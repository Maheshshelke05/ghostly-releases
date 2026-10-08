// Sends the extracted resume to the user's own AI provider and turns the answer into a CandidateProfile.
//
// - Uses the app's existing provider layer (streamWithFallback): the user's active provider/model first,
//   quota fallback and the Groq/NVIDIA -> vision-capable rescue come for free.
// - Every model call has its own 45 s timeout and honours the caller's AbortSignal (Cancel button).
//   Anthropic/NVIDIA go through the main-process proxy and ignore `signal`, so the stream is also raced
//   against the abort - the UI never waits on a request that was cancelled or timed out.
// - Resume text and API keys are never written to the console.
import { streamWithFallback, getProvider } from "../ai";
import type { FallbackEvent, ProviderName } from "../ai";
import { isRateLimitError } from "../ai/types";
import { usableApiKeys } from "../providerState";
import type { Settings } from "../../store/useStore";
import { AI_TIMEOUT_MS } from "./limits";
import { parseResumeResponse, redactForDisplay } from "./parse";
import { buildImageResumePrompt, buildTextResumePrompt, buildTranscribePrompt } from "./prompt";
import type { CandidateProfile, ExtractedResume } from "./types";
import { ResumeError } from "./types";

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  groq: "Groq", gemini: "Gemini", openrouter: "OpenRouter", nvidia: "NVIDIA",
  openai: "OpenAI", anthropic: "Anthropic", grok: "Grok",
};
// Mirrors VISION_INCAPABLE in lib/ai/index.ts (not exported there): these have no image-capable model.
const TEXT_ONLY: ReadonlySet<string> = new Set(["groq", "nvidia"]);
// Same preference order as lib/ai/index.ts FALLBACK_ORDER (free/generous tiers first).
const ORDER: ProviderName[] = ["gemini", "groq", "openrouter", "nvidia", "openai", "anthropic", "grok"];
const MAX_TOKENS = 4096; // lowest common ceiling across the providers a fallback might land on

const labelOf = (id: string) => PROVIDER_LABELS[id as ProviderName] ?? id;

export interface ProviderInfo {
  provider: ProviderName;
  label: string;
  model: string;
  /** Why this provider (undefined = the planned one). */
  reason?: "vision" | "quota";
}

export interface AnalyzeOptions {
  settings: Settings;
  /** User pressed Cancel. */
  signal?: AbortSignal;
  /** Fired when the analysis starts and again if a different provider takes over. */
  onProvider?: (info: ProviderInfo) => void;
  /** Sub-status, e.g. "Reading page 2 of 3". */
  onNote?: (note: string) => void;
  /** Per model call; defaults to 45 s. */
  timeoutMs?: number;
}

export interface AnalyzeResult {
  profile: CandidateProfile;
  provider: ProviderInfo;
}

// ───────────────────────── which provider/model ─────────────────────────

/** The provider that should answer: the user's active one if usable, else the best configured one. */
export function planProvider(settings: Settings, needsVision: boolean): ProviderInfo {
  const keys = usableApiKeys(settings);
  const ids = Object.keys(keys) as ProviderName[];
  if (ids.length === 0) {
    throw new ResumeError("no_key", "Resume analysis needs an AI API key. Add one first.");
  }
  const capable = ids.filter((id) => !TEXT_ONLY.has(id));
  if (needsVision && capable.length === 0) {
    throw new ResumeError(
      "no_vision_key",
      "Scanned and image resumes need a provider that can read images: add a Gemini, OpenAI, Anthropic, OpenRouter or Grok key. (Groq and NVIDIA can't.) Text resumes (PDF, Word or .txt) work with any provider.",
    );
  }
  const pool = needsVision ? capable : ids;
  const active = settings.activeProvider;
  if (pool.includes(active)) {
    return { provider: active, label: labelOf(active), model: settings.activeModel || getProvider(active).listModels()[0] };
  }
  const best = ORDER.find((id) => pool.includes(id)) ?? pool[0];
  return { provider: best, label: labelOf(best), model: getProvider(best).listModels()[0] };
}

// ───────────────────────── one model call ─────────────────────────

function abortReasonError(userSignal: AbortSignal | undefined, timeoutMs: number): ResumeError {
  if (userSignal?.aborted) return new ResumeError("cancelled", "Cancelled.");
  return new ResumeError(
    "timeout",
    `The AI took longer than ${Math.round(timeoutMs / 1000)} seconds to answer. Try again, or pick a faster model in Settings.`,
    true,
  );
}

function mapAiError(err: unknown, label: string): ResumeError {
  if (err instanceof ResumeError) return err;
  const raw = String((err as { message?: unknown } | null)?.message ?? err ?? "");
  if (isRateLimitError(err) || /\b429\b|rate.?limit|too many requests|quota|resource.?exhausted|insufficient.{0,12}(credit|quota|funds)|billing/i.test(raw)) {
    return new ResumeError(
      "rate_limit",
      `${label} is rate-limited or out of quota right now (free tiers allow only a few requests a minute). Wait a minute and try again, or add another provider's key.`,
      true,
    );
  }
  const offline = (typeof navigator !== "undefined" && navigator.onLine === false) ||
    (err instanceof TypeError && /failed to fetch|networkerror|load failed|network request failed|fetch failed|network error/i.test(raw)) ||
    /ERR_INTERNET_DISCONNECTED|ERR_NETWORK|ENOTFOUND|ECONNREFUSED|ECONNRESET|getaddrinfo/i.test(raw);
  if (offline) {
    return new ResumeError("offline", `Couldn't reach ${label}. Check your internet connection and try again.`, true);
  }
  if (/api[\s_-]?key|unauthori[sz]ed|authentication|permission.?denied|forbidden|invalid.{0,24}(token|credential)|\b401\b|\b403\b/i.test(raw)) {
    return new ResumeError("auth", `${label} rejected your API key. Check it in API Setup (or add a different provider's key) and try again.`, false);
  }
  if (/model.{0,30}(not found|not available|does not exist|unavailable|no longer)|\b404\b|not_found/i.test(raw)) {
    return new ResumeError("model", `${label} says the selected model isn't available for this key. Choose another model in Settings and try again.`, false);
  }
  return new ResumeError("ai_failed", `${label} couldn't analyze the resume${raw ? `: ${redactForDisplay(raw, 140)}` : "."} Please try again.`, true);
}

interface Call {
  prompt: string;
  image?: string; // JPEG data URL
}

interface Ctx {
  opts: AnalyzeOptions;
  keys: Record<string, string>;
  plan: ProviderInfo;
  timeoutMs: number;
}

interface Answer {
  text: string;
  /** The provider that actually produced the text (differs from the plan after a quota/vision fallback). */
  used: ProviderInfo;
}

async function callModel(ctx: Ctx, call: Call): Promise<Answer> {
  const { opts, keys, plan, timeoutMs } = ctx;
  const user = opts.signal;
  if (user?.aborted) throw new ResumeError("cancelled", "Cancelled.");

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  const onUser = () => ctl.abort(user?.reason ?? new DOMException("cancelled", "AbortError"));
  user?.addEventListener("abort", onUser, { once: true });

  const aborted = new Promise<never>((_, reject) => {
    const fire = () => reject(abortReasonError(user, timeoutMs));
    if (ctl.signal.aborted) fire();
    else ctl.signal.addEventListener("abort", fire, { once: true });
  });
  aborted.catch(() => {}); // the race below consumes it; avoid an unhandled-rejection warning when it is not needed

  let stream: AsyncGenerator<string> | null = null;
  let used: ProviderInfo = plan;
  try {
    const onFallback = (e: FallbackEvent) => {
      used = { provider: e.to, label: labelOf(e.to), model: getProvider(e.to).listModels()[0], reason: e.reason };
      opts.onProvider?.(used);
    };
    stream = streamWithFallback(
      plan.provider,
      {
        prompt: call.prompt,
        model: plan.model,
        apiKey: keys[plan.provider],
        maxTokens: MAX_TOKENS,
        signal: ctl.signal,
        ...(call.image ? { base64Image: call.image, mimeType: "image/jpeg" } : {}),
      },
      keys,
      opts.settings.autoSwitchProvider ?? true,
      onFallback,
    );
    const it = stream[Symbol.asyncIterator]();
    let out = "";
    for (;;) {
      const r = await Promise.race([it.next(), aborted]);
      if (r.done) break;
      out += r.value;
      if (out.length > 60000) break; // a resume profile is ~3 KB; never accumulate a runaway answer
    }
    return { text: out, used };
  } catch (e) {
    if (ctl.signal.aborted) throw abortReasonError(user, timeoutMs);
    throw mapAiError(e, plan.label);
  } finally {
    clearTimeout(timer);
    user?.removeEventListener("abort", onUser);
    // Best effort: close the generator (it may still be awaiting a request we no longer care about).
    if (stream) void stream.return(undefined).catch(() => {});
  }
}

/** Run a prompt that must produce the profile JSON; one automatic retry if the answer is unusable. */
async function structure(ctx: Ctx, make: (retry: boolean) => Call): Promise<{ profile: CandidateProfile; used: ProviderInfo }> {
  let lastErr: ResumeError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await callModel(ctx, make(attempt > 0));
    try {
      return { profile: parseResumeResponse(answer.text), used: answer.used };
    } catch (e) {
      if (!(e instanceof ResumeError) || (e.code !== "bad_json" && e.code !== "truncated")) throw e;
      lastErr = e; // unusable answer: try once more with the stricter reminder
    }
  }
  throw lastErr!;
}

// ───────────────────────── public entry point ─────────────────────────

export async function analyzeResume(extracted: ExtractedResume, opts: AnalyzeOptions): Promise<AnalyzeResult> {
  const needsVision = extracted.kind === "images";
  const plan = planProvider(opts.settings, needsVision);
  const ctx: Ctx = { opts, keys: usableApiKeys(opts.settings), plan, timeoutMs: opts.timeoutMs ?? AI_TIMEOUT_MS };
  opts.onProvider?.(plan);

  let result: { profile: CandidateProfile; used: ProviderInfo };
  if (extracted.kind === "text") {
    result = await structure(ctx, (retry) => ({ prompt: buildTextResumePrompt(extracted.text, retry) }));
  } else if (extracted.pages.length === 1) {
    result = await structure(ctx, (retry) => ({ prompt: buildImageResumePrompt(retry), image: extracted.pages[0] }));
  } else {
    // A model call carries ONE image, and stitching pages into one tall image would shrink the text below
    // what vision models (which downscale to ~1.5-2k px) can read. So: transcribe each page on its own
    // (sequentially - gentler on free-tier rate limits), then structure the combined text in a final call.
    const total = extracted.pages.length;
    const parts: string[] = [];
    for (let i = 0; i < total; i++) {
      opts.onNote?.(`Reading page ${i + 1} of ${total}`);
      const page = (await callModel(ctx, { prompt: buildTranscribePrompt(i + 1, total), image: extracted.pages[i] })).text.trim();
      if (page.replace(/\s/g, "").length >= 20) parts.push(`--- Page ${i + 1} ---\n${page}`);
    }
    if (parts.length === 0) {
      throw new ResumeError("no_text", "We couldn't read any text in that scan. Try a clearer, higher-resolution copy.");
    }
    opts.onNote?.("Putting it together");
    const joined = parts.join("\n\n").slice(0, 30000);
    result = await structure(ctx, (retry) => ({ prompt: buildTextResumePrompt(joined, retry) }));
  }
  return { profile: result.profile, provider: result.used };
}
