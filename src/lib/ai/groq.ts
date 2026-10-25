import type { AIProvider, AIRequestOptions } from "./types";
import { defaultSignal, httpError, readSSE, requireApiKey } from "./types";
import { modelIds } from "./catalog";

export class GroqProvider implements AIProvider {
  name = "groq";

  listModels(): string[] {
    return modelIds("groq");
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, prompt, messages = [], model, apiKey, maxTokens = 4096 } = options;

    const apiMessages: any[] = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : String(m.content),
    }));

    // Groq has no vision-capable model right now — sending an image_url part to a
    // text-only model is itself a hard API error, so degrade gracefully instead of
    // silently dropping the screenshot or crashing: tell the model (and by extension
    // the user, since this becomes part of the response) that it can't see the image.
    if (base64Image) {
      apiMessages.push({
        role: "user",
        content: `[Note: a screenshot was attached, but Groq models don't support image input yet — please ask the user to describe what's on screen, or switch to Gemini/OpenRouter for screen analysis.]\n\n${prompt}`,
      });
    } else {
      apiMessages.push({ role: "user", content: prompt });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireApiKey(apiKey, "Groq", "https://console.groq.com/keys")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.5,
        stream: true,
        messages: apiMessages,
      }),
      signal: defaultSignal(options.signal),
    });

    if (!response.ok) {
      throw httpError("Groq", response, await response.json().catch(() => null));
    }

    for await (const frame of readSSE(response)) {
      const text = frame.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}