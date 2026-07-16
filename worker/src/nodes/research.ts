// Phase 3 — Market Intelligence (Nodes 17-18).
// LLM-backed; KV cache for SEO results, Vectorize VEC_COMPETITORS for diffs.

import type { Env } from "../env";
import { llmJson } from "../llm";
import { envelope } from "../types/workflows";
import type { NodeOutputEnvelope, UUID } from "../types/workflows";

// ─ Node 17 — SEO Keyword Research ──────────────────────────────────────
export interface SeoResearchInput {
  seedKeywords: string[];
  market: string;
  intent?: "informational" | "commercial" | "transactional" | "navigational";
}
export interface SeoKeyword {
  keyword: string;
  volume: number;
  difficulty: number;
  intent: string;
  topCompetitorUrls: string[];
}
export interface SeoResearchOutput {
  primary: SeoKeyword[];
  longTail: SeoKeyword[];
  contentBriefs: Array<{ keyword: string; outline: string[]; wordTarget: number }>;
}

export async function node17_seo(env: Env, input: SeoResearchInput, runId: UUID): Promise<NodeOutputEnvelope<SeoResearchOutput>> {
  // 24h KV cache by (keyword set, market) hash.
  const cacheKey = `seo:${input.market}:${input.seedKeywords.sort().join(",")}`;
  if (env.CACHE) {
    const cached = await env.CACHE.get(cacheKey, "json") as SeoResearchOutput | null;
    if (cached) return envelope("node_17_seo", runId, "completed", cached, { warnings: ["served from KV cache"] });
  }

  const prompt = `You are an SEO strategist. From these seed keywords, derive a research plan.

Seeds: ${input.seedKeywords.join(", ")}
Market: ${input.market}
Intent target: ${input.intent ?? "any"}

Return strict JSON:
{
  "primary": [{"keyword": "...", "volume": 1000-50000, "difficulty": 0-100, "intent": "informational|commercial|transactional|navigational", "topCompetitorUrls": ["..."]}],
  "longTail": [{"keyword": "long-tail variant ≥4 words", "volume": 100-2000, "difficulty": 10-60, "intent": "...", "topCompetitorUrls": []}],
  "contentBriefs": [{"keyword": "...", "outline": ["H2 1", "H2 2", "..."], "wordTarget": 1200-2500}]
}
Volumes and difficulties should reflect your honest assessment for the ${input.market} market.`;

  const { data } = await llmJson<SeoResearchOutput>(env, prompt, { maxTokens: 3072 });
  const out: SeoResearchOutput = {
    primary: Array.isArray(data.primary) ? data.primary : [],
    longTail: Array.isArray(data.longTail) ? data.longTail : [],
    contentBriefs: Array.isArray(data.contentBriefs) ? data.contentBriefs : [],
  };

  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(out), { expirationTtl: 24 * 3600 });
  }
  return envelope("node_17_seo", runId, "completed", out);
}

// ─ Node 18 — Competitor Intelligence Agent ─────────────────────────────
export type IntelDepth = "brief" | "standard" | "deep" | "max";
export interface CompetitorIntelInput {
  competitorDomains: string[];
  ourValueProps: string[];
  /** Controls how exhaustive the analysis is. */
  depth?: IntelDepth;
  /** Optional: fetched HTML/text for each domain (skip live fetch if provided). */
  domainContent?: Record<string, string>;
}
export interface Competitor {
  domain: string;
  positioning: string;
  pricingTier: "free" | "low" | "mid" | "high" | "enterprise" | "unknown";
  detectedFeatures: string[];
  contentAngles: string[];
  weaknessSignals: string[];
}
export interface CompetitorIntelOutput {
  competitors: Competitor[];
  similarityMatrix: Array<{ competitor: string; vectorScore: number; sharedFeatures: string[] }>;
  wedgeOpportunities: string[];
}

export async function node18_competitor(env: Env, input: CompetitorIntelInput, runId: UUID): Promise<NodeOutputEnvelope<CompetitorIntelOutput>> {
  if (input.competitorDomains.length === 0) {
    return envelope("node_18_competitor", runId, "failed_terminal",
      { competitors: [], similarityMatrix: [], wedgeOpportunities: [] });
  }

  const depth = input.depth ?? "standard";
  const DEPTH_TOKENS: Record<IntelDepth, number> = { brief: 1500, standard: 3072, deep: 6144, max: 12288 };
  const DEPTH_GUIDANCE: Record<IntelDepth, string> = {
    brief:    "Be concise: 1-sentence positioning per competitor, 3-5 features each, 3 wedges total.",
    standard: "Mid-detail: 2-3 sentence positioning per competitor, 5-8 features, 5 wedges, 3-5 weakness signals each.",
    deep:     "Detailed: paragraph-length positioning per competitor, 8-15 features, 10 wedges with rationale, 5-8 weakness signals per competitor, 5 content angles each, 3 narrative gaps for us to exploit.",
    max:      "Exhaustive multi-section analysis. For each competitor produce a mini-dossier with: positioning narrative (3-5 paragraphs), feature inventory (15+ items with notes), pricing/packaging breakdown, brand voice analysis, content strategy critique (5+ angles), 8+ specific weakness signals with examples, customer-objection map, then for our side produce 10+ specific wedge opportunities each with: hook, evidence, counter-message, and a sample social post.",
  };

  const contentBlock = input.domainContent
    ? "\nFetched content snippets per domain:\n" + Object.entries(input.domainContent)
        .map(([d, t]) => `--- ${d} ---\n${t.slice(0, 2000)}`)
        .join("\n\n")
    : "";

  const prompt = `You are a competitive intelligence analyst. Analyse these competitors against our value props with the goal of giving us a STRATEGIC ADVANTAGE — find weak points to exploit, find gaps in our offer to improve, and find narrative wedges to position against them.

DEPTH: ${depth.toUpperCase()}
${DEPTH_GUIDANCE[depth]}

Our value props: ${input.ourValueProps.join("; ")}

Competitors:
${input.competitorDomains.map((d) => `- ${d}`).join("\n")}
${contentBlock}

Return strict JSON. Use the schema below; the LENGTH and DEPTH of each field MUST match the depth guidance above.

{
  "competitors": [
    {
      "domain": "...",
      "positioning": "...",                       // length follows depth guidance
      "pricingTier": "free|low|mid|high|enterprise|unknown",
      "detectedFeatures": [...],
      "contentAngles": ["topics they dominate"],
      "weaknessSignals": ["specific gaps with evidence"],
      "objectionMap": [{"objection": "common buyer pushback", "ourCounter": "how we win"}],
      "brandVoice": "...",                        // populate when depth >= deep
      "narrativeGapsToExploit": ["..."]
    }
  ],
  "wedgeOpportunities": [
    {
      "title": "short wedge name",
      "hook": "1-sentence claim we lead with",
      "rationale": "why this works against the competitor set",
      "evidence": ["data points / proof"],
      "samplePost": "short LinkedIn/IG post draft using this wedge"
    }
  ],
  "executiveSummary": "...",                      // 1 sentence (brief) → multi-paragraph (max)
  "ourGapsToClose": ["improvements we should make based on what we saw"]
}`;

  const { data } = await llmJson<any>(env, prompt, { maxTokens: DEPTH_TOKENS[depth] });
  const competitors: Competitor[] = Array.isArray(data.competitors) ? data.competitors : [];

  // Compute similarity matrix via Workers AI embeddings + Vectorize, if available.
  let similarityMatrix: CompetitorIntelOutput["similarityMatrix"] = [];
  if (env.AI && env.VEC_COMPETITORS && competitors.length > 0) {
    try {
      const ourProfile = input.ourValueProps.join(" · ");
      const ourEmb = (await env.AI.run("@cf/baai/bge-base-en-v1.5" as any, { text: [ourProfile] } as any)) as any;
      const ourVec: number[] = ourEmb?.data?.[0] ?? [];

      for (const comp of competitors) {
        const compText = `${comp.positioning} · ${comp.detectedFeatures.join(", ")}`;
        const compEmb = (await env.AI.run("@cf/baai/bge-base-en-v1.5" as any, { text: [compText] } as any)) as any;
        const compVec: number[] = compEmb?.data?.[0] ?? [];
        await env.VEC_COMPETITORS.upsert([{
          id: `competitor:${comp.domain}`,
          values: compVec,
          metadata: { domain: comp.domain, positioning: comp.positioning } as any,
        }]);

        const sim = cosine(ourVec, compVec);
        const sharedFeatures = comp.detectedFeatures.filter((f) =>
          input.ourValueProps.some((vp) => f.toLowerCase().includes(vp.toLowerCase().slice(0, 8)))
        );
        similarityMatrix.push({ competitor: comp.domain, vectorScore: Math.round(sim * 100) / 100, sharedFeatures });
      }
    } catch {
      // Embedding/Vectorize failures are non-fatal.
    }
  }

  return envelope("node_18_competitor", runId, "completed", {
    competitors,
    similarityMatrix,
    wedgeOpportunities: Array.isArray(data.wedgeOpportunities) ? data.wedgeOpportunities.map(String) : [],
  });
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}
