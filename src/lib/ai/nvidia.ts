import type { AIProvider, AIRequestOptions } from "./types";

export const NVIDIA_MODELS = [
  // Top 3 Best Free Models — IDs verified against NVIDIA's current NIM catalog.
  // The previous IDs here were incomplete/stale (missing size suffix on the
  // Nemotron model, missing the "-instruct-v0.1" suffix on Mixtral) and were
  // 404ing on every call.
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1.5", name: "Llama 3.3 Nemotron Super 49B v1.5" },
  { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
  { id: "mistralai/mixtral-8x7b-instruct-v0.1", name: "Mixtral 8x7B Instruct" },
];

export class NvidiaProvider implements AIProvider {
  name = "NVIDIA";

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    let { prompt, messages = [], model, apiKey, base64Image } = options;

    // Clean model name
    model = model.trim().replace(/\s+/g, "");

    try {
      let finalPrompt = prompt;
      if (base64Image) {
        finalPrompt = `[Note: User shared a screenshot but this model doesn't support images. Please ask them to describe what they see.]\n\n${prompt}`;
      }

      const body = {
        model,
        messages: [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: finalPrompt },
        ],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 4096,
        stream: false,
      };

      console.log("[NVIDIA] Calling via Electron proxy");
      console.log("[NVIDIA] Model:", model);

      const result = await window.ghostly.nvidiaApiCall(apiKey, body);

      console.log("[NVIDIA] Response status:", result.status);

      if (!result.ok) {
        console.error("[NVIDIA] API error:", result.data);
        throw new Error(`NVIDIA API failed (${result.status}): ${result.data.slice(0, 300)}`);
      }

      const response = JSON.parse(result.data);
      const content = response.choices?.[0]?.message?.content;
      
      if (content) {
        yield content;
      } else {
        throw new Error("No content in NVIDIA response");
      }
    } catch (error) {
      console.error("[NVIDIA] Provider error:", error);
      throw error;
    }
  }

  listModels(): string[] {
    return NVIDIA_MODELS.map((m) => m.id);
  }
}
