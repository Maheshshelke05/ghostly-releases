import type { AIProvider, AIRequestOptions } from "./types";

export class GroqProvider implements AIProvider {
  name = "groq";

  listModels(): string[] {
    return [
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ];
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, prompt, messages = [], model, apiKey, maxTokens = 4096 } = options;

    const imageUrl = base64Image?.startsWith("data:")
      ? base64Image
      : base64Image
        ? `data:image/png;base64,${base64Image}`
        : undefined;

    const apiMessages: any[] = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : String(m.content),
    }));

    // Groq vision models support image_url, text-only models need string content
    const hasVision = model.includes("scout") || model.includes("vision");
    if (imageUrl && hasVision) {
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

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.5,
          stream: true,
          messages: apiMessages,
        }),
      },
    );

    if (!response.ok) {
      const err = await response
        .json()
        .catch(() => ({ error: { message: response.statusText } }));
      throw new Error(
        `Groq API error: ${err.error?.message || response.statusText}`,
      );
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
