// High-quality scene planner. Takes a brief, returns a structured shotlist.
// Models route through env.AI (AI Gateway BYOK) so no new SDK is needed.

import type { Env } from "./env";

export const PLANNER_MODELS = {
  "openai/gpt-5":                       { label: "GPT-5 (OpenAI)", provider: "openai" },
  "openai/gpt-5-mini":                  { label: "GPT-5 Mini (OpenAI)", provider: "openai" },
  "anthropic/claude-opus-4":            { label: "Claude Opus 4 (Anthropic)", provider: "anthropic" },
  "anthropic/claude-sonnet-4-6":        { label: "Claude Sonnet 4.6 (Anthropic)", provider: "anthropic" },
  "google-ai-studio/gemini-2.5-pro":    { label: "Gemini 2.5 Pro (Google)", provider: "gemini" },
  "google-ai-studio/gemini-2.5-flash":  { label: "Gemini 2.5 Flash (Google)", provider: "gemini" },
} as const;
export type PlannerModelId = keyof typeof PLANNER_MODELS;

export interface ScenePlan {
  idx: number;
  title: string;
  imagePrompt: string;
  videoPrompt: string;
  continuity: string;
  duration: number;
  aspectRatio: string;
}

export interface PlannerOutput {
  title: string;
  scenes: ScenePlan[];
  styleSummary: string;
  warnings: string[];
}

const PLANNER_SYSTEM = `You are a senior commercial film director planning a short-form storyboard.
You ALWAYS return strict JSON matching this schema:

{
  "title": "<5-7 word title>",
  "styleSummary": "<2 sentences capturing lens, mood, palette, motion language>",
  "scenes": [
    {
      "idx": <0-based int>,
      "title": "<5-9 word scene label>",
      "imagePrompt": "<detailed keyframe image prompt, ≥30 words>",
      "videoPrompt": "<image-to-video animation prompt, ≥20 words>",
      "continuity": "<what carries from prior scene — subject, lighting, lens, palette tokens>",
      "duration": <4|5|6|8 seconds>,
      "aspectRatio": "<16:9|9:16|1:1>"
    }
  ],
  "warnings": ["<optional concerns about ambiguity, IP, or feasibility>"]
}

Rules:
- Generate between 3 and 8 scenes unless the operator specified count.
- Continuity tokens are critical: each scene must explicitly call back to the subject, lens choice, and palette of the prior scene so a video model can maintain visual identity.
- Image prompts target a high-quality T2I model (gpt-image-2). Video prompts target a T2V/I2V model (Veo 3, Kling, Wan).
- Do NOT invent copyrighted characters or brands.
- Match the requested aspect ratio across all scenes unless the brief explicitly asks for variation.
- Output ONLY the JSON, no commentary.`;

export interface PlannerInput {
  brief: string;
  count?: number;
  aspectRatio?: string;
  durationPreference?: number;
  styleHints?: string;
  model?: PlannerModelId;
}

export async function planScenes(env: Env, input: PlannerInput): Promise<PlannerOutput> {
  if (!env.AI) throw new Error("env.AI binding missing");
  const model: PlannerModelId = input.model ?? "openai/gpt-5";
  const sceneCount = input.count && input.count > 0 ? Math.min(12, input.count) : undefined;

  const user = `BRIEF:
${input.brief.trim()}

CONSTRAINTS:
- aspectRatio: ${input.aspectRatio ?? "16:9"}
- duration preference per scene (seconds): ${input.durationPreference ?? 5}
${sceneCount ? `- exact scene count: ${sceneCount}` : "- scene count: pick 4-6 unless the brief demands more"}
${input.styleHints ? `- style hints: ${input.styleHints}` : ""}

Return the JSON.`;

  // Some providers expose chat-completion-style; route through env.AI as
  // generic messages and hope the gateway maps correctly per model id.
  const res = await env.AI.run(model as any, {
    messages: [
      { role: "system", content: PLANNER_SYSTEM },
      { role: "user", content: user },
    ],
    max_tokens: 4000,
    response_format: { type: "json_object" },
  } as any, { gateway: { id: env.AI_GATEWAY_SLUG || "default" } } as any) as any;

  // Normalize across response shapes.
  const text: string =
    res?.choices?.[0]?.message?.content ??
    res?.message?.content ??
    res?.response ??
    res?.content ??
    (typeof res === "string" ? res : "");

  if (!text) throw new Error(`Planner ${model}: empty response`);

  // Strip code fences if a model insists on them.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: any;
  try { parsed = JSON.parse(cleaned); } catch (err) {
    throw new Error(`Planner ${model}: JSON parse failed — ${String(err).slice(0, 200)}\nRaw: ${cleaned.slice(0, 400)}`);
  }

  const scenes: ScenePlan[] = Array.isArray(parsed.scenes) ? parsed.scenes.map((s: any, i: number) => ({
    idx: typeof s.idx === "number" ? s.idx : i,
    title: String(s.title ?? `Scene ${i + 1}`),
    imagePrompt: String(s.imagePrompt ?? ""),
    videoPrompt: String(s.videoPrompt ?? ""),
    continuity: String(s.continuity ?? ""),
    duration: clampDuration(s.duration),
    aspectRatio: String(s.aspectRatio ?? input.aspectRatio ?? "16:9"),
  })) : [];

  return {
    title: String(parsed.title ?? "Untitled composition"),
    styleSummary: String(parsed.styleSummary ?? ""),
    scenes,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((w: any) => String(w)) : [],
  };
}

function clampDuration(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 5;
  // Veo allows 4/6/8. Kling/Wan/HappyHorse allow 5/10. We pick the closest
  // value that's compatible with the most providers (5).
  return Math.max(3, Math.min(10, n));
}
