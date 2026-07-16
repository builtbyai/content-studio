import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, HonoEnv, PublishJob } from "./env";
import { db } from "./db";
import {
  clearSessionCookie,
  loadUser,
  requireUser,
  setSessionCookie,
  verifyPassword,
} from "./auth";
import { generateCampaign, generateWorkflow } from "./gemini";
import { postiz } from "./postiz";
import { presignPut, publicUrl, r2KeyFor } from "./r2";
import { generateImage, type ImageGenerateInput } from "./images";
import { chatComplete, type ChatCompletionInput } from "./chat";
import {
  REPLICATE_MODELS,
  createPrediction as replicateCreate,
  getPrediction as replicateGet,
  cancelPrediction as replicateCancel,
  waitForPrediction as replicateWait,
  firstOutputUrl as replicateOutput,
  mirrorToR2 as replicateMirror,
  verifyWebhookSignature as replicateVerifySig,
  type ReplicateModelKey,
} from "./replicate";
import {
  createJob as createGenJob,
  getJob as getGenJob,
  getJobByPrediction,
  listJobs as listGenJobs,
  updateJob as updateGenJob,
  type JobSourceKind,
} from "./jobs";
import { PLANNER_MODELS, planScenes, type PlannerModelId } from "./planner";
import { applyWebhookEvent, verifyWebhookSignature } from "./webhooks";
import { runReconciliation } from "./cron";
import { handleQueueBatch } from "./queue";
import { workflowsRoutes } from "./routes/workflows";
import { salesRoutes } from "./routes/sales";
import { researchRoutes } from "./routes/research";
import { brollRoutes } from "./routes/broll";
import { articlesDb, battlecardsDb, sourcesDb, runContentIngest, runRelevanceScrub, runIntelTagger } from "./content";

export { ScheduleRoom } from "./do";

const app = new Hono<HonoEnv>();

// CORS only matters when the SPA isn't same-origin (i.e. when someone calls
// api.example.com directly). Same-origin /api/* calls don't preflight.
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = [c.env.APP_ORIGIN, "http://localhost:5173"];
      return allowed.includes(origin) ? origin : "";
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["content-type", "x-requested-with"],
  })
);

app.use("*", loadUser);

// ---------- R2 public proxy ----------
// Serves anything in the MEDIA bucket as a stable public URL via the app's
// own hostname — no need for a separate media.* DNS record. Bypasses the
// loadUser middleware so generated images can be referenced from social
// platforms (Postiz, Twitter, etc) without auth.
app.get("/api/r2/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/r2\//, "");
  if (!key) return c.text("missing key", 400);
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.text("not found", 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  // Cache aggressively at the edge — generated content keys are unique per upload.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});

// ---------- Health ----------
app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    hasGeminiKey: !!c.env.GEMINI_API_KEY,
    hasPostizKey: !!c.env.POSTIZ_API_KEY,
    user: c.var.user?.email ?? null,
    time: new Date().toISOString(),
  })
);

// ---------- Setup status (drives the "What's configured?" panel) ----------
app.get("/api/setup/status", requireUser, async (c) => {
  // Quick green/red signal per dependency. Latency-sensitive — keep checks bounded.
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  checks.gemini = { ok: !!c.env.GEMINI_API_KEY };
  checks.openai = { ok: !!c.env.OPENAI_API_KEY };
  checks.runway = { ok: !!c.env.RUNWAY_API_KEY };
  checks.replicate = { ok: !!c.env.REPLICATE_API_TOKEN, detail: c.env.REPLICATE_API_TOKEN ? "video provider configured" : "set REPLICATE_API_TOKEN to enable Video Lab" };
  checks.session_secret = { ok: !!c.env.SESSION_COOKIE_SECRET };
  // R2 S3-API token is OPTIONAL — only needed for browser-direct presigned uploads.
  // Worker-proxied /api/media/upload works without it.
  checks.r2_access = {
    ok: true,
    detail: c.env.R2_ACCESS_KEY_ID
      ? "presigned uploads enabled"
      : "optional — using Worker-proxied uploads",
  };
  checks.postiz_secret = { ok: !!c.env.POSTIZ_API_KEY };
  checks.postiz_webhook_secret = { ok: !!c.env.POSTIZ_WEBHOOK_SECRET };
  // CF Access service-token is optional; mark green if either both set OR neither (= unused).
  checks.cf_access = {
    ok: !c.env.CF_ACCESS_CLIENT_ID || !!c.env.CF_ACCESS_CLIENT_SECRET,
    detail: c.env.CF_ACCESS_CLIENT_ID ? undefined : "optional — public Postiz hostname doesn't need it",
  };

  // Live ping: Postiz reachability (3s budget).
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${c.env.POSTIZ_API_BASE}/public/v1/integrations`, {
      // POSTIZ_API_BASE already includes the /api prefix for self-hosted.
      headers: {
        Authorization: c.env.POSTIZ_API_KEY ?? "",
        "CF-Access-Client-Id": c.env.CF_ACCESS_CLIENT_ID ?? "",
        "CF-Access-Client-Secret": c.env.CF_ACCESS_CLIENT_SECRET ?? "",
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    checks.postiz_reachable = { ok: r.ok, detail: `HTTP ${r.status}` };
  } catch (e: any) {
    checks.postiz_reachable = { ok: false, detail: e?.message ?? "unreachable" };
  }

  // Live ping: AI Gateway (via Workers AI binding doing a tiny chat)
  if (c.env.AI) {
    try {
      const r = await c.env.AI.run("openai/gpt-4o-mini" as any, {
        messages: [{ role: "user", content: "ping" }], max_tokens: 1,
      } as any, { gateway: { id: c.env.AI_GATEWAY_SLUG || "default" }} as any) as any;
      const text = r?.choices?.[0]?.message?.content ?? r?.response ?? "";
      checks.ai_gateway = { ok: !!text || !!r, detail: "ok" };
    } catch (e: any) {
      checks.ai_gateway = { ok: false, detail: e?.message ?? "ai gateway error" };
    }
  } else {
    checks.ai_gateway = { ok: false, detail: "AI binding missing" };
  }

  // D1: trivial select.
  try {
    await c.env.DB.prepare("SELECT 1").first();
    checks.d1 = { ok: true };
  } catch (e: any) {
    checks.d1 = { ok: false, detail: e?.message ?? "d1 error" };
  }

  // R2: head a known-non-existent key just to confirm binding works.
  try {
    await c.env.MEDIA.head("__health_probe");
    checks.r2 = { ok: true };
  } catch (e: any) {
    checks.r2 = { ok: false, detail: e?.message ?? "r2 error" };
  }

  return c.json({
    checks,
    user: c.var.user,
    app: { origin: c.env.APP_ORIGIN, r2PublicBase: c.env.R2_PUBLIC_BASE, geminiModel: c.env.GEMINI_MODEL },
  });
});

// ---------- Auth ----------
app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: "missing credentials" }, 400);

  const user = await db.userByEmail(c.env, email);
  if (!user) return c.json({ error: "invalid credentials" }, 401);
  const ok = await verifyPassword(password, user.salt, user.password_hash);
  if (!ok) return c.json({ error: "invalid credentials" }, 401);

  const ttl = Number(c.env.SESSION_TTL_HOURS || "168") * 3600;
  const sid = await db.createSession(c.env, user.id, ttl);
  setSessionCookie(c, sid);
  return c.json({ user: { id: user.id, email: user.email, role: user.role } });
});

app.post("/api/auth/logout", async (c) => {
  if (c.var.sessionId) await db.deleteSession(c.env, c.var.sessionId);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get("/api/auth/me", (c) => {
  if (!c.var.user) return c.json({ user: null });
  return c.json({ user: c.var.user });
});

// ---------- Gemini (ported from server.ts) ----------
app.post("/api/generate-workflow", requireUser, async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.brief) return c.json({ error: "Missing required parameter: brief is necessary." }, 400);
    const out = await generateWorkflow(c.env, body);
    return c.json(out);
  } catch (err: any) {
    return c.json({ error: "generation_failed", message: err?.message ?? String(err) }, 500);
  }
});

app.post("/api/generate-campaign", requireUser, async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.article || !body?.platform || !body?.angle) {
      return c.json({ error: "Missing required parameters: article, platform, angle" }, 400);
    }
    const out = await generateCampaign(c.env, body);
    return c.json(out);
  } catch (err: any) {
    return c.json({ error: "generation_failed", message: err?.message ?? String(err) }, 500);
  }
});

// ---------- Media / R2 ----------
// Worker-proxied upload — no presigned URL needed (no R2 API token required).
// Use this when the browser uploads small/medium files (<100MB). Larger files
// should still presign-and-direct-upload via /api/media/upload-url, but that
// path requires R2_ACCESS_KEY_ID/SECRET to be set.
app.post("/api/media/upload", requireUser, async (c) => {
  const userId = c.var.user!.id;
  const ct = c.req.header("content-type") ?? "";

  let filename = "upload.bin";
  let contentType = "application/octet-stream";
  let body: ReadableStream<Uint8Array> | ArrayBuffer | null = null;
  let bytes = 0;

  if (ct.startsWith("multipart/form-data")) {
    const form = await c.req.formData();
    const fileEntry = form.get("file") as any;
    if (!fileEntry || typeof fileEntry === "string" || typeof fileEntry.arrayBuffer !== "function") {
      return c.json({ error: "missing file field" }, 400);
    }
    filename = fileEntry.name || filename;
    contentType = fileEntry.type || contentType;
    bytes = fileEntry.size ?? 0;
    body = await fileEntry.arrayBuffer();
  } else {
    // Raw body upload: filename + mime in query params or X-Filename / X-Mime headers.
    filename = c.req.query("filename") ?? c.req.header("x-filename") ?? filename;
    contentType = c.req.query("contentType") ?? c.req.header("x-mime") ?? ct ?? contentType;
    const buf = await c.req.arrayBuffer();
    bytes = buf.byteLength;
    body = buf;
  }

  const key = r2KeyFor(userId, "raw", filename);
  await c.env.MEDIA.put(key, body, { httpMetadata: { contentType } });

  const id = crypto.randomUUID();
  await db.insertMedia(c.env, {
    id,
    user_id: userId,
    r2_key: key,
    mime: contentType,
    bytes,
    source: "upload",
    original_url: null,
    public_url: publicUrl(c.env, key),
  });

  return c.json({ id, r2Key: key, publicUrl: publicUrl(c.env, key), bytes, contentType });
});

app.post("/api/media/upload-url", requireUser, async (c) => {
  const { filename, contentType } = await c.req.json<{ filename: string; contentType: string }>();
  if (!filename || !contentType) return c.json({ error: "filename and contentType required" }, 400);
  const key = r2KeyFor(c.var.user!.id, "raw", filename);
  const url = await presignPut(c.env, key, contentType);

  const id = crypto.randomUUID();
  await db.insertMedia(c.env, {
    id,
    user_id: c.var.user!.id,
    r2_key: key,
    mime: contentType,
    bytes: 0,
    source: "upload",
    original_url: null,
    public_url: publicUrl(c.env, key),
  });

  return c.json({ id, uploadUrl: url, publicUrl: publicUrl(c.env, key), r2Key: key });
});

app.post("/api/media/from-url", requireUser, async (c) => {
  const { sourceUrl, filename, source = "external" } = await c.req.json<{
    sourceUrl: string;
    filename: string;
    source?: string;
  }>();
  if (!sourceUrl || !filename) return c.json({ error: "sourceUrl and filename required" }, 400);

  const key = r2KeyFor(c.var.user!.id, "raw", filename);
  const id = crypto.randomUUID();
  await db.insertMedia(c.env, {
    id,
    user_id: c.var.user!.id,
    r2_key: key,
    mime: "application/octet-stream",
    bytes: 0,
    source,
    original_url: sourceUrl,
    public_url: publicUrl(c.env, key),
  });

  await c.env.PUBLISH_QUEUE.send({
    kind: "ingest_media",
    mediaId: id,
    userId: c.var.user!.id,
    sourceUrl,
  } satisfies PublishJob);

  return c.json({ id, publicUrl: publicUrl(c.env, key), status: "ingesting" });
});

app.get("/api/media", requireUser, async (c) => {
  const rows = await db.listMedia(c.env, c.var.user!.id, 200);
  return c.json({ media: rows });
});

app.delete("/api/media/:id", requireUser, async (c) => {
  const id = c.req.param("id")!;
  const row = await db.deleteMedia(c.env, c.var.user!.id, id);
  if (!row) return c.json({ error: "not found" }, 404);
  // Best-effort R2 delete; if it fails the row is already gone — orphan is acceptable.
  try {
    await c.env.MEDIA.delete(row.r2_key);
  } catch {}
  return c.json({ ok: true });
});

// ---------- Chat completions (Workers AI → AI Gateway → provider) ----------
app.post("/api/chat", requireUser, async (c) => {
  try {
    const body = await c.req.json<ChatCompletionInput>();
    const result = await chatComplete(c.env, body);
    return c.json({ model: result.model, content: result.content });
  } catch (err: any) {
    return c.json({ error: "chat_failed", message: err?.message ?? String(err) }, 500);
  }
});

// ---------- Image generation (Workers AI → R2) ----------
app.post("/api/images/generate", requireUser, async (c) => {
  try {
    const body = await c.req.json<ImageGenerateInput>();
    const result = await generateImage(c.env, c.var.user!.id, body);

    // Record in media table so it shows up in Media Library + can be attached to drafts.
    const mediaId = crypto.randomUUID();
    await db.insertMedia(c.env, {
      id: mediaId,
      user_id: c.var.user!.id,
      r2_key: result.r2Key,
      mime: `image/${(body.output_format ?? "png").toLowerCase()}`,
      bytes: result.bytes,
      source: result.model.replace("openai/", ""),  // 'gpt-image-2' | 'gpt-image-1.5'
      original_url: result.url,
      public_url: result.publicUrl,
    });

    return c.json({
      id: mediaId,
      model: result.model,
      publicUrl: result.publicUrl,
      r2Key: result.r2Key,
      bytes: result.bytes,
    });
  } catch (err: any) {
    return c.json({ error: "image_gen_failed", message: err?.message ?? String(err) }, 500);
  }
});

// ---------- Video generation (Replicate → R2) ----------
// Lists the curated model registry the Video Lab UI renders.
app.get("/api/video/models", requireUser, (c) => {
  const models = Object.values(REPLICATE_MODELS).map((m) => ({
    key: m.key,
    owner: m.owner,
    name: m.name,
    label: m.label,
    mediaType: m.mediaType,
    needsImage: !!m.needsImage,
    unitPriceUsd: m.unitPriceUsd,
    ui: m.ui,
    defaults: m.defaults,
  }));
  return c.json({ models, hasToken: !!c.env.REPLICATE_API_TOKEN });
});

interface VideoGenerateInput {
  modelKey?: ReplicateModelKey;
  customOwner?: string;
  customName?: string;
  prompt: string;
  promptImage?: string;          // start frame (intro)
  promptImageOut?: string;       // end frame (outro)
  aspectRatio?: string;
  duration?: number;
  seed?: number;
  resolution?: string;
  negativePrompt?: string;
  // Free-form extra Replicate input params — passed through as-is.
  extra?: Record<string, unknown>;
  // If true, return immediately with the prediction id and do not poll.
  async?: boolean;
}

app.post("/api/video/generate", requireUser, async (c) => {
  if (!c.env.REPLICATE_API_TOKEN) {
    return c.json({ error: "replicate_not_configured", message: "REPLICATE_API_TOKEN is not set on the worker." }, 503);
  }
  try {
    const body = await c.req.json<VideoGenerateInput>();
    if (!body.prompt?.trim() && !body.promptImage) {
      return c.json({ error: "missing_prompt" }, 400);
    }

    // Resolve target model: registry preset OR custom owner/name pair.
    let owner: string;
    let name: string;
    let preset = body.modelKey ? REPLICATE_MODELS[body.modelKey] : undefined;
    if (preset) {
      owner = preset.owner;
      name = preset.name;
    } else if (body.customOwner && body.customName) {
      owner = body.customOwner.trim();
      name = body.customName.trim();
    } else {
      return c.json({ error: "missing_model", message: "Provide modelKey or customOwner+customName." }, 400);
    }

    const input: Record<string, unknown> = {
      ...(preset?.defaults ?? {}),
      prompt: body.prompt,
    };
    if (body.aspectRatio) input.aspect_ratio = body.aspectRatio;
    if (typeof body.duration === "number") input.duration = body.duration;
    if (typeof body.seed === "number") input.seed = body.seed;
    if (body.resolution) input.resolution = body.resolution;
    if (body.negativePrompt) input.negative_prompt = body.negativePrompt;
    if (body.promptImage) {
      input.image = body.promptImage;
      input.start_image = body.promptImage;
      input.input_image = body.promptImage;
      input.first_frame_image = body.promptImage;
    }
    if (body.promptImageOut) {
      // Different Replicate models use different field names for the end
      // frame target. Set the common ones — extras are ignored by the schema.
      input.end_image = body.promptImageOut;
      input.last_frame_image = body.promptImageOut;
      input.end_frame_image = body.promptImageOut;
    }
    if (body.extra) Object.assign(input, body.extra);

    // Create a tracking job row so the global Jobs widget + batch / scene
    // composer flows can follow this generation. We attach the prediction id
    // once Replicate hands it back. Source/batch/scene metadata flows in via
    // optional fields on the body so the same endpoint serves direct Lab
    // requests, batched fan-outs, and Scene Composer chains.
    const extra = (body as any) as {
      batchId?: string; sceneId?: string; compositionId?: string; sourceKind?: JobSourceKind;
    };
    const job = await createGenJob(c.env, {
      userId: c.var.user!.id,
      kind: preset?.mediaType === "image" ? "image" : "video",
      provider: "replicate",
      model: `replicate/${owner}/${name}`,
      prompt: body.prompt,
      params: input,
      batchId: extra.batchId,
      sceneId: extra.sceneId,
      compositionId: extra.compositionId,
      sourceKind: extra.sourceKind ?? "video_lab",
      initialStatus: "queued",
    });

    const webhookUrl = `${c.env.APP_ORIGIN}/api/webhooks/replicate?u=${encodeURIComponent(c.var.user!.id)}&job=${job.id}`;
    let prediction;
    try {
      prediction = await replicateCreate(c.env, owner, name, input, {
        preferWaitSeconds: body.async ? 0 : 55,
        webhookUrl,
      });
    } catch (err: any) {
      await updateGenJob(c.env, job.id, { status: "failed", error: err?.message ?? String(err) });
      throw err;
    }

    await updateGenJob(c.env, job.id, {
      status: prediction.status === "succeeded" ? "succeeded" : "processing",
      predictionId: prediction.id,
    });

    // Async path: return job id + prediction id, let the client poll
    // /predictions/:id or wait for the webhook/SSE to land.
    if (body.async) {
      return c.json({
        async: true,
        jobId: job.id,
        predictionId: prediction.id,
        status: prediction.status,
        model: `${owner}/${name}`,
      });
    }

    // Sync path: poll inline up to ~110s.
    const finished =
      prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled"
        ? prediction
        : await replicateWait(c.env, prediction.id, 110_000, 4_000);

    if (finished.status !== "succeeded") {
      await updateGenJob(c.env, job.id, { status: finished.status === "canceled" ? "canceled" : "failed", error: finished.error ?? finished.status });
      return c.json({
        error: "replicate_failed",
        status: finished.status,
        message: finished.error ?? finished.status,
        predictionId: finished.id,
        jobId: job.id,
      }, 502);
    }

    const outUrl = replicateOutput(finished);
    if (!outUrl) {
      await updateGenJob(c.env, job.id, { status: "failed", error: "no output url" });
      return c.json({ error: "no_output", predictionId: finished.id, jobId: job.id }, 502);
    }

    const mediaType = preset?.mediaType ?? "video";
    const mirror = await replicateMirror(c.env, c.var.user!.id, finished.id, outUrl, mediaType);

    const row = await db.insertOrGetMedia(c.env, {
      id: crypto.randomUUID(),
      user_id: c.var.user!.id,
      r2_key: mirror.r2Key,
      mime: mirror.mime,
      bytes: mirror.bytes,
      source: `replicate/${owner}/${name}`,
      original_url: outUrl,
      public_url: mirror.publicUrl,
    });

    await updateGenJob(c.env, job.id, {
      status: "succeeded",
      outputUrl: mirror.publicUrl,
      mediaId: row.id,
    });

    return c.json({
      id: row.id,
      jobId: job.id,
      predictionId: finished.id,
      model: `${owner}/${name}`,
      mediaType,
      publicUrl: mirror.publicUrl,
      r2Key: mirror.r2Key,
      bytes: mirror.bytes,
      mime: mirror.mime,
    });
  } catch (err: any) {
    return c.json({ error: "video_gen_failed", message: err?.message ?? String(err) }, 500);
  }
});

// Status poll for async predictions. Returns the raw Replicate prediction
// (status/output/error). When the prediction has succeeded for the first time
// and isn't already mirrored, persist it to media + R2.
app.get("/api/video/predictions/:id", requireUser, async (c) => {
  if (!c.env.REPLICATE_API_TOKEN) return c.json({ error: "replicate_not_configured" }, 503);
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing_id" }, 400);
  try {
    const p = await replicateGet(c.env, id);
    let media: { id: string; publicUrl: string } | undefined;
    if (p.status === "succeeded") {
      const outUrl = replicateOutput(p);
      if (outUrl) {
        const mediaType = outUrl.includes(".mp4") || outUrl.includes(".webm") ? "video" : "image";
        const mirror = await replicateMirror(c.env, c.var.user!.id, p.id, outUrl, mediaType);
        const row = await db.insertOrGetMedia(c.env, {
          id: crypto.randomUUID(),
          user_id: c.var.user!.id,
          r2_key: mirror.r2Key,
          mime: mirror.mime,
          bytes: mirror.bytes,
          source: `replicate/${(p.model ?? "unknown").replace(/\/$/, "")}`,
          original_url: outUrl,
          public_url: mirror.publicUrl,
        });
        media = { id: row.id, publicUrl: row.public_url };
        // Update the matching job (if any) so the widget gets the green tick.
        const job = await getJobByPrediction(c.env, p.id);
        if (job && job.user_id === c.var.user!.id && job.status !== "succeeded") {
          await updateGenJob(c.env, job.id, {
            status: "succeeded",
            outputUrl: row.public_url,
            mediaId: row.id,
          });
        }
      }
    } else if (p.status === "failed" || p.status === "canceled") {
      const job = await getJobByPrediction(c.env, p.id);
      if (job && job.user_id === c.var.user!.id && job.status !== p.status) {
        await updateGenJob(c.env, job.id, { status: p.status, error: p.error ?? null ?? undefined });
      }
    }
    return c.json({
      id: p.id,
      status: p.status,
      output: p.output ?? null,
      error: p.error ?? null,
      media: media ?? null,
    });
  } catch (err: any) {
    return c.json({ error: "replicate_get_failed", message: err?.message ?? String(err) }, 500);
  }
});

// Replicate webhook — finalizes async predictions when "Prefer: wait" timed out.
// HMAC verification is optional and only enforced when REPLICATE_WEBHOOK_SECRET
// is set. The path takes ?u=<userId> so the handler can attribute the asset.
app.post("/api/webhooks/replicate", async (c) => {
  const rawBody = await c.req.text();
  const ok = await replicateVerifySig(c.env, rawBody, {
    id: c.req.header("webhook-id"),
    timestamp: c.req.header("webhook-timestamp"),
    signature: c.req.header("webhook-signature"),
  });
  if (!ok) return c.json({ error: "bad_signature" }, 401);

  let body: any;
  try { body = JSON.parse(rawBody); } catch { return c.json({ error: "bad_json" }, 400); }
  const userId = c.req.query("u");
  const jobIdHint = c.req.query("job");
  if (!userId) return c.json({ error: "missing_user" }, 400);

  // Always reflect terminal state onto the matching job row.
  if (body.status === "failed" || body.status === "canceled") {
    const job = jobIdHint
      ? await getGenJob(c.env, jobIdHint)
      : await getJobByPrediction(c.env, body.id);
    if (job && job.user_id === userId) {
      await updateGenJob(c.env, job.id, { status: body.status, error: body.error ?? body.status });
    }
    return c.json({ ok: true, status: body.status });
  }
  if (body.status !== "succeeded") return c.json({ ok: true, status: body.status });

  const outUrl = typeof body.output === "string"
    ? body.output
    : Array.isArray(body.output) ? body.output.find((x: any) => typeof x === "string") : undefined;
  if (!outUrl) return c.json({ ok: true, note: "no_output" });

  const mediaType = outUrl.includes(".mp4") || outUrl.includes(".webm") ? "video" : "image";
  const mirror = await replicateMirror(c.env, userId, body.id, outUrl, mediaType);
  const row = await db.insertOrGetMedia(c.env, {
    id: crypto.randomUUID(),
    user_id: userId,
    r2_key: mirror.r2Key,
    mime: mirror.mime,
    bytes: mirror.bytes,
    source: `replicate/${body.model ?? "unknown"}`,
    original_url: outUrl,
    public_url: mirror.publicUrl,
  });

  // Advance the matching job row so the UI gets the green tick over SSE.
  const job = jobIdHint
    ? await getGenJob(c.env, jobIdHint)
    : await getJobByPrediction(c.env, body.id);
  if (job && job.user_id === userId && job.status !== "succeeded") {
    await updateGenJob(c.env, job.id, {
      status: "succeeded",
      outputUrl: mirror.publicUrl,
      mediaId: row.id,
    });
  }
  return c.json({ ok: true, mediaId: row.id, jobId: job?.id ?? null });
});

// ---------- Jobs ledger (background generations across the app) ----------
// Spend rollup — sums per-model estimated price × succeeded count per scope.
// Note: estimated until we capture actual `metrics.predict_time` from Replicate.
// Replicate predictions include `metrics.predict_time` (GPU seconds) once
// they finish; a follow-up migration will persist that on the job row for
// exact billing.
app.get("/api/spend", requireUser, async (c) => {
  const userId = c.var.user!.id;
  const now = Math.floor(Date.now() / 1000);
  const todayStart = Math.floor(new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000);
  const monthStart = Math.floor(new Date(new Date().setDate(1)).setHours(0, 0, 0, 0) / 1000);

  // Estimated price per model — kept inline so we can iterate quickly.
  const PRICE: Record<string, number> = {
    "replicate/alibaba/happyhorse-1.0": 0.10,
    "replicate/wan-video/wan-2.5-t2v-fast": 0.08,
    "replicate/wan-video/wan-2.5-i2v-fast": 0.08,
    "replicate/kwaivgi/kling-v2.1-master": 0.28,
    "replicate/kwaivgi/kling-v2.1": 0.28,
    "replicate/bytedance/seedance-1-pro": 0.18,
    "replicate/google/veo-3-fast": 0.05,
    "replicate/google/veo-3": 0.50,
    "replicate/black-forest-labs/flux-dev": 0.03,
    "replicate/ideogram-ai/ideogram-v3-turbo": 0.03,
    "replicate/nightmareai/real-esrgan": 0.005,
    "replicate/lucataco/real-esrgan-video": 0.20,
    "replicate/google-research/frame-interpolation": 0.08,
    "replicate/lucataco/remove-bg": 0.003,
    "replicate/meta/musicgen": 0.05,
    "replicate/lucataco/xtts-v2": 0.02,
    "replicate/cjwbw/video-retalking": 0.30,
    "replicate/openai/whisper": 0.006,
    // Workers AI
    "openai/gpt-image-2": 0.025,
    "openai/gpt-image-1.5": 0.025,
    "@cf/black-forest-labs/flux-1-schnell": 0.0011,
  };

  const rs = await c.env.DB.prepare(
    `SELECT model, status, COUNT(*) as cnt
     FROM generation_jobs
     WHERE user_id = ?1
     GROUP BY model, status`
  ).bind(userId).all<{ model: string; status: string; cnt: number }>();

  // Three windowed selects for today / month / total.
  async function aggregate(sinceTs: number) {
    const rows = await c.env.DB.prepare(
      `SELECT model, COUNT(*) as cnt FROM generation_jobs
       WHERE user_id = ?1 AND status = 'succeeded' AND finished_at >= ?2
       GROUP BY model`
    ).bind(userId, sinceTs).all<{ model: string; cnt: number }>();
    let total = 0;
    const byModel: Record<string, { count: number; cost: number; rate: number }> = {};
    for (const r of rows.results ?? []) {
      const rate = PRICE[r.model] ?? 0.02; // generic fallback
      const cost = rate * r.cnt;
      total += cost;
      byModel[r.model] = { count: r.cnt, cost, rate };
    }
    return { total, byModel };
  }

  const [today, month, allTime] = await Promise.all([
    aggregate(todayStart),
    aggregate(monthStart),
    aggregate(0),
  ]);

  // Inflight aggregation — running + queued jobs.
  const inflight = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM generation_jobs WHERE user_id = ?1 AND status IN ('queued','processing')"
  ).bind(userId).first<{ cnt: number }>();

  return c.json({
    asOf: now,
    notice: "Estimated cost — based on published Replicate per-job rates. Actual cost reconciles via Replicate billing.",
    inflight: inflight?.cnt ?? 0,
    today,
    month,
    allTime,
  });
});

app.get("/api/jobs", requireUser, async (c) => {
  const status = c.req.query("status");
  const since = Number(c.req.query("since") ?? "0");
  const limit = Math.max(1, Math.min(500, Number(c.req.query("limit") ?? "100")));
  const filter = status
    ? status.split(",").map((s) => s.trim()).filter(Boolean) as any[]
    : undefined;
  const jobs = await listGenJobs(c.env, c.var.user!.id, {
    status: filter, sinceUnix: since > 0 ? since : undefined, limit,
    batchId: c.req.query("batchId") ?? undefined,
    sceneId: c.req.query("sceneId") ?? undefined,
    compositionId: c.req.query("compositionId") ?? undefined,
  });
  return c.json({ jobs });
});

app.get("/api/jobs/:id", requireUser, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing_id" }, 400);
  const job = await getGenJob(c.env, id);
  if (!job || job.user_id !== c.var.user!.id) return c.json({ error: "not_found" }, 404);
  return c.json({ job });
});

// Cancel a job. If it has a Replicate prediction id, call Replicate's cancel
// endpoint too. Idempotent — calling again on a terminal job is a no-op.
app.post("/api/jobs/:id/cancel", requireUser, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing_id" }, 400);
  const job = await getGenJob(c.env, id);
  if (!job || job.user_id !== c.var.user!.id) return c.json({ error: "not_found" }, 404);
  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
    return c.json({ ok: true, alreadyTerminal: true, job });
  }
  if (job.prediction_id && c.env.REPLICATE_API_TOKEN) {
    try { await replicateCancel(c.env, job.prediction_id); } catch {}
  }
  const updated = await updateGenJob(c.env, id, { status: "canceled" });
  return c.json({ ok: true, job: updated });
});

// Generic Replicate generation endpoint. Handles upscale, bg-remove, music
// gen, lip-sync — anything in REPLICATE_MODELS that isn't a primary video model.
// Always async; result lands in media + job ledger.
app.post("/api/replicate/generate", requireUser, async (c) => {
  if (!c.env.REPLICATE_API_TOKEN) return c.json({ error: "replicate_not_configured" }, 503);
  try {
    const body = await c.req.json<{
      modelKey?: ReplicateModelKey;
      customOwner?: string; customName?: string;
      input: Record<string, unknown>;
      prompt?: string;
      sourceKind?: JobSourceKind;
      batchId?: string;
      compositionId?: string;
    }>();

    let owner: string, name: string;
    let preset = body.modelKey ? REPLICATE_MODELS[body.modelKey] : undefined;
    if (preset) {
      owner = preset.owner; name = preset.name;
    } else if (body.customOwner && body.customName) {
      owner = body.customOwner.trim(); name = body.customName.trim();
    } else {
      return c.json({ error: "missing_model" }, 400);
    }

    const merged = { ...(preset?.defaults ?? {}), ...(body.input ?? {}) };

    const job = await createGenJob(c.env, {
      userId: c.var.user!.id,
      kind: (preset?.mediaType === "image" ? "image" : "video"),
      provider: "replicate",
      model: `replicate/${owner}/${name}`,
      prompt: body.prompt ?? JSON.stringify(body.input).slice(0, 400),
      params: merged,
      batchId: body.batchId,
      compositionId: body.compositionId,
      sourceKind: body.sourceKind ?? "workflow_composer",
      initialStatus: "queued",
    });

    const webhookUrl = `${c.env.APP_ORIGIN}/api/webhooks/replicate?u=${encodeURIComponent(c.var.user!.id)}&job=${job.id}`;
    let prediction;
    try {
      prediction = await replicateCreate(c.env, owner, name, merged, {
        preferWaitSeconds: 55, webhookUrl,
      });
    } catch (err: any) {
      await updateGenJob(c.env, job.id, { status: "failed", error: err?.message ?? String(err) });
      throw err;
    }
    await updateGenJob(c.env, job.id, {
      status: prediction.status === "succeeded" ? "succeeded" : "processing",
      predictionId: prediction.id,
    });

    // If it finished within the prefer-wait window, finalize inline.
    if (prediction.status === "succeeded") {
      const outUrl = replicateOutput(prediction);
      if (outUrl) {
        const mediaType = preset?.mediaType ?? (outUrl.includes(".mp4") || outUrl.includes(".webm") ? "video" : "image");
        const mirror = await replicateMirror(c.env, c.var.user!.id, prediction.id, outUrl, mediaType);
        const row = await db.insertOrGetMedia(c.env, {
          id: crypto.randomUUID(),
          user_id: c.var.user!.id,
          r2_key: mirror.r2Key,
          mime: mirror.mime,
          bytes: mirror.bytes,
          source: `replicate/${owner}/${name}`,
          original_url: outUrl,
          public_url: mirror.publicUrl,
        });
        await updateGenJob(c.env, job.id, { status: "succeeded", outputUrl: mirror.publicUrl, mediaId: row.id });
        return c.json({ jobId: job.id, predictionId: prediction.id, media: { id: row.id, publicUrl: mirror.publicUrl } });
      }
    }
    return c.json({ jobId: job.id, predictionId: prediction.id, async: true, status: prediction.status });
  } catch (err: any) {
    return c.json({ error: "replicate_failed", message: err?.message ?? String(err) }, 500);
  }
});

// Expose the full Replicate model registry (not just video) for the UI.
app.get("/api/replicate/models", requireUser, (c) => {
  const models = Object.values(REPLICATE_MODELS).map((m) => ({
    key: m.key, owner: m.owner, name: m.name, label: m.label,
    mediaType: m.mediaType, needsImage: !!m.needsImage,
    unitPriceUsd: m.unitPriceUsd, ui: m.ui, defaults: m.defaults,
  }));
  return c.json({ models, hasToken: !!c.env.REPLICATE_API_TOKEN });
});

// ---------- Scene Composer (LLM planner + chained image/video build) ----------
app.get("/api/planner/models", requireUser, (c) =>
  c.json({ models: Object.entries(PLANNER_MODELS).map(([id, m]) => ({ id, label: m.label, provider: m.provider })) })
);

app.post("/api/compositions", requireUser, async (c) => {
  const body = await c.req.json<{
    brief: string; title?: string; plannerModel?: PlannerModelId;
    count?: number; aspectRatio?: string; durationPreference?: number; styleHints?: string;
  }>();
  if (!body.brief?.trim()) return c.json({ error: "missing_brief" }, 400);
  const plannerModel = (body.plannerModel ?? "openai/gpt-5") as PlannerModelId;
  if (!PLANNER_MODELS[plannerModel]) return c.json({ error: "unknown_planner_model" }, 400);

  // Plan up-front so the operator can review before building.
  let plan;
  try {
    plan = await planScenes(c.env, {
      brief: body.brief,
      count: body.count,
      aspectRatio: body.aspectRatio,
      durationPreference: body.durationPreference,
      styleHints: body.styleHints,
      model: plannerModel,
    });
  } catch (err: any) {
    return c.json({ error: "planner_failed", message: err?.message ?? String(err) }, 500);
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO compositions (id, user_id, title, brief, planner_model, scenes_count, status, meta_json, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)`
  ).bind(
    id, c.var.user!.id,
    body.title?.trim() || plan.title || "Untitled composition",
    body.brief, plannerModel, plan.scenes.length, "planned",
    JSON.stringify({ styleSummary: plan.styleSummary, warnings: plan.warnings }),
    now
  ).run();

  // Persist each scene.
  for (const s of plan.scenes) {
    await c.env.DB.prepare(
      `INSERT INTO scenes (
         id, composition_id, user_id, idx, title, image_prompt, video_prompt,
         continuity, duration_sec, aspect_ratio, status, created_at, updated_at
       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)`
    ).bind(
      crypto.randomUUID(), id, c.var.user!.id, s.idx, s.title,
      s.imagePrompt, s.videoPrompt, s.continuity,
      s.duration, s.aspectRatio, "pending", now
    ).run();
  }

  const scenes = (await c.env.DB.prepare(
    "SELECT * FROM scenes WHERE composition_id = ?1 ORDER BY idx ASC"
  ).bind(id).all()).results ?? [];

  return c.json({ compositionId: id, title: plan.title, styleSummary: plan.styleSummary, scenes, warnings: plan.warnings });
});

app.get("/api/compositions", requireUser, async (c) => {
  const rs = await c.env.DB.prepare(
    "SELECT * FROM compositions WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 100"
  ).bind(c.var.user!.id).all();
  return c.json({ compositions: rs.results ?? [] });
});

app.get("/api/compositions/:id", requireUser, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing_id" }, 400);
  const comp = await c.env.DB.prepare(
    "SELECT * FROM compositions WHERE id = ?1 AND user_id = ?2"
  ).bind(id, c.var.user!.id).first();
  if (!comp) return c.json({ error: "not_found" }, 404);
  const scenes = (await c.env.DB.prepare(
    "SELECT * FROM scenes WHERE composition_id = ?1 ORDER BY idx ASC"
  ).bind(id).all()).results ?? [];
  return c.json({ composition: comp, scenes });
});

// Persist scene build results. Scene Composer + Workflow Composer call this
// after each image / video job finishes so the composition is resumable.
app.post("/api/scenes/:id/result", requireUser, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing_id" }, 400);
  const patch = await c.req.json<{
    imageMediaId?: string;
    videoMediaId?: string;
    status?: "pending" | "image_building" | "image_ready" | "video_building" | "completed" | "failed";
  }>();
  const scene = await c.env.DB.prepare(
    "SELECT * FROM scenes WHERE id = ?1 AND user_id = ?2"
  ).bind(id, c.var.user!.id).first<any>();
  if (!scene) return c.json({ error: "not_found" }, 404);

  const cols: string[] = [];
  const binds: unknown[] = [];
  let p = 1;
  if (patch.imageMediaId !== undefined) { cols.push(`image_media_id = ?${p++}`); binds.push(patch.imageMediaId); }
  if (patch.videoMediaId !== undefined) { cols.push(`video_media_id = ?${p++}`); binds.push(patch.videoMediaId); }
  if (patch.status !== undefined)       { cols.push(`status = ?${p++}`);         binds.push(patch.status); }
  if (cols.length === 0) return c.json({ scene });
  const now = Math.floor(Date.now() / 1000);
  cols.push(`updated_at = ?${p++}`); binds.push(now);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE scenes SET ${cols.join(", ")} WHERE id = ?${p}`)
    .bind(...binds).run();

  // Roll composition status forward if every scene completed.
  if (patch.status === "completed") {
    const remaining = await c.env.DB.prepare(
      "SELECT COUNT(*) as c FROM scenes WHERE composition_id = ?1 AND status != 'completed'"
    ).bind(scene.composition_id).first<{ c: number }>();
    if (remaining && remaining.c === 0) {
      await c.env.DB.prepare(
        "UPDATE compositions SET status = 'completed', updated_at = ?1 WHERE id = ?2"
      ).bind(now, scene.composition_id).run();
    }
  }

  const updated = await c.env.DB.prepare("SELECT * FROM scenes WHERE id = ?1").bind(id).first();
  return c.json({ scene: updated });
});

app.patch("/api/scenes/:id", requireUser, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing_id" }, 400);
  const patch = await c.req.json<{
    title?: string; imagePrompt?: string; videoPrompt?: string; continuity?: string;
    durationSec?: number; aspectRatio?: string;
    imageProvider?: string; imageModel?: string;
    videoProvider?: string; videoModel?: string;
  }>();
  const scene = await c.env.DB.prepare(
    "SELECT * FROM scenes WHERE id = ?1 AND user_id = ?2"
  ).bind(id, c.var.user!.id).first<any>();
  if (!scene) return c.json({ error: "not_found" }, 404);

  const cols: string[] = [];
  const binds: unknown[] = [];
  let p = 1;
  for (const [field, col] of [
    ["title", "title"], ["imagePrompt", "image_prompt"], ["videoPrompt", "video_prompt"],
    ["continuity", "continuity"], ["durationSec", "duration_sec"], ["aspectRatio", "aspect_ratio"],
    ["imageProvider", "image_provider"], ["imageModel", "image_model"],
    ["videoProvider", "video_provider"], ["videoModel", "video_model"],
  ] as const) {
    const v = (patch as any)[field];
    if (v !== undefined) { cols.push(`${col} = ?${p++}`); binds.push(v); }
  }
  if (cols.length === 0) return c.json({ scene });
  const now = Math.floor(Date.now() / 1000);
  cols.push(`updated_at = ?${p++}`); binds.push(now);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE scenes SET ${cols.join(", ")} WHERE id = ?${p}`)
    .bind(...binds).run();
  const updated = await c.env.DB.prepare("SELECT * FROM scenes WHERE id = ?1").bind(id).first();
  return c.json({ scene: updated });
});

// ---------- Channels (Postiz integrations) ----------
app.get("/api/channels", requireUser, async (c) => {
  // Refresh from Postiz on every call — small list, cheap.
  try {
    const remote = await postiz.listIntegrations(c.env);
    for (const r of remote) {
      const existing = await c.env.DB.prepare(
        "SELECT id FROM connected_channels WHERE postiz_integration_id = ?1 AND user_id = ?2"
      )
        .bind(r.id, c.var.user!.id)
        .first<{ id: string }>();
      await db.upsertChannel(c.env, {
        id: existing?.id ?? crypto.randomUUID(),
        user_id: c.var.user!.id,
        platform: r.identifier,
        postiz_integration_id: r.id,
        display_name: r.name,
        status: r.disabled ? "disabled" : "active",
      });
    }
  } catch (e: any) {
    // surface but still return cached
    return c.json({
      channels: await db.listChannels(c.env, c.var.user!.id),
      warning: `Postiz sync failed: ${e?.message ?? String(e)}`,
    });
  }
  return c.json({ channels: await db.listChannels(c.env, c.var.user!.id) });
});

app.post("/api/channels/connect", requireUser, async (c) => {
  const { platform } = await c.req.json<{ platform: string }>();
  if (!platform) return c.json({ error: "platform required" }, 400);
  const returnUrl = `${c.env.APP_ORIGIN}/?tab=connections&connected=${encodeURIComponent(platform)}`;
  const { url } = postiz.initiateChannelConnect(c.env, platform, returnUrl);
  return c.json({ url });
});

// ---------- Posts / Schedules ----------
app.get("/api/posts", requireUser, async (c) => {
  const fromTs = Number(c.req.query("from") ?? "0");
  const toTs = Number(c.req.query("to") ?? String(Math.floor(Date.now() / 1000) + 30 * 86400));
  const rows = await db.listSchedulesWindow(c.env, c.var.user!.id, fromTs, toTs);
  return c.json({ schedules: rows });
});

app.post("/api/posts", requireUser, async (c) => {
  const body = await c.req.json<{
    channelId: string;
    scheduledFor: string; // ISO 8601
    content: string;
    slides?: string[];
    mediaR2Keys?: string[];
    videoDirectives?: string;
    draftKind?: string;
  }>();
  if (!body.channelId || !body.scheduledFor || !body.content) {
    return c.json({ error: "channelId, scheduledFor, content required" }, 400);
  }
  const channel = await db.channelById(c.env, c.var.user!.id, body.channelId);
  if (!channel) return c.json({ error: "channel not found" }, 404);

  const scheduledTs = Math.floor(new Date(body.scheduledFor).getTime() / 1000);
  if (!Number.isFinite(scheduledTs)) return c.json({ error: "invalid scheduledFor" }, 400);

  const draft = await db.createDraft(c.env, c.var.user!.id, body.draftKind ?? "campaign", {
    content: body.content,
    slides: body.slides,
    mediaR2Keys: body.mediaR2Keys,
    videoDirectives: body.videoDirectives,
  });
  const sched = await db.createSchedule(c.env, {
    user_id: c.var.user!.id,
    draft_id: draft.id,
    channel_id: body.channelId,
    scheduled_for: scheduledTs,
    status: "pending",
  });

  await c.env.PUBLISH_QUEUE.send({
    kind: "publish",
    scheduleId: sched.id,
    userId: c.var.user!.id,
    attempt: 0,
  } satisfies PublishJob);

  return c.json({ schedule: sched, draft: { id: draft.id } }, 202);
});

app.delete("/api/posts/:id", requireUser, async (c) => {
  const id = c.req.param("id")!;
  const sched = await db.scheduleById(c.env, c.var.user!.id, id);
  if (!sched) return c.json({ error: "not found" }, 404);
  if (sched.postiz_post_id) {
    try {
      await postiz.deletePost(c.env, sched.postiz_post_id);
    } catch {
      // best-effort
    }
  }
  await db.updateScheduleStatus(c.env, sched.id, { status: "cancelled" });
  return c.json({ ok: true });
});

// ---------- Analytics passthrough ----------
app.get("/api/analytics/:channelId", requireUser, async (c) => {
  const channelId = c.req.param("channelId")!;
  const channel = await db.channelById(c.env, c.var.user!.id, channelId);
  if (!channel) return c.json({ error: "not found" }, 404);
  const days = Number(c.req.query("days") ?? "30");
  const data = await postiz.analytics(c.env, channel.postiz_integration_id, days);
  return c.json({ channel: { id: channel.id, platform: channel.platform }, analytics: data });
});

// ---------- Webhooks (Postiz → us) ----------
app.post("/api/webhooks/postiz", async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header("x-postiz-signature");
  const ts = c.req.header("x-postiz-timestamp");
  const eventId = c.req.header("x-postiz-event-id") ?? crypto.randomUUID();

  const verify = await verifyWebhookSignature(c.env, raw, sig ?? null, ts ?? null);
  if (!verify.ok) return c.json({ error: "invalid signature", reason: verify.reason }, 401);

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  const recorded = await db.recordWebhookEvent(c.env, {
    postiz_event_id: eventId,
    kind: payload.type ?? "unknown",
    payload_json: raw,
    signature: sig ?? "",
  });
  if (recorded.alreadyProcessed) return c.json({ ok: true, deduped: true });

  await applyWebhookEvent(c.env, payload);
  await db.markWebhookProcessed(c.env, recorded.id);
  return c.json({ ok: true });
});

// ---------- Articles ----------
app.get("/api/articles", requireUser, async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? "100"), 200);
  const offset = Number(c.req.query("offset") ?? "0");
  const rows = await articlesDb.list(c.env, c.var.user!.id, limit, offset);
  return c.json({ articles: rows });
});
app.get("/api/articles/:id", requireUser, async (c) => {
  const row = await articlesDb.byId(c.env, c.var.user!.id, c.req.param("id")!);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ article: row });
});
app.post("/api/articles/from-url", requireUser, async (c) => {
  try {
    const body = await c.req.json<{ url: string; category?: string; badge?: string }>();
    if (!body.url) return c.json({ error: "url required" }, 400);
    const row = await articlesDb.ingestFromUrl(c.env, c.var.user!.id, body.url, null,
      { category: body.category, badge: body.badge });
    return c.json({ article: row });
  } catch (err: any) {
    return c.json({ error: "ingest_failed", message: err?.message ?? String(err) }, 500);
  }
});
app.post("/api/articles/draft", requireUser, async (c) => {
  try {
    const body = await c.req.json<{ topic: string; category?: string; badge?: string }>();
    if (!body.topic) return c.json({ error: "topic required" }, 400);
    const row = await articlesDb.generateDraft(c.env, c.var.user!.id, body.topic,
      { category: body.category, badge: body.badge });
    return c.json({ article: row });
  } catch (err: any) {
    return c.json({ error: "draft_failed", message: err?.message ?? String(err) }, 500);
  }
});
app.delete("/api/articles/:id", requireUser, async (c) => {
  await articlesDb.archive(c.env, c.var.user!.id, c.req.param("id")!);
  return c.json({ ok: true });
});

// ---------- Battlecards ----------
app.get("/api/battlecards", requireUser, async (c) => {
  const rows = await battlecardsDb.list(c.env, c.var.user!.id);
  return c.json({ battlecards: rows });
});
app.post("/api/battlecards", requireUser, async (c) => {
  const body = await c.req.json<any>();
  if (!body.category || !body.objection || !body.counter_wedge || !body.one_liner) {
    return c.json({ error: "category, objection, counter_wedge, one_liner required" }, 400);
  }
  const row = await battlecardsDb.upsert(c.env, c.var.user!.id, body);
  return c.json({ battlecard: row });
});
app.post("/api/battlecards/generate", requireUser, async (c) => {
  try {
    const body = await c.req.json<{ competitorDomain: string; objection: string; category: string }>();
    if (!body.competitorDomain || !body.objection || !body.category) {
      return c.json({ error: "competitorDomain, objection, category required" }, 400);
    }
    const row = await battlecardsDb.generate(c.env, c.var.user!.id, body);
    return c.json({ battlecard: row });
  } catch (err: any) {
    return c.json({ error: "generate_failed", message: err?.message ?? String(err) }, 500);
  }
});
app.delete("/api/battlecards/:id", requireUser, async (c) => {
  await battlecardsDb.archive(c.env, c.var.user!.id, c.req.param("id")!);
  return c.json({ ok: true });
});

// Manual relevance scrub trigger — drops off-topic articles older than `hours`.
app.post("/api/articles/scrub", requireUser, async (c) => {
  const body: { hours?: number; max?: number } =
    await c.req.json<{ hours?: number; max?: number }>().catch(() => ({} as { hours?: number; max?: number }));
  const result = await runRelevanceScrub(c.env, {
    tenantId: c.var.user!.id,
    lookbackHours: Math.max(1, Math.min(720, body.hours ?? 168)),
    maxItems: Math.max(1, Math.min(500, body.max ?? 120)),
  });
  return c.json({ ok: true, ...result });
});

// Manual ingest trigger — for force-pulling sources now (no waiting for cron).
app.post("/api/sources/run-now", requireUser, async (c) => {
  const result = await runContentIngest(c.env, c.executionCtx);
  return c.json({ ok: true, ...result });
});

// Manual intel tagger trigger.
app.post("/api/articles/intel-tag", requireUser, async (c) => {
  const result = await runIntelTagger(c.env, { tenantId: c.var.user!.id, lookbackHours: 168, maxItems: 100 });
  return c.json({ ok: true, ...result });
});

// Signal feed — recently tagged articles with high-value angles, deduped.
app.get("/api/intel/signals", requireUser, async (c) => {
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") ?? "60")));
  const rs = await c.env.DB.prepare(
    `SELECT id, title, description, source_url, category, badge, highlights_json, updated_at
     FROM articles
     WHERE tenant_id = ?1 AND is_archived = 0 AND highlights_json LIKE '%__intel%'
     ORDER BY updated_at DESC LIMIT ?2`
  ).bind(c.var.user!.id, limit).all<{ id: string; title: string; description: string; source_url: string; category: string; badge: string; highlights_json: string; updated_at: string }>();
  const items = (rs.results ?? []).map((r) => {
    let intel: any = null;
    try { intel = JSON.parse(r.highlights_json)?.__intel ?? null; } catch {}
    return {
      id: r.id, title: r.title, description: r.description, source_url: r.source_url,
      category: r.category, badge: r.badge, updated_at: r.updated_at,
      intel,
    };
  });
  return c.json({ items });
});

// Seed roofing-intel sources — competitor blogs + roofing subreddits + industry
// publications. Idempotent: skips any url that already exists for the tenant.
app.post("/api/sources/seed-roofing", requireUser, async (c) => {
  const userId = c.var.user!.id;
  const presets: Array<{ kind: "rss" | "reddit" | "competitor"; url: string; label: string; category: string; badge: string }> = [
    // Reddit communities — roofing trade
    { kind: "reddit", url: "https://www.reddit.com/r/Roofing/top", label: "r/Roofing", category: "industry", badge: "Reddit" },
    { kind: "reddit", url: "https://www.reddit.com/r/RoofingSales/top", label: "r/RoofingSales", category: "industry", badge: "Reddit" },
    { kind: "reddit", url: "https://www.reddit.com/r/Construction/top", label: "r/Construction", category: "industry", badge: "Reddit" },
    { kind: "reddit", url: "https://www.reddit.com/r/Insurance/top", label: "r/Insurance — claims signal", category: "industry", badge: "Reddit" },
    { kind: "reddit", url: "https://www.reddit.com/r/Adjusters/top", label: "r/Adjusters", category: "industry", badge: "Reddit" },
    // Industry publications (RSS where available)
    { kind: "rss", url: "https://www.roofingcontractor.com/rss/topic/2613-news.xml", label: "Roofing Contractor news", category: "industry", badge: "RSS" },
    { kind: "rss", url: "https://www.constructiondive.com/feeds/news/", label: "Construction Dive", category: "industry", badge: "RSS" },
    { kind: "rss", url: "https://www.roofingmagazine.com/feed/", label: "Roofing Magazine", category: "industry", badge: "RSS" },
    // Competitor landing pages — auto-extract article links
    { kind: "competitor", url: "https://www.acculynx.com/blog/", label: "AccuLynx blog", category: "competitor", badge: "Competitor" },
    { kind: "competitor", url: "https://jobnimbus.com/blog/", label: "JobNimbus blog", category: "competitor", badge: "Competitor" },
    { kind: "competitor", url: "https://www.roofr.com/blog", label: "Roofr blog", category: "competitor", badge: "Competitor" },
    { kind: "competitor", url: "https://blog.companycam.com/", label: "CompanyCam blog", category: "competitor", badge: "Competitor" },
    { kind: "competitor", url: "https://www.rooflink.com/blog", label: "RoofLink blog", category: "competitor", badge: "Competitor" },
    { kind: "competitor", url: "https://www.improveit360.com/blog", label: "improveit360 blog", category: "competitor", badge: "Competitor" },
  ];
  let added = 0, skipped = 0;
  for (const p of presets) {
    try {
      // Reuse sourcesDb.upsert which is idempotent by url+tenant.
      const existing = await c.env.DB.prepare(
        "SELECT id FROM content_sources WHERE tenant_id = ?1 AND url = ?2 LIMIT 1"
      ).bind(userId, p.url).first();
      if (existing) { skipped++; continue; }
      await sourcesDb.create(c.env, userId, {
        kind: p.kind,
        url: p.url,
        label: p.label,
        category: p.category,
        badge: p.badge,
        is_active: 1,
      });
      added++;
    } catch { skipped++; }
  }
  return c.json({ added, skipped, total: presets.length });
});

// ---------- Content sources (RSS/Reddit/sitemap/manual) ----------
app.get("/api/sources", requireUser, async (c) => {
  const rows = await sourcesDb.list(c.env, c.var.user!.id);
  return c.json({ sources: rows });
});
app.post("/api/sources", requireUser, async (c) => {
  const body = await c.req.json<any>();
  if (!body.url || !body.label) return c.json({ error: "url and label required" }, 400);
  const row = await sourcesDb.create(c.env, c.var.user!.id, body);
  return c.json({ source: row });
});
app.patch("/api/sources/:id", requireUser, async (c) => {
  const body = await c.req.json<any>();
  await sourcesDb.update(c.env, c.var.user!.id, c.req.param("id")!, body);
  return c.json({ ok: true });
});
app.delete("/api/sources/:id", requireUser, async (c) => {
  await sourcesDb.delete(c.env, c.var.user!.id, c.req.param("id")!);
  return c.json({ ok: true });
});
app.post("/api/sources/run-now", requireUser, async (c) => {
  // Manual trigger of the ingest cron (admin convenience).
  const result = await runContentIngest(c.env, c.executionCtx);
  return c.json({ ok: true, ...result });
});

// ---------- User prefs (notification email + toggles) ----------
app.get("/api/prefs", requireUser, async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM user_prefs WHERE user_id = ?1").bind(c.var.user!.id).first<any>();
  return c.json({ prefs: row ?? null });
});

app.put("/api/prefs", requireUser, async (c) => {
  const b = await c.req.json<{
    notify_email?: string | null;
    notify_on_generated?: boolean;
    notify_on_published?: boolean;
    notify_on_failed?: boolean;
    notify_cost_threshold_usd?: number | null;
  }>();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO user_prefs (user_id, notify_email, notify_on_generated, notify_on_published, notify_on_failed, notify_cost_threshold_usd, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(user_id) DO UPDATE SET
       notify_email = excluded.notify_email,
       notify_on_generated = excluded.notify_on_generated,
       notify_on_published = excluded.notify_on_published,
       notify_on_failed = excluded.notify_on_failed,
       notify_cost_threshold_usd = excluded.notify_cost_threshold_usd,
       updated_at = excluded.updated_at`
  ).bind(
    c.var.user!.id,
    b.notify_email ?? null,
    b.notify_on_generated ? 1 : 0,
    b.notify_on_published ? 1 : 0,
    b.notify_on_failed ? 1 : 0,
    b.notify_cost_threshold_usd ?? null,
    now,
  ).run();
  return c.json({ ok: true });
});

// POST /api/notifications/test — send a test email via MailChannels (free for CF Workers).
app.post("/api/notifications/test", requireUser, async (c) => {
  const row = await c.env.DB.prepare("SELECT notify_email FROM user_prefs WHERE user_id = ?1").bind(c.var.user!.id).first<{ notify_email: string | null }>();
  const to = row?.notify_email;
  if (!to) return c.json({ error: "no notify_email set; PUT /api/prefs first" }, 400);

  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: "noreply@example.com", name: "ContentForge" },
      subject: "ContentForge — test notification",
      content: [{
        type: "text/plain",
        value: `Hi ${c.var.user!.email},\n\nThis is a test notification from ContentForge.\nIf you got this, email delivery is wired and toggles in Settings will start firing.\n\n— ContentForge\n${c.env.APP_ORIGIN}`,
      }],
    }),
  });
  if (!res.ok) return c.json({ error: "send failed", status: res.status, body: (await res.text()).slice(0, 300) }, 502);
  return c.json({ ok: true, to });
});

// ---------- Brand profile (KV-backed; drives every generator) ----------
app.get("/api/brand", requireUser, async (c) => {
  if (!c.env.CACHE) return c.json({ brand: null });
  const key = `brand:${c.var.user!.id}:default`;
  const brand = await c.env.CACHE.get(key, "json");
  return c.json({ brand });
});
app.put("/api/brand", requireUser, async (c) => {
  if (!c.env.CACHE) return c.json({ error: "KV not bound" }, 500);
  const body = await c.req.json<any>();
  const key = `brand:${c.var.user!.id}:default`;
  await c.env.CACHE.put(key, JSON.stringify({ ...body, id: "default" }));
  return c.json({ ok: true });
});

// ---------- Cost rollup ----------
// Aggregates spend from workflow_audit_events metadata (where the queue
// consumer stores `spent` per generation). Returns per-provider sums + count.
app.get("/api/cost/summary", requireUser, async (c) => {
  const days = Math.min(Number(c.req.query("days") ?? "30"), 365);
  const sinceIso = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const rs = await c.env.DB.prepare(
    `SELECT ae.metadata_json
       FROM workflow_audit_events ae
       JOIN workflows w ON w.id = ae.workflow_id
      WHERE w.user_id = ?1 AND ae.created_at >= ?2 AND ae.node_id = 'node_11_dispatcher'
        AND ae.metadata_json LIKE '%spent%'`
  ).bind(c.var.user!.id, sinceIso).all<any>();

  const byProvider = new Map<string, { totalUsd: number; count: number; models: Set<string> }>();
  for (const row of rs.results ?? []) {
    try {
      const meta = JSON.parse(row.metadata_json);
      const s = meta.spent;
      if (s && s.providerId && typeof s.estimatedCostUsd === "number") {
        const key = s.providerId;
        const agg = byProvider.get(key) ?? { totalUsd: 0, count: 0, models: new Set() };
        agg.totalUsd += s.estimatedCostUsd;
        agg.count += 1;
        agg.models.add(s.modelId ?? "?");
        byProvider.set(key, agg);
      }
    } catch {}
  }

  const summary = [...byProvider.entries()].map(([provider, agg]) => ({
    provider,
    totalUsd: Math.round(agg.totalUsd * 1000) / 1000,
    count: agg.count,
    models: [...agg.models],
  })).sort((a, b) => b.totalUsd - a.totalUsd);

  const grandTotal = summary.reduce((s, x) => s + x.totalUsd, 0);
  return c.json({ days, sinceIso, grandTotalUsd: Math.round(grandTotal * 1000) / 1000, byProvider: summary });
});

// ---------- Workflow list (for audit viewer) ----------
app.get("/api/workflows-list", requireUser, async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT w.id, w.mode, w.status, w.created_at, w.updated_at,
            (SELECT COUNT(*) FROM generated_assets WHERE workflow_id = w.id) AS asset_count,
            (SELECT COUNT(*) FROM workflow_audit_events WHERE workflow_id = w.id) AS event_count
       FROM workflows w
      WHERE w.user_id = ?1
      ORDER BY w.created_at DESC LIMIT 50`
  ).bind(c.var.user!.id).all<any>();
  return c.json({ workflows: rs.results ?? [] });
});

// ---------- Generated assets ledger (across all workflows for current user) ----------
app.get("/api/assets/recent", requireUser, async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? "60"), 200);
  const rs = await c.env.DB.prepare(
    `SELECT g.*
       FROM generated_assets g
       JOIN workflows w ON w.id = g.workflow_id
      WHERE w.user_id = ?1
      ORDER BY g.created_at DESC
      LIMIT ?2`
  ).bind(c.var.user!.id, limit).all<any>();
  const assets = rs.results ?? [];

  // Hydrate latest review score per asset from workflow_audit_events.
  if (assets.length > 0) {
    const assetIds = assets.map((a: any) => a.id);
    // SQLite IN-list size cap considered safe up to thousands; cap at 200 anyway.
    const placeholders = assetIds.map((_: any, i: number) => `?${i + 1}`).join(",");
    const ev = await c.env.DB.prepare(
      `SELECT metadata_json FROM workflow_audit_events
        WHERE node_id = 'node_14_review' AND metadata_json LIKE '%assetId%'`
    ).all<any>();
    const scoreByAsset = new Map<string, any>();
    for (const e of ev.results ?? []) {
      try {
        const s = JSON.parse(e.metadata_json);
        if (s.assetId) scoreByAsset.set(s.assetId, s);
      } catch {}
    }
    for (const a of assets) (a as any).review = scoreByAsset.get(a.id) ?? null;
  }

  return c.json({ assets });
});

// ---------- Workflows (26-node spec) ----------
app.route("/api/workflows", workflowsRoutes);
app.route("/api", salesRoutes); // mounts /prospects/* and /outreach/* and /crm/*
app.route("/api/research", researchRoutes);
app.route("/api/broll", brollRoutes);

// ---------- SSE for live status ----------
app.get("/api/events/stream", requireUser, async (c) => {
  const id = c.env.SCHEDULE_ROOM.idFromName(c.var.user!.id);
  const stub = c.env.SCHEDULE_ROOM.get(id);
  return stub.fetch("https://room/subscribe");
});

// ---------- 404 ----------
app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error("worker error:", err);
  return c.json({ error: "internal", message: err.message }, 500);
});

// Worker exports — Hono fetch + queue + scheduled + DO.
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<PublishJob>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Every minute: reconcile pending Postiz posts.
    ctx.waitUntil(runReconciliation(env));
    // Content ingest: now runs every 10 minutes so the article intel feed
    // stays fresh. Internal source-level cadence gate (now 30 minutes per
    // source) prevents hammering the same RSS / subreddit / competitor URL.
    const now = new Date();
    if (now.getMinutes() % 10 === 0) {
      ctx.waitUntil((async () => {
        await runContentIngest(env, ctx).catch(() => {});
        // Immediately scrub anything fresh against the Acme relevance
        // filter. Off-topic articles get archived (is_archived = 1) so the
        // Library + Studio surfaces never see them.
        await runRelevanceScrub(env, { lookbackHours: 1, maxItems: 40 }).catch(() => {});
      })());
    }
    // Hourly deep-scrub of the last 24h — catches anything the fast pass let
    // through and keeps quality high over time.
    if (now.getMinutes() === 5) {
      ctx.waitUntil(runRelevanceScrub(env, { lookbackHours: 24, maxItems: 80 }).catch(() => {}));
    }
    // Hourly intel-tag pass — adds sentiment + signal annotations.
    if (now.getMinutes() === 15) {
      ctx.waitUntil(runIntelTagger(env, { lookbackHours: 12, maxItems: 60 }).catch(() => {}));
    }
  },
};
