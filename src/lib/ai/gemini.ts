import type { AIProvider, AIRequestOptions } from "./types";
import { defaultSignal, httpError, readSSE, rateLimitError, requireApiKey } from "./types";
import { modelIds } from "./catalog";

// Gemini 3.x Flash models "think" by default: hundreds of hidden tokens are
// generated before the first visible word. Measured on this app's own prompts
// (screenshot -> short answer): ~370-520 thinking tokens per answer, i.e. 3-6s
// before/while anything showed, versus ~2s with thinking down to minimal — and
// identical correctness on Two Sum / Trapping Rain Water / Coin Change / Median
// of Two Sorted Arrays / Minimum Window Substring (all passed, run against real
// tests). This app wants short, glanceable answers fast, so thinking is turned
// down. "minimal" is the lowest level the 3.x models accept: the old
// `thinkingBudget: 0` was a Gemini 2.5-era field and the 3.x docs now specify
// `thinking_level` (ai.google.dev/gemini-api/docs/thinking). Pro models can't
// turn thinking down, so they keep their default.
function thinkingConfigFor(model: string): { thinkingLevel: string } | undefined {
  return /pro/i.test(model) ? undefined : { thinkingLevel: "minimal" };
}

// Hidden thinking tokens come out of maxOutputTokens on Gemini too (Google says
// so explicitly: setting a low limit "can truncate responses"), so the visible
// budget gets headroom for them.
const THINKING_HEADROOM_TOKENS = 2048;

// Models that rejected `thinkingConfig` once and never see it again. The old
// code retried the whole request — including re-uploading the entire base64
// screenshot — on every single call, which on a free tier is a guaranteed 429.
const THINKING_REJECTED = new Set<string>();

export class GeminiProvider implements AIProvider {
  name = "gemini";

  listModels(): string[] {
    return modelIds("gemini");
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    let {
      base64Image,
      mimeType = "image/png",
      prompt,
      messages = [],
      model,
      apiKey,
      maxTokens = 4096,
    } = options;
    const signal = defaultSignal(options.signal);

    // Clean model name
    model = model.trim().replace(/\s+/g, "");

    // Passing the key via `?key=` query param returns
    // "401 ACCESS_TOKEN_TYPE_UNSUPPORTED" for the newer "AQ."-prefixed Auth Keys
    // that Google AI Studio now issues by default (legacy "AIza" Standard keys
    // are being phased out entirely by Sept 2026). The `x-goog-api-key` header
    // is Google's current documented method and works with both key formats.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    // Strip data URL prefix if present
    const imageData = base64Image?.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;

    const contents: any[] = [];

    // Map previous messages
    for (const msg of messages) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    // Append new prompt + image
    const parts: any[] = [];
    if (imageData) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: imageData,
        },
      });
    }
    parts.push({ text: prompt });

    contents.push({ role: "user", parts });

    const headers = {
      "Content-Type": "application/json",
      "x-goog-api-key": requireApiKey(apiKey, "Gemini", "https://aistudio.google.com/app/apikey"),
    };

    // temperature / topP / topK are deprecated on Gemini 3.6+ and are no longer
    // sent at all. What remains is the output ceiling plus, when supported, the
    // thinking level.
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens + THINKING_HEADROOM_TOKENS,
    };
    const thinking = THINKING_REJECTED.has(model) ? undefined : thinkingConfigFor(model);
    if (thinking) generationConfig.thinkingConfig = thinking;

    const send = (config: Record<string, unknown>) =>
      fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ contents, generationConfig: config }),
        signal,
      });

    let response = await send(generationConfig);

    // A model variant that rejects thinkingConfig must not break the answer:
    // drop it, remember the answer for this model id, and retry once.
    if (response.status === 400 && thinking) {
      const detail = await response.clone().text().catch(() => "");
      if (/thinking/i.test(detail)) {
        THINKING_REJECTED.add(model);
        delete generationConfig.thinkingConfig;
        response = await send(generationConfig);
      }
    }

    if (!response.ok) {
      const parsed = await response.json().catch(() => null);
      const rawMessage = (parsed as any)?.error?.message || response.statusText;
      // 429 covers both a real per-day quota AND a much more common per-minute
      // rate limit on the free tier — Google's own message doesn't always make
      // that distinction obvious, and users were reading any 429 as "I'm out
      // for the day" even when it clears in under a minute. Surface which kind
      // this actually looks like instead of passing the raw text through as-is.
      if (response.status === 429) {
        const isDaily = /per[\s-]?day|daily limit|quota exceeded/i.test(rawMessage);
        throw rateLimitError(
          isDaily
            ? `Gemini free-tier DAILY quota reached for this key. It resets at midnight Pacific Time — switch to another provider in Settings to keep going today. (${rawMessage})`
            : `Gemini rate limit hit (too many requests in a short time — this is usually per-MINUTE, not per-day). Wait ~30-60s and try again, or switch provider in Settings. (${rawMessage})`,
        );
      }
      throw httpError("Gemini", response, parsed, rawMessage);
    }

    for await (const frame of readSSE(response)) {
      const text = frame.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("");
      if (text) yield text;
    }
  }
}