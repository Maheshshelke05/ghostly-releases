import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { OpenRouterProvider } from "./openrouter";
import { NvidiaProvider } from "./nvidia";
import type { AIProvider } from "./types";

export type ProviderName = "groq" | "gemini" | "openrouter" | "nvidia";

const providers: Record<ProviderName, AIProvider> = {
  groq:        new GroqProvider(),
  gemini:      new GeminiProvider(),
  openrouter:  new OpenRouterProvider(),
  nvidia:      new NvidiaProvider(),
};

export function getProvider(name: ProviderName): AIProvider {
  return providers[name] ?? providers["groq"];
}

export function getAllProviders(): Record<ProviderName, AIProvider> {
  return providers;
}

export { providers };
