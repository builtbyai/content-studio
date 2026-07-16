import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { requireUser } from "../auth";
import { node17_seo, node18_competitor } from "../nodes/research";

const r = new Hono<HonoEnv>();
r.use("*", requireUser);

// POST /api/research/seo — Node 17
r.post("/seo", async (c) => {
  const body = await c.req.json<{ seedKeywords: string[]; market?: string; intent?: string }>();
  if (!Array.isArray(body.seedKeywords) || body.seedKeywords.length === 0) {
    return c.json({ error: "seedKeywords[] required" }, 400);
  }
  const runId = crypto.randomUUID();
  const out = await node17_seo(c.env, {
    seedKeywords: body.seedKeywords,
    market: body.market ?? "us-en",
    intent: body.intent as any,
  }, runId);
  return c.json(out);
});

// POST /api/research/competitor — Node 18 with depth + persistence
r.post("/competitor", async (c) => {
  const body = await c.req.json<{
    competitorDomains: string[]; ourValueProps: string[];
    depth?: "brief" | "standard" | "deep" | "max";
    fetchContent?: boolean;
  }>();
  if (!Array.isArray(body.competitorDomains) || body.competitorDomains.length === 0) {
    return c.json({ error: "competitorDomains[] required" }, 400);
  }

  // Optionally fetch each competitor URL so the analysis works from real content.
  let domainContent: Record<string, string> | undefined;
  if (body.fetchContent !== false) {
    domainContent = {};
    for (const d of body.competitorDomains) {
      try {
        const url = d.startsWith("http") ? d : `https://${d}`;
        const res = await fetch(url, { headers: { "user-agent": "contentforge-intel/1.0" } });
        if (res.ok) {
          const html = await res.text();
          // Strip tags inline for cheaper LLM context
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          domainContent[d] = text.slice(0, 3000);
        }
      } catch {}
    }
  }

  const runId = crypto.randomUUID();
  const out = await node18_competitor(c.env, {
    competitorDomains: body.competitorDomains,
    ourValueProps: body.ourValueProps ?? [],
    depth: body.depth,
    domainContent,
  }, runId);

  // Persist the report so it can be re-read later
  try {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO competitor_reports (id, user_id, competitor_domains_json, our_value_props_json, depth, report_json, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(
      id, c.var.user!.id,
      JSON.stringify(body.competitorDomains),
      JSON.stringify(body.ourValueProps ?? []),
      body.depth ?? "standard",
      JSON.stringify(out.data),
      new Date().toISOString(),
    ).run();
  } catch {}

  return c.json(out);
});

// GET /api/research/competitor/reports — list saved reports
r.get("/competitor/reports", async (c) => {
  const rs = await c.env.DB.prepare(
    "SELECT id, competitor_domains_json, our_value_props_json, depth, created_at FROM competitor_reports WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50"
  ).bind(c.var.user!.id).all<any>();
  return c.json({ reports: rs.results ?? [] });
});

// GET /api/research/competitor/reports/:id — load a saved report
r.get("/competitor/reports/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT * FROM competitor_reports WHERE id = ?1 AND user_id = ?2"
  ).bind(c.req.param("id"), c.var.user!.id).first<any>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ report: row });
});

export const researchRoutes = r;
