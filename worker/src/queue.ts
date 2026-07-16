import type { Env, PublishJob } from "./env";
import { db } from "./db";
import { postiz, PostizError } from "./postiz";
import { ingestRemoteIntoR2, publicUrl } from "./r2";
import {
  node09_providerAdapter,
  node13_normalizer,
  node14_review,
  type ProviderAdapterInput,
  type ProviderAdapterOutput,
} from "./nodes/creative";

// Queue consumer. Cloudflare delivers in batches; we ack per-message so a
// transient Postiz outage on one message doesn't drop the rest.

export async function handleQueueBatch(batch: MessageBatch<PublishJob>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      switch (msg.body.kind) {
        case "publish":
          await runPublishJob(env, msg.body);
          break;
        case "ingest_media":
          await runIngestJob(env, msg.body);
          break;
        case "generate":
          await runGenerateJob(env, msg.body);
          break;
      }
      msg.ack();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Treat upstream-permanent failures as terminal — don't waste 5 retries.
      const isPermanent =
        /402|credits|quota|API_KEY_SERVICE_BLOCKED|PERMISSION_DENIED|denied|not implemented|Validation|7003|content policy|safety/i.test(detail);
      const isRetriable = err instanceof PostizError ? err.retriable : !isPermanent;

      // Broadcast failure so the runner UI shows "failed" instead of "queued".
      if (msg.body.kind === "generate") {
        const g = msg.body as Extract<PublishJob, { kind: "generate" }>;
        try {
          const room = env.SCHEDULE_ROOM.get(env.SCHEDULE_ROOM.idFromName(g.userId));
          await room.fetch("https://room/broadcast", {
            method: "POST",
            body: JSON.stringify({
              kind: "node_failed",
              workflowId: g.workflowId,
              nodeId: "node_09_provider_adapter",
              promptId: g.promptId,
              error: detail.slice(0, 240),
              terminal: !isRetriable,
              at: Math.floor(Date.now() / 1000),
            }),
          });
        } catch {}

        // Mark B-roll shot as failed when this is a terminal error.
        // BUT: if the failure is a Runway-credits error on a B-roll video job,
        // auto-fallback to Veo 3.1 Fast before giving up.
        if (!isRetriable) {
          const isCreditsFailure = /credit|402|insufficient|not enough credits/i.test(detail);
          const isRunwayVideo = g.providerId === "runway";
          let fellBackToVeo = false;

          if (isRunwayVideo && isCreditsFailure && env.GEMINI_API_KEY) {
            try {
              const shot = await env.DB.prepare(
                `SELECT bs.id AS shot_id, bs.project_id, bs.still_r2_uri, bs.motion_hint,
                        bs.duration_seconds, bs.continuity_token, bp.aspect_ratio
                   FROM broll_shots bs
                   JOIN broll_projects bp ON bp.id = bs.project_id
                  WHERE bs.prompt_id = ?1`
              ).bind(g.promptId).first<any>();

              if (shot && shot.still_r2_uri) {
                const veoPromptId = crypto.randomUUID();
                await env.PUBLISH_QUEUE.send({
                  kind: "generate",
                  workflowId: g.workflowId,
                  userId: g.userId,
                  promptId: veoPromptId,
                  providerId: "google-ai-studio" as any,
                  modelId: "google-ai-studio/veo-3.1-fast-generate-preview",
                  prompt: shot.motion_hint || "subtle cinematic motion, slow drift",
                  parameters: {
                    promptImage: shot.still_r2_uri,
                    aspectRatio: shot.aspect_ratio ?? "16:9",
                    resolution: "720p",
                    duration: shot.duration_seconds === 10 ? 8 : 5,
                  },
                  preservationTokens: [shot.continuity_token].filter(Boolean),
                });
                await env.DB.prepare(
                  `UPDATE broll_shots
                     SET prompt_id = ?1,
                         last_error = 'Runway out of credits — fallback to Veo 3.1 Fast in progress',
                         updated_at = ?2
                   WHERE id = ?3`
                ).bind(veoPromptId, new Date().toISOString(), shot.shot_id).run();
                fellBackToVeo = true;
              }
            } catch {}
          }

          if (!fellBackToVeo) {
            try {
              await env.DB.prepare(
                "UPDATE broll_shots SET status = 'failed', last_error = ?1, updated_at = ?2 WHERE prompt_id = ?3"
              ).bind(detail.slice(0, 600), new Date().toISOString(), g.promptId).run();
            } catch {}
          }
        }
      }

      await db.logJob(env, {
        user_id: "user_id" in msg.body ? (msg.body as any).user_id ?? (msg.body as any).userId : "unknown",
        kind: msg.body.kind,
        status: isRetriable ? "retry" : "dead",
        attempts: msg.attempts,
        payload_json: JSON.stringify(msg.body),
        error: detail,
      });

      if (msg.body.kind === "publish") {
        // Surface the error to the schedule row immediately.
        await db.updateScheduleStatus(env, msg.body.scheduleId, {
          status: isRetriable ? "pending" : "failed",
          last_error: detail.slice(0, 1000),
        });
      }

      if (isRetriable) {
        // Exponential backoff: 30s, 60s, 120s, 240s, 480s.
        const delay = Math.min(30 * 2 ** Math.max(0, msg.attempts - 1), 600);
        msg.retry({ delaySeconds: delay });
      } else {
        msg.ack(); // permanent failure — drop, DLQ already has retries from wrangler.toml
      }
    }
  }
}

async function runPublishJob(env: Env, job: Extract<PublishJob, { kind: "publish" }>): Promise<void> {
  const sched = await db.scheduleById(env, job.userId, job.scheduleId);
  if (!sched) throw new Error(`schedule ${job.scheduleId} not found`);
  if (sched.status === "published" || sched.status === "cancelled") return; // already terminal

  const channel = await db.channelById(env, job.userId, sched.channel_id);
  if (!channel) throw new Error(`channel ${sched.channel_id} not found`);

  // Hydrate the draft payload for Postiz.
  const draftRow = sched.draft_id
    ? await env.DB.prepare("SELECT * FROM drafts WHERE id = ?1 AND user_id = ?2")
        .bind(sched.draft_id, job.userId)
        .first<{ payload_json: string }>()
    : null;
  const draft = draftRow ? JSON.parse(draftRow.payload_json) : { content: "" };

  // Build Postiz payload. Note: when 'content' contains slide separators (Instagram
  // carousel), we split into multiple `value` entries — that's Postiz's carousel
  // convention as of the 6-container reference image.
  const valueEntries =
    Array.isArray(draft.slides) && draft.slides.length > 0
      ? draft.slides.map((s: string, i: number) => ({
          content: s,
          image: draft.mediaR2Keys?.[i] ? [{ path: publicUrl(env, draft.mediaR2Keys[i]) }] : undefined,
        }))
      : [
          {
            content: draft.content ?? "",
            image: Array.isArray(draft.mediaR2Keys)
              ? draft.mediaR2Keys.map((k: string) => ({ path: publicUrl(env, k) }))
              : undefined,
          },
        ];

  const postizResp = await postiz.createPost(env, {
    type: "schedule",
    date: new Date(sched.scheduled_for * 1000).toISOString(),
    posts: [
      {
        integration: { id: channel.postiz_integration_id },
        value: valueEntries,
      },
    ],
  });

  const created = postizResp[0];
  await db.updateScheduleStatus(env, sched.id, {
    status: "scheduled",
    postiz_post_id: created?.id ?? null,
    last_error: null,
  });

  // Notify live subscribers.
  const room = env.SCHEDULE_ROOM.get(env.SCHEDULE_ROOM.idFromName(job.userId));
  await room.fetch("https://room/broadcast", {
    method: "POST",
    body: JSON.stringify({
      scheduleId: sched.id,
      status: "scheduled",
      postizPostId: created?.id ?? null,
      at: Math.floor(Date.now() / 1000),
    }),
  });
}

async function runGenerateJob(env: Env, job: Extract<PublishJob, { kind: "generate" }>): Promise<void> {
  const runId = crypto.randomUUID();
  const adapterInput: ProviderAdapterInput = {
    promptId: job.promptId,
    capability: {
      providerId: job.providerId as any,
      modelId: job.modelId,
      supportedMediaTypes: [],
      unitPriceUsd: 0,
    },
    prompt: {
      id: job.promptId,
      providerCandidates: [job.providerId as any],
      modelCandidates: [job.modelId],
      prompt: job.prompt,
      negativePrompt: job.negativePrompt,
      parameters: job.parameters,
      preservationTokens: job.preservationTokens,
    },
  };

  // ── Node 09 ──
  const adapterOut = await node09_providerAdapter(env, adapterInput, runId);
  const providerOutput: ProviderAdapterOutput = adapterOut.data;

  // ── Node 13 (Normalizer) — mirror to R2 + persist generated_asset ──
  const normalized = await node13_normalizer(env, { providerOutputs: [providerOutput] }, job.workflowId as any);

  // ── Node 14 (Quality Review) — auto-chain on every generation ──
  let reviewSummary: any = null;
  try {
    const review = await node14_review(env, {
      assets: normalized.data.assets,
      brand: {
        id: "default", name: "Acme", voice: "Premium, confident",
        palette: ["#C3A35B", "#272011"], logoAssetIds: [],
        forbiddenClaims: [], productReferences: [],
      },
    }, runId);
    reviewSummary = {
      scoreCount: review.data.scores.length,
      avgOverall: review.data.scores.length
        ? Math.round((review.data.scores.reduce((s, x) => s + x.overall, 0) / review.data.scores.length) * 100) / 100
        : null,
      failedCount: review.data.failedAssetIds.length,
    };

    // Persist scores onto the audit_events for the run.
    for (const s of review.data.scores) {
      await env.DB.prepare(
        `INSERT INTO workflow_audit_events (id, workflow_id, node_id, state, message, metadata_json, created_at)
         VALUES (?1,?2,'node_14_review','completed','asset review',?3,?4)`
      ).bind(
        crypto.randomUUID(),
        job.workflowId,
        JSON.stringify(s),
        new Date().toISOString(),
      ).run().catch(() => {});
    }
  } catch (e: any) {
    reviewSummary = { error: e?.message ?? String(e) };
  }

  // ── Fan out live status to the user's DO subscribers ──
  const room = env.SCHEDULE_ROOM.get(env.SCHEDULE_ROOM.idFromName(job.userId));
  await room.fetch("https://room/broadcast", {
    method: "POST",
    body: JSON.stringify({
      kind: "generated",
      workflowId: job.workflowId,
      promptId: job.promptId,
      assets: normalized.data.assets.map((a) => ({ id: a.id, uri: a.uri, mediaType: a.mediaType, providerId: a.providerId, modelId: a.modelId })),
      review: reviewSummary,
      spent: providerOutput.spent,
      at: Math.floor(Date.now() / 1000),
    }),
  });

  // ── Audit ledger entry ──
  await env.DB.prepare(
    `INSERT INTO workflow_audit_events (id, workflow_id, node_id, state, message, metadata_json, created_at)
     VALUES (?1,?2,'node_11_dispatcher','completed','generate job completed',?3,?4)`
  ).bind(
    crypto.randomUUID(),
    job.workflowId,
    JSON.stringify({ promptId: job.promptId, assetCount: normalized.data.assets.length, spent: providerOutput.spent }),
    new Date().toISOString(),
  ).run().catch(() => {});

  // ── B-Roll shot linkage ────────────────────────────────────────────
  // If this generate job came from a broll_shot:
  //   * still completed → record it, then auto-chain a Runway image-to-video
  //     job using the still URL as `promptImage` (when render_video is on)
  //   * video completed → mark the shot animated
  try {
    const firstAsset = normalized.data.assets[0];
    if (firstAsset) {
      const isVideo = firstAsset.mediaType === "video" || /runway/i.test(job.providerId);
      const now = new Date().toISOString();
      if (isVideo) {
        await env.DB.prepare(
          `UPDATE broll_shots
             SET status = 'animated', video_asset_id = ?1, video_r2_uri = ?2, updated_at = ?3
           WHERE prompt_id = ?4`
        ).bind(firstAsset.id, firstAsset.uri, now, job.promptId).run();
      } else {
        // Find the shot + project to decide whether to chain into video.
        const shotRow = await env.DB.prepare(
          `SELECT bs.id AS shot_id, bs.project_id, bs.continuity_token, bs.motion_hint, bs.duration_seconds,
                  bp.aspect_ratio, bp.render_video
             FROM broll_shots bs
             JOIN broll_projects bp ON bp.id = bs.project_id
            WHERE bs.prompt_id = ?1`
        ).bind(job.promptId).first<any>();

        if (shotRow && shotRow.render_video === 1) {
          // Mark still as 'animating' so the UI shows the in-progress chain,
          // and enqueue the Runway image-to-video follow-up.
          const videoPromptId = crypto.randomUUID();
          await env.DB.prepare(
            `UPDATE broll_shots
               SET status = 'animating', still_asset_id = ?1, still_r2_uri = ?2,
                   prompt_id = ?3, updated_at = ?4
             WHERE id = ?5`
          ).bind(firstAsset.id, firstAsset.uri, videoPromptId, now, shotRow.shot_id).run();

          const runwayRatio =
            shotRow.aspect_ratio === "9:16" ? "720:1280" :
            shotRow.aspect_ratio === "1:1"  ? "960:960"  :
            shotRow.aspect_ratio === "4:5"  ? "832:1104" :
            "1280:720";
          await env.PUBLISH_QUEUE.send({
            kind: "generate",
            workflowId: job.workflowId,
            userId: job.userId,
            promptId: videoPromptId,
            providerId: "runway",
            modelId: "runway/gen4_turbo",
            prompt: shotRow.motion_hint || "subtle cinematic motion, slow drift",
            parameters: {
              promptImage: firstAsset.uri,
              ratio: runwayRatio,
              duration: shotRow.duration_seconds === 10 ? 10 : 5,
            },
            preservationTokens: [shotRow.continuity_token].filter(Boolean),
          });
        } else {
          // No video step requested — still completion is terminal.
          await env.DB.prepare(
            `UPDATE broll_shots
               SET status = 'ready', still_asset_id = ?1, still_r2_uri = ?2, updated_at = ?3
             WHERE prompt_id = ?4`
          ).bind(firstAsset.id, firstAsset.uri, now, job.promptId).run();
        }
      }

      // Flip project to 'ready' when every shot reached a terminal state.
      const projRow = await env.DB.prepare(
        `SELECT bp.id, bp.user_id,
                SUM(CASE WHEN bs.status IN ('ready','animated') THEN 0 ELSE 1 END) AS pending
           FROM broll_projects bp
           JOIN broll_shots bs ON bs.project_id = bp.id
          WHERE bp.id = (SELECT project_id FROM broll_shots
                          WHERE prompt_id = ?1 OR still_asset_id = ?2 OR video_asset_id = ?2
                          LIMIT 1)
          GROUP BY bp.id`
      ).bind(job.promptId, firstAsset.id).first<{ id: string; pending: number }>();
      if (projRow && projRow.pending === 0) {
        await env.DB.prepare(
          "UPDATE broll_projects SET status = 'ready', updated_at = ?1 WHERE id = ?2"
        ).bind(now, projRow.id).run();
      }
    }
  } catch {
    // B-roll linkage is best-effort; never block normal workflow output.
  }
}

async function runIngestJob(env: Env, job: Extract<PublishJob, { kind: "ingest_media" }>): Promise<void> {
  // Pull a remote source (e.g. Veo3 signed URL) into R2 before it expires.
  // Caller has already created the media row with public_url set; we just
  // populate it now.
  const row = await env.DB.prepare("SELECT * FROM media WHERE id = ?1 AND user_id = ?2")
    .bind(job.mediaId, job.userId)
    .first<{ id: string; r2_key: string }>();
  if (!row) throw new Error(`media ${job.mediaId} not found`);

  const { bytes, mime } = await ingestRemoteIntoR2(env, job.sourceUrl, row.r2_key);
  await env.DB.prepare("UPDATE media SET bytes = ?1, mime = ?2 WHERE id = ?3")
    .bind(bytes, mime, row.id)
    .run();
}
