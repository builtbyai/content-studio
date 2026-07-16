import type { Env } from "./env";
import { db } from "./db";

// HMAC-SHA256 hex verification of Postiz webhook deliveries.
// Postiz signs the raw request body with POSTIZ_WEBHOOK_SECRET and sends
// `X-Postiz-Signature: sha256=<hex>` plus `X-Postiz-Event-Id: <uuid>` for
// idempotency. We refuse anything older than 5 minutes (replay window).

const REPLAY_WINDOW_SECONDS = 300;

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  eventId?: string;
  kind?: string;
  ts?: number;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function constantTimeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

export async function verifyWebhookSignature(
  env: Env,
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null
): Promise<VerifyResult> {
  if (!signatureHeader) return { ok: false, reason: "missing signature" };
  if (!timestampHeader) return { ok: false, reason: "missing timestamp" };

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  const drift = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (drift > REPLAY_WINDOW_SECONDS) return { ok: false, reason: `replay window exceeded (${drift}s)` };

  const sig = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.POSTIZ_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const macBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${rawBody}`))
  );
  let provided: Uint8Array;
  try {
    provided = hexToBytes(sig);
  } catch {
    return { ok: false, reason: "bad signature encoding" };
  }
  if (!constantTimeEq(macBytes, provided)) return { ok: false, reason: "signature mismatch" };
  return { ok: true, ts };
}

// Apply a verified webhook event: update schedule status, broadcast to DO subscribers.
export async function applyWebhookEvent(env: Env, event: PostizWebhookPayload): Promise<void> {
  // Postiz emits something like:
  //   { id, type: 'post.published'|'post.failed'|'post.scheduled', postId, integrationId, releaseURL?, error?, userId? }
  // userId in our schema is the local app user (not Postiz). We resolve via the
  // schedules table: schedules.postiz_post_id = event.postId.
  const sched = await env.DB.prepare(
    "SELECT * FROM schedules WHERE postiz_post_id = ?1 LIMIT 1"
  )
    .bind(event.postId)
    .first<{ id: string; user_id: string }>();

  if (!sched) return; // event for a post we don't track

  let status: string | null = null;
  let lastError: string | null = event.error ?? null;
  switch (event.type) {
    case "post.published":
      status = "published";
      break;
    case "post.failed":
      status = "failed";
      break;
    case "post.scheduled":
      status = "scheduled";
      break;
    case "post.cancelled":
      status = "cancelled";
      break;
  }
  if (status) {
    await db.updateScheduleStatus(env, sched.id, { status, last_error: lastError });
  }

  // Fan out to live subscribers (SSE) via DO keyed by user.
  const room = env.SCHEDULE_ROOM.get(env.SCHEDULE_ROOM.idFromName(sched.user_id));
  await room.fetch("https://room/broadcast", {
    method: "POST",
    body: JSON.stringify({
      scheduleId: sched.id,
      status,
      error: lastError,
      releaseURL: event.releaseURL ?? null,
      at: Math.floor(Date.now() / 1000),
    }),
  });
}

export interface PostizWebhookPayload {
  id: string;
  type: "post.published" | "post.failed" | "post.scheduled" | "post.cancelled" | string;
  postId: string;
  integrationId?: string;
  releaseURL?: string;
  error?: string;
}
