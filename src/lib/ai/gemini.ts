import type { AIProvider, AIRequestOptions } from "./types";

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

    const body = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.4,
        topP: 0.95,
        topK: 40,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response
        .json()
        .catch(() => ({ error: { message: response.statusText } }));
      throw new Error(
        `Gemini API error: ${err.error?.message || response.statusText}`,
      );
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
