import type { AIProvider, AIRequestOptions } from "./types";
import { rateLimitError } from "./types";

// Gemini 3.x Flash models "think" by default: hundreds of hidden tokens are
// generated before the first visible word. Measured on this app's own prompts
// (screenshot -> short answer): ~370-520 thinking tokens per answer, i.e. 3-6s
// before/while anything showed, versus ~2s with thinking off — and identical
// correctness on Two Sum / Trapping Rain Water / Coin Change / Median of Two
// Sorted Arrays / Minimum Window Substring (all passed, run against real tests).
// This app wants short, glanceable answers fast, so thinking is switched off.
// Pro models can't turn thinking off, so they keep their default.
function thinkingConfigFor(model: string): { thinkingBudget: number } | undefined {
  return /pro/i.test(model) ? undefined : { thinkingBudget: 0 };
}

export class GeminiProvider implements AIProvider {
  name = "gemini";

  listModels(): string[] {
    // Verified live against a current "AQ."-format Auth Key (the format
    // Google AI Studio now issues by default): gemini-2.5-flash/2.5-pro/
    // 2.0-flash/2.5-flash-lite all 404 ("no longer available to new users")
    // for this key type — they were quietly killing "Invalid API key"
    // reports for users with perfectly valid new keys.
    return [
      "gemini-3.5-flash",
      "gemini-pro-latest",
      "gemini-3.1-flash-lite",
    ];
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
      signal,
    } = options;

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
        parts: [{ text: msg.content }]
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

    contents.push({
      role: "user",
      parts,
    });

    const thinking = thinkingConfigFor(model);
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens,
      temperature: 0.4,
      topP: 0.95,
      topK: 40,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    };
    const body = { contents, generationConfig };

    const send = () =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal,
      });

    let response = await send();

    // A model variant that rejects thinkingConfig must not break the answer:
    // drop it and retry once with Gemini's defaults.
    if (response.status === 400 && thinking) {
      const detail = await response.clone().text().catch(() => "");
      if (/thinking/i.test(detail)) {
        delete generationConfig.thinkingConfig;
        response = await send();
      }
    }

    if (!response.ok) {
      const err = await response
        .json()
        .catch(() => ({ error: { message: response.statusText } }));
      const rawMessage = err.error?.message || response.statusText;
      // 429 covers both a real per-day quota AND a much more common per-minute
      // rate limit on the free tier — Google's own message doesn't always make
      // that distinction obvious, and users were reading any 429 as "I'm out
      // for the day" even when it clears in under a minute. Surface which kind
      // this actually looks like instead of passing the raw text through as-is.
      if (response.status === 429) {
        const isDaily = /per[\s-]?day|daily|PerDay/i.test(rawMessage);
        throw rateLimitError(
          isDaily
            ? `Gemini free-tier DAILY quota reached for this key. It resets at midnight Pacific Time — switch to another provider in Settings to keep going today. (${rawMessage})`
            : `Gemini rate limit hit (too many requests in a short time — this is usually per-MINUTE, not per-day). Wait ~30-60s and try again, or switch provider in Settings. (${rawMessage})`,
        );
      }
      throw new Error(`Gemini API error: ${rawMessage}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield text;
          } catch {
            /* skip malformed chunks */
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.startsWith("data: ")) {
      try {
        const data = JSON.parse(buffer.slice(6));
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        /* skip */
      }
    }
  }
}
