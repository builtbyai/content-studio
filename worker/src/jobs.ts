// Generation job ledger — every async media gen lands a row. Backs the
// global Jobs widget, batch panels, scene composer chains, and workflow
// composer pipelines. SSE broadcasts go through ScheduleRoom so existing
// /api/events/stream subscribers pick them up.

import type { Env } from "./env";

export type JobKind = "video" | "image" | "text";
export type JobStatus = "queued" | "processing" | "succeeded" | "failed" | "canceled";
export type JobSourceKind =
  | "video_lab" | "image_lab"
  | "scene_composer" | "workflow_composer"
  | "workflow_runner" | "broll";

export interface GenerationJob {
  id: string;
  user_id: string;
  kind: JobKind;
  provider: string;
  model: string;
  status: JobStatus;
  prompt: string | null;
  params_json: string;
  prediction_id: string | null;
  output_url: string | null;
  media_id: string | null;
  error: string | null;
  batch_id: string | null;
  scene_id: string | null;
  composition_id: string | null;
  workflow_run_id: string | null;
  source_kind: JobSourceKind | null;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

export interface CreateJobInput {
  userId: string;
  kind: JobKind;
  provider: string;
  model: string;
  prompt?: string;
  params?: Record<string, unknown>;
  predictionId?: string;
  batchId?: string;
  sceneId?: string;
  compositionId?: string;
  workflowRunId?: string;
  sourceKind?: JobSourceKind;
  initialStatus?: JobStatus;
}

export async function createJob(env: Env, input: CreateJobInput): Promise<GenerationJob> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO generation_jobs (
       id, user_id, kind, provider, model, status, prompt, params_json,
       prediction_id, batch_id, scene_id, composition_id, workflow_run_id, source_kind,
       created_at, updated_at
     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`
  ).bind(
    id, input.userId, input.kind, input.provider, input.model,
    input.initialStatus ?? "queued",
    (input.prompt ?? "").slice(0, 2000),
    JSON.stringify(input.params ?? {}),
    input.predictionId ?? null,
    input.batchId ?? null,
    input.sceneId ?? null,
    input.compositionId ?? null,
    input.workflowRunId ?? null,
    input.sourceKind ?? null,
    now, now
  ).run();
  return (await getJob(env, id))!;
}

export async function getJob(env: Env, id: string): Promise<GenerationJob | null> {
  const row = await env.DB.prepare("SELECT * FROM generation_jobs WHERE id = ?1")
    .bind(id).first<GenerationJob>();
  return row ?? null;
}

export async function getJobByPrediction(env: Env, predictionId: string): Promise<GenerationJob | null> {
  const row = await env.DB.prepare("SELECT * FROM generation_jobs WHERE prediction_id = ?1 LIMIT 1")
    .bind(predictionId).first<GenerationJob>();
  return row ?? null;
}

export async function listJobs(
  env: Env, userId: string,
  opts?: { status?: JobStatus[]; limit?: number; sinceUnix?: number; batchId?: string; sceneId?: string; compositionId?: string }
): Promise<GenerationJob[]> {
  const where: string[] = ["user_id = ?1"];
  const binds: unknown[] = [userId];
  let p = 2;
  if (opts?.status && opts.status.length > 0) {
    where.push(`status IN (${opts.status.map(() => `?${p++}`).join(",")})`);
    binds.push(...opts.status);
  }
  if (typeof opts?.sinceUnix === "number") { where.push(`updated_at > ?${p++}`); binds.push(opts.sinceUnix); }
  if (opts?.batchId) { where.push(`batch_id = ?${p++}`); binds.push(opts.batchId); }
  if (opts?.sceneId) { where.push(`scene_id = ?${p++}`); binds.push(opts.sceneId); }
  if (opts?.compositionId) { where.push(`composition_id = ?${p++}`); binds.push(opts.compositionId); }
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
  const sql = `SELECT * FROM generation_jobs WHERE ${where.join(" AND ")}
               ORDER BY updated_at DESC LIMIT ${limit}`;
  const rs = await env.DB.prepare(sql).bind(...binds).all<GenerationJob>();
  return rs.results ?? [];
}

export interface UpdateJobPatch {
  status?: JobStatus;
  predictionId?: string;
  outputUrl?: string;
  mediaId?: string;
  error?: string;
}

export async function updateJob(env: Env, id: string, patch: UpdateJobPatch): Promise<GenerationJob | null> {
  const set: string[] = [];
  const binds: unknown[] = [];
  let p = 1;
  if (patch.status !== undefined)       { set.push(`status = ?${p++}`);        binds.push(patch.status); }
  if (patch.predictionId !== undefined) { set.push(`prediction_id = ?${p++}`); binds.push(patch.predictionId); }
  if (patch.outputUrl !== undefined)    { set.push(`output_url = ?${p++}`);    binds.push(patch.outputUrl); }
  if (patch.mediaId !== undefined)      { set.push(`media_id = ?${p++}`);      binds.push(patch.mediaId); }
  if (patch.error !== undefined)        { set.push(`error = ?${p++}`);         binds.push((patch.error ?? "").slice(0, 2000)); }
  const now = Math.floor(Date.now() / 1000);
  set.push(`updated_at = ?${p++}`); binds.push(now);
  const terminal = patch.status === "succeeded" || patch.status === "failed" || patch.status === "canceled";
  if (terminal) { set.push(`finished_at = ?${p++}`); binds.push(now); }
  binds.push(id);
  await env.DB.prepare(`UPDATE generation_jobs SET ${set.join(", ")} WHERE id = ?${p}`)
    .bind(...binds).run();
  const row = await getJob(env, id);
  if (row) await broadcastJobEvent(env, row);
  return row;
}

/** Broadcasts a `job` SSE event to the user's ScheduleRoom DO. */
export async function broadcastJobEvent(env: Env, job: GenerationJob): Promise<void> {
  try {
    if (!env.SCHEDULE_ROOM) return;
    const id = env.SCHEDULE_ROOM.idFromName(job.user_id);
    const stub = env.SCHEDULE_ROOM.get(id);
    await stub.fetch("https://do.local/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "job",
        job: {
          id: job.id,
          kind: job.kind,
          provider: job.provider,
          model: job.model,
          status: job.status,
          prompt: job.prompt,
          predictionId: job.prediction_id,
          outputUrl: job.output_url,
          mediaId: job.media_id,
          error: job.error,
          batchId: job.batch_id,
          sceneId: job.scene_id,
          compositionId: job.composition_id,
          sourceKind: job.source_kind,
          updatedAt: job.updated_at,
          finishedAt: job.finished_at,
        },
      }),
    });
  } catch {
    // SSE is best-effort — clients still get state via /api/jobs poll fallback.
  }
}
