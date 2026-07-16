// B-Roll shot-list planner.
// Mirrors Runway's Gen-4 "B-Roll workspace" pattern: take a single reference
// (image or detailed description) + scene context, emit a multi-angle shot list
// with a shared continuity token, beats, motion hints, and final ready-to-fire
// prompts that each repeat the continuity anchor so the subject stays locked
// across every generated still.

import type { Env } from "../env";
import { llmJson } from "../llm";

export interface BrollPlanInput {
  sceneText: string;
  referenceDescription: string;       // what the subject/location looks like — locked across all shots
  style?: "cinematic" | "product" | "documentary" | "editorial" | "drone";
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:5";
  shotCount?: number;                 // 4..12, default 6
}

export interface BrollShotSpec {
  ordinal: number;
  title: string;
  angle: "wide" | "medium" | "close" | "extreme_close" | "overhead" | "low" | "dutch" | "pov" | "tracking";
  beat: "intro" | "reveal" | "detail" | "action" | "transition" | "outro";
  prompt: string;                     // final, ready-to-fire still prompt; always ends with the continuity anchor
  negativePrompt?: string;
  motionHint: string;                 // future-use: feeds Runway gen4 when animating this shot
  durationSeconds: number;            // 5 | 10
}

export interface BrollPlanOutput {
  continuityToken: string;            // short shared anchor — e.g. "amber-roof-001"
  continuityAnchor: string;           // longer description repeated into every prompt
  shots: BrollShotSpec[];
  warnings: string[];                 // actionable issues only — provider-failover noise filtered
  plannedBy?: string;                 // which LLM actually answered (gemini | openai | raw)
}

const STYLE_GUIDANCE: Record<string, string> = {
  cinematic: "Cinematic, anamorphic, shallow depth of field, motivated lighting, color-graded for warmth.",
  product:   "Studio product photography, key light + rim light, seamless background, ultra-crisp focus.",
  documentary: "Documentary realism, natural light, handheld feel without blur, journalistic framing.",
  editorial: "Editorial magazine spread, large negative space, refined composition, neutral tones with one accent.",
  drone: "Aerial drone photography, high vantage, gentle parallax, cinematic wide field of view.",
};

const ANGLES_BY_COUNT: Record<number, BrollShotSpec["angle"][]> = {
  4:  ["wide", "medium", "close", "extreme_close"],
  5:  ["wide", "medium", "close", "extreme_close", "low"],
  6:  ["wide", "medium", "close", "extreme_close", "overhead", "low"],
  7:  ["wide", "medium", "close", "extreme_close", "overhead", "low", "tracking"],
  8:  ["wide", "medium", "close", "extreme_close", "overhead", "low", "tracking", "dutch"],
  9:  ["wide", "medium", "close", "extreme_close", "overhead", "low", "tracking", "dutch", "pov"],
  10: ["wide", "wide", "medium", "close", "extreme_close", "overhead", "low", "tracking", "dutch", "pov"],
  11: ["wide", "wide", "medium", "medium", "close", "extreme_close", "overhead", "low", "tracking", "dutch", "pov"],
  12: ["wide", "wide", "medium", "medium", "close", "close", "extreme_close", "overhead", "low", "tracking", "dutch", "pov"],
};

export async function planBrollShots(env: Env, input: BrollPlanInput): Promise<BrollPlanOutput> {
  const count = Math.max(4, Math.min(12, input.shotCount ?? 6));
  const style = input.style ?? "cinematic";
  const aspect = input.aspectRatio ?? "16:9";
  const angles = ANGLES_BY_COUNT[count] ?? ANGLES_BY_COUNT[6];
  const styleLine = STYLE_GUIDANCE[style] ?? STYLE_GUIDANCE.cinematic;

  // The continuity token is the bit Runway calls "subject lock" — a short
  // identifier the LLM is told to use as the literal subject anchor in every
  // shot prompt, so the generator interprets every shot as the SAME thing.
  const tokenSeed = (input.referenceDescription || input.sceneText).slice(0, 40);
  const continuityToken = `cf-${hash32(tokenSeed)}`;

  const planPrompt = [
    "You are an experienced cinematographer building a B-roll shot list.",
    "",
    `SCENE: ${input.sceneText}`,
    `SUBJECT / CONTINUITY ANCHOR: ${input.referenceDescription}`,
    `STYLE: ${styleLine}`,
    `ASPECT RATIO: ${aspect}`,
    `SHOT COUNT: ${count}`,
    `REQUIRED ANGLE SEQUENCE (use in this order): ${angles.join(", ")}`,
    "",
    "Produce a JSON object with this exact shape:",
    `{`,
    `  "continuityAnchor": "<a 1-2 sentence description of the subject that MUST be referenced in every shot prompt verbatim, so the generator locks the subject across shots>",`,
    `  "shots": [`,
    `    {`,
    `      "ordinal": 1,`,
    `      "title": "<short label like 'Wide establishing' or 'Tight on hands'>",`,
    `      "angle": "<one of: ${angles.join(" | ")}>",`,
    `      "beat": "<one of: intro | reveal | detail | action | transition | outro>",`,
    `      "prompt": "<the FINAL ready-to-fire still prompt. Must start with the angle phrase, must restate the continuity anchor verbatim, must include style language. ~50-80 words.>",`,
    `      "negativePrompt": "<short list of things to avoid, comma-separated>",`,
    `      "motionHint": "<1 sentence describing the motion if we animate this shot to 5s — e.g. 'slow drone push-in toward roof line'>",`,
    `      "durationSeconds": 5`,
    `    }`,
    `  ]`,
    `}`,
    "",
    "Rules:",
    "- EVERY shot.prompt MUST include the exact continuityAnchor text verbatim — this is non-negotiable.",
    "- Vary angles in the required sequence; do not skip angles.",
    "- Vary the beat across shots so the sequence has narrative arc (intro → reveal → detail → action → transition → outro).",
    "- Keep prompts concrete and specific. No filler words.",
    "- No people unless explicitly mentioned in the scene.",
    "- All shot prompts share the same style + aspect; only angle/beat/focus change.",
  ].join("\n");

  const res = await llmJson<BrollPlanOutput>(env, planPrompt, {
    schemaHint: "JSON with continuityAnchor (string) and shots (array of objects)",
    maxTokens: 4096,
  });

  const raw = res.data ?? ({} as any);
  const continuityAnchor = String(raw.continuityAnchor ?? input.referenceDescription).slice(0, 800);

  const shots: BrollShotSpec[] = Array.isArray(raw.shots) ? raw.shots.slice(0, count).map((s: any, i: number) => {
    const angle = (angles[i] ?? "medium") as BrollShotSpec["angle"];
    const promptRaw = String(s?.prompt ?? "").trim();
    // Defensive: if LLM forgot to embed continuity, prepend it.
    const prompt = promptRaw.includes(continuityAnchor.slice(0, 30))
      ? promptRaw
      : `${promptRaw} ${continuityAnchor}`.trim();
    return {
      ordinal: i + 1,
      title: String(s?.title ?? `Shot ${i + 1}`).slice(0, 80),
      angle,
      beat: (["intro","reveal","detail","action","transition","outro"].includes(s?.beat) ? s.beat : "detail") as BrollShotSpec["beat"],
      prompt: prompt.slice(0, 1200),
      negativePrompt: s?.negativePrompt ? String(s.negativePrompt).slice(0, 400) : undefined,
      motionHint: String(s?.motionHint ?? "static").slice(0, 240),
      durationSeconds: (s?.durationSeconds === 10 ? 10 : 5),
    };
  }) : [];

  // Pad if planner under-produced.
  while (shots.length < count) {
    const i = shots.length;
    const angle = (angles[i] ?? "medium") as BrollShotSpec["angle"];
    shots.push({
      ordinal: i + 1,
      title: `${angle.replace("_", " ")} of subject`,
      angle,
      beat: "detail",
      prompt: `${angle.replace("_", " ")} shot, ${styleLine} ${continuityAnchor}`,
      motionHint: "subtle drift",
      durationSeconds: 5,
    });
  }

  // Surface warnings only for *unexpected* attempts — provider-failover noise
  // (Gemini quota, account-level PERMISSION_DENIED, etc.) is the failover
  // system working as designed and would alarm users unnecessarily.
  const EXPECTED_FALLBACK = /PERMISSION_DENIED|RESOURCE_EXHAUSTED|quota|API_KEY_SERVICE_BLOCKED|429|403|skipped/i;
  const usedProvider = res.provider;
  const interestingWarnings = res.attempts
    .filter((a) => !a.ok)
    .filter((a) => !EXPECTED_FALLBACK.test(a.error ?? ""))
    .map((a) => `${a.provider}: ${a.error ?? "fail"}`);

  return {
    continuityToken,
    continuityAnchor,
    shots,
    warnings: interestingWarnings,
    plannedBy: usedProvider,
  };
}

function hash32(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
