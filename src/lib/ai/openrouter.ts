import type { AIProvider, AIRequestOptions } from "./types";
import { defaultSignal, httpError, ProviderError, readSSE, requireApiKey } from "./types";
import { defaultModel, MODEL_CATALOG, modelIds } from "./catalog";

// Kept as a named export because the (dead) SettingsPanel.tsx still imports it.
export const OPENROUTER_FREE_MODELS = MODEL_CATALOG.openrouter;

export class OpenRouterProvider implements AIProvider {
  name = "openrouter";

  listModels(): string[] {
    return modelIds("openrouter");
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, prompt, messages = [], model, apiKey, maxTokens = 4096 } = options;

    const requestedModel = model || defaultModel("openrouter");
    const known = modelIds("openrouter");
    // "openrouter/auto" is only a last resort: it routes to whatever OpenRouter
    // judges best, PAID models included, which on a free key is a 402.
    const fallbackModel = known.find((id) => !id.endsWith("/auto")) ?? requestedModel;
    const safeModel = known.includes(requestedModel) ? requestedModel : fallbackModel;
    if (safeModel !== requestedModel) {
      // Warn instead of substituting silently: a saved model missing from the catalog is rerouted visibly.
      console.warn(`[OpenRouter] "${requestedModel}" isn't in the current model list — using "${safeModel}" instead.`);
    }

    const imageUrl = base64Image?.startsWith("data:")
      ? base64Image
      : base64Image
        ? `data:image/png;base64,${base64Image}`
        : undefined;

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
        Authorization: `Bearer ${requireApiKey(apiKey, "OpenRouter", "https://openrouter.ai/keys")}`,
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
      signal: defaultSignal(options.signal),
    });

    if (!response.ok) {
      const parsed = await response.json().catch(() => null);
      if (response.status === 401) {
        throw new ProviderError("Invalid OpenRouter API key. Get a free API key at openrouter.ai/keys", 401, "fatal");
      }
      throw httpError("OpenRouter", response, parsed);
    }

    for await (const frame of readSSE(response)) {
      const text = frame.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}