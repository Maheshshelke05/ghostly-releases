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

// Fixed preference order for auto-fallback — free/generous-tier providers first,
// since that's what most users have configured and who's most likely to hit quota.
const FALLBACK_ORDER: ProviderName[] = ["gemini", "groq", "openrouter", "nvidia", "openai", "anthropic", "grok"];
// Groq and NVIDIA have no vision model and degrade gracefully (groq.ts/nvidia.ts), but a
// screenshot-blind answer is worse than one that can see the image, so they sort last when a screenshot is attached.
const VISION_INCAPABLE: ReadonlySet<ProviderName> = new Set(["groq", "nvidia"]);

export interface FallbackEvent {
  from: ProviderName;
  to: ProviderName;
  // "vision": rerouted to a provider that can see the screenshot before anything was sent.
  // "quota": the chosen provider hit a real 429 and another configured one answered instead.
  reason: "vision" | "quota";
}

/** Streams from `primaryName`, substituting another configured provider only for vision rescue (primary
 *  can't see images) or quota fallback (429/402/503/529/transport error); one-off only, always reported via onFallback. */
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
    // No vision-capable provider configured at all — fall through to the primary anyway.
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
    // The primary keeps the user's chosen model; a stand-in gets its provider's catalog
    // default. Checked by name, not index, since a vision rescue can push the primary later.
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
      // A fatal error, a fallback-worthy error with nothing left to fall back to, or an
      // error after output already started (would duplicate text) — surface it instead of retrying.
      if (yieldedAny || !isFallbackWorthy(err) || isLast) throw err;
    }
  }
}

// Opens (and keeps warm) the HTTPS connection to a provider so the first real
// request doesn't also pay DNS + TCP + TLS. no-cors: only the connection matters, any failure is ignored.
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
  // (a captive portal holding the socket open, a blackholed SYN) would leave a socket pending forever.
  fetch(url, {
    method: "HEAD",
    mode: "no-cors",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}