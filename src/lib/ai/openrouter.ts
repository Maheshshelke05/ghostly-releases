import type { AIProvider, AIRequestOptions } from "./types";

export const OPENROUTER_FREE_MODELS = [
  { id: "openrouter/auto", name: "Auto (Best Free)", desc: "Automatically selects best free model" },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "Nemotron 3 Nano Omni 30B", desc: "Reasoning model by NVIDIA" },
  { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B IT", desc: "Large instruction model by Google" },
  { id: "nvidia/nemotron-nano-12b-v2-vl:free", name: "Nemotron Nano 12B V2 VL", desc: "Vision-language model by NVIDIA" },
  { id: "nvidia/llama-nemotron-embed-vl-1b-v2:free", name: "Llama Nemotron Embed VL 1B V2", desc: "Compact vision-language model by NVIDIA" },
  { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B A4B IT", desc: "Fast instruction model by Google" },
];

export class OpenRouterProvider implements AIProvider {
  name = "openrouter";

  listModels(): string[] {
    return OPENROUTER_FREE_MODELS.map((m) => m.id);
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, prompt, messages = [], model, apiKey, maxTokens = 8192 } = options;

    const requestedModel = model || "openrouter/auto";
    const safeModel = OPENROUTER_FREE_MODELS.some((m) => m.id === requestedModel) ? requestedModel : "openrouter/auto";

    const imageUrl = base64Image?.startsWith("data:")
      ? base64Image
      : base64Image
        ? `data:image/png;base64,${base64Image}`
        : undefined;

    // OpenRouter auto model doesn't need vision check - it handles everything
    const apiMessages: any[] = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : String(m.content),
    }));

    if (imageUrl) {
      apiMessages.push({
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      });
    } else {
      apiMessages.push({ role: "user", content: prompt });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ghostly.ai",
        "X-Title": "Ghostly AI",
      },
      body: JSON.stringify({
        model: safeModel,
        messages: apiMessages,
        stream: true,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`OpenRouter API error: ${err.error?.message || response.statusText}`);
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
          } catch {
            /* skip malformed chunks */
          }
        }
      }
    }
  }
}
