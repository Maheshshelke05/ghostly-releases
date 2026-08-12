import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { OpenRouterProvider } from "./openrouter";
import { NvidiaProvider } from "./nvidia";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GrokProvider } from "./grok";
import type { AIProvider } from "./types";

export type ProviderName = "groq" | "gemini" | "openrouter" | "nvidia" | "openai" | "anthropic" | "grok";

const providers: Record<ProviderName, AIProvider> = {
  groq:        new GroqProvider(),
  gemini:      new GeminiProvider(),
  openrouter:  new OpenRouterProvider(),
  nvidia:      new NvidiaProvider(),
  openai:      new OpenAIProvider(),
  anthropic:   new AnthropicProvider(),
  grok:        new GrokProvider(),
};

export function getProvider(name: ProviderName): AIProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown AI provider "${name}" — no implementation is registered for it.`);
  }
  return provider;
}

export function getAllProviders(): Record<ProviderName, AIProvider> {
  return providers;
}

export { providers };
