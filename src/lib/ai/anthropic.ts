import type { AIProvider, AIRequestOptions } from "./types";
import {
  defaultSignal,
  extractApiErrorMessage,
  ProviderError,
  raceSignal,
  rateLimitError,
  requireApiKey,
  retryOnServerError,
} from "./types";
import { modelIds } from "./catalog";

export class AnthropicProvider implements AIProvider {
  name = "anthropic";

  listModels(): string[] {
    return modelIds("anthropic");
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, mimeType = "image/png", prompt, messages = [], apiKey, maxTokens = 4096 } = options;
    const signal = defaultSignal(options.signal);
    let model = options.model;

    // An empty key would otherwise spend a guaranteed 401 round trip in the proxy.
    const anthropicKey = requireApiKey(apiKey, "Anthropic", "https://console.anthropic.com/settings/keys");

    model = model.trim().replace(/\s+/g, "");

    const imageData = base64Image?.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;

    const apiMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const currentContent: any[] = [];
    if (imageData) {
      currentContent.push({
        type: "image",
        source: { type: "base64", media_type: mimeType, data: imageData },
      });
    }
    currentContent.push({ type: "text", text: prompt });
    apiMessages.push({ role: "user", content: currentContent as any });

    const body = {
      model,
      max_tokens: maxTokens,
      // No temperature/top_p/top_k: deprecated on Claude 4.7+ and a 400 for any
      // non-default value, which is every model this app offers.
      stream: false,
      messages: apiMessages,
    };

    const call = async () => {
      const result = await raceSignal(
        window.ghostly.anthropicApiCall(anthropicKey, body),
        signal,
      );
      if (!result.ok) {
        const message = extractApiErrorMessage(result.data, "Anthropic", result.status);
        if (result.status === 429) throw rateLimitError(message);
        // 529 ("overloaded") and 5xx classify as retryable, so the fallback chain
        // in lib/ai/index.ts fires for both common Anthropic failures.
        throw new ProviderError(message, result.status);
      }
      return result;
    };

    // The proxy has no abort channel, so raceSignal bounds the wait, and one
    // jittered retry rides out the 5xx that Anthropic's gateway throws under load.
    const result = await retryOnServerError(call, signal);

    let response: any;
    try {
      response = JSON.parse(result.data);
    } catch {
      throw new ProviderError(
        "Anthropic returned a non-JSON response — a network proxy or captive portal may be intercepting the request.",
      );
    }

    // Thinking blocks come first when a model emits them, so joining every text
    // block beats assuming content[0] is the answer.
    const text = (Array.isArray(response.content) ? response.content : [])
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("");

    if (text) {
      yield text;
    } else {
      throw new ProviderError("Anthropic returned no text content.");
    }
  }
}