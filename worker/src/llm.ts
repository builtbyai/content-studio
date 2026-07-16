// Universal JSON-mode LLM helper.
// Tries Gemini first (cheapest for structured JSON); on PERMISSION_DENIED /
// quota / network failure, falls back to OpenAI gpt-4o-mini via the Workers AI
// binding (env.AI). Either way returns a parsed JSON object.
//
// Every node + content-ingest path should call this — single point of vendor
// failover. Logs which provider actually served the call so analytics in AI
// Gateway stay accurate.

import { GoogleGenAI } from "@google/genai";
import type { Env } from "./env";

export interface LlmJsonOptions {
  /** Free-form schema description appended to the prompt to nudge JSON shape. */
  schemaHint?: string;
  /** Per-call max tokens for OpenAI fallback. */
  maxTokens?: number;
  /** Set false to skip the Gemini attempt. */
  tryGemini?: boolean;
}

export interface LlmJsonResult<T = any> {
  data: T;
  provider: "gemini" | "openai" | "raw";
  attempts: Array<{ provider: string; ok: boolean; error?: string }>;
}

export async function llmJson<T = any>(env: Env, prompt: string, opts: LlmJsonOptions = {}): Promise<LlmJsonResult<T>> {
  const attempts: LlmJsonResult["attempts"] = [];
  const useGemini = opts.tryGemini !== false && !!env.GEMINI_API_KEY;

  // ── 1. Try Gemini ─────────────────────────────────────────
  if (useGemini) {
    try {
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const r = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });
      const text = r.text ?? "";
      const parsed = parseJsonLoose<T>(text);
      if (parsed) {
        attempts.push({ provider: "gemini", ok: true });
        return { data: parsed, provider: "gemini", attempts };
      }
      attempts.push({ provider: "gemini", ok: false, error: "non-JSON response" });
    } catch (e: any) {
      attempts.push({ provider: "gemini", ok: false, error: e?.message ?? String(e) });
    }
  } else {
    attempts.push({ provider: "gemini", ok: false, error: "skipped" });
  }

  // ── 2. Fall back to OpenAI gpt-4o-mini via env.AI binding ─
  if (env.AI) {
    try {
      const sysMsg = `You MUST respond with a single, valid JSON object. No markdown, no commentary. ${opts.schemaHint ?? ""}`;
      const r = (await env.AI.run("openai/gpt-4o-mini" as any, {
        messages: [
          { role: "system", content: sysMsg },
          { role: "user", content: prompt },
        ],
        max_tokens: opts.maxTokens ?? 4096,
        response_format: { type: "json_object" },
      } as any, { gateway: { id: env.AI_GATEWAY_SLUG || "default" } } as any)) as any;

      const content =
        r?.choices?.[0]?.message?.content ??
        r?.response ??
        r?.result?.response ?? "";
      const parsed = parseJsonLoose<T>(content);
      if (parsed) {
        attempts.push({ provider: "openai", ok: true });
        return { data: parsed, provider: "openai", attempts };
      }
      attempts.push({ provider: "openai", ok: false, error: "non-JSON response" });
    } catch (e: any) {
      attempts.push({ provider: "openai", ok: false, error: e?.message ?? String(e) });
    }
  } else {
    attempts.push({ provider: "openai", ok: false, error: "env.AI binding missing" });
  }

  // ── 3. Last-resort: throw with full attempt log so caller sees what happened ─
  const summary = attempts.map((a) => `${a.provider}:${a.ok ? "ok" : a.error}`).join(" | ");
  throw new Error(`llmJson: all providers failed — ${summary}`);
}

function parseJsonLoose<T>(text: string): T | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  // Strip ```json fences then retry
  const stripped = text.replace(/^```(?:json)?\s*|\s*```$/gim, "").trim();
  if (stripped !== text) {
    try { return JSON.parse(stripped); } catch {}
  }
  // Grab the first {…} or […] block
  const m = text.match(/[\{\[][\s\S]*[\}\]]/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}
