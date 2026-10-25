import type { AIProvider, AIRequestOptions } from "./types";
import { defaultSignal, httpError, readSSE, rateLimitError, requireApiKey } from "./types";
import { modelIds } from "./catalog";

// Gemini 3.x Flash thinks by default: hundreds of hidden tokens (~3-6s) before the
// first visible word, versus ~2s at "minimal". Pro models can't turn it down, so they keep the default.
function thinkingConfigFor(model: string): { thinkingLevel: string } | undefined {
  return /pro/i.test(model) ? undefined : { thinkingLevel: "minimal" };
}

// Hidden thinking tokens come out of maxOutputTokens too (Google says a low limit
// "can truncate responses"), so the visible budget gets headroom for them.
const THINKING_HEADROOM_TOKENS = 2048;

// Models that rejected `thinkingConfig` once and never see it again: retrying the
// whole request (including the base64 screenshot) on every call is a guaranteed 429 on a free tier.
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

    model = model.trim().replace(/\s+/g, "");

    // Passing the key via `?key=` returns "401 ACCESS_TOKEN_TYPE_UNSUPPORTED" for the
    // newer "AQ."-prefixed Auth Keys; the `x-goog-api-key` header works with both formats.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    const imageData = base64Image?.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;

    const contents: any[] = [];

    for (const msg of messages) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

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

    // temperature / topP / topK are deprecated on Gemini 3.6+ and are not sent;
    // only the output ceiling and, when supported, the thinking level remain.
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
      // 429 covers both a real per-day quota and the far more common per-minute free-tier
      // limit; users read any 429 as "out for the day", so surface which kind it looks like.
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