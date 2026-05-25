import type { AIProvider, AIRequestOptions } from "./types";

export class GemmaProvider implements AIProvider {
  name = "gemma";

  listModels(): string[] {
    return ["gemma-3-27b-it", "gemma-3-12b-it", "gemma-3-4b-it", "gemma-3n-e4b-it"];
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, mimeType = "image/png", prompt, messages = [], model, apiKey, maxTokens = 4096 } = options;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 } }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Gemma API error: ${err.error?.message || response.statusText}`);
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
          } catch { /* skip */ }
        }
      }
    }
  }
}
