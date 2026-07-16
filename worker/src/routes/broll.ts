import { Hono } from "hono";
import type { HonoEnv, PublishJob } from "../env";
import { requireUser } from "../auth";
import { governance } from "../nodes/governance";
import { planBrollShots, type BrollPlanInput, type BrollShotSpec } from "../nodes/broll";

const r = new Hono<HonoEnv>();
r.use("*", requireUser);

// ── POST /api/broll/projects — create + plan ──────────────────────────
// Body: { sceneText, referenceDescription, referenceUri?, referenceKind?, style?, aspectRatio?, shotCount?, title? }
r.post("/projects", async (c) => {
  const body = await c.req.json<{
    sceneText: string;
    referenceDescription: string;
    referenceUri?: string;
    referenceKind?: "text" | "upload" | "generated" | "url";
    style?: BrollPlanInput["style"];
    aspectRatio?: BrollPlanInput["aspectRatio"];
    shotCount?: number;
    title?: string;
    quality?: "fast" | "high";
    renderVideo?: boolean;            // default true — B-roll output is video
  }>();

  if (!body.sceneText || !body.sceneText.trim()) return c.json({ error: "sceneText required" }, 400);
  if (!body.referenceDescription || !body.referenceDescription.trim()) {
    return c.json({ error: "referenceDescription required (used as the cross-shot continuity anchor)" }, 400);
  }

  const userId = c.var.user!.id;
  const wf = await governance.createWorkflow(c.env, {
    tenantId: userId as any,
    userId: userId as any,
    mode: "execute",
  });

  const plan = await planBrollShots(c.env, {
    sceneText: body.sceneText,
    referenceDescription: body.referenceDescription,
    style: body.style,
    aspectRatio: body.aspectRatio,
    shotCount: body.shotCount,
  });

  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();
  const quality = body.quality === "high" ? "high" : "fast";
  const renderVideo = body.renderVideo === false ? 0 : 1;
  await c.env.DB.prepare(
    `INSERT INTO broll_projects
       (id, user_id, workflow_id, title, scene_text, reference_kind, reference_uri, reference_description, style, aspect_ratio, shot_count, status, quality, video_provider, render_video, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'ready_to_render',?12,'runway_gen4_turbo',?13,?14,?14)`
  ).bind(
    projectId, userId, wf.workflowId,
    body.title ?? body.sceneText.slice(0, 80),
    body.sceneText,
    body.referenceKind ?? "text",
    body.referenceUri ?? null,
    plan.continuityAnchor,
    body.style ?? "cinematic",
    body.aspectRatio ?? "16:9",
    plan.shots.length,
    quality,
    renderVideo,
    now,
  ).run();

  // Persist each shot row.
  for (const s of plan.shots) {
    await c.env.DB.prepare(
      `INSERT INTO broll_shots
         (id, project_id, user_id, ordinal, title, angle, beat, continuity_token, prompt, negative_prompt, motion_hint, duration_seconds, status, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'planned',?13,?13)`
    ).bind(
      crypto.randomUUID(), projectId, userId,
      s.ordinal, s.title, s.angle, s.beat,
      plan.continuityToken,
      s.prompt, s.negativePrompt ?? null, s.motionHint, s.durationSeconds,
      now,
    ).run();
  }

  const shots = await listShots(c.env, projectId);
  return c.json({
    projectId,
    workflowId: wf.workflowId,
    continuityToken: plan.continuityToken,
    continuityAnchor: plan.continuityAnchor,
    plannedBy: plan.plannedBy,
    shots,
    warnings: plan.warnings,
  }, 201);
});

// ── GET /api/broll/projects — list ────────────────────────────────────
r.get("/projects", async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, title, scene_text, reference_kind, reference_uri, style, aspect_ratio, shot_count, status, workflow_id, created_at, updated_at
       FROM broll_projects WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50`
  ).bind(c.var.user!.id).all<any>();
  return c.json({ projects: rs.results ?? [] });
});

// ── GET /api/broll/projects/:id — load with shots ─────────────────────
r.get("/projects/:id", async (c) => {
  const id = c.req.param("id")!;
  const row = await c.env.DB.prepare(
    "SELECT * FROM broll_projects WHERE id = ?1 AND user_id = ?2"
  ).bind(id, c.var.user!.id).first<any>();
  if (!row) return c.json({ error: "not found" }, 404);
  const shots = await listShots(c.env, id);
  return c.json({ project: row, shots });
});

// ── POST /api/broll/projects/:id/render — dispatch all unrendered shots ─
r.post("/projects/:id/render", async (c) => {
  const id = c.req.param("id")!;
  const proj = await c.env.DB.prepare(
    "SELECT * FROM broll_projects WHERE id = ?1 AND user_id = ?2"
  ).bind(id, c.var.user!.id).first<any>();
  if (!proj) return c.json({ error: "not found" }, 404);

  // Only render shots in 'planned' or 'failed' state.
  const shots = await c.env.DB.prepare(
    "SELECT * FROM broll_shots WHERE project_id = ?1 AND status IN ('planned','failed') ORDER BY ordinal"
  ).bind(id).all<any>();
  const list = shots.results ?? [];
  if (list.length === 0) return c.json({ dispatched: 0, note: "nothing to render" });

  const dispatched: string[] = [];
  const now = new Date().toISOString();

  const { modelId, parameters: baseParams } = imageModelFor(proj.quality ?? "fast", proj.aspect_ratio);
  for (const s of list) {
    const promptId = crypto.randomUUID();

    await c.env.PUBLISH_QUEUE.send({
      kind: "generate",
      workflowId: proj.workflow_id,
      userId: c.var.user!.id,
      promptId,
      providerId: "workers-ai",
      modelId,
      prompt: s.prompt,
      negativePrompt: s.negative_prompt ?? undefined,
      parameters: baseParams,
      preservationTokens: [s.continuity_token],
    } satisfies PublishJob);

    await c.env.DB.prepare(
      "UPDATE broll_shots SET status = 'rendering', prompt_id = ?1, updated_at = ?2, last_error = NULL WHERE id = ?3"
    ).bind(promptId, now, s.id).run();
    dispatched.push(s.id);
  }

  await c.env.DB.prepare(
    "UPDATE broll_projects SET status = 'rendering', updated_at = ?1 WHERE id = ?2"
  ).bind(now, id).run();

  return c.json({ dispatched: dispatched.length, shotIds: dispatched }, 202);
});

// ── POST /api/broll/projects/:id/shots/:shotId/regenerate ─────────────
r.post("/projects/:id/shots/:shotId/regenerate", async (c) => {
  const id = c.req.param("id")!;
  const shotId = c.req.param("shotId")!;
  const body = await c.req.json<{ prompt?: string; negativePrompt?: string }>().catch(() => ({} as any));

  const proj = await c.env.DB.prepare(
    "SELECT * FROM broll_projects WHERE id = ?1 AND user_id = ?2"
  ).bind(id, c.var.user!.id).first<any>();
  if (!proj) return c.json({ error: "project not found" }, 404);

  const shot = await c.env.DB.prepare(
    "SELECT * FROM broll_shots WHERE id = ?1 AND project_id = ?2"
  ).bind(shotId, id).first<any>();
  if (!shot) return c.json({ error: "shot not found" }, 404);

  const finalPrompt = (body.prompt && body.prompt.trim()) || shot.prompt;
  const finalNeg = body.negativePrompt !== undefined ? body.negativePrompt : shot.negative_prompt;
  const promptId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { modelId: regenModel, parameters: regenParams } = imageModelFor(proj.quality ?? "fast", proj.aspect_ratio);
  await c.env.PUBLISH_QUEUE.send({
    kind: "generate",
    workflowId: proj.workflow_id,
    userId: c.var.user!.id,
    promptId,
    providerId: "workers-ai",
    modelId: regenModel,
    prompt: finalPrompt,
    negativePrompt: finalNeg ?? undefined,
    parameters: regenParams,
    preservationTokens: [shot.continuity_token],
  } satisfies PublishJob);

  await c.env.DB.prepare(
    `UPDATE broll_shots
       SET prompt = ?1, negative_prompt = ?2, status = 'rendering',
           prompt_id = ?3, still_asset_id = NULL, still_r2_uri = NULL,
           last_error = NULL, updated_at = ?4
     WHERE id = ?5`
  ).bind(finalPrompt, finalNeg ?? null, promptId, now, shotId).run();

  return c.json({ ok: true, shotId, promptId }, 202);
});

// ── POST /api/broll/projects/:id/shots/:shotId/animate ────────────────
// Kicks off Runway gen4 video generation using the rendered still as input.
r.post("/projects/:id/shots/:shotId/animate", async (c) => {
  const id = c.req.param("id")!;
  const shotId = c.req.param("shotId")!;

  const proj = await c.env.DB.prepare(
    "SELECT * FROM broll_projects WHERE id = ?1 AND user_id = ?2"
  ).bind(id, c.var.user!.id).first<any>();
  if (!proj) return c.json({ error: "project not found" }, 404);

  const shot = await c.env.DB.prepare(
    "SELECT * FROM broll_shots WHERE id = ?1 AND project_id = ?2"
  ).bind(shotId, id).first<any>();
  if (!shot) return c.json({ error: "shot not found" }, 404);
  if (!shot.still_r2_uri) return c.json({ error: "render the still first" }, 422);

  const promptId = crypto.randomUUID();
  const now = new Date().toISOString();
  const motion = shot.motion_hint || "subtle cinematic motion, slow drift";

  await c.env.PUBLISH_QUEUE.send({
    kind: "generate",
    workflowId: proj.workflow_id,
    userId: c.var.user!.id,
    promptId,
    providerId: "runway",
    modelId: "gen4_turbo",
    prompt: motion,
    parameters: {
      duration: shot.duration_seconds === 10 ? 10 : 5,
      ratio: proj.aspect_ratio === "9:16" ? "768:1280" : proj.aspect_ratio === "1:1" ? "960:960" : "1280:768",
      promptImage: shot.still_r2_uri,
    },
    preservationTokens: [shot.continuity_token],
  } satisfies PublishJob);

  await c.env.DB.prepare(
    "UPDATE broll_shots SET status = 'animating', prompt_id = ?1, last_error = NULL, updated_at = ?2 WHERE id = ?3"
  ).bind(promptId, now, shotId).run();

  return c.json({ ok: true, shotId, promptId }, 202);
});

// ── DELETE /api/broll/projects/:id ────────────────────────────────────
r.delete("/projects/:id", async (c) => {
  const id = c.req.param("id")!;
  const proj = await c.env.DB.prepare(
    "SELECT id FROM broll_projects WHERE id = ?1 AND user_id = ?2"
  ).bind(id, c.var.user!.id).first<any>();
  if (!proj) return c.json({ error: "not found" }, 404);
  await c.env.DB.prepare("DELETE FROM broll_shots WHERE project_id = ?1").bind(id).run();
  await c.env.DB.prepare("DELETE FROM broll_projects WHERE id = ?1").bind(id).run();
  return c.json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────────────
async function listShots(env: HonoEnv["Bindings"], projectId: string) {
  const rs = await env.DB.prepare(
    "SELECT * FROM broll_shots WHERE project_id = ?1 ORDER BY ordinal"
  ).bind(projectId).all<any>();
  return rs.results ?? [];
}

// Choose image model + params from the project quality setting.
// `fast`  → Flux-1 Schnell, 4 steps (~1-2s/image, ~$0.001).
// `high`  → Flux-1 Schnell, 8 steps + larger dims (sharper detail, still cheap).
function imageModelFor(quality: string, aspectRatio: string): { modelId: string; parameters: Record<string, unknown> } {
  const isHigh = quality === "high";
  const [width, height] = isHigh
    ? (aspectRatio === "9:16" ? [896, 1600] : aspectRatio === "16:9" ? [1600, 896] : aspectRatio === "4:5" ? [1024, 1280] : [1280, 1280])
    : (aspectRatio === "9:16" ? [768, 1344] : aspectRatio === "16:9" ? [1344, 768] : aspectRatio === "4:5" ? [1024, 1280] : [1024, 1024]);
  return {
    modelId: "@cf/black-forest-labs/flux-1-schnell",
    parameters: { width, height, num_steps: isHigh ? 8 : 4 },
  };
}

export const brollRoutes = r;
