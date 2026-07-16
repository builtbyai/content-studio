// Image generation via Cloudflare Workers AI binding.
// Supports: openai/gpt-image-2 (default, no transparency)
//           openai/gpt-image-1.5 (transparent PNGs)
//
// Cloudflare hosts these models directly; auth is BYOK via AI Gateway
// (configured once in the dashboard — see docs/DEPLOY.md §"AI Gateway BYOK").
//
// Cost is metered by Cloudflare and surfaces in AI Gateway analytics.

import type { Env } from "./env";

export type ImageModel = "openai/gpt-image-2" | "openai/gpt-image-1.5";
export type ImageQuality = "low" | "medium" | "high" | "auto";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
export type ImageBackground = "transparent" | "opaque" | "auto";
export type ImageFormat = "png" | "webp" | "jpeg";

export interface ImageGenerateInput {
  prompt: string;
  quality?: ImageQuality;
  size?: ImageSize;
  output_format?: ImageFormat;
  background?: ImageBackground;
  /** Up to 16 base64 strings (raw or data: URIs). Routes to /images/edits. */
  images?: string[];
  /** Override model. Defaults: transparent→gpt-image-1.5, else gpt-image-2. */
  model?: ImageModel;
}

export interface ImageGenerateResult {
  url: string;              // Original CF-hosted result URL
  r2Key: string;            // Where we stashed a copy
  publicUrl: string;        // Our R2 public URL (stable, never expires)
  model: ImageModel;
  bytes: number;
}

function pickModel(input: ImageGenerateInput): ImageModel {
  if (input.model) return input.model;
  if (input.background === "transparent") return "openai/gpt-image-1.5";
  return "openai/gpt-image-2";
}

export async function generateImage(env: Env, userId: string, input: ImageGenerateInput): Promise<ImageGenerateResult> {
  if (!env.AI) throw new Error("env.AI binding missing — add [ai] to wrangler.toml");
  if (!input.prompt?.trim()) throw new Error("prompt is required");

  const model = pickModel(input);
  const payload: Record<string, unknown> = { prompt: input.prompt };
  if (input.quality) payload.quality = input.quality;
  if (input.size) payload.size = input.size;
  if (input.output_format) payload.output_format = input.output_format;
  if (input.background) payload.background = input.background;
  if (input.images && input.images.length > 0) payload.images = input.images.slice(0, 16);

  const response = (await env.AI.run(model as any, payload as any, {
    gateway: { id: env.AI_GATEWAY_SLUG || "default" },
  } as any)) as { image?: string; result?: { image?: string } };

  // Different runtime shapes — normalize.
  const imageUrl = response.image ?? response.result?.image;
  if (!imageUrl) throw new Error(`AI returned no image URL: ${JSON.stringify(response).slice(0, 200)}`);

  // Mirror to R2 so the link is stable (CF preview URLs are short-lived).
  const ext = (input.output_format ?? "png").toLowerCase();
  const stamp = Date.now().toString(36);
  const r2Key = `generated/${userId}/${stamp}-${model.replace("/", "_")}.${ext}`;

  const fetched = await fetch(imageUrl);
  if (!fetched.ok || !fetched.body) {
    throw new Error(`Failed to fetch generated image: ${fetched.status}`);
  }
  const mime = fetched.headers.get("content-type") ?? `image/${ext}`;
  const cl = fetched.headers.get("content-length");
  await env.MEDIA.put(r2Key, fetched.body, { httpMetadata: { contentType: mime } });
  let bytes = cl ? Number(cl) : 0;
  if (!bytes) {
    const head = await env.MEDIA.head(r2Key);
    bytes = head?.size ?? 0;
  }

  return {
    url: imageUrl,
    r2Key,
    publicUrl: `${env.R2_PUBLIC_BASE}/${encodeURI(r2Key)}`,
    model,
    bytes,
  };
}
