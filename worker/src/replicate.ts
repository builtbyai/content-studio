// Replicate.com client for video (and one-off image) generation.
//
// Two surfaces:
//   1. Direct: /api/video/generate hits createPrediction({ preferWait: true })
//      then polls inline up to ~110s, mirrors result into R2, records in media.
//   2. Workflow: Node 09 in nodes/creative.ts has a "replicate" branch that
//      handles its own polling exactly like the Runway/Veo branches.
//
// Long jobs (>110s) finalize via the optional webhook handler in index.ts.
// All requests use REPLICATE_API_TOKEN as Bearer; never log it.

import type { Env } from "./env";

export type ReplicateModelKey =
  | "happyhorse"
  | "wan_t2v" | "wan_i2v"
  | "kling_t2v" | "kling_i2v"
  | "seedance"
  | "veo3_fast" | "veo3"
  | "upscale_image" | "upscale_video" | "interpolate_video" | "remove_bg"
  | "music_gen" | "voice_clone" | "lip_sync"
  | "whisper" | "flux_dev" | "ideogram";

export interface ReplicateModelSpec {
  key: ReplicateModelKey;
  owner: string;
  name: string;
  label: string;
  mediaType: "video" | "image";
  needsImage?: boolean;
  unitPriceUsd: number;
  defaults: Record<string, unknown>;
  /** Hints for the UI. Not enforced server-side — Replicate validates input. */
  ui: {
    aspectRatios?: string[];
    durations?: number[];
    needsImage?: boolean;
  };
}

// Curated registry. Add more by appending here; `custom` lets the API accept
// any owner/name pair from the UI for one-off experiments.
export const REPLICATE_MODELS: Record<ReplicateModelKey, ReplicateModelSpec> = {
  happyhorse: {
    key: "happyhorse",
    owner: "alibaba", name: "happyhorse-1.0",
    label: "HappyHorse 1.0 (Alibaba) — T2V",
    mediaType: "video", unitPriceUsd: 0.10,
    defaults: { aspect_ratio: "16:9" },
    ui: { aspectRatios: ["16:9", "9:16", "1:1"] },
  },
  wan_t2v: {
    key: "wan_t2v",
    owner: "wan-video", name: "wan-2.5-t2v-fast",
    label: "Wan 2.5 T2V Fast — text→video",
    mediaType: "video", unitPriceUsd: 0.08,
    defaults: { duration: 5, aspect_ratio: "16:9" },
    ui: { aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  },
  wan_i2v: {
    key: "wan_i2v",
    owner: "wan-video", name: "wan-2.5-i2v-fast",
    label: "Wan 2.5 I2V Fast — image→video",
    mediaType: "video", needsImage: true, unitPriceUsd: 0.08,
    defaults: { duration: 5 },
    ui: { durations: [5, 10], needsImage: true },
  },
  kling_t2v: {
    key: "kling_t2v",
    owner: "kwaivgi", name: "kling-v2.1-master",
    label: "Kling v2.1 Master — text→video",
    mediaType: "video", unitPriceUsd: 0.28,
    defaults: { duration: 5, aspect_ratio: "16:9" },
    ui: { aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  },
  kling_i2v: {
    key: "kling_i2v",
    owner: "kwaivgi", name: "kling-v2.1",
    label: "Kling v2.1 — image→video",
    mediaType: "video", needsImage: true, unitPriceUsd: 0.28,
    defaults: { duration: 5 },
    ui: { durations: [5, 10], needsImage: true },
  },
  seedance: {
    key: "seedance",
    owner: "bytedance", name: "seedance-1-pro",
    label: "Seedance 1 Pro — text→video",
    mediaType: "video", unitPriceUsd: 0.18,
    defaults: { duration: 5, aspect_ratio: "16:9", resolution: "1080p" },
    ui: { aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  },
  veo3_fast: {
    key: "veo3_fast",
    owner: "google", name: "veo-3-fast",
    label: "Veo 3 Fast — text→video",
    mediaType: "video", unitPriceUsd: 0.05,
    defaults: { aspect_ratio: "16:9", duration: 4 },
    ui: { aspectRatios: ["16:9", "9:16"], durations: [4, 6, 8] },
  },
  veo3: {
    key: "veo3",
    owner: "google", name: "veo-3",
    label: "Veo 3 — text→video (premium)",
    mediaType: "video", unitPriceUsd: 0.50,
    defaults: { aspect_ratio: "16:9", duration: 4 },
    ui: { aspectRatios: ["16:9", "9:16"], durations: [4, 6, 8] },
  },

  // ── Image enhancement ──
  flux_dev: {
    key: "flux_dev",
    owner: "black-forest-labs", name: "flux-dev",
    label: "FLUX.1 Dev — high-fidelity image",
    mediaType: "image", unitPriceUsd: 0.03,
    defaults: { aspect_ratio: "1:1", num_outputs: 1, guidance_scale: 3.5 },
    ui: { aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
  },
  ideogram: {
    key: "ideogram",
    owner: "ideogram-ai", name: "ideogram-v3-turbo",
    label: "Ideogram v3 Turbo — text-in-image",
    mediaType: "image", unitPriceUsd: 0.03,
    defaults: { aspect_ratio: "1:1", style_type: "Auto" },
    ui: { aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
  },
  upscale_image: {
    key: "upscale_image",
    owner: "nightmareai", name: "real-esrgan",
    label: "Real-ESRGAN — image 4× upscale",
    mediaType: "image", needsImage: true, unitPriceUsd: 0.005,
    defaults: { scale: 4, face_enhance: false },
    ui: { needsImage: true },
  },
  remove_bg: {
    key: "remove_bg",
    owner: "lucataco", name: "remove-bg",
    label: "Remove background — RMBG",
    mediaType: "image", needsImage: true, unitPriceUsd: 0.003,
    defaults: {},
    ui: { needsImage: true },
  },

  // ── Video enhancement ──
  upscale_video: {
    key: "upscale_video",
    owner: "lucataco", name: "real-esrgan-video",
    label: "Real-ESRGAN Video — 4× video upscale",
    mediaType: "video", needsImage: true, unitPriceUsd: 0.20,
    defaults: { resolution: "FHD" },
    ui: { needsImage: true },
  },
  interpolate_video: {
    key: "interpolate_video",
    owner: "google-research", name: "frame-interpolation",
    label: "Frame interpolation — smooth slow-mo",
    mediaType: "video", needsImage: true, unitPriceUsd: 0.08,
    defaults: { times_to_interpolate: 3 },
    ui: { needsImage: true },
  },

  // ── Audio ──
  music_gen: {
    key: "music_gen",
    owner: "meta", name: "musicgen",
    label: "MusicGen — text→music",
    mediaType: "video",  // audio file, but treated as media (mp3/wav)
    unitPriceUsd: 0.05,
    defaults: { model_version: "stereo-large", duration: 10, output_format: "mp3" },
    ui: { durations: [5, 10, 15, 20, 30] },
  },
  voice_clone: {
    key: "voice_clone",
    owner: "lucataco", name: "xtts-v2",
    label: "XTTS v2 — voice clone / TTS",
    mediaType: "video", needsImage: true, // takes a voice sample
    unitPriceUsd: 0.02,
    defaults: { language: "en" },
    ui: { needsImage: true },
  },
  lip_sync: {
    key: "lip_sync",
    owner: "cjwbw", name: "video-retalking",
    label: "Lip-sync — video to audio",
    mediaType: "video", needsImage: true,
    unitPriceUsd: 0.30,
    defaults: {},
    ui: { needsImage: true },
  },

  // ── Transcription ──
  whisper: {
    key: "whisper",
    owner: "openai", name: "whisper",
    label: "Whisper — speech to text",
    mediaType: "image", // returns JSON, mapped to text downstream
    needsImage: true,
    unitPriceUsd: 0.006,
    defaults: { model: "large-v3", language: "auto" },
    ui: { needsImage: true },
  },
};

export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string; cancel?: string };
  model?: string;
}

const REPLICATE_API = "https://api.replicate.com/v1";

function authHeaders(env: Env): Record<string, string> {
  if (!env.REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN missing");
  return {
    "Authorization": `Bearer ${env.REPLICATE_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function createPrediction(
  env: Env,
  owner: string,
  name: string,
  input: Record<string, unknown>,
  opts?: { webhookUrl?: string; preferWaitSeconds?: number }
): Promise<ReplicatePrediction> {
  const url = `${REPLICATE_API}/models/${owner}/${name}/predictions`;
  const body: Record<string, unknown> = { input };
  if (opts?.webhookUrl) {
    body.webhook = opts.webhookUrl;
    body.webhook_events_filter = ["completed"];
  }
  const headers = authHeaders(env);
  if (opts?.preferWaitSeconds && opts.preferWaitSeconds > 0) {
    // Replicate "Prefer: wait=N" returns the prediction inline if it finishes
    // in N seconds, otherwise returns 200 with starting/processing status.
    headers["Prefer"] = `wait=${Math.min(60, opts.preferWaitSeconds)}`;
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Replicate ${owner}/${name}: ${res.status} ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as ReplicatePrediction;
}

export async function cancelPrediction(env: Env, id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${REPLICATE_API}/predictions/${id}/cancel`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.REPLICATE_API_TOKEN!}` },
  });
  return { ok: res.ok };
}

export async function getPrediction(env: Env, id: string): Promise<ReplicatePrediction> {
  const res = await fetch(`${REPLICATE_API}/predictions/${id}`, {
    headers: { "Authorization": `Bearer ${env.REPLICATE_API_TOKEN!}` },
  });
  if (!res.ok) throw new Error(`Replicate get ${id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as ReplicatePrediction;
}

export async function waitForPrediction(
  env: Env,
  id: string,
  timeoutMs: number = 110_000,
  intervalMs: number = 4_000
): Promise<ReplicatePrediction> {
  const deadline = Date.now() + timeoutMs;
  let last: ReplicatePrediction | null = null;
  while (Date.now() < deadline) {
    last = await getPrediction(env, id);
    if (last.status === "succeeded" || last.status === "failed" || last.status === "canceled") return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Replicate ${id}: still ${last?.status ?? "unknown"} after ${timeoutMs}ms`);
}

export function firstOutputUrl(p: ReplicatePrediction): string | undefined {
  if (!p.output) return undefined;
  if (typeof p.output === "string") return p.output;
  if (Array.isArray(p.output)) {
    const u = p.output.find((x) => typeof x === "string" && x);
    return typeof u === "string" ? u : undefined;
  }
  return undefined;
}

/**
 * Download the Replicate output and mirror it into our R2 bucket so the URL is
 * stable. Replicate signed delivery URLs expire after ~1 hour.
 */
export async function mirrorToR2(
  env: Env,
  userId: string,
  predictionId: string,
  sourceUrl: string,
  mediaType: "video" | "image"
): Promise<{ r2Key: string; publicUrl: string; bytes: number; mime: string }> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Replicate mirror fetch ${res.status}`);
  const mime = res.headers.get("content-type") ?? (mediaType === "video" ? "video/mp4" : "image/png");
  const ext = mime.includes("webm") ? "webm" : mediaType === "video" ? "mp4" : mime.includes("jpeg") ? "jpg" : "png";
  const r2Key = `generated/${userId}/replicate/${predictionId}.${ext}`;
  const buf = await res.arrayBuffer();
  await env.MEDIA.put(r2Key, buf, { httpMetadata: { contentType: mime } });
  return {
    r2Key,
    publicUrl: `${env.R2_PUBLIC_BASE}/${encodeURI(r2Key)}`,
    bytes: buf.byteLength,
    mime,
  };
}

/**
 * Replicate signs webhooks with HMAC-SHA256 over `${id}.${timestamp}.${body}`.
 * Headers: `webhook-id`, `webhook-timestamp`, `webhook-signature` (v1,<base64>).
 * Returns true if the signature is valid OR if no REPLICATE_WEBHOOK_SECRET is
 * configured (in which case the caller has opted out of verification).
 */
export async function verifyWebhookSignature(
  env: Env,
  rawBody: string,
  headers: { id?: string | null; timestamp?: string | null; signature?: string | null }
): Promise<boolean> {
  if (!env.REPLICATE_WEBHOOK_SECRET) return true;
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const secretB64 = env.REPLICATE_WEBHOOK_SECRET.replace(/^whsec_/, "");
  const secretBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // Multiple v1 sigs may be space-separated: "v1,<sig> v1,<sig>"
  const candidates = signature.split(/\s+/).map((s) => s.replace(/^v1,/, ""));
  return candidates.includes(expected);
}
