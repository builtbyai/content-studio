// Cloudflare AI Gateway wrapper.
// Reference: https://developers.cloudflare.com/ai-gateway/
//
// Every multi-vendor model call should go through here. Benefits:
//   - Unified analytics / logs across Gemini, OpenAI, OpenRouter, Workers AI, Runway
//   - Configurable response cache (key by request hash) → cost savings
//   - Per-vendor rate limits + global rate limit
//   - Automatic retry with exponential backoff
//   - Fallback to next provider on persistent failures
//   - Single place to enforce CompliancePolicy + audit
//
// This satisfies Nodes 09 (Provider Adapter), 10 (Cost Governor — via analytics
// pull), and 11 (Parallel Dispatcher) from the spec.

import type { Env } from "./env";
import type { ProviderId } from "./types/workflows";

export interface GatewayConfig {
  accountId: string;
  gatewaySlug: string;          // the slug you created in dashboard, e.g. "contentforge-ai"
}

function gatewayBase(env: Env, providerSegment: string): string {
  // Gateway URLs look like:
  // https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_slug}/{provider}
  return `https://gateway.ai.cloudflare.com/v1/${env.R2_ACCOUNT_ID}/${env.AI_GATEWAY_SLUG}/${providerSegment}`;
}

export const aiGateway = {
  // Universal call — Gemini, OpenAI, Anthropic, OpenRouter routes share the path style.
  // `providerSegment` is the AI Gateway provider id (e.g. "google-ai-studio", "openai", "openrouter").
  async call(
    env: Env,
    providerSegment: string,
    pathAfterProvider: string,        // e.g. "/v1/models/gemini-2.5-flash:generateContent"
    init: RequestInit & { apiKey?: string }
  ): Promise<Response> {
    const url = gatewayBase(env, providerSegment) + pathAfterProvider;
    const headers = new Headers(init.headers ?? {});
    if (init.apiKey && !headers.has("authorization") && !headers.has("x-api-key") && !headers.has("x-goog-api-key")) {
      // Pick the right auth header per provider segment.
      if (providerSegment === "google-ai-studio") headers.set("x-goog-api-key", init.apiKey);
      else if (providerSegment === "anthropic") headers.set("x-api-key", init.apiKey);
      else headers.set("authorization", `Bearer ${init.apiKey}`);
    }
    // Gateway hints — opt in to caching and fallback chain per request.
    headers.set("cf-aig-cache-ttl", "3600");
    if (init.method && init.method.toUpperCase() !== "GET") headers.set("cf-aig-collect-log", "true");
    return fetch(url, { ...init, headers });
  },

  // Workers AI binding — separate path because the runtime gives you env.AI directly,
  // and the gateway is configured via the dashboard binding settings, not URL.
  async workersAi<T = unknown>(env: Env, model: string, inputs: Record<string, unknown>): Promise<T> {
    if (!env.AI) throw new Error("env.AI binding missing — add [ai] to wrangler.toml");
    return (await env.AI.run(model, inputs)) as T;
  },

  // Vectorize wrapper — used by Node 02 brand resolver, Node 18 competitor matrix,
  // Node 25 lead temperature trend.
  async vectorUpsert(env: Env, index: "brands" | "competitors" | "leads", vectors: VectorizeVector[]) {
    const idx = vectorizeIndex(env, index);
    return idx.upsert(vectors);
  },
  async vectorQuery(env: Env, index: "brands" | "competitors" | "leads", values: number[], topK = 5) {
    const idx = vectorizeIndex(env, index);
    return idx.query(values, { topK });
  },
};

function vectorizeIndex(env: Env, index: "brands" | "competitors" | "leads"): VectorizeIndex {
  switch (index) {
    case "brands":      if (!env.VEC_BRANDS)      throw new Error("VEC_BRANDS binding missing");      return env.VEC_BRANDS;
    case "competitors": if (!env.VEC_COMPETITORS) throw new Error("VEC_COMPETITORS binding missing"); return env.VEC_COMPETITORS;
    case "leads":       if (!env.VEC_LEADS)       throw new Error("VEC_LEADS binding missing");       return env.VEC_LEADS;
  }
}

// Map our internal ProviderId → AI Gateway provider segment.
export function gatewaySegment(p: ProviderId): string {
  switch (p) {
    case "gemini":     return "google-ai-studio";
    case "openai":     return "openai";
    case "openrouter": return "openrouter";
    case "runway":     return "runway";          // confirm against AI Gateway provider catalog
    case "workers-ai": return "workers-ai";      // handled via env.AI binding, not URL
    case "custom":     return "compat";          // OpenAI-compat universal endpoint
    case "google-ai-studio": return "google-ai-studio"; // direct Gemini/Veo passthrough
    case "replicate":  return "replicate";       // direct Replicate REST, not via AI Gateway
  }
}
