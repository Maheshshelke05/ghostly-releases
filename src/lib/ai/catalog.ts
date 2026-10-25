import type { ProviderName } from "./types";

// ───────────────────────── model catalog ─────────────────────────
//
// One list, three consumers: every provider's listModels(), ApiSetupPage's
// picker, and runKeyTest's per-provider default. They used to be maintained by
// hand in four places and HAD drifted — electron/ipc.ts shipped a default model
// the picker could not even select, while the picker offered a different list
// again. Every fix since (f870d58, 2ba6b83, 9c07f80, da2f03f) patched one dead
// ID at a time; this removes the bug class instead.
//
// Index 0 is the provider's DEFAULT model, which matters beyond the picker:
// streamWithFallback's quota fallback and resume/analyze.ts's planProvider both
// use listModels()[0] when the user has no saved model for a standing-in
// provider. So index 0 is always the one that works on a bare free key.

export interface CatalogModel {
  id: string;
  /** Display name, shown in the picker. */
  name: string;
  /** Short qualifier (price tier, speed, position in the line-up). */
  desc?: string;
}

export const MODEL_CATALOG: Record<ProviderName, CatalogModel[]> = {
  groq: [
    // "meta-llama/llama-4-scout-17b-16e-instruct" was removed from Groq's catalog
    // entirely — it 400s "model does not exist" for every user. Groq has no
    // vision-capable model at all, so everything here is text-only.
    // llama-3.3-70b-versatile and llama-3.1-8b-instant were both shut down
    // 08/16/26 (console.groq.com/docs/deprecations).
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", desc: "FREE" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", desc: "FREE + FAST" },
  ],

  gemini: [
    // Verified against ai.google.dev/gemini-api/docs/deprecations (2026-10-19):
    //   gemini-3.8-flash      released 2026-09-02, no shutdown announced
    //   gemini-3.6-flash      released 2026-07-21, no shutdown announced
    //   gemini-3.5-flash-lite released 2026-07-21, no shutdown announced
    // Dropped two entries here:
    //   gemini-3.1-flash-lite — shuts down 2027-05-07; Google's own listed
    //     replacement is gemini-3.5-flash-lite, now offered above.
    //   gemini-3.5-flash — DEPRECATED, not fabricated. It is a real ID that
    //     still resolves, but Google auto-routes it to gemini-3.6-flash and it
    //     is not selectable in AI Studio, so offering it in a picker would be
    //     advertising a model that never answers. (An earlier comment here
    //     claimed it "was never a real model ID" — that was wrong, and the wrong
    //     diagnosis is exactly what would make the next audit skip it again.)
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", desc: "FREE · Newest, best all-round" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", desc: "FREE · Fast & smart" },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Lite", desc: "FREE · Fastest (~2s)" },
  ],

  openrouter: [
    // Re-verified against OpenRouter's live catalog (openrouter.ai/api/v1/models,
    // needs no key) on 2026-10-19: all 15 free models below are present, and the
    // ":free" suffix means a zero-price entry, not just a popular one.
    //
    // nvidia/nemotron-3.5-super-vl:free is first because index 0 is what the
    // quota fallback in lib/ai/index.ts reaches for when this provider stands in
    // for another. It is free AND takes images, so a screenshot fallback still
    // gets answered. "openrouter/auto" is kept selectable but NOT default: it
    // routes to whatever OpenRouter judges best, paid models included, which on
    // a free key is a 402 — and it used to be index 0.
    // nvidia/nemotron-3.5-content-safety:free is deliberately excluded: it is a
    // moderation classifier, not a conversational model.
    { id: "nvidia/nemotron-3.5-super-vl:free", name: "Nemotron 3.5 Super VL", desc: "FREE + VISION" },
    { id: "nvidia/nemotron-3.5-lightning:free", name: "Nemotron 3.5 Lightning", desc: "FREE + FAST" },
    { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "Nemotron 3 Nano Omni 30B", desc: "FREE + VISION" },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super 120B", desc: "FREE" },
    { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nemotron 3 Ultra 550B", desc: "FREE · 1M context" },
    { id: "thinkingmachines/inkling:free", name: "Inkling", desc: "FREE + VISION · 1M context" },
    { id: "thinkingmachines/inkling-small:free", name: "Inkling Small", desc: "FREE + VISION · 1M context" },
    { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B IT", desc: "FREE + VISION" },
    { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B A4B IT", desc: "FREE + VISION" },
    { id: "dots-studio/dots-3-note-preview:free", name: "Dots3 Note Preview", desc: "FREE + VISION · 512K context" },
    { id: "cohere/north-mini-code:free", name: "North Mini Code", desc: "FREE · code-focused" },
    { id: "liquid/lfm-2.5-2.6b:free", name: "LFM2.5 2.6B", desc: "FREE · compact" },
    { id: "poolside/laguna-s-2.1:free", name: "Laguna S 2.1", desc: "FREE" },
    { id: "poolside/laguna-xs-2.1:free", name: "Laguna XS 2.1", desc: "FREE · compact" },
    { id: "xingchen-agi/xing4.0-29b-a4b:free", name: "Xing4.0 29B A4B", desc: "FREE" },
    { id: "openrouter/auto", name: "Auto", desc: "may route to PAID models — needs credits" },
  ],

  nvidia: [
    // Confirmed live against integrate.api.nvidia.com/v1/chat/completions on
    // 2026-10-17: a bad key gets HTTP 403 "Authorization failed", not 410/404,
    // which is proof the model itself resolves. All three previous IDs had
    // reached end of life and returned 410 "has reached its end of life".
    // NVIDIA has no vision-capable model, so Screen Analysis degrades gracefully
    // (see nvidia.ts) rather than erroring.
    { id: "nvidia/llama-3.1-nemotron-70b-instruct", name: "Llama 3.1 Nemotron 70B Instruct", desc: "FREE" },
    { id: "mistralai/mixtral-8x22b-v0.1", name: "Mixtral 8x22B", desc: "FREE" },
    { id: "deepseek-ai/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", desc: "FREE" },
  ],

  openai: [
    // The gpt-5 family rejects `max_tokens` (wants `max_completion_tokens`) and
    // rejects any temperature other than the default 1 — see openai.ts, which
    // probes and self-corrects per model id. All four ids below are live.
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", desc: "Flagship" },
    { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", desc: "Balanced" },
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", desc: "Fast" },
    { id: "gpt-4o", name: "GPT-4o", desc: "Legacy" },
  ],

  anthropic: [
    // Verified against platform.claude.com/docs/en/about-claude/models on
    // 2026-10-19. All four are listed Active with no deprecation:
    //   claude-sonnet-5-5  (newest, and the one the fallback should reach for:
    //                       fast, and $2/$10 vs Opus 5.5's $4/$20)
    //   claude-opus-5-5    (most capable)
    //   claude-haiku-5-5   (fastest, near-free)
    //   claude-sonnet-5    (previous flagship)
    // Dropped: claude-haiku-4-5-20251001 ("not sooner than 2026-10-15", i.e.
    // already at its retirement date) and the whole 4.x line.
    // NOTE: temperature/top_p/top_k are deprecated on Claude 4.7+ and return 400
    // when set to a non-default value — anthropic.ts sends none of them.
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", desc: "Newest, balanced" },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", desc: "Most capable" },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", desc: "Fastest" },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5", desc: "Previous flagship" },
  ],

  grok: [
    { id: "grok-4.7", name: "Grok 4.7", desc: "Latest" },
    { id: "grok-4.6", name: "Grok 4.6", desc: "" },
    { id: "grok-4.5", name: "Grok 4.5", desc: "" },
    { id: "grok-4.3", name: "Grok 4.3", desc: "" },
  ],
};

/** Model ids for a provider, in catalog order. */
export function modelIds(provider: ProviderName): string[] {
  return MODEL_CATALOG[provider].map((m) => m.id);
}

/** id -> picker label ("Name · qualifier"). */
export function modelLabels(provider: ProviderName): Record<string, string> {
  return Object.fromEntries(
    MODEL_CATALOG[provider].map((m) => [m.id, m.desc ? `${m.name} · ${m.desc}` : m.name]),
  );
}

/**
 * The model to use when the caller has none of their own. Index 0 of the
 * catalog, resolved by identity rather than trusting a copy at each call site.
 */
export function defaultModel(provider: ProviderName): string {
  const first = MODEL_CATALOG[provider][0];
  if (!first) throw new Error(`No models are configured for AI provider "${provider}".`);
  return first.id;
}

/**
 * Falls forward to the default when a saved model has since left the catalog,
 * so a stale saved setting degrades to "works" instead of 404ing forever.
 */
export function resolveModel(provider: ProviderName, saved: string | undefined | null): string {
  const ids = modelIds(provider);
  return saved && ids.includes(saved) ? saved : defaultModel(provider);
}