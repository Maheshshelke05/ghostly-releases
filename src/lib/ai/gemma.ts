import type { AIProvider, AIRequestOptions } from "./types";
import { defaultSignal, httpError, readSSE, requireApiKey } from "./types";

export class GemmaProvider implements AIProvider {
  name = "gemma";

  listModels(): string[] {
    return ["gemma-3-27b-it", "gemma-3-12b-it", "gemma-3-4b-it", "gemma-3n-e4b-it"];
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, mimeType = "image/png", prompt, messages = [], model, apiKey, maxTokens = 4096 } = options;

    // Not currently wired into the provider registry (dead code today), but
    // fixed preemptively: this used the same ?key= query-param auth that
    // gemini.ts's own history documents as returning 401
    // ACCESS_TOKEN_TYPE_UNSUPPORTED for the newer "AQ."-prefixed keys Google
    // AI Studio now issues by default — would reproduce that already-fixed
    // bug immediately if this provider is ever reactivated.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    const imageData = base64Image?.includes(",") ? base64Image.split(",")[1] : base64Image;
    const contents: any[] = [];

    for (const msg of messages) {
      contents.push({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] });
    }

    const parts: any[] = [];
    if (imageData) parts.push({ inline_data: { mime_type: mimeType, data: imageData } });
    parts.push({ text: prompt });
    contents.push({ role: "user", parts });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": requireApiKey(apiKey, "Gemma", "https://aistudio.google.com/app/apikey") },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens } }),
      signal: defaultSignal(options.signal),
    });

    if (!response.ok) {
      throw httpError("Gemma", response, await response.json().catch(() => null));
    }

    for await (const frame of readSSE(response)) {
      const text = frame.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("");
      if (text) yield text;
    }
  }
}
