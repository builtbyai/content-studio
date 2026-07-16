import { AwsClient } from "aws4fetch";
import type { Env } from "./env";

// R2 helpers. Two modes:
//   1. Server-side put/get via the R2 binding (env.MEDIA) — used by the queue
//      consumer when piping Veo/Gemini outputs into R2 immediately on generation
//      (those source URLs expire fast — see ADR Temporal-warning #24mo).
//   2. Presigned S3 PUT URLs for browser-direct uploads, so user-uploaded
//      images/videos never round-trip through the Worker.

function s3Client(env: Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: "auto",
    service: "s3",
  });
}

function r2Endpoint(env: Env, key: string): string {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${encodeURI(key)}`;
}

export function publicUrl(env: Env, key: string): string {
  return `${env.R2_PUBLIC_BASE}/${encodeURI(key)}`;
}

// Mint a presigned URL the browser can PUT directly to. 15-min expiry.
export async function presignPut(
  env: Env,
  key: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<string> {
  const client = s3Client(env);
  const url = new URL(r2Endpoint(env, key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await client.sign(
    new Request(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": contentType },
    }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

// Fetch a remote URL and stream it into R2. Used by the ingest_media queue job
// to pull Veo/Gemini outputs into stable storage before their signed URLs expire.
export async function ingestRemoteIntoR2(
  env: Env,
  sourceUrl: string,
  key: string
): Promise<{ bytes: number; mime: string }> {
  const res = await fetch(sourceUrl);
  if (!res.ok || !res.body) {
    throw new Error(`ingest: source returned ${res.status} for ${sourceUrl}`);
  }
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  const cl = res.headers.get("content-length");
  const bytes = cl ? Number(cl) : 0;
  await env.MEDIA.put(key, res.body, {
    httpMetadata: { contentType: mime },
  });
  // If content-length missing, do one HEAD afterward to record size.
  if (!bytes) {
    const head = await env.MEDIA.head(key);
    return { bytes: head?.size ?? 0, mime };
  }
  return { bytes, mime };
}

export function r2KeyFor(userId: string, kind: "raw" | "published", filename: string): string {
  const stamp = Date.now().toString(36);
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${kind}/${userId}/${stamp}-${safe}`;
}
