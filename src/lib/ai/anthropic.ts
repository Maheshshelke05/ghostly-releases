import type { AIProvider, AIRequestOptions } from "./types";

export class AnthropicProvider implements AIProvider {
  name = "anthropic";

  listModels(): string[] {
    return [
      "claude-sonnet-5",
      "claude-opus-5",
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-5-20250929",
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

    // CRITICAL FIX: Clean model name - remove all whitespace
    model = model.trim().replace(/\s+/g, "");

    try {
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
          source: {
            type: "base64",
            media_type: mimeType,
            data: imageData,
          },
        });
      }
      currentContent.push({ type: "text", text: prompt });

      apiMessages.push({
        role: "user",
        content: currentContent as any,
      });

      const body = {
        model,
        max_tokens: maxTokens,
        stream: false,
        messages: apiMessages,
        temperature: 0.7,
      };

      console.log("[Anthropic] Calling via Electron proxy");
      console.log("[Anthropic] Model:", model);

      const result = await window.ghostly.anthropicApiCall(apiKey, body);

      console.log("[Anthropic] Response status:", result.status);

      if (!result.ok) {
        console.error("[Anthropic] API error:", result.data);
        throw new Error(`Anthropic API failed (${result.status}): ${result.data.slice(0, 300)}`);
      }

      const response = JSON.parse(result.data);
      const content = response.content?.[0]?.text;
      
      if (content) {
        yield content;
      } else {
        throw new Error("No content in Anthropic response");
      }
    } catch (error) {
      console.error("[Anthropic] Provider error:", error);
      throw error;
    }
  }
}
