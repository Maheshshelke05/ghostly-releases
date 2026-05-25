import type { AIProvider, AIRequestOptions } from "./types";

export class OllamaProvider implements AIProvider {
  name = "ollama";

  listModels(): string[] {
    return ["llama3.2", "llama3.1", "mistral", "codellama", "deepseek-coder"];
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, prompt, messages = [], model, apiKey, maxTokens = 4096 } = options;
    // apiKey field is used as the Ollama base URL (e.g. http://localhost:11434)
    const baseUrl = (apiKey || "http://localhost:11434").replace(/\/$/, "");

    const apiMessages: any[] = messages.map(m => ({ role: m.role, content: m.content }));

    const imageData = base64Image?.includes(",") ? base64Image.split(",")[1] : base64Image;
    const userMsg: any = { role: "user", content: prompt };
    if (imageData) userMsg.images = [imageData];
    apiMessages.push(userMsg);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: apiMessages, stream: true, options: { num_predict: maxTokens } }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama error: ${err || response.statusText}`);
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
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          const text = data.message?.content;
          if (text) yield text;
          if (data.done) return;
        } catch { /* skip */ }
      }
    }
  }
}
