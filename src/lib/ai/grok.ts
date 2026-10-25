import type { AIProvider, AIRequestOptions } from "./types";
import { defaultSignal, httpError, readSSE, requireApiKey } from "./types";
import { modelIds } from "./catalog";

export class GrokProvider implements AIProvider {
  name = "grok";

  listModels(): string[] {
    return modelIds("grok");
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, prompt, messages = [], model, apiKey, maxTokens = 4096 } = options;

    const imageUrl = base64Image?.startsWith("data:")
      ? base64Image
      : base64Image ? `data:image/png;base64,${base64Image}` : undefined;

    const apiMessages: any[] = messages.map((m) => ({ role: m.role, content: m.content }));

    // All current Grok chat models (4.x+) are vision-capable by default — the
    // "-vision" suffix only existed on the retired grok-2 generation.
    if (imageUrl) {
      apiMessages.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: prompt },
        ],
      });
    } else {
      apiMessages.push({ role: "user", content: prompt });
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireApiKey(apiKey, "Grok", "https://console.x.ai/")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.6,
        stream: true,
        messages: apiMessages,
      }),
      signal: defaultSignal(options.signal),
    });

    if (!response.ok) {
      throw httpError("Grok", response, await response.json().catch(() => null));
    }

    for await (const frame of readSSE(response)) {
      const text = frame.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}