// /api/prospects/* and /api/outreach/* routes — spec §11 (sales engine).
// All compliance-gated. Calls real handlers from nodes/sales.ts.

import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { requireUser } from "../auth";
import {
  node19_prospects, node20_enrich, node21_discoveryForm, node22_outreachCopy,
  node23_sendQueue, node24_followUps, node25_leadTemp,
  type ProspectCompany,
} from "../nodes/sales";
import { DEFAULT_COMPLIANCE_POLICY } from "../types/workflows";

const r = new Hono<HonoEnv>();
r.use("*", requireUser);

// POST /api/prospects/discover — Node 19
r.post("/prospects/discover", async (c) => {
  const body = await c.req.json<{ idealCustomerProfile: string; geography?: string; industry?: string; maxResults?: number }>();
  if (!body.idealCustomerProfile) return c.json({ error: "idealCustomerProfile required" }, 400);
  const runId = crypto.randomUUID();
  const out = await node19_prospects(c.env, { ...body, compliance: DEFAULT_COMPLIANCE_POLICY }, runId);
  return c.json(out);
});

// POST /api/prospects/:id/enrich — Node 20
r.post("/prospects/:id/enrich", async (c) => {
  const id = c.req.param("id")!;
  const runId = crypto.randomUUID();
  const out = await node20_enrich(c.env, { prospectId: id as any, compliance: DEFAULT_COMPLIANCE_POLICY }, runId);
  return c.json(out);
});

// GET /api/prospects — list all prospects
r.get("/prospects", async (c) => {
  const rs = await c.env.DB.prepare(
    "SELECT * FROM prospects ORDER BY fit_score DESC, created_at DESC LIMIT 100"
  ).all<any>();
  return c.json({ prospects: rs.results ?? [] });
});

// POST /api/outreach/draft — Node 22
r.post("/outreach/draft", async (c) => {
  const body = await c.req.json<{ prospect: ProspectCompany; channel: "email" | "linkedin" | "form"; offerSummary: string; brandVoice?: string }>();
  if (!body.prospect || !body.channel || !body.offerSummary) return c.json({ error: "prospect, channel, offerSummary required" }, 400);
  const runId = crypto.randomUUID();
  const out = await node22_outreachCopy(c.env, {
    prospect: body.prospect,
    channel: body.channel,
    offerSummary: body.offerSummary,
    brandVoice: body.brandVoice ?? "Premium, confident, no-fluff",
  }, runId);
  return c.json(out);
});

// POST /api/outreach/:draftId/approve — Node 23
r.post("/outreach/:draftId/approve", async (c) => {
  const draftId = c.req.param("draftId")!;
  const body = await c.req.json<{ scheduledFor?: string }>().catch(() => ({} as any));
  const runId = crypto.randomUUID();
  const out = await node23_sendQueue(c.env, {
    draftId: draftId as any,
    approvedBy: c.var.user!.id as any,
    scheduledFor: body.scheduledFor,
    compliance: DEFAULT_COMPLIANCE_POLICY,
  }, runId);
  return c.json(out);
});

// POST /api/outreach/:conversationId/follow-up-plan — Node 24
r.post("/outreach/:conversationId/follow-up-plan", async (c) => {
  const conversationId = c.req.param("conversationId")!;
  const body = await c.req.json<{ lastInboundAt?: string; cadenceDays?: number[]; maxFollowUps?: number }>().catch(() => ({} as any));
  const runId = crypto.randomUUID();
  const out = await node24_followUps(c.env, {
    conversationId: conversationId as any,
    lastInboundAt: body.lastInboundAt,
    cadenceDays: body.cadenceDays ?? [3, 7, 14],
    maxFollowUps: body.maxFollowUps ?? 3,
  }, runId);
  return c.json(out);
});

// POST /api/outreach/lead-temperature — Node 25
r.post("/outreach/lead-temperature", async (c) => {
  const body = await c.req.json<{ messages: Array<{ role: "us" | "lead"; body: string; at: string }> }>();
  const runId = crypto.randomUUID();
  const out = await node25_leadTemp(c.env, body, runId);
  return c.json(out);
});

// POST /api/crm/forms/create — Node 21
r.post("/crm/forms/create", async (c) => {
  const body = await c.req.json<{ prospectId: string; purposeStatement: string; askedQuestions: string[] }>();
  if (!body.prospectId || !body.purposeStatement) return c.json({ error: "prospectId + purposeStatement required" }, 400);
  const runId = crypto.randomUUID();
  const out = await node21_discoveryForm(c.env, {
    prospectId: body.prospectId as any,
    purposeStatement: body.purposeStatement,
    askedQuestions: body.askedQuestions ?? [],
    compliance: DEFAULT_COMPLIANCE_POLICY,
  }, runId);
  return c.json(out);
});

export const salesRoutes = r;
