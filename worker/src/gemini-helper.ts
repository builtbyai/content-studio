// Backwards-compat shim — `generateContent` now routes through the universal
// llmJson helper so every existing call site (content.ts, nodes/creative.ts,
// etc.) automatically falls back to OpenAI when Gemini is blocked/denied.
import type { Env } from "./env";
import { llmJson } from "./llm";

export async function generateContent(env: Env, prompt: string): Promise<any> {
  const { data } = await llmJson(env, prompt);
  return data;
}
