import type { AIProvider, AIRequestOptions } from "./types";

export class GroqProvider implements AIProvider {
  name = "groq";

  listModels(): string[] {
    // "meta-llama/llama-4-scout-17b-16e-instruct" was removed from Groq's catalog
    // entirely (production and preview) — it now 400s with "model does not exist or
    // you do not have access to it" for every user, which is what bug reports on
    // v3.3.3/v3.3.4 were surfacing. Groq currently has no vision-capable model at all,
    // so it's text-only until they ship a replacement.
    //
    // llama-3.3-70b-versatile and llama-3.1-8b-instant are BOTH being shut down by
    // Groq on 08/16/26 (per console.groq.com/docs/deprecations) — removed entirely
    // rather than left in as an option that's about to start failing for everyone.
    return [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
    ];
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
