// Chat completions via Workers AI binding → AI Gateway → OpenAI (BYOK/Unified Billing).
// The binding handles auth internally; Authenticated Gateway mode is fine.

import type { Env } from "./env";

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage { role: ChatRole; content: string; }

export interface ChatCompletionInput {
  messages: ChatMessage[];
  /** AI Gateway model id, e.g. "openai/gpt-4o-mini", "openai/gpt-5", "openai/gpt-5-mini". */
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResult {
  model: string;
  content: string;
  raw: unknown;
}

const DEFAULT_MODEL = "openai/gpt-4o-mini";

export async function chatComplete(env: Env, input: ChatCompletionInput): Promise<ChatCompletionResult> {
  if (!env.AI) throw new Error("env.AI binding missing — add [ai] to wrangler.toml");
  if (!input.messages?.length) throw new Error("messages is required");

  const model = input.model ?? DEFAULT_MODEL;
  const payload: Record<string, unknown> = {
    messages: input.messages,
    ...(input.temperature !== undefined && { temperature: input.temperature }),
    ...(input.max_tokens !== undefined && { max_tokens: input.max_tokens }),
    ...(input.stream && { stream: true }),
  };

  const response = (await env.AI.run(model as any, payload as any, {
    gateway: { id: env.AI_GATEWAY_SLUG || "default" },
  } as any)) as any;

  // Normalize across response shapes:
  //   - OpenAI-style: { choices: [{ message: { content } }] }
  //   - Workers-AI-style: { response } or { result: { response } }
  const content =
    response?.choices?.[0]?.message?.content ??
    response?.response ??
    response?.result?.response ??
    response?.result?.choices?.[0]?.message?.content ??
    "";

  return { model, content, raw: response };
}
