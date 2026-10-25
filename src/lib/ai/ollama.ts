import type { AIProvider, AIRequestOptions } from "./types";
import { defaultSignal, httpError } from "./types";

// NOTE: this provider is not registered in lib/ai/index.ts and nothing imports
// it. It was left in place while the provider registry is being cleaned up, but
// it is dead code — see PUBLISH.
export class OllamaProvider implements AIProvider {
  name = "ollama";

  listModels(): string[] {
    return ["llama3.2", "llama3.1", "mistral", "codellama", "deepseek-coder"];
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    // `endpoint` rather than the `apiKey` slot this used to abuse: a field named
    // apiKey carrying an arbitrary URL is how a key ends up sent to a hostile host.
    const { base64Image, prompt, messages = [], model, endpoint, maxTokens = 4096 } = options as AIRequestOptions & {
      endpoint?: string;
    };
    const baseUrl = (endpoint?.trim() || "http://localhost:11434").replace(/\/$/, "");

    const apiMessages: any[] = messages.map((m) => ({ role: m.role, content: m.content }));

    const imageData = base64Image?.includes(",") ? base64Image.split(",")[1] : base64Image;
    const userMsg: any = { role: "user", content: prompt };
    if (imageData) userMsg.images = [imageData];
    apiMessages.push(userMsg);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: apiMessages, stream: true, options: { num_predict: maxTokens } }),
      signal: defaultSignal(options.signal),
    });

    if (!response.ok) {
      // Ollama's /api/chat answers with a plain-text error, not JSON.
      const text = await response.text().catch(() => "");
      throw httpError("Ollama", response, { message: text || response.statusText });
    }

    // /api/chat streams one JSON object per line (not SSE), so it keeps its own
    // reader instead of readSSE.
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
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          const text = data.message?.content;
          if (text) yield text;
          if (data.done) return;
        } catch { /* skip */ }
      }
    }
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        const text = data.message?.content;
        if (text) yield text;
      } catch { /* skip */ }
    }
  }
}