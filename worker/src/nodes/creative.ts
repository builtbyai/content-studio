// Phase 1 — Creative Core (Nodes 01-16). Typed contracts + handler stubs.
// Spec section 8 (multi_model_workflow_studio_architecture_spec.md).
//
// Most handlers throw `NodeNotImplemented` until you fill them in. The contracts
// are what locks the system together — implement against these.

import type { Env } from "../env";
import type {
  AssetRequirement, AuditEvent, BrandProfile, CostEstimate, MediaType,
  NodeOutputEnvelope, PlatformRequirement, ProductReference, ProviderId, UUID,
} from "../types/workflows";
import { envelope } from "../types/workflows";
import { generateContent as ai } from "../gemini-helper";
import { llmJson } from "../llm";
import { generateWorkflow } from "../gemini";
import {
  REPLICATE_MODELS,
  createPrediction as replicateCreate,
  waitForPrediction as replicateWait,
  firstOutputUrl as replicateOutput,
  type ReplicateModelKey,
} from "../replicate";

export class NodeNotImplemented extends Error {
  constructor(nodeId: string) { super(`node ${nodeId} not implemented`); this.name = "NodeNotImplemented"; }
}

// ─────────────────────────────────────────────────────────────────────
// Node 01 — Creative Brief Intake
// ─────────────────────────────────────────────────────────────────────
export interface CreativeBriefIntakeInput {
  rawBrief: string;
  uploadedAssetIds: UUID[];
  productReferences?: ProductReference[];
  targetPlatforms?: PlatformRequirement[];
  negativeConstraints?: string[];
  desiredOutputs: MediaType[];
}
export interface CreativeBriefIntakeOutput {
  normalizedText: string;
  extractedGoals: string[];
  requiredAssets: AssetRequirement[];
  ambiguityFlags: string[];
  readinessScore: number;
}
export async function node01_briefIntake(
  env: Env, input: CreativeBriefIntakeInput, runId: UUID
): Promise<NodeOutputEnvelope<CreativeBriefIntakeOutput>> {
  if (!input.rawBrief?.trim()) {
    return envelope("node_01_brief_intake", runId, "failed_terminal", {
      normalizedText: "", extractedGoals: [], requiredAssets: [],
      ambiguityFlags: ["rawBrief is empty"], readinessScore: 0,
    });
  }

  const prompt = `You are a creative brief analyst. Normalise this raw brief into structured fields.

Raw brief:
${input.rawBrief}

Constraints: ${(input.negativeConstraints ?? []).join("; ") || "none"}
Desired outputs: ${input.desiredOutputs.join(", ")}
Target platforms: ${(input.targetPlatforms ?? []).map((p) => `${p.platform}/${p.aspectRatio}`).join(", ") || "none specified"}
Uploaded asset count: ${input.uploadedAssetIds.length}

Return strict JSON:
{
  "normalizedText": "polished rewrite of the brief, retaining intent",
  "extractedGoals": ["3-7 clear, measurable goals derived from the brief"],
  "requiredAssets": [{ "kind": "image|video|logo|font|data", "description": "...", "required": true|false }],
  "ambiguityFlags": ["specific questions the user should answer before proceeding (or [])"],
  "readinessScore": 0.0-1.0
}

Score 1.0 means the brief is fully self-contained; 0.5 means significant ambiguity remains; 0 means nothing can proceed without more info.`;

  const out = await ai(env, prompt);
  const data: CreativeBriefIntakeOutput = {
    normalizedText: String(out.normalizedText ?? input.rawBrief),
    extractedGoals: Array.isArray(out.extractedGoals) ? out.extractedGoals.map(String) : [],
    requiredAssets: Array.isArray(out.requiredAssets) ? out.requiredAssets : [],
    ambiguityFlags: Array.isArray(out.ambiguityFlags) ? out.ambiguityFlags.map(String) : [],
    readinessScore: Number(out.readinessScore ?? 0.5),
  };
  const status = data.readinessScore >= 0.5 ? "completed" : "review_required";
  return envelope("node_01_brief_intake", runId, status, data);
}

// ─────────────────────────────────────────────────────────────────────
// Node 02 — Brand Profile Resolver
//   Implementation hint: store brand fingerprints in Vectorize; query by
//   nearest-neighbor on prior briefs + asset embeddings.
// ─────────────────────────────────────────────────────────────────────
export interface BrandResolverInput {
  tenantId: UUID;
  hintBrandId?: UUID;
  briefText?: string;
}
export interface BrandResolverOutput {
  brand: BrandProfile;
  confidence: number;
  similarBrandIds: UUID[];
}
export async function node02_brandResolver(
  env: Env, input: BrandResolverInput, runId: UUID
): Promise<NodeOutputEnvelope<BrandResolverOutput>> {
  // v1 implementation:
  //   - If hintBrandId passed, look it up in KV (cache) — else fall back to default.
  //   - If briefText provided, embed via Workers AI bge-base and query VEC_BRANDS.
  // Long-tail: storing brand fingerprints lives outside this node — done by a
  // separate /api/brands/upsert call when the user edits their brand profile.

  let brand: BrandProfile;
  const similarBrandIds: UUID[] = [];
  let confidence = 0.5;

  if (input.hintBrandId && env.CACHE) {
    const cached = await env.CACHE.get(`brand:${input.tenantId}:${input.hintBrandId}`, "json") as BrandProfile | null;
    if (cached) {
      brand = cached;
      confidence = 1.0;
    } else {
      brand = defaultBrand(input.tenantId, input.hintBrandId);
    }
  } else {
    brand = defaultBrand(input.tenantId);
  }

  // Vectorize nearest-neighbor on brief embedding (best-effort).
  if (input.briefText && env.VEC_BRANDS && env.AI) {
    try {
      const emb = (await env.AI.run("@cf/baai/bge-base-en-v1.5" as any, {
        text: [input.briefText.slice(0, 1000)],
      } as any)) as any;
      const vec: number[] | undefined = emb?.data?.[0] ?? emb?.vector ?? emb?.[0];
      if (vec && Array.isArray(vec)) {
        const result = await env.VEC_BRANDS.query(vec, { topK: 5 });
        for (const m of result.matches ?? []) {
          similarBrandIds.push(m.id);
          if ((m as any).score > 0.85 && confidence < 0.95) {
            // Prefer the top match if highly similar
            confidence = (m as any).score;
          }
        }
      }
    } catch {
      // Vectorize miss is non-fatal
    }
  }

  return envelope("node_02_brand_resolver", runId, "completed", { brand, confidence, similarBrandIds });
}

function defaultBrand(tenantId: UUID, id?: UUID): BrandProfile {
  return {
    id: id ?? "default",
    name: "Acme",
    voice: "Premium, confident, data-led roofing intelligence",
    palette: ["#C3A35B", "#272011", "#F7F7F5"],
    logoAssetIds: [],
    forbiddenClaims: ["miracle", "guaranteed", "instant"],
    productReferences: [],
  };
}

// ─────────────────────────────────────────────────────────────────────
// Node 03 — Asset Registry + Product Preservation
// ─────────────────────────────────────────────────────────────────────
export interface AssetRegistryInput { uploadedAssetIds: UUID[]; brand: BrandProfile; }
export interface AssetRegistryOutput {
  registeredAssetIds: UUID[];
  productPreservationMap: Array<{ productId: UUID; preservationToken: string }>;
}
export async function node03_assetRegistry(
  _env: Env, input: AssetRegistryInput, runId: UUID
): Promise<NodeOutputEnvelope<AssetRegistryOutput>> {
  // Register each uploaded asset id and mint a stable preservation token per
  // product reference. The token is short + memorable so prompts that include
  // it stay readable. The actual preservation enforcement happens in Node 14.
  const registeredAssetIds = [...input.uploadedAssetIds];
  const productPreservationMap = input.brand.productReferences
    .filter((p) => p.mustPreserve)
    .map((p) => ({
      productId: p.id,
      preservationToken: `<<${p.label.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || p.id.slice(0, 6)}>>`,
    }));

  return envelope("node_03_asset_registry", runId, "completed", {
    registeredAssetIds,
    productPreservationMap,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Node 04 — Platform Requirements Mapper
// ─────────────────────────────────────────────────────────────────────
export interface PlatformMapperInput { desiredOutputs: MediaType[]; targetPlatforms: PlatformRequirement[]; }
export interface PlatformMapperOutput { platforms: PlatformRequirement[]; renderTargets: Array<{ platform: string; aspectRatio: string; mediaType: MediaType }>; }
export async function node04_platformMapper(
  input: PlatformMapperInput, runId: UUID
): Promise<NodeOutputEnvelope<PlatformMapperOutput>> {
  // Trivial enough to implement inline.
  const renderTargets = input.targetPlatforms.flatMap((p) =>
    input.desiredOutputs.map((mt) => ({ platform: p.platform, aspectRatio: p.aspectRatio, mediaType: mt }))
  );
  return envelope("node_04_platform_mapper", runId, "completed", {
    platforms: input.targetPlatforms,
    renderTargets,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Node 05 — Concept Generation  (existing /api/generate-workflow can back this)
// ─────────────────────────────────────────────────────────────────────
export interface ConceptGenerationInput {
  normalizedBrief: string;
  brand: BrandProfile;
  platforms: PlatformRequirement[];
  conceptCount: number;
}
export interface Concept {
  id: UUID;
  title: string;
  mood: string;
  lighting: string;
  imagePrompt: string;
  videoPrompt: string;
  socialPostCopy: string;
  recommendedRatios: string[];
}
export interface ConceptGenerationOutput { concepts: Concept[]; }
export async function node05_conceptGeneration(
  env: Env, input: ConceptGenerationInput, runId: UUID
): Promise<NodeOutputEnvelope<ConceptGenerationOutput>> {
  // Reuse the existing /api/generate-workflow Gemini call (same shape).
  const aspectRatios = Array.from(new Set(input.platforms.map((p) => p.aspectRatio))).slice(0, 6);
  const out: any = await generateWorkflow(env, {
    brief: input.normalizedBrief,
    brandGuide: `${input.brand?.voice ?? ""}. Palette: ${(input.brand?.palette ?? []).join(", ")}. Voice: premium.`,
    constraints: (input.brand?.forbiddenClaims ?? []).join("; "),
    aspectRatios,
  });

  const rawConcepts = Array.isArray(out?.concepts) ? out.concepts : [];
  const concepts: Concept[] = rawConcepts.slice(0, Math.max(input.conceptCount ?? 3, 1)).map((c: any) => ({
    id: crypto.randomUUID(),
    title: String(c.title ?? "Untitled concept"),
    mood: String(c.mood ?? ""),
    lighting: String(c.lighting ?? ""),
    imagePrompt: String(c.imagePrompt ?? ""),
    videoPrompt: String(c.videoPrompt ?? ""),
    socialPostCopy: String(c.socialPostCopy ?? ""),
    recommendedRatios: Array.isArray(c.recommendedRatios) ? c.recommendedRatios.map(String) : aspectRatios,
  }));

  return envelope("node_05_concept_generation", runId, concepts.length > 0 ? "completed" : "failed_recoverable", { concepts });
}

// ─────────────────────────────────────────────────────────────────────
// Node 06 — Film Scene Planner
// ─────────────────────────────────────────────────────────────────────
export interface FilmPlanInput { concept: Concept; durationSeconds: number; }
export interface Scene { index: number; description: string; durationSec: number; cameraMotion: string; subjectContinuityToken: string; }
export interface FilmPlanOutput { scenes: Scene[]; continuityTokens: string[]; }
export async function node06_filmPlanner(env: Env, input: FilmPlanInput, runId: UUID): Promise<NodeOutputEnvelope<FilmPlanOutput>> {
  const dur = Math.max(3, Math.min(input.durationSeconds, 60));
  const targetSceneCount = Math.max(2, Math.min(Math.ceil(dur / 4), 8));

  const prompt = `Plan a ${dur}-second short-form video built from this concept.

Concept:
  Title: ${input.concept.title}
  Mood:  ${input.concept.mood}
  Lighting: ${input.concept.lighting}
  Image prompt: ${input.concept.imagePrompt}
  Video prompt: ${input.concept.videoPrompt}

Break it into ${targetSceneCount} scenes that together flow as one cohesive shot list.
For each scene:
  - description: what is on screen
  - durationSec: portion of the ${dur}s budget (integers preferred, must sum to ~${dur})
  - cameraMotion: e.g. "slow dolly in", "static medium shot", "drone pull-back"
  - subjectContinuityToken: a short identifier (3-10 chars) that ALL scenes featuring the SAME subject reuse, to lock visual consistency across cuts

Also: emit \`continuityTokens\` as the deduped set of all tokens you used.

Return strict JSON:
{
  "scenes": [
    { "index": 1, "description": "...", "durationSec": 4, "cameraMotion": "...", "subjectContinuityToken": "..." }
  ],
  "continuityTokens": ["..."]
}`;

  const { data } = await llmJson<{ scenes: Scene[]; continuityTokens?: string[] }>(env, prompt, { maxTokens: 2048 });
  const scenes: Scene[] = Array.isArray(data.scenes) ? data.scenes.map((s, i) => ({
    index: Number(s.index ?? i + 1),
    description: String(s.description ?? ""),
    durationSec: Number(s.durationSec ?? Math.round(dur / targetSceneCount)),
    cameraMotion: String(s.cameraMotion ?? "static medium shot"),
    subjectContinuityToken: String((s as any).subjectContinuityToken ?? `t${i}`),
  })) : [];

  const tokens = data.continuityTokens && Array.isArray(data.continuityTokens) && data.continuityTokens.length > 0
    ? Array.from(new Set(data.continuityTokens.map(String)))
    : Array.from(new Set(scenes.map((s) => s.subjectContinuityToken)));

  const status = scenes.length > 0 ? "completed" : "failed_recoverable";
  return envelope("node_06_film_planner", runId, status, { scenes, continuityTokens: tokens });
}

// ─────────────────────────────────────────────────────────────────────
// Node 07 — Prompt Schema Builder
//   Output must be accepted by Node 09 (contract test).
// ─────────────────────────────────────────────────────────────────────
export interface PromptSpec {
  id: UUID;
  providerCandidates: ProviderId[];
  modelCandidates: string[];
  prompt: string;
  negativePrompt?: string;
  parameters: Record<string, unknown>;
  preservationTokens: string[];
}
export interface PromptSchemaBuilderInput { concept: Concept; scenes?: Scene[]; brand: BrandProfile; }
export interface PromptSchemaBuilderOutput { prompts: PromptSpec[]; }
export async function node07_promptBuilder(env: Env, input: PromptSchemaBuilderInput, runId: UUID): Promise<NodeOutputEnvelope<PromptSchemaBuilderOutput>> {
  const scenesBlock = input.scenes && input.scenes.length > 0
    ? `Scenes to cover:\n${input.scenes.map((s) => `  ${s.index}. ${s.description} (token=${s.subjectContinuityToken}, ${s.durationSec}s, ${s.cameraMotion})`).join("\n")}`
    : "No multi-scene plan — produce one image-style prompt + one video-style prompt for the whole concept.";

  const brandLine = `Brand: ${input.brand.name}. Voice: ${input.brand.voice}. Palette: ${input.brand.palette.join(", ")}. Forbidden claims: ${input.brand.forbiddenClaims.join("; ") || "none"}.`;
  const preservation = [
    ...input.brand.productReferences.filter((p) => p.mustPreserve).map((p) => p.label),
    input.brand.name,
  ].filter(Boolean);

  const prompt = `You are a Prompt Schema Builder for a multi-vendor generative pipeline.

${brandLine}

Concept:
  ${input.concept.title}
  Mood: ${input.concept.mood}
  Lighting: ${input.concept.lighting}
  Image hint: ${input.concept.imagePrompt}
  Video hint: ${input.concept.videoPrompt}

${scenesBlock}

For each prompt entry you emit, target one media type (image OR video).
PREFERENCE: For IMAGE prompts, ALWAYS rank "openai" FIRST with model "openai/gpt-image-2". Only use "openai/gpt-image-1.5" when transparency is required.
For VIDEO prompts, you MAY include runway/veo as a candidate, but it's optional — emit fewer video prompts unless the brief explicitly demands video.

For each prompt produce:
  - providerCandidates: ranked subset of ["openai", "gemini", "runway", "replicate", "openrouter", "workers-ai"] that can do this prompt
  - modelCandidates: ranked subset of model ids that match the candidates, e.g. ["openai/gpt-image-2", "openai/gpt-image-1.5"] for image, ["runway/gen4.5", "google-ai-studio/veo-3.1-fast-generate-preview", "replicate/google/veo-3-fast", "replicate/bytedance/seedance-1-pro", "replicate/kwaivgi/kling-v2.1-master", "replicate/wan-video/wan-2.5-t2v-fast", "replicate/alibaba/happyhorse-1.0"] for video
  - prompt: the actual prompt text optimized for image-gen / video-gen
  - negativePrompt: things to avoid (concise)
  - parameters: { aspectRatio, quality, durationSec? } as appropriate
  - preservationTokens: a copy of ${JSON.stringify(preservation)} — any of these MUST appear in the prompt verbatim or be referenced by token

Return strict JSON:
{
  "prompts": [
    { "providerCandidates": ["openai"], "modelCandidates": ["openai/gpt-image-2"], "prompt": "...", "negativePrompt": "...", "parameters": { "aspectRatio": "1:1", "quality": "high" }, "preservationTokens": [...] }
  ]
}`;

  const { data } = await llmJson<{ prompts: Array<Omit<PromptSpec, "id">> }>(env, prompt, { maxTokens: 3072 });
  const prompts: PromptSpec[] = Array.isArray(data.prompts) ? data.prompts.map((p) => ({
    id: crypto.randomUUID(),
    providerCandidates: Array.isArray(p.providerCandidates) ? (p.providerCandidates as ProviderId[]) : ["openai"],
    modelCandidates: Array.isArray(p.modelCandidates) ? p.modelCandidates : ["openai/gpt-image-2"],
    prompt: String(p.prompt ?? ""),
    negativePrompt: p.negativePrompt ? String(p.negativePrompt) : undefined,
    parameters: (p.parameters && typeof p.parameters === "object") ? p.parameters as Record<string, unknown> : {},
    preservationTokens: Array.isArray(p.preservationTokens) ? p.preservationTokens.map(String) : preservation,
  })) : [];

  return envelope("node_07_prompt_builder", runId, prompts.length > 0 ? "completed" : "failed_recoverable", { prompts });
}

// ─────────────────────────────────────────────────────────────────────
// Node 08 — Provider Capability Resolver
//   Implementation hint: hardcode a registry per provider/model; refresh weekly
//   via a scheduled cron, store in KV.
// ─────────────────────────────────────────────────────────────────────
export interface ProviderCapability {
  providerId: ProviderId;
  modelId: string;
  supportedMediaTypes: MediaType[];
  maxOutputBytes?: number;
  maxVideoSeconds?: number;
  unitPriceUsd: number;
}
export interface CapabilityResolverInput { prompts: PromptSpec[]; }
export interface CapabilityResolverOutput { resolved: Array<{ promptId: UUID; viable: ProviderCapability[] }>; }
export async function node08_capabilityResolver(env: Env, input: CapabilityResolverInput, runId: UUID): Promise<NodeOutputEnvelope<CapabilityResolverOutput>> {
  // Pull registry from KV (refreshed weekly by a cron); fall back to hardcoded.
  let registry: ProviderCapability[] = [];
  if (env.CACHE) {
    const cached = await env.CACHE.get("provider:capabilities:v1", "json") as ProviderCapability[] | null;
    if (cached) registry = cached;
  }
  if (registry.length === 0) registry = HARDCODED_REGISTRY;

  const resolved = input.prompts.map((p) => {
    const requested = new Set(p.providerCandidates);
    const viable = registry.filter((cap) => {
      if (!requested.has(cap.providerId)) return false;
      // Model candidate match if explicitly listed, otherwise allow provider-level match.
      const modelMatches = p.modelCandidates.length === 0 || p.modelCandidates.includes(cap.modelId);
      return modelMatches;
    });
    return { promptId: p.id, viable };
  });

  return envelope("node_08_capability_resolver", runId, "completed", { resolved });
}

const HARDCODED_REGISTRY: ProviderCapability[] = [
  { providerId: "openai",     modelId: "openai/gpt-image-2",                                  supportedMediaTypes: ["image"], unitPriceUsd: 0.04 },
  { providerId: "openai",     modelId: "openai/gpt-image-1.5",                                supportedMediaTypes: ["image"], unitPriceUsd: 0.04 },
  { providerId: "openai",     modelId: "openai/gpt-4o-mini",                                  supportedMediaTypes: ["text"],  unitPriceUsd: 0.001 },
  { providerId: "openai",     modelId: "openai/gpt-4o",                                       supportedMediaTypes: ["text"],  unitPriceUsd: 0.01 },
  { providerId: "openai",     modelId: "openai/gpt-5-mini",                                   supportedMediaTypes: ["text"],  unitPriceUsd: 0.003 },
  { providerId: "gemini",     modelId: "google-ai-studio/gemini-2.5-flash",                   supportedMediaTypes: ["text"],  unitPriceUsd: 0.0008 },
  { providerId: "runway",     modelId: "runway/gen4.5",                                       supportedMediaTypes: ["video"], unitPriceUsd: 0.12, maxVideoSeconds: 10 },
  { providerId: "runway",     modelId: "runway/veo3.1_fast",                                  supportedMediaTypes: ["video"], unitPriceUsd: 0.10, maxVideoSeconds: 10 },
  { providerId: "workers-ai", modelId: "@cf/black-forest-labs/flux-1-schnell",                supportedMediaTypes: ["image"], unitPriceUsd: 0.005 },
  // Replicate-hosted video models. modelId is `replicate/<owner>/<name>`; the
  // adapter splits it back out when dispatching. Prices are approximate per
  // ~5s clip from the model card; Replicate bills per-second of GPU time.
  { providerId: "replicate", modelId: "replicate/alibaba/happyhorse-1.0",     supportedMediaTypes: ["video"], unitPriceUsd: 0.10, maxVideoSeconds: 10 },
  { providerId: "replicate", modelId: "replicate/wan-video/wan-2.5-t2v-fast", supportedMediaTypes: ["video"], unitPriceUsd: 0.08, maxVideoSeconds: 10 },
  { providerId: "replicate", modelId: "replicate/wan-video/wan-2.5-i2v-fast", supportedMediaTypes: ["video"], unitPriceUsd: 0.08, maxVideoSeconds: 10 },
  { providerId: "replicate", modelId: "replicate/kwaivgi/kling-v2.1-master",  supportedMediaTypes: ["video"], unitPriceUsd: 0.28, maxVideoSeconds: 10 },
  { providerId: "replicate", modelId: "replicate/kwaivgi/kling-v2.1",         supportedMediaTypes: ["video"], unitPriceUsd: 0.28, maxVideoSeconds: 10 },
  { providerId: "replicate", modelId: "replicate/bytedance/seedance-1-pro",   supportedMediaTypes: ["video"], unitPriceUsd: 0.18, maxVideoSeconds: 10 },
  { providerId: "replicate", modelId: "replicate/google/veo-3-fast",          supportedMediaTypes: ["video"], unitPriceUsd: 0.05, maxVideoSeconds: 8  },
  { providerId: "replicate", modelId: "replicate/google/veo-3",               supportedMediaTypes: ["video"], unitPriceUsd: 0.50, maxVideoSeconds: 8  },
];

// ─────────────────────────────────────────────────────────────────────
// Node 09 — Provider Adapter
//   Implementation hint: route ALL calls through Cloudflare AI Gateway so
//   you inherit caching, analytics, retry, fallback, and per-vendor logs.
//   See worker/src/ai-gateway.ts.
// ─────────────────────────────────────────────────────────────────────
export interface ProviderAdapterInput { promptId: UUID; capability: ProviderCapability; prompt: PromptSpec; }
export interface ProviderAdapterOutput { promptId: UUID; rawResponse: unknown; assetUri?: string; spent: CostEstimate; }
export async function node09_providerAdapter(env: Env, input: ProviderAdapterInput, runId: UUID): Promise<NodeOutputEnvelope<ProviderAdapterOutput>> {
  if (!env.AI) throw new Error("env.AI binding missing");
  const providerId = input.capability.providerId;
  const modelId = input.capability.modelId;
  const params = input.prompt.parameters ?? {};

  let assetUri: string | undefined;
  let rawResponse: unknown;
  let estimatedCostUsd = 0;
  let mediaType: MediaType = "text";

  // ─ Image generation through env.AI binding (BYOK via AI Gateway) ─
  if (providerId === "openai" && (modelId === "openai/gpt-image-2" || modelId === "openai/gpt-image-1.5")) {
    mediaType = "image";
    const payload: Record<string, unknown> = { prompt: input.prompt.prompt };

    // STRICT enum validation — Workers AI returns 7003 if anything's out of band.
    const VALID_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024", "auto"]);
    const VALID_QUALITY = new Set(["low", "medium", "high", "auto"]);
    const VALID_FORMAT = new Set(["png", "webp", "jpeg"]);
    const VALID_BG = new Set(["transparent", "opaque", "auto"]);

    let size = typeof params.size === "string" ? params.size : "";
    if (!size && params.aspectRatio) size = mapAspectToSize(String(params.aspectRatio));
    if (VALID_SIZES.has(size)) payload.size = size;

    const quality = typeof params.quality === "string" ? params.quality.toLowerCase() : "";
    if (VALID_QUALITY.has(quality)) payload.quality = quality;

    const outFmt = typeof params.output_format === "string" ? params.output_format.toLowerCase() : "";
    if (VALID_FORMAT.has(outFmt)) payload.output_format = outFmt;

    const bg = typeof params.background === "string" ? params.background.toLowerCase() : "";
    if (VALID_BG.has(bg)) payload.background = bg;

    const r = await env.AI.run(modelId as any, payload as any, {
      gateway: { id: env.AI_GATEWAY_SLUG || "default" },
    } as any) as { image?: string; result?: { image?: string } };
    rawResponse = r;
    assetUri = r.image ?? r.result?.image;

    // gpt-image-2 high quality ~$0.04, medium ~$0.02, low ~$0.01. gpt-image-1.5 similar.
    const q = String(params.quality ?? "auto").toLowerCase();
    estimatedCostUsd = q === "high" ? 0.04 : q === "medium" ? 0.02 : q === "low" ? 0.01 : 0.025;
  }
  // ─ Workers AI native image / text models ─
  else if (providerId === "workers-ai") {
    const isFluxLike = /flux|stable-diffusion|sdxl|black-forest/i.test(modelId);
    const payload: Record<string, unknown> = isFluxLike
      ? {
          prompt: input.prompt.prompt,
          // Flux-schnell: 1-8 steps, default 4. Higher = slower but more detail.
          num_steps: clampInt(params.num_steps ?? params.steps ?? 4, 1, 8),
          ...(typeof params.seed === "number" ? { seed: params.seed } : {}),
          ...(typeof params.width === "number" ? { width: clampMul32(params.width, 256, 2048) } : {}),
          ...(typeof params.height === "number" ? { height: clampMul32(params.height, 256, 2048) } : {}),
        }
      : { prompt: input.prompt.prompt, ...input.prompt.parameters };

    const r = await env.AI.run(modelId as any, payload as any, {
      gateway: { id: env.AI_GATEWAY_SLUG || "default" },
    } as any) as any;
    rawResponse = r;

    // Flux returns either a raw base64 string (older) or { image: "<base64>" }.
    // Wrap as a data: URI so node13 normalizer fetch() can decode it and mirror to R2.
    const b64 = typeof r === "string" ? r : (r?.image ?? r?.result?.image);
    if (b64 && typeof b64 === "string" && b64.length > 100) {
      mediaType = "image";
      assetUri = b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;
      estimatedCostUsd = 0.0011; // flux-schnell ~$0.0011/image on Workers AI
    } else if (typeof r?.response === "string") {
      mediaType = "text"; estimatedCostUsd = 0.001;
    }
  }
  // ─ Text via chat completions through env.AI binding ─
  else if (providerId === "openai" || providerId === "openrouter" || providerId === "gemini") {
    mediaType = "text";
    const gatewayProvider =
      providerId === "gemini" ? "google-ai-studio/gemini-2.5-flash" :
      providerId === "openrouter" ? `openrouter/${modelId.replace(/^openrouter\//, "")}` :
      modelId.startsWith("openai/") ? modelId : `openai/${modelId}`;
    const r = await env.AI.run(gatewayProvider as any, {
      messages: [{ role: "user", content: input.prompt.prompt }],
      max_tokens: Number(params.maxTokens ?? 1024),
    } as any, { gateway: { id: env.AI_GATEWAY_SLUG || "default" } } as any) as any;
    rawResponse = r;
    estimatedCostUsd = 0.002;
  }
  // ─ Runway (text-to-video OR image-to-video) — direct REST call ─
  else if (providerId === "runway") {
    if (!env.RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY missing");
    mediaType = "video";

    // Image-to-video kicks in when params include a promptImage URL.
    const promptImage = typeof params.promptImage === "string" ? params.promptImage : "";
    const endpoint = promptImage
      ? "https://api.dev.runwayml.com/v1/image_to_video"
      : "https://api.dev.runwayml.com/v1/text_to_video";
    const ratio = String(params.ratio ?? mapAspectToRunwayRatio(String(params.aspectRatio ?? "9:16")));
    const body: Record<string, unknown> = {
      model: modelId.replace(/^runway\//, "") || (promptImage ? "gen4_turbo" : "gen4.5"),
      ratio,
      duration: Math.min(10, Math.max(1, Number(params.duration ?? params.durationSec ?? 5))),
    };
    if (promptImage) {
      body.promptImage = promptImage;
      body.promptText = input.prompt.prompt;
    } else {
      body.promptText = input.prompt.prompt;
    }

    const taskRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RUNWAY_API_KEY}`, "X-Runway-Version": "2024-11-06", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!taskRes.ok) throw new Error(`Runway ${taskRes.status}: ${(await taskRes.text()).slice(0, 200)}`);
    const task = await taskRes.json() as { id: string };
    rawResponse = task;
    estimatedCostUsd = (Number(body.duration) * 0.10); // gen4_turbo ~10 credits/sec

    // Poll inline until SUCCEEDED or FAILED. Cap at 110s to stay well under
    // the queue handler's 120s soft limit per message; if it doesn't finish
    // in time we throw retriable so the next attempt picks up the same task.
    const deadline = Date.now() + 110_000;
    let videoUrl: string | undefined;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5_000));
      const pollRes = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, {
        headers: { "Authorization": `Bearer ${env.RUNWAY_API_KEY}`, "X-Runway-Version": "2024-11-06" },
      });
      if (!pollRes.ok) continue;
      const status = await pollRes.json() as { status: string; output?: string[]; failure?: string; failureCode?: string };
      if (status.status === "SUCCEEDED") {
        videoUrl = Array.isArray(status.output) ? status.output[0] : undefined;
        break;
      }
      if (status.status === "FAILED" || status.status === "CANCELLED") {
        throw new Error(`Runway task ${status.status}: ${status.failureCode ?? ""} ${status.failure ?? ""}`.slice(0, 240));
      }
    }
    if (!videoUrl) throw new Error(`Runway task ${task.id} did not finish in 110s — will retry`);
    assetUri = videoUrl;
  }
  // ─ Google Veo (image-to-video) — direct REST call ─
  // Used as fallback when Runway hits 402 credits. Veo 3.1 Fast accepts an
  // inline-base64 image + text prompt and returns an async long-running
  // operation. We poll inline, then mirror the resulting MP4 into R2 ourselves
  // (Veo's signed URL requires an API key on download — the normalizer can't
  // fetch it).
  else if (providerId === "google-ai-studio") {
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing for Veo");
    mediaType = "video";

    const promptImage = String(params.promptImage ?? "");
    if (!promptImage) throw new Error("Veo image-to-video requires params.promptImage URL");

    const imgRes = await fetch(promptImage);
    if (!imgRes.ok) throw new Error(`Veo: failed to fetch promptImage ${imgRes.status}`);
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
    let binary = "";
    for (let i = 0; i < imgBytes.length; i++) binary += String.fromCharCode(imgBytes[i]);
    const imgB64 = btoa(binary);
    const mime = imgRes.headers.get("content-type") ?? "image/jpeg";

    const modelSlug = modelId.replace(/^google-ai-studio\//, "").replace(/^veo\//, "") || "veo-3.1-fast-generate-preview";
    const startUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelSlug}:predictLongRunning`;
    const startBody = {
      instances: [{
        prompt: input.prompt.prompt,
        image: { inlineData: { mimeType: mime, data: imgB64 } },
      }],
      parameters: {
        aspectRatio: String(params.aspectRatio ?? "16:9"),
        resolution: String(params.resolution ?? "720p"),
        ...(typeof params.duration === "number" ? { durationSeconds: clampInt(params.duration, 4, 8) } : {}),
      },
    };
    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify(startBody),
    });
    if (!startRes.ok) {
      throw new Error(`Veo ${startRes.status}: ${(await startRes.text()).slice(0, 240)}`);
    }
    const op = await startRes.json() as { name?: string };
    if (!op.name) throw new Error("Veo: missing operation name");
    rawResponse = op;

    // Poll up to 110s (Veo 3.1 Fast usually finishes in 30-90s for 5s clips).
    const deadline = Date.now() + 110_000;
    let videoUri: string | undefined;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10_000));
      const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op.name}`, {
        headers: { "x-goog-api-key": env.GEMINI_API_KEY },
      });
      if (!pollRes.ok) continue;
      const status = await pollRes.json() as any;
      if (status.done) {
        if (status.error) throw new Error(`Veo failed: ${JSON.stringify(status.error).slice(0, 240)}`);
        videoUri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
                ?? status.response?.predictions?.[0]?.videoUri
                ?? status.response?.predictions?.[0]?.video?.uri;
        break;
      }
    }
    if (!videoUri) throw new Error(`Veo operation ${op.name} did not finish in 110s — will retry`);

    // Veo's video URL requires the API key on GET; download here and mirror to R2.
    const videoRes = await fetch(videoUri.includes("?") ? `${videoUri}&key=${env.GEMINI_API_KEY}` : `${videoUri}?key=${env.GEMINI_API_KEY}`);
    if (!videoRes.ok) throw new Error(`Veo download ${videoRes.status}`);
    const videoBytes = await videoRes.arrayBuffer();
    const r2Key = `generated/veo/${input.promptId}/${crypto.randomUUID().slice(0, 8)}.mp4`;
    await env.MEDIA.put(r2Key, videoBytes, { httpMetadata: { contentType: "video/mp4" } });
    assetUri = `${env.R2_PUBLIC_BASE}/${encodeURI(r2Key)}`;
    estimatedCostUsd = 0.05; // Veo 3.1 Fast ~$0.05/5s clip
  }
  // ─ Replicate (text-to-video OR image-to-video) — REST API ─
  // modelId format: "replicate/<owner>/<name>". Inline-poll up to 110s.
  // Mirrors the result MP4 into our R2 so the link doesn't expire.
  else if (providerId === "replicate") {
    if (!env.REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN missing");
    const tail = modelId.replace(/^replicate\//, "");
    const [owner, name] = tail.split("/", 2);
    if (!owner || !name) throw new Error(`Node 09: bad replicate modelId ${modelId}`);

    // Look up the curated spec by owner/name for sensible defaults; fall back to
    // a generic spec if the LLM picked an off-registry combo.
    const knownSpec = Object.values(REPLICATE_MODELS).find((m) => m.owner === owner && m.name === name);
    mediaType = "video";

    const promptImage = typeof params.promptImage === "string" ? params.promptImage : "";
    const replicateInput: Record<string, unknown> = {
      ...(knownSpec?.defaults ?? {}),
      prompt: input.prompt.prompt,
    };
    if (params.aspectRatio) replicateInput.aspect_ratio = String(params.aspectRatio);
    if (params.ratio) replicateInput.aspect_ratio = String(params.ratio);
    if (typeof params.duration === "number") replicateInput.duration = clampInt(params.duration, 1, 10);
    if (typeof params.seed === "number") replicateInput.seed = params.seed;
    if (promptImage) {
      // Different I2V models use different field names. Set the common ones —
      // unrecognized fields are ignored by Replicate's input schema.
      replicateInput.image = promptImage;
      replicateInput.start_image = promptImage;
      replicateInput.input_image = promptImage;
      replicateInput.first_frame_image = promptImage;
    }
    if (input.prompt.negativePrompt) replicateInput.negative_prompt = input.prompt.negativePrompt;

    const prediction = await replicateCreate(env, owner, name, replicateInput, { preferWaitSeconds: 55 });
    rawResponse = prediction;
    const finished =
      prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled"
        ? prediction
        : await replicateWait(env, prediction.id, 110_000, 4_000);
    if (finished.status !== "succeeded") {
      throw new Error(`Replicate ${owner}/${name} ${finished.status}: ${finished.error ?? ""}`.slice(0, 240));
    }
    const outUrl = replicateOutput(finished);
    if (!outUrl) throw new Error(`Replicate ${finished.id}: no output url`);
    assetUri = outUrl;
    estimatedCostUsd = knownSpec?.unitPriceUsd ?? 0.15;
  }
  else {
    throw new Error(`Node 09: provider ${providerId} model ${modelId} not implemented`);
  }

  const spent: CostEstimate = {
    providerId,
    modelId,
    mediaType,
    quantity: 1,
    estimatedCostUsd,
    confidence: 0.85,
  };

  const data: ProviderAdapterOutput = {
    promptId: input.promptId,
    rawResponse,
    assetUri,
    spent,
  };
  return envelope("node_09_provider_adapter", runId, "completed", data, { costSpent: spent });
}

function mapAspectToSize(ar: string): string {
  switch (ar) {
    case "9:16": case "2:3": return "1024x1536";
    case "16:9": case "3:2": return "1536x1024";
    case "1:1":              return "1024x1024";
    default:                  return "1024x1024";
  }
}
function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function clampMul32(v: unknown, lo: number, hi: number): number {
  const n = clampInt(v, lo, hi);
  return Math.round(n / 32) * 32;
}
function mapAspectToRunwayRatio(ar: string): string {
  switch (ar) {
    case "9:16":  return "720:1280";
    case "1:1":   return "1024:1024";
    case "16:9":  return "1280:720";
    case "2:3":   return "720:1080";
    default:       return "720:1280";
  }
}

// ─────────────────────────────────────────────────────────────────────
// Node 10 — Cost Governor
// ─────────────────────────────────────────────────────────────────────
export interface CostGovernorInput { estimates: CostEstimate[]; budgetUsd: number; }
export interface CostGovernorOutput { approvedPromptIds: UUID[]; deferredPromptIds: UUID[]; totalEstimatedUsd: number; }
export async function node10_costGovernor(
  input: CostGovernorInput, runId: UUID
): Promise<NodeOutputEnvelope<CostGovernorOutput>> {
  // Greedy fit by confidence × inverse cost — approve high-confidence cheap items
  // first, defer the rest. This is the v1; v2 should weight by ProviderPolicy
  // preferred providers and pull real spend from AI Gateway analytics.
  const estimates = [...input.estimates].sort((a, b) => {
    const scoreA = (a.confidence ?? 0.5) / Math.max(a.estimatedCostUsd, 0.001);
    const scoreB = (b.confidence ?? 0.5) / Math.max(b.estimatedCostUsd, 0.001);
    return scoreB - scoreA;
  });

  let spent = 0;
  const approved: string[] = [];
  const deferred: string[] = [];

  // Each estimate may have an associated promptId on its metadata-shaped sibling;
  // for the v1 we index by position in the input array.
  for (let i = 0; i < estimates.length; i++) {
    const e = estimates[i];
    const promptId = (e as any).promptId ?? `prompt_${i}`;
    if (spent + e.estimatedCostUsd <= input.budgetUsd) {
      approved.push(promptId);
      spent += e.estimatedCostUsd;
    } else {
      deferred.push(promptId);
    }
  }

  const status = approved.length > 0 ? "completed" : "failed_recoverable";
  const warnings: string[] = [];
  if (spent > input.budgetUsd * 0.75) warnings.push(`spent ${spent.toFixed(4)} of ${input.budgetUsd} (over 75% of budget)`);
  if (deferred.length > 0) warnings.push(`${deferred.length} prompts deferred for budget`);

  return envelope("node_10_cost_governor", runId, status, {
    approvedPromptIds: approved,
    deferredPromptIds: deferred,
    totalEstimatedUsd: Number(spent.toFixed(4)),
  }, { warnings });
}

// ─────────────────────────────────────────────────────────────────────
// Node 11 — Parallel Provider Dispatcher
//   Implementation hint: ENQUEUE each viable prompt onto PUBLISH_QUEUE
//   (or a dedicated GENERATE_QUEUE) with parallelism limits from ProviderPolicy.
// ─────────────────────────────────────────────────────────────────────
export interface DispatcherInput { jobs: Array<{ promptId: UUID; capability: ProviderCapability; prompt: PromptSpec }>; }
export interface DispatcherOutput { dispatchedJobIds: UUID[]; }
export async function node11_dispatcher(
  env: Env, input: DispatcherInput & { workflowId: UUID; userId: UUID; parallelism?: { maxConcurrentJobsPerProvider: number; maxConcurrentProviders: number } },
  runId: UUID
): Promise<NodeOutputEnvelope<DispatcherOutput>> {
  const perProviderLimit = input.parallelism?.maxConcurrentJobsPerProvider ?? 2;
  const totalProviderLimit = input.parallelism?.maxConcurrentProviders ?? 3;

  // Group jobs by provider, then cap per-provider, then cap total providers.
  const byProvider = new Map<string, typeof input.jobs>();
  for (const j of input.jobs) {
    const list = byProvider.get(j.capability.providerId) ?? [];
    list.push(j);
    byProvider.set(j.capability.providerId, list);
  }
  const trimmed: typeof input.jobs = [];
  let providersUsed = 0;
  for (const [, list] of byProvider) {
    if (providersUsed >= totalProviderLimit) break;
    providersUsed++;
    trimmed.push(...list.slice(0, perProviderLimit));
  }

  // Enqueue.
  const dispatched: UUID[] = [];
  for (const j of trimmed) {
    await env.PUBLISH_QUEUE.send({
      kind: "generate",
      workflowId: input.workflowId,
      userId: input.userId,
      promptId: j.promptId,
      providerId: j.capability.providerId,
      modelId: j.capability.modelId,
      prompt: j.prompt.prompt,
      negativePrompt: j.prompt.negativePrompt,
      parameters: j.prompt.parameters,
      preservationTokens: j.prompt.preservationTokens,
    });
    dispatched.push(j.promptId);
  }

  return envelope("node_11_dispatcher", runId, dispatched.length > 0 ? "completed" : "failed_recoverable", { dispatchedJobIds: dispatched });
}

// ─────────────────────────────────────────────────────────────────────
// Node 12 — Variation Matrix Generator
// ─────────────────────────────────────────────────────────────────────
export interface VariationInput { prompts: PromptSpec[]; axes: Array<{ name: string; values: unknown[] }>; }
export interface VariationOutput { variants: Array<{ id: UUID; basePromptId: UUID; axisValues: Record<string, unknown> }>; }
export async function node12_variations(_env: Env, input: VariationInput, runId: UUID): Promise<NodeOutputEnvelope<VariationOutput>> {
  // Cartesian product of axes (capped to keep cost sane).
  const MAX_VARIANTS_PER_BASE = 8;
  const variants: VariationOutput["variants"] = [];

  for (const base of input.prompts) {
    const combos = cartesian(input.axes.map((a) => a.values.map((v) => [a.name, v] as [string, unknown])));
    for (const combo of combos.slice(0, MAX_VARIANTS_PER_BASE)) {
      const axisValues: Record<string, unknown> = {};
      for (const [name, value] of combo) axisValues[name] = value;
      variants.push({
        id: crypto.randomUUID(),
        basePromptId: base.id,
        axisValues,
      });
    }
  }

  return envelope("node_12_variations", runId, variants.length > 0 ? "completed" : "failed_recoverable", { variants });
}

function cartesian<T>(arrs: T[][]): T[][] {
  if (arrs.length === 0) return [[]];
  const [first, ...rest] = arrs;
  const tail = cartesian(rest);
  return first.flatMap((v) => tail.map((t) => [v, ...t]));
}

// ─────────────────────────────────────────────────────────────────────
// Node 13 — Output Normalizer
//   Implementation hint: take provider raw output, pipe into R2 immediately,
//   compute SHA-256 checksum, return canonical `GeneratedAsset` shape.
// ─────────────────────────────────────────────────────────────────────
export interface NormalizerInput { providerOutputs: ProviderAdapterOutput[]; }
export interface GeneratedAsset {
  id: UUID;
  providerId: ProviderId;
  modelId: string;
  mediaType: MediaType;
  uri: string;
  checksum: string;
  promptId: UUID;
  variantId?: UUID;
  metadata: Record<string, unknown>;
}
export interface NormalizerOutput { assets: GeneratedAsset[]; }
export async function node13_normalizer(env: Env, input: NormalizerInput, runId: UUID): Promise<NodeOutputEnvelope<NormalizerOutput>> {
  const assets: GeneratedAsset[] = [];
  for (const out of input.providerOutputs) {
    if (!out.assetUri) continue; // text/json outputs don't need R2 mirroring
    try {
      const res = await fetch(out.assetUri);
      if (!res.ok || !res.body) {
        throw new Error(`fetch ${out.assetUri} → ${res.status}`);
      }
      const mime = res.headers.get("content-type") ?? "application/octet-stream";
      const buf = await res.arrayBuffer();
      const checksum = await sha256Bytes(new Uint8Array(buf));
      const mediaType = mimeToMediaType(mime);
      const ext = mime.split("/")[1]?.split(";")[0] ?? "bin";
      const r2Key = `generated/normalized/${out.promptId}/${checksum.slice(0, 8)}.${ext}`;
      await env.MEDIA.put(r2Key, buf, { httpMetadata: { contentType: mime } });

      const asset: GeneratedAsset = {
        id: crypto.randomUUID(),
        providerId: out.spent.providerId,
        modelId: out.spent.modelId,
        mediaType,
        uri: `${env.R2_PUBLIC_BASE}/${encodeURI(r2Key)}`,
        checksum,
        promptId: out.promptId,
        metadata: { bytes: buf.byteLength, mime, originalUri: out.assetUri, cost: out.spent },
      };
      assets.push(asset);

      // Persist to generated_assets table for auditability.
      try {
        const now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO generated_assets
            (id,workflow_id,provider_id,model_id,media_type,uri,checksum,prompt_id,variant_id,metadata_json,created_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,NULL,?9,?10)`
        ).bind(
          asset.id,
          runId.toString(),  // workflow_id slot reused as run-scoped grouping
          asset.providerId,
          asset.modelId,
          asset.mediaType,
          asset.uri,
          asset.checksum,
          asset.promptId,
          JSON.stringify(asset.metadata),
          now
        ).run();
      } catch {
        // table may be missing workflow context — not fatal for normalizer
      }
    } catch {
      // Per-item failures are tolerable; the rest of the batch can proceed.
    }
  }
  return envelope("node_13_normalizer", runId, assets.length > 0 ? "completed" : "failed_recoverable", { assets });
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function mimeToMediaType(mime: string): MediaType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.includes("html")) return "html";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("csv")) return "csv";
  if (mime.includes("json")) return "json";
  return "text";
}

// ─────────────────────────────────────────────────────────────────────
// Node 14 — Creative Quality Review
//   Implementation hint: chain Workers AI calls:
//     1. llamaguard-7b-awq → safety classification
//     2. resnet-50 (or image-classification model) → product preservation
//     3. brand-palette extraction → palette adherence
// ─────────────────────────────────────────────────────────────────────
export interface ReviewInput { assets: GeneratedAsset[]; brand: BrandProfile; }
export interface ReviewScore { assetId: UUID; productConsistency: number; brandAdherence: number; safety: number; overall: number; failureTags: string[]; }
export interface ReviewOutput { scores: ReviewScore[]; failedAssetIds: UUID[]; }
export async function node14_review(env: Env, input: ReviewInput, runId: UUID): Promise<NodeOutputEnvelope<ReviewOutput>> {
  const scores: ReviewScore[] = [];
  const failed: UUID[] = [];

  for (const asset of input.assets) {
    let safety = 1.0;
    let productConsistency = 0.8; // default neutral when we can't classify
    let brandAdherence = 0.7;
    const failureTags: string[] = [];

    // ── Safety pass: llamaguard text-classify the prompt that produced the asset.
    // We don't have the prompt text here — pass the image URI through caption first if image.
    if (asset.mediaType === "image" && env.AI) {
      try {
        // Caption via image-to-text, then guard the caption.
        const cap = (await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf" as any, {
          prompt: "Describe this image in one sentence.",
          image: await fetchAsUint8(asset.uri),
        } as any)) as any;
        const caption: string = cap?.description ?? cap?.response ?? "";

        if (caption) {
          const guard = (await env.AI.run("@cf/meta/llama-guard-3-8b" as any, {
            messages: [{ role: "user", content: caption }],
          } as any)) as any;
          const verdict: string = String(guard?.response ?? "").toLowerCase();
          if (verdict.includes("unsafe")) { safety = 0.0; failureTags.push("safety_unsafe"); }
          else if (verdict.includes("safe")) { safety = 1.0; }

          // Brand adherence proxy: check if any of the user's brand colors are mentioned/
          // visible in the caption.
          const brandKeywords = (input.brand.palette ?? []).map((c) => c.toLowerCase());
          if (brandKeywords.length > 0) {
            const hits = brandKeywords.filter((k) => caption.toLowerCase().includes(k)).length;
            brandAdherence = Math.min(1.0, 0.5 + (hits / Math.max(1, brandKeywords.length)) * 0.5);
          }
          // Product preservation: did any required-preserve product label appear?
          const mustPreserve = (input.brand.productReferences ?? []).filter((p) => p.mustPreserve);
          if (mustPreserve.length > 0) {
            const labelHits = mustPreserve.filter((p) => caption.toLowerCase().includes(p.label.toLowerCase())).length;
            productConsistency = labelHits / mustPreserve.length;
            if (productConsistency < 0.5) failureTags.push("product_missing");
          }
        }
      } catch (e: any) {
        failureTags.push(`review_error:${(e?.message ?? String(e)).slice(0, 40)}`);
      }
    }

    const overall = (safety * 0.4) + (brandAdherence * 0.3) + (productConsistency * 0.3);
    scores.push({
      assetId: asset.id,
      productConsistency: round(productConsistency),
      brandAdherence: round(brandAdherence),
      safety: round(safety),
      overall: round(overall),
      failureTags,
    });
    if (overall < 0.6 || failureTags.includes("safety_unsafe")) failed.push(asset.id);
  }

  const status = scores.length > 0 ? "completed" : "failed_recoverable";
  return envelope("node_14_review", runId, status, { scores, failedAssetIds: failed });
}

function round(n: number): number { return Math.round(n * 100) / 100; }
async function fetchAsUint8(uri: string): Promise<number[]> {
  const r = await fetch(uri);
  const buf = new Uint8Array(await r.arrayBuffer());
  return Array.from(buf);
}

// ─────────────────────────────────────────────────────────────────────
// Node 15 — Regeneration Decision + Delta Prompt
// ─────────────────────────────────────────────────────────────────────
export interface RegenerationInput { reviewScores: ReviewScore[]; assets: GeneratedAsset[]; prompts: PromptSpec[]; }
export interface RegenerationPlan { regenerate: Array<{ assetId: UUID; deltaPrompt: string; targetedFix: string[] }>; }
export async function node15_regeneration(env: Env, input: RegenerationInput, runId: UUID): Promise<NodeOutputEnvelope<RegenerationPlan>> {
  // For each failed asset (overall < threshold), emit a delta prompt that
  // addresses the specific failureTags. LLM-backed micro-rewrite of the
  // originating PromptSpec.

  const HUMAN_REVIEW = 0.72;
  const failedScores = input.reviewScores.filter((s) => s.overall < HUMAN_REVIEW);
  if (failedScores.length === 0) {
    return envelope("node_15_regeneration", runId, "completed", { regenerate: [] });
  }

  const regenerate: RegenerationPlan["regenerate"] = [];
  for (const score of failedScores) {
    const asset = input.assets.find((a) => a.id === score.assetId);
    if (!asset) continue;
    const originalPrompt = input.prompts.find((p) => p.id === asset.promptId);
    const promptText = originalPrompt?.prompt ?? "(unknown)";

    const llmPrompt = `An image generator produced an asset that failed quality review.

Original prompt:
${promptText}

Failure tags: ${score.failureTags.join(", ") || "(low overall score)"}
Brand adherence: ${score.brandAdherence}, product consistency: ${score.productConsistency}, safety: ${score.safety}

Write a DELTA PROMPT — a focused modification to the original — that addresses the failure tags. The delta should be 1-3 sentences appended to the original prompt (NOT a rewrite). Be specific about what to change.

Return strict JSON: { "deltaPrompt": "...", "targetedFix": ["tag1", "tag2"] }`;

    try {
      const { data } = await llmJson<{ deltaPrompt: string; targetedFix: string[] }>(env, llmPrompt, { maxTokens: 512 });
      regenerate.push({
        assetId: asset.id,
        deltaPrompt: String(data.deltaPrompt ?? ""),
        targetedFix: Array.isArray(data.targetedFix) ? data.targetedFix.map(String) : score.failureTags,
      });
    } catch {
      regenerate.push({
        assetId: asset.id,
        deltaPrompt: `Ensure the result better satisfies: ${score.failureTags.join(", ")}.`,
        targetedFix: score.failureTags,
      });
    }
  }

  return envelope("node_15_regeneration", runId, "completed", { regenerate });
}

// ─────────────────────────────────────────────────────────────────────
// Node 16 — Export Package Builder
//   Implementation hint: produce a ZIP in R2 + a manifest.json with every
//   asset URI, prompt, cost, review score, and a per-platform render plan
//   pointing at Cloudflare Image Resizing URLs for instant size variants.
// ─────────────────────────────────────────────────────────────────────
export interface ExportInput { workflowId: UUID; approvedAssets: GeneratedAsset[]; renderTargets: PlatformMapperOutput["renderTargets"]; }
export interface ExportPackage { workflowId: UUID; bundleUri: string; manifestUri: string; perPlatformUris: Array<{ platform: string; uri: string }>; }
export async function node16_exportPackage(env: Env, input: ExportInput, runId: UUID): Promise<NodeOutputEnvelope<ExportPackage>> {
  // We don't have a Worker-native ZIP lib, so emit a manifest.json + a small
  // index.html catalog. Downloader can grab everything from those.
  const stamp = Date.now().toString(36);
  const baseKey = `exports/${input.workflowId}/${stamp}`;

  const manifest = {
    workflowId: input.workflowId,
    createdAt: new Date().toISOString(),
    assetCount: input.approvedAssets.length,
    assets: input.approvedAssets.map((a) => ({
      id: a.id,
      provider: a.providerId,
      model: a.modelId,
      mediaType: a.mediaType,
      uri: a.uri,
      checksum: a.checksum,
      promptId: a.promptId,
      metadata: a.metadata,
    })),
    renderTargets: input.renderTargets,
  };
  const manifestKey = `${baseKey}/manifest.json`;
  await env.MEDIA.put(manifestKey, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  // Per-platform index pages — useful when handing off to a marketing op.
  const perPlatformUris: { platform: string; uri: string }[] = [];
  const platforms = Array.from(new Set(input.renderTargets.map((r) => r.platform)));
  for (const platform of platforms) {
    const platformAssets = input.approvedAssets;  // v1: all assets work for all platforms; v2 would map by aspect ratio
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${platform} export — ${input.workflowId}</title>
<style>body{background:#120F0F;color:#F7F7F5;font:14px/1.5 system-ui;margin:24px}img,video{max-width:100%;border-radius:6px;border:1px solid #C3A35B33;display:block;margin:8px 0}h1{font-family:'Space Grotesk',sans-serif;color:#C3A35B}.a{margin:24px 0;padding:16px;background:#27201180;border:1px solid #C3A35B26;border-radius:8px}.meta{font-family:monospace;font-size:11px;color:#F7F7F580}</style></head>
<body>
<h1>${platform} export</h1>
<div class="meta">Workflow: ${input.workflowId} · ${platformAssets.length} assets</div>
${platformAssets.map((a) => `
  <div class="a">
    ${a.mediaType === "image" ? `<img src="${a.uri}" alt="">` : a.mediaType === "video" ? `<video src="${a.uri}" controls></video>` : ""}
    <div class="meta">${a.providerId} / ${a.modelId} · checksum ${a.checksum.slice(0, 12)}</div>
  </div>`).join("")}
</body></html>`;
    const key = `${baseKey}/${platform}.html`;
    await env.MEDIA.put(key, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
    perPlatformUris.push({ platform, uri: `${env.R2_PUBLIC_BASE}/${encodeURI(key)}` });
  }

  const pkg: ExportPackage = {
    workflowId: input.workflowId,
    bundleUri: `${env.R2_PUBLIC_BASE}/${encodeURI(manifestKey)}`,
    manifestUri: `${env.R2_PUBLIC_BASE}/${encodeURI(manifestKey)}`,
    perPlatformUris,
  };
  return envelope("node_16_export_package", runId, "completed", pkg);
}
