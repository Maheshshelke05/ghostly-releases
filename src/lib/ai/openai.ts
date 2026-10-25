import type { AIProvider, AIRequestOptions } from "./types";
import { defaultSignal, httpError, readSSE, requireApiKey } from "./types";
import { modelIds } from "./catalog";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

// The gpt-5 reasoning family counts hidden reasoning tokens against `max_completion_tokens`,
// so passing the 2048/4096 answer budget straight through could return nothing; reasoning models get extra room.
const REASONING_HEADROOM_TOKENS = 2048;

interface OpenAIShape {
  /** gpt-5+ wants max_completion_tokens; older chat models still want max_tokens. */
  tokenKey: "max_tokens" | "max_completion_tokens";
  /** gpt-5+ rejects any temperature other than the default 1. */
  temperature: boolean;
}

// Learned per model id, so a rejected parameter is probed once per model instead of
// re-POSTing the request (and, on a screenshot question, the whole base64 image) on every call.
const SHAPE_CACHE = new Map<string, OpenAIShape>();

function isReasoningFamily(model: string): boolean {
  return !/^gpt-4/.test(model);
}

function shapeFor(model: string): OpenAIShape {
  const cached = SHAPE_CACHE.get(model);
  if (cached) return cached;
  const shape: OpenAIShape = isReasoningFamily(model)
    ? { tokenKey: "max_completion_tokens", temperature: false }
    : { tokenKey: "max_tokens", temperature: true };
  SHAPE_CACHE.set(model, shape);
  return shape;
}

export interface OpenAIRequest {
  model: string;
  apiKey: string;
  messages: unknown[];
  /** Visible output budget. Hidden reasoning tokens come out of the same pool. */
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

/** POSTs a chat completion, correcting itself if the model rejects the request shape (gpt-5 rejects
 *  `max_tokens` and non-default temperature). Shared with ApiSetupPage's "Test Key" button. */
export async function openAiChat(req: OpenAIRequest): Promise<Response> {
  const { model, apiKey, messages, maxTokens = 4096, stream = false } = req;
  const signal = defaultSignal(req.signal);

  const send = (shape: OpenAIShape) =>
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireApiKey(apiKey, "OpenAI", "https://platform.openai.com/api-keys")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        ...(shape.tokenKey === "max_completion_tokens"
          ? { max_completion_tokens: maxTokens + REASONING_HEADROOM_TOKENS }
          : { max_tokens: maxTokens }),
        // Every other provider here sets a low/moderate temperature for focused answers;
        // this one would otherwise run at the API's default of 1.0.
        ...(shape.temperature ? { temperature: 0.5 } : {}),
        ...(stream ? { stream: true } : {}),
      }),
      signal,
    });

  let shape = shapeFor(model);
  let response = await send(shape);

  if (response.status === 400) {
    const parsed = await response.clone().json().catch(() => null);
    const detail = (parsed?.error?.message || response.statusText || "").toLowerCase();
    const corrected: OpenAIShape = {
      tokenKey: /max_completion_tokens|max_tokens/.test(detail)
        ? shape.tokenKey === "max_completion_tokens" ? "max_tokens" : "max_completion_tokens"
        : shape.tokenKey,
      temperature: /temperature/.test(detail) ? false : shape.temperature,
    };
    if (corrected.tokenKey !== shape.tokenKey || corrected.temperature !== shape.temperature) {
      SHAPE_CACHE.set(model, corrected);
      shape = corrected;
      response = await send(shape);
    }
  }

  if (!response.ok) {
    const parsed = await response.json().catch(() => null);
    throw httpError("OpenAI", response, parsed);
  }
  return response;
}

export class OpenAIProvider implements AIProvider {
  name = "openai";

  listModels(): string[] {
    return modelIds("openai");
  }

  async *streamSolution(options: AIRequestOptions): AsyncGenerator<string> {
    const { base64Image, prompt, messages = [], model, apiKey, maxTokens = 4096 } = options;

    const imageUrl = base64Image?.startsWith("data:")
      ? base64Image
      : base64Image
        ? `data:image/png;base64,${base64Image}`
        : undefined;

    const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));

    const currentContent: any[] = [];
    if (imageUrl) currentContent.push({ type: "image_url", image_url: { url: imageUrl } });
    currentContent.push({ type: "text", text: prompt });
    apiMessages.push({ role: "user", content: currentContent as any });

    const response = await openAiChat({
      model,
      apiKey,
      messages: apiMessages,
      maxTokens,
      stream: true,
      signal: defaultSignal(options.signal),
    });

    for await (const frame of readSSE(response)) {
      const text = frame.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}