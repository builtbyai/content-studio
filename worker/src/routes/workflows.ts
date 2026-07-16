// /api/workflows/* routes — implements the API surface from spec §11.
// Most handlers are thin wrappers around the governance helper or stubs
// that delegate into the nodes/ modules.
//
// Mount in worker/src/index.ts with: app.route("/api/workflows", workflowsRoutes)

import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { requireUser } from "../auth";
import { governance } from "../nodes/governance";
import {
  node01_briefIntake, node02_brandResolver, node03_assetRegistry,
  node04_platformMapper, node05_conceptGeneration, node06_filmPlanner,
  node07_promptBuilder, node08_capabilityResolver, node10_costGovernor,
  node11_dispatcher, node14_review, node16_exportPackage,
  type GeneratedAsset, type Concept, type ConceptGenerationInput,
  type CreativeBriefIntakeInput, type PromptSpec, type ProviderCapability,
} from "../nodes/creative";
import type {
  BudgetEnvelope, CompliancePolicy, CostEstimate, ProviderPolicy, UUID, WorkflowMode,
} from "../types/workflows";

const r = new Hono<HonoEnv>();

r.use("*", requireUser);

// POST /api/workflows
r.post("/", async (c) => {
  const body = await c.req.json<{
    mode?: WorkflowMode;
    tenantId?: UUID;
    budget?: Partial<BudgetEnvelope>;
    providerPolicy?: Partial<ProviderPolicy>;
    compliancePolicy?: Partial<CompliancePolicy>;
    timezone?: string;
  }>();
  const wf = await governance.createWorkflow(c.env, {
    tenantId: body.tenantId ?? c.var.user!.id, // single-tenant default
    userId: c.var.user!.id,
    mode: body.mode ?? "draft",
    timezone: body.timezone,
    budget: body.budget,
    providerPolicy: body.providerPolicy,
    compliancePolicy: body.compliancePolicy,
  });
  return c.json({ workflowId: wf.workflowId, status: "idle" });
});

// GET /api/workflows/:id
r.get("/:id", async (c) => {
  const wf = await governance.getWorkflow(c.env, c.req.param("id"));
  if (!wf) return c.json({ error: "not found" }, 404);
  if (wf.userId !== c.var.user!.id) return c.json({ error: "forbidden" }, 403);
  const nodes = await governance.listNodes(c.env, wf.workflowId);
  return c.json({ ...wf, nodes });
});

// POST /api/workflows/:id/estimate — Node 10 Cost Governor.
r.post("/:id/estimate", async (c) => {
  const id = c.req.param("id")!;
  const wf = await governance.getWorkflow(c.env, id);
  if (!wf || wf.userId !== c.var.user!.id) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ estimates?: CostEstimate[]; budgetUsd?: number }>();
  const estimates = body.estimates ?? [];
  const budgetUsd = body.budgetUsd ?? wf.budget.maxTotalCostUsd;

  const runId = crypto.randomUUID();
  await governance.recordNodeStart(c.env, {
    workflowId: id, nodeId: "node_10_cost_governor", runId,
    inputHash: await sha256Hex(JSON.stringify({ estimates, budgetUsd })),
    parentNodeIds: [], childNodeIds: [],
  });
  const out = await node10_costGovernor({ estimates, budgetUsd }, runId);
  await governance.recordNodeFinish(c.env, {
    workflowId: id, runId, state: out.status,
    outputHash: await sha256Hex(JSON.stringify(out.data)),
  });
  return c.json(out);
});

// POST /api/workflows/:id/execute — drives Phase 1 Creative Core happy path:
//   Node 01 (Brief Intake) → Node 05 (Concept Generation) → ledger.
// Returns the concepts inline; the caller can then call Node 11 dispatcher
// (still stub) to fan-out generation jobs.
r.post("/:id/execute", async (c) => {
  const id = c.req.param("id")!;
  const wf = await governance.getWorkflow(c.env, id);
  if (!wf || wf.userId !== c.var.user!.id) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{
    brief: CreativeBriefIntakeInput;
    conceptCount?: number;
  }>();
  if (!body?.brief?.rawBrief) return c.json({ error: "body.brief.rawBrief required" }, 400);

  // ─ Node 01 ─
  const runId01 = crypto.randomUUID();
  await governance.recordNodeStart(c.env, {
    workflowId: id, nodeId: "node_01_brief_intake", runId: runId01,
    inputHash: await sha256Hex(JSON.stringify(body.brief)),
    parentNodeIds: [], childNodeIds: ["node_05_concept_generation"],
  });
  const briefOut = await node01_briefIntake(c.env, body.brief, runId01);
  await governance.recordNodeFinish(c.env, {
    workflowId: id, runId: runId01, state: briefOut.status,
    outputHash: await sha256Hex(JSON.stringify(briefOut.data)),
  });

  if (briefOut.status === "failed_terminal") {
    return c.json({ workflowId: id, brief: briefOut, concepts: null }, 422);
  }

  // ─ Node 05 ─
  const platforms = body.brief.targetPlatforms ?? [
    { platform: "linkedin",  aspectRatio: "1:1" },
    { platform: "instagram", aspectRatio: "9:16" },
    { platform: "tiktok",    aspectRatio: "9:16" },
  ];
  const conceptInput: ConceptGenerationInput = {
    normalizedBrief: briefOut.data.normalizedText,
    brand: wf.brandProfile ?? {
      id: "default", name: "Default", voice: "Premium, confident",
      palette: ["#C3A35B", "#272011"], logoAssetIds: [],
      forbiddenClaims: [], productReferences: [],
    },
    platforms,
    conceptCount: body.conceptCount ?? 3,
  };
  const runId05 = crypto.randomUUID();
  await governance.recordNodeStart(c.env, {
    workflowId: id, nodeId: "node_05_concept_generation", runId: runId05,
    inputHash: await sha256Hex(JSON.stringify(conceptInput)),
    parentNodeIds: ["node_01_brief_intake"], childNodeIds: ["node_07_prompt_builder"],
  });
  const conceptOut = await node05_conceptGeneration(c.env, conceptInput, runId05);
  await governance.recordNodeFinish(c.env, {
    workflowId: id, runId: runId05, state: conceptOut.status,
    outputHash: await sha256Hex(JSON.stringify(conceptOut.data)),
  });

  return c.json({
    workflowId: id,
    brief: briefOut,
    concepts: conceptOut,
  });
});

// POST /api/workflows/:id/dispatch — drives Node 07 (Prompt Builder) over the
// supplied concepts, then Node 11 (Dispatcher) which enqueues generate-jobs.
// The queue consumer drives Node 09 (Provider Adapter) → Node 13 (Normalizer)
// → generated_assets row + SSE broadcast.
r.post("/:id/dispatch", async (c) => {
  const id = c.req.param("id")!;
  const wf = await governance.getWorkflow(c.env, id);
  if (!wf || wf.userId !== c.var.user!.id) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{ concepts: Concept[]; durationSec?: number }>();
  if (!Array.isArray(body.concepts) || body.concepts.length === 0) {
    return c.json({ error: "concepts[] required" }, 400);
  }

  const allDispatched: string[] = [];
  const allPrompts: PromptSpec[] = [];

  for (const concept of body.concepts) {
    // ── Node 07 ──
    const runId07 = crypto.randomUUID();
    await governance.recordNodeStart(c.env, {
      workflowId: id, nodeId: "node_07_prompt_builder", runId: runId07,
      inputHash: await sha256Hex(JSON.stringify(concept)),
      parentNodeIds: ["node_05_concept_generation"], childNodeIds: ["node_11_dispatcher"],
    });
    const promptsOut = await node07_promptBuilder(c.env, {
      concept,
      brand: wf.brandProfile ?? {
        id: "default", name: "Acme", voice: "Premium, confident",
        palette: ["#C3A35B", "#272011"], logoAssetIds: [],
        forbiddenClaims: [], productReferences: [],
      },
    }, runId07);
    await governance.recordNodeFinish(c.env, {
      workflowId: id, runId: runId07, state: promptsOut.status,
      outputHash: await sha256Hex(JSON.stringify(promptsOut.data)),
    });
    allPrompts.push(...promptsOut.data.prompts);

    // ── Node 11 ──
    const runId11 = crypto.randomUUID();
    const jobs = promptsOut.data.prompts.map((p) => {
      const cap: ProviderCapability = {
        providerId: (p.providerCandidates[0] ?? "openai") as any,
        modelId: p.modelCandidates[0] ?? "openai/gpt-image-2",
        supportedMediaTypes: [],
        unitPriceUsd: 0,
      };
      return { promptId: p.id, capability: cap, prompt: p };
    });
    await governance.recordNodeStart(c.env, {
      workflowId: id, nodeId: "node_11_dispatcher", runId: runId11,
      inputHash: await sha256Hex(JSON.stringify(jobs.map((j) => j.promptId))),
      parentNodeIds: ["node_07_prompt_builder"], childNodeIds: ["node_09_provider_adapter"],
    });
    const disp = await node11_dispatcher(c.env, {
      jobs,
      workflowId: id as any,
      userId: c.var.user!.id as any,
      parallelism: wf.providerPolicy.parallelism,
    }, runId11);
    await governance.recordNodeFinish(c.env, {
      workflowId: id, runId: runId11, state: disp.status,
      outputHash: await sha256Hex(JSON.stringify(disp.data)),
    });
    allDispatched.push(...disp.data.dispatchedJobIds);
  }

  return c.json({
    workflowId: id,
    promptCount: allPrompts.length,
    dispatchedJobIds: allDispatched,
    note: "Jobs are running asynchronously. Subscribe to /api/events/stream for live results.",
  }, 202);
});

// POST /api/workflows/run-full — single-call orchestration.
// Creates a workflow, runs Phase 1 chain end-to-end:
//   01 Brief Intake → 02 Brand → 03 Assets → 04 Platforms → 05 Concepts
//   → 07 Prompt Builder → 08 Capability Resolver → 10 Cost Governor
//   → 11 Parallel Dispatcher (enqueue jobs)
// Returns the workflowId so the caller can poll /api/workflows/:id and
// /api/workflows/:id/assets for the streaming results.
r.post("/run-full", async (c) => {
  const body = await c.req.json<{
    brief: CreativeBriefIntakeInput;
    conceptCount?: number;
    budgetUsd?: number;
  }>();
  if (!body?.brief?.rawBrief) return c.json({ error: "brief.rawBrief required" }, 400);

  const wf = await governance.createWorkflow(c.env, {
    tenantId: c.var.user!.id as any,
    userId: c.var.user!.id as any,
    mode: "execute",
    budget: { maxTotalCostUsd: body.budgetUsd ?? 5 } as any,
  });
  const workflowId = wf.workflowId;

  const runNode = async <T,>(
    nodeId: string,
    parents: string[],
    children: string[],
    impl: (runId: any) => Promise<{ data: T; status: string }>,
    inputHashSrc: unknown
  ) => {
    const runId = crypto.randomUUID();
    await governance.recordNodeStart(c.env, {
      workflowId, nodeId, runId, inputHash: await sha256Hex(JSON.stringify(inputHashSrc)),
      parentNodeIds: parents, childNodeIds: children,
    });
    const r = await impl(runId);
    await governance.recordNodeFinish(c.env, {
      workflowId, runId, state: r.status as any,
      outputHash: await sha256Hex(JSON.stringify(r.data)),
    });
    return r.data;
  };

  // ── Node 01 ──
  const brief01 = await runNode("node_01_brief_intake", [], ["node_02_brand_resolver", "node_04_platform_mapper"],
    (rid) => node01_briefIntake(c.env, body.brief, rid),
    body.brief);
  if (brief01.readinessScore < 0.3) {
    return c.json({ workflowId, brief: brief01, blocked: "low readiness" }, 422);
  }

  // ── Node 02 ──
  const brand02 = await runNode("node_02_brand_resolver", ["node_01_brief_intake"], ["node_07_prompt_builder"],
    (rid) => node02_brandResolver(c.env, { tenantId: c.var.user!.id as any, briefText: brief01.normalizedText }, rid),
    brief01);

  // ── Node 03 ──
  const assets03 = await runNode("node_03_asset_registry", ["node_02_brand_resolver"], ["node_07_prompt_builder"],
    (rid) => node03_assetRegistry(c.env, { uploadedAssetIds: body.brief.uploadedAssetIds ?? [], brand: brand02.brand }, rid),
    { brand: brand02.brand.name, assets: body.brief.uploadedAssetIds });

  // ── Node 04 ──
  const platforms = body.brief.targetPlatforms ?? [
    { platform: "linkedin",  aspectRatio: "1:1" },
    { platform: "instagram", aspectRatio: "9:16" },
  ];
  const platform04 = await runNode("node_04_platform_mapper", ["node_01_brief_intake"], ["node_05_concept_generation"],
    (rid) => node04_platformMapper({ desiredOutputs: (body.brief.desiredOutputs ?? ["image"]) as any, targetPlatforms: platforms as any }, rid),
    platforms);

  // ── Node 05 ──
  const concepts05 = await runNode("node_05_concept_generation", ["node_04_platform_mapper", "node_02_brand_resolver"], ["node_07_prompt_builder"],
    (rid) => node05_conceptGeneration(c.env, {
      normalizedBrief: brief01.normalizedText,
      brand: brand02.brand,
      platforms: platform04.platforms,
      conceptCount: body.conceptCount ?? 2,
    }, rid),
    brief01.normalizedText);

  if (concepts05.concepts.length === 0) {
    return c.json({ workflowId, brief: brief01, concepts: [], blocked: "no concepts produced" }, 422);
  }

  // ── Nodes 07 + 08 + 10 + 11 per concept ──
  const dispatched: string[] = [];
  const allPrompts: PromptSpec[] = [];
  for (const concept of concepts05.concepts) {
    const prompts07 = await runNode("node_07_prompt_builder", ["node_05_concept_generation"], ["node_08_capability_resolver"],
      (rid) => node07_promptBuilder(c.env, { concept, brand: brand02.brand }, rid),
      concept);

    if (prompts07.prompts.length === 0) continue;
    allPrompts.push(...prompts07.prompts);

    const caps08 = await runNode("node_08_capability_resolver", ["node_07_prompt_builder"], ["node_10_cost_governor", "node_11_dispatcher"],
      (rid) => node08_capabilityResolver(c.env, { prompts: prompts07.prompts }, rid),
      prompts07.prompts.map((p) => p.id));

    // Build estimates for cost governor from capability unit prices.
    const estimates = caps08.resolved.flatMap((r) => r.viable.slice(0, 1).map((cap) => ({
      providerId: cap.providerId,
      modelId: cap.modelId,
      mediaType: "image" as any,
      quantity: 1,
      estimatedCostUsd: cap.unitPriceUsd,
      confidence: 0.85,
      promptId: r.promptId,
    } as any)));
    const cost10 = await runNode("node_10_cost_governor", ["node_08_capability_resolver"], ["node_11_dispatcher"],
      (rid) => node10_costGovernor({ estimates, budgetUsd: body.budgetUsd ?? 5 }, rid),
      estimates);

    // Only dispatch approved prompts.
    const jobs = caps08.resolved
      .filter((r) => cost10.approvedPromptIds.includes(r.promptId))
      .map((r) => {
        const prompt = prompts07.prompts.find((p) => p.id === r.promptId)!;
        const cap = r.viable[0]; // top-ranked
        return { promptId: r.promptId, capability: cap, prompt };
      })
      .filter((j) => j.capability && j.prompt);

    const disp11 = await runNode("node_11_dispatcher", ["node_10_cost_governor"], ["node_09_provider_adapter"],
      (rid) => node11_dispatcher(c.env, {
        jobs, workflowId: workflowId as any, userId: c.var.user!.id as any,
        parallelism: wf.providerPolicy.parallelism,
      }, rid),
      jobs.map((j) => j.promptId));
    dispatched.push(...disp11.dispatchedJobIds);
  }

  return c.json({
    workflowId,
    brief: brief01,
    brand: brand02.brand,
    conceptCount: concepts05.concepts.length,
    promptCount: allPrompts.length,
    dispatchedJobIds: dispatched,
    note: "Phase 1 chain complete; generate jobs running async. Subscribe to /api/events/stream for live results.",
  }, 202);
});

// POST /api/workflows/:id/export — drives Node 16. Bundles approved assets into
// an R2-hosted manifest + per-platform HTML catalog pages.
r.post("/:id/export", async (c) => {
  const id = c.req.param("id")!;
  const wf = await governance.getWorkflow(c.env, id);
  if (!wf || wf.userId !== c.var.user!.id) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{ platforms?: string[] }>().catch(() => ({} as any));
  const platforms = body.platforms ?? ["linkedin", "instagram", "tiktok"];

  // Pull approved assets from D1.
  const rs = await c.env.DB.prepare(
    "SELECT * FROM generated_assets WHERE workflow_id = ?1 ORDER BY created_at DESC"
  ).bind(id).all<any>();
  const approvedAssets: GeneratedAsset[] = (rs.results ?? []).map((row: any) => ({
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    mediaType: row.media_type,
    uri: row.uri,
    checksum: row.checksum,
    promptId: row.prompt_id,
    metadata: (() => { try { return JSON.parse(row.metadata_json); } catch { return {}; } })(),
  }));

  if (approvedAssets.length === 0) return c.json({ error: "no assets to export" }, 422);

  const renderTargets = platforms.flatMap((p: string) => [
    { platform: p, aspectRatio: p === "linkedin" ? "1:1" : p === "tiktok" ? "9:16" : "1:1", mediaType: "image" as const },
  ]);

  const runId = crypto.randomUUID();
  await governance.recordNodeStart(c.env, {
    workflowId: id, nodeId: "node_16_export_package", runId,
    inputHash: await sha256Hex(JSON.stringify(approvedAssets.map((a) => a.id))),
    parentNodeIds: ["node_13_normalizer"], childNodeIds: [],
  });
  const out = await node16_exportPackage(c.env, {
    workflowId: id as any,
    approvedAssets,
    renderTargets,
  }, runId);
  await governance.recordNodeFinish(c.env, {
    workflowId: id, runId, state: out.status,
    outputHash: await sha256Hex(JSON.stringify(out.data)),
  });
  return c.json(out.data);
});

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// GET /api/workflows/:id/assets
r.get("/:id/assets", async (c) => {
  const id = c.req.param("id");
  const wf = await governance.getWorkflow(c.env, id);
  if (!wf || wf.userId !== c.var.user!.id) return c.json({ error: "not found" }, 404);
  const rs = await c.env.DB.prepare(
    "SELECT * FROM generated_assets WHERE workflow_id = ?1 ORDER BY created_at DESC"
  ).bind(id).all<any>();
  return c.json({ assets: rs.results ?? [] });
});

// POST /api/workflows/:id/review/:assetId/decision
r.post("/:id/review/:assetId/decision", async (c) => {
  const body = await c.req.json<{ action: "accept" | "reject" | "regenerate" | "human_review"; notes?: string }>();
  await governance.audit(c.env, {
    workflowId: c.req.param("id"),
    nodeId: "node_15_regeneration",
    state: body.action === "accept" ? "completed" : "review_required",
    message: `review decision: ${body.action}`,
    metadata: { assetId: c.req.param("assetId"), notes: body.notes },
  });
  return c.json({ ok: true, recorded: body.action });
});

// GET /api/workflows/:id/audit  (helper — not in spec but obviously useful)
r.get("/:id/audit", async (c) => {
  const id = c.req.param("id");
  const wf = await governance.getWorkflow(c.env, id);
  if (!wf || wf.userId !== c.var.user!.id) return c.json({ error: "not found" }, 404);
  const events = await governance.listAuditEvents(c.env, id, 500);
  return c.json({ events });
});

export const workflowsRoutes = r;
