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
import { MODEL_CATALOG, modelIds } from "./catalog";

// Kept as a named export because ApiSetupPage.tsx still imports it.
export const NVIDIA_MODELS = MODEL_CATALOG.nvidia;

export class NvidiaProvider implements AIProvider {
  name = "nvidia";

  listModels(): string[] {
    return modelIds("nvidia");
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { prompt, messages = [], model, apiKey, base64Image, maxTokens = 4096 } = options;
    const signal = defaultSignal(options.signal);

    const cleanModel = model.trim().replace(/\s+/g, "");

    // An empty key would otherwise spend a guaranteed 401 round trip in the proxy.
    const nvidiaKey = requireApiKey(apiKey, "NVIDIA", "https://build.nvidia.com/");

    let finalPrompt = prompt;
    if (base64Image) {
      finalPrompt = `[Note: User shared a screenshot but this model doesn't support images. Please ask them to describe what they see.]\n\n${prompt}`;
    }

    const body = {
      model: cleanModel,
      messages: [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: finalPrompt },
      ],
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: maxTokens,
      stream: false,
    };

    const call = async () => {
      const result = await raceSignal(window.ghostly.nvidiaApiCall(nvidiaKey, body), signal);
      if (!result.ok) {
        const message = extractApiErrorMessage(result.data, "NVIDIA", result.status);
        if (result.status === 429) throw rateLimitError(message);
        throw new ProviderError(message, result.status);
      }
      return result;
    };

    // The proxy has no abort channel, so raceSignal bounds the wait, and one
    // jittered retry rides out the 5xx that NVIDIA's gateway throws under load.
    const result = await retryOnServerError(call, signal);

    let response: any;
    try {
      response = JSON.parse(result.data);
    } catch {
      throw new ProviderError(
        "NVIDIA returned a non-JSON response — a network proxy or captive portal may be intercepting the request.",
      );
    }

    const content = response.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      yield content;
    } else {
      throw new ProviderError("NVIDIA returned no content.");
    }
  }
}