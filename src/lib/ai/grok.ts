import type { AIProvider, AIRequestOptions } from "./types";

export class GrokProvider implements AIProvider {
  name = "grok";

  listModels(): string[] {
    return ["grok-4.6", "grok-4.5", "grok-4.3"];
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, prompt, messages = [], model, apiKey, maxTokens = 4096 } = options;

    const imageUrl = base64Image?.startsWith("data:")
      ? base64Image
      : base64Image ? `data:image/png;base64,${base64Image}` : undefined;

    const apiMessages: any[] = messages.map(m => ({ role: m.role, content: m.content }));

    // All current Grok chat models (4.x+) are vision-capable by default — the
    // "-vision" suffix only existed on the retired grok-2 generation.
    if (imageUrl) {
      apiMessages.push({ role: "user", content: [{ type: "image_url", image_url: { url: imageUrl } }, { type: "text", text: prompt }] });
    } else {
      apiMessages.push({ role: "user", content: prompt });
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.6, stream: true, messages: apiMessages }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Grok API error: ${err.error?.message || response.statusText}`);
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
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.slice(6));
            const text = data.choices?.[0]?.delta?.content;
            if (text) yield text;
          } catch { /* skip */ }
        }
      }
    }
  }
}
