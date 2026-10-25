import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { OpenRouterProvider } from "./openrouter";
import { NvidiaProvider } from "./nvidia";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GrokProvider } from "./grok";
import type { AIProvider, AIRequestOptions, ProviderName } from "./types";
import { isFallbackWorthy } from "./types";
import { resolveModel } from "./catalog";

export type { ProviderName };

const providers: Record<ProviderName, AIProvider> = {
  groq:        new GroqProvider(),
  gemini:      new GeminiProvider(),
  openrouter:  new OpenRouterProvider(),
  nvidia:      new NvidiaProvider(),
  openai:      new OpenAIProvider(),
  anthropic:   new AnthropicProvider(),
  grok:        new GrokProvider(),
};

export function getProvider(name: ProviderName): AIProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown AI provider "${name}" — no implementation is registered for it.`);
  }
  return provider;
}

// Fixed preference order for auto-fallback — free/generous-tier providers
// first, since that's who most users have configured and who's most likely
// to actually be hit for quota.
const FALLBACK_ORDER: ProviderName[] = ["gemini", "groq", "openrouter", "nvidia", "openai", "anthropic", "grok"];
// Groq and NVIDIA have no vision-capable model — both already degrade
// gracefully (see groq.ts/nvidia.ts) rather than erroring, but falling back
// to a screenshot-blind provider for a Screen Analysis answer is a worse
// answer than falling back to one that can actually see the image. Used to
// push those two to the end of the order specifically when the request
// carries an image.
const VISION_INCAPABLE: ReadonlySet<ProviderName> = new Set(["groq", "nvidia"]);

export interface FallbackEvent {
  from: ProviderName;
  to: ProviderName;
  // "vision": the chosen provider has no vision model at all, so a screenshot
  // was rerouted to one that can actually see it, BEFORE any request was even
  // sent. "quota": the chosen provider was tried, hit a real 429, and a
  // different configured provider picked up that same request instead.
  reason: "vision" | "quota";
}

/**
 * Streams from `primaryName`, with two distinct, narrow reasons a different
 * already-configured provider might answer instead:
 *
 * 1. VISION RESCUE — Groq and NVIDIA have no vision-capable model at all. Asking
 *    one of them to look at a screenshot isn't an error it can fail loudly on:
 *    both providers quietly tell the model "you can't see images," and the
 *    model dutifully answers "I can't view the screenshot, please describe
 *    it" — a real, successfully-streamed response that the catch-based retry
 *    below never triggers on, since nothing threw. If the user's chosen
 *    provider can't see and they've configured ANY provider that can, that
 *    one is tried FIRST for this one request — this runs regardless of the
 *    auto-switch-on-quota toggle below, since it isn't a quota workaround,
 *    it's the only way Screen Analysis can function at all with that provider.
 *
 * 2. QUOTA FALLBACK — whenever the provider could not serve the request right
 *    now rather than because the request itself was wrong: a 429 quota
 *    exhaustion, a 402 (OpenRouter has no credits on a free key), a 503
 *    (Google overloaded), a 529 (Anthropic overloaded), or a transport-level
 *    TypeError such as a TLS reset. Never on an invalid key, an unknown model
 *    or any other 4xx — retrying those elsewhere only wastes quota and hides
 *    the real problem.
 *
 * Neither ever touches settings.activeProvider: both are one-off substitutions
 * for this single answer only, so the next question still tries the user's
 * actual chosen provider first. Both always report the switch via onFallback
 * so the UI can tell the user what happened instead of hiding it — this is
 * deliberately narrower than the earlier "silent Groq fallback" bug (fixed in
 * v3.4.0), which substituted providers unconditionally and silently.
 */
export async function* streamWithFallback(
  primaryName: ProviderName,
  options: AIRequestOptions,
  apiKeys: Record<string, string>,
  enabled: boolean,
  onFallback?: (event: FallbackEvent) => void,
): AsyncGenerator<string> {
  const hasImage = !!options.base64Image;
  const isConfigured = (name: ProviderName) => !!apiKeys[name]?.trim();

  let candidates: ProviderName[] = [primaryName];
  let visionRescue: ProviderName | null = null;

  if (hasImage && VISION_INCAPABLE.has(primaryName)) {
    visionRescue = FALLBACK_ORDER.find(
      (name) => name !== primaryName && !VISION_INCAPABLE.has(name) && isConfigured(name),
    ) ?? null;
    // No vision-capable provider configured at all — nothing to rescue with,
    // fall through to the primary anyway (same as before this fix existed).
    if (visionRescue) candidates = [visionRescue, primaryName];
  }

  if (enabled) {
    const rest = FALLBACK_ORDER.filter((name) => !candidates.includes(name) && isConfigured(name));
    if (hasImage) {
      rest.sort((a, b) => Number(VISION_INCAPABLE.has(a)) - Number(VISION_INCAPABLE.has(b)));
    }
    candidates.push(...rest);
  }

  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i];
    const provider = getProvider(name);
    // The primary keeps the user's chosen model; anyone else standing in for
    // it (vision rescue or quota fallback) has no "chosen" model for this
    // session, so it gets the catalog's default for that provider — always a
    // model verified against the vendor's live catalog, and on a free key.
    // Checked by NAME, not index 0 in `candidates`, since a vision rescue can
    // push the true primary to a later position.
    const isPrimary = name === primaryName;
    const model = isPrimary ? resolveModel(name, options.model) : resolveModel(name, undefined);
    let yieldedAny = false;
    try {
      const stream = provider.streamSolution({ ...options, apiKey: apiKeys[name], model });
      for await (const chunk of stream) {
        yieldedAny = true;
        yield chunk;
      }
      if (!isPrimary) onFallback?.({ from: primaryName, to: name, reason: name === visionRescue ? "vision" : "quota" });
      return;
    } catch (err) {
      const isLast = i === candidates.length - 1;
      // A fatal error, a fallback-worthy error with nothing left to fall back
      // to, or an error after output already started (would duplicate text if
      // retried) — surface it instead of silently trying more.
      if (yieldedAny || !isFallbackWorthy(err) || isLast) throw err;
    }
  }
}

// Opens (and keeps warm) the HTTPS connection to a provider so the first real
// request doesn't also pay DNS + TCP + TLS — ~0.2s on a good network, several
// times that on a slow one. no-cors: only the connection matters, the opaque
// response is ignored, and any failure is irrelevant.
const WARM_HOSTS: Record<ProviderName, string> = {
  gemini:     "https://generativelanguage.googleapis.com/",
  groq:       "https://api.groq.com/",
  openai:     "https://api.openai.com/",
  anthropic:  "https://api.anthropic.com/",
  openrouter: "https://openrouter.ai/",
  nvidia:     "https://integrate.api.nvidia.com/",
  grok:       "https://api.x.ai/",
};

export function warmProviderConnection(name: ProviderName): void {
  const url = WARM_HOSTS[name];
  if (!url || typeof fetch === "undefined") return;
  // Fire-and-forget on purpose, but never unbounded: a tick that never settles
  // (a captive portal holding the socket open, a network that blackholes the
  // SYN) left a socket pending every 4 minutes forever, with nothing to reap it.
  fetch(url, {
    method: "HEAD",
    mode: "no-cors",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}