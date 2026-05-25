import type { AIProvider, AIRequestOptions } from "./types";

export class ManagedProvider implements AIProvider {
  name = "managed";
  listModels(): string[] { return []; }
  async *streamSolution(_options: AIRequestOptions): AsyncGenerator<string> {
    throw new Error("Managed AI not available. Please use your own API key in Settings.");
  }
}
