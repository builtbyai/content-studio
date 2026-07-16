// Content domain: articles, battlecards, sources, manual paste, RSS ingest.
// One module so the cron + routes + D1 helpers share types.

import type { Env } from "./env";
import { generateContent as ai } from "./gemini-helper";

// ── Types ──────────────────────────────────────────────────────────────
export type ContentSourceKind = "rss" | "reddit" | "sitemap" | "manual" | "competitor";

export interface ContentSourceRow {
  id: string;
  tenant_id: string;
  kind: ContentSourceKind;
  url: string;
  label: string;
  category: string;
  badge: string;
  is_active: number;
  fail_count: number;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleRow {
  id: string;
  tenant_id: string;
  url_sha256: string;
  source_id: string | null;
  source_url: string | null;
  title: string;
  slug: string;
  category: string;
  badge: string;
  read_time: string | null;
  seo_title: string;
  description: string;
  hero_angle: string | null;
  highlights_json: string;
  content: string;
  cta_text: string | null;
  hero_media_id: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface BattlecardRow {
  id: string;
  tenant_id: string;
  source_id: string | null;
  category: string;
  objection: string;
  counter_wedge: string;
  discovery_questions_json: string;
  one_liner: string;
  metrics_json: string;
  competitor_domain: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────
const MAX_FAIL_BEFORE_MUTE = 5;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}

function nowIso(): string { return new Date().toISOString(); }

function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Strip common tracking params
    for (const p of [...u.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$|^ref$|^source$/i.test(p)) u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

// ── Sources CRUD ───────────────────────────────────────────────────────
export const sourcesDb = {
  async list(env: Env, tenantId: string): Promise<ContentSourceRow[]> {
    const rs = await env.DB.prepare(
      "SELECT * FROM content_sources WHERE tenant_id = ?1 ORDER BY label"
    ).bind(tenantId).all<ContentSourceRow>();
    return rs.results ?? [];
  },
  async create(env: Env, tenantId: string, input: Partial<ContentSourceRow> & { url: string; label: string }): Promise<ContentSourceRow> {
    const id = crypto.randomUUID();
    const now = nowIso();
    const row: ContentSourceRow = {
      id, tenant_id: tenantId,
      kind: (input.kind as ContentSourceKind) ?? "rss",
      url: input.url,
      label: input.label,
      category: input.category ?? "general",
      badge: input.badge ?? "Article",
      is_active: input.is_active ?? 1,
      fail_count: 0,
      last_run_at: null, last_error: null,
      created_at: now, updated_at: now,
    };
    await env.DB.prepare(
      `INSERT INTO content_sources
         (id,tenant_id,kind,url,label,category,badge,is_active,fail_count,last_run_at,last_error,created_at,updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,NULL,NULL,?9,?9)`
    ).bind(row.id, row.tenant_id, row.kind, row.url, row.label, row.category, row.badge, row.is_active, now).run();
    return row;
  },
  async update(env: Env, tenantId: string, id: string, patch: Partial<ContentSourceRow>): Promise<void> {
    const fields: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const k of ["label", "category", "badge", "is_active", "url", "kind"] as const) {
      if (k in patch) { fields.push(`${k} = ?${i++}`); vals.push((patch as any)[k]); }
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = ?${i++}`);
    vals.push(nowIso());
    vals.push(id, tenantId);
    await env.DB.prepare(
      `UPDATE content_sources SET ${fields.join(", ")} WHERE id = ?${i++} AND tenant_id = ?${i}`
    ).bind(...vals).run();
  },
  async delete(env: Env, tenantId: string, id: string): Promise<void> {
    await env.DB.prepare("DELETE FROM content_sources WHERE id = ?1 AND tenant_id = ?2").bind(id, tenantId).run();
  },
  async recordSuccess(env: Env, id: string): Promise<void> {
    await env.DB.prepare(
      "UPDATE content_sources SET fail_count = 0, last_run_at = ?1, last_error = NULL, updated_at = ?1 WHERE id = ?2"
    ).bind(nowIso(), id).run();
  },
  async recordFailure(env: Env, id: string, err: string): Promise<void> {
    const now = nowIso();
    await env.DB.prepare(
      `UPDATE content_sources SET fail_count = fail_count + 1, last_run_at = ?1, last_error = ?2, updated_at = ?1,
         is_active = CASE WHEN fail_count + 1 >= ?3 THEN 0 ELSE is_active END
       WHERE id = ?4`
    ).bind(now, err.slice(0, 500), MAX_FAIL_BEFORE_MUTE, id).run();
  },
};

// ── Articles CRUD + ingest ─────────────────────────────────────────────
export const articlesDb = {
  async list(env: Env, tenantId: string, limit = 100, offset = 0): Promise<ArticleRow[]> {
    const rs = await env.DB.prepare(
      "SELECT * FROM articles WHERE tenant_id = ?1 AND is_archived = 0 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3"
    ).bind(tenantId, limit, offset).all<ArticleRow>();
    return rs.results ?? [];
  },
  async byId(env: Env, tenantId: string, id: string): Promise<ArticleRow | null> {
    return env.DB.prepare("SELECT * FROM articles WHERE id = ?1 AND tenant_id = ?2").bind(id, tenantId).first<ArticleRow>();
  },
  async upsert(env: Env, tenantId: string, input: Partial<ArticleRow> & { title: string; content: string; source_url?: string }): Promise<ArticleRow> {
    const now = nowIso();
    const url = input.source_url ?? `urn:contentforge:${tenantId}:${slugify(input.title)}:${crypto.randomUUID()}`;
    const hash = await sha256Hex(canonicalUrl(url));
    const existing = await env.DB.prepare("SELECT * FROM articles WHERE url_sha256 = ?1 AND tenant_id = ?2").bind(hash, tenantId).first<ArticleRow>();
    if (existing) {
      // Update content if changed
      await env.DB.prepare(
        `UPDATE articles SET title=?1, description=?2, content=?3, highlights_json=?4, updated_at=?5 WHERE id=?6`
      ).bind(input.title, input.description ?? existing.description, input.content,
             input.highlights_json ?? existing.highlights_json, now, existing.id).run();
      return { ...existing, title: input.title, content: input.content, updated_at: now };
    }
    const id = input.id ?? crypto.randomUUID();
    const row: ArticleRow = {
      id, tenant_id: tenantId,
      url_sha256: hash,
      source_id: input.source_id ?? null,
      source_url: url,
      title: input.title,
      slug: input.slug ?? slugify(input.title),
      category: input.category ?? "general",
      badge: input.badge ?? "Article",
      read_time: input.read_time ?? null,
      seo_title: input.seo_title ?? input.title,
      description: input.description ?? input.content.slice(0, 200),
      hero_angle: input.hero_angle ?? null,
      highlights_json: input.highlights_json ?? "[]",
      content: input.content,
      cta_text: input.cta_text ?? null,
      hero_media_id: input.hero_media_id ?? null,
      is_archived: 0,
      created_at: now, updated_at: now,
    };
    await env.DB.prepare(
      `INSERT INTO articles
        (id,tenant_id,url_sha256,source_id,source_url,title,slug,category,badge,read_time,seo_title,description,hero_angle,highlights_json,content,cta_text,hero_media_id,is_archived,created_at,updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,0,?18,?18)`
    ).bind(
      row.id, row.tenant_id, row.url_sha256, row.source_id, row.source_url,
      row.title, row.slug, row.category, row.badge, row.read_time,
      row.seo_title, row.description, row.hero_angle, row.highlights_json,
      row.content, row.cta_text, row.hero_media_id, now
    ).run();
    return row;
  },
  async archive(env: Env, tenantId: string, id: string): Promise<void> {
    await env.DB.prepare("UPDATE articles SET is_archived=1, updated_at=?1 WHERE id=?2 AND tenant_id=?3")
      .bind(nowIso(), id, tenantId).run();
  },

  /** URL → Gemini normalisation → upsert. Used by manual paste + RSS items. */
  async ingestFromUrl(env: Env, tenantId: string, srcUrl: string, sourceId: string | null, opts?: { category?: string; badge?: string }): Promise<ArticleRow> {
    const url = canonicalUrl(srcUrl);
    // Fetch raw HTML/text
    const res = await fetch(url, { headers: { "user-agent": "contentforge/1.0 (+example.com)" } });
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const html = await res.text();
    const stripped = stripHtml(html).slice(0, 12000);

    // Ask Gemini to extract structured article fields.
    const prompt = `You are normalising a webpage into a JSON article record.

URL: ${url}
Raw text (truncated):
${stripped}

Return strict JSON with this shape:
{
  "title": "concise, faithful to the page",
  "description": "1-2 sentence summary",
  "category": "single word category",
  "badge": "Article" | "Guide" | "Review",
  "readTime": "X min read",
  "seoTitle": "SEO-friendly title",
  "heroAngle": "the most compelling angle",
  "highlights": ["3-5 key bullet points"],
  "content": "the full body content as prose, cleaned",
  "ctaText": "what action the reader should take next"
}`;

    const aiResp = await ai(env, prompt);

    return articlesDb.upsert(env, tenantId, {
      source_id: sourceId,
      source_url: url,
      title: aiResp.title,
      description: aiResp.description,
      category: opts?.category ?? aiResp.category ?? "general",
      badge: opts?.badge ?? aiResp.badge ?? "Article",
      read_time: aiResp.readTime,
      seo_title: aiResp.seoTitle ?? aiResp.title,
      hero_angle: aiResp.heroAngle,
      highlights_json: JSON.stringify(aiResp.highlights ?? []),
      content: aiResp.content ?? stripped.slice(0, 4000),
      cta_text: aiResp.ctaText,
    });
  },

  async generateDraft(env: Env, tenantId: string, topic: string, opts?: { category?: string; badge?: string }): Promise<ArticleRow> {
    const prompt = `Draft a high-quality ${opts?.badge ?? "Guide"} article on this topic.
Topic: ${topic}

Return strict JSON:
{
  "title": "...", "description": "...", "category": "...",
  "readTime": "X min read", "seoTitle": "...", "heroAngle": "...",
  "highlights": [...], "content": "full body, 500-1500 words", "ctaText": "..."
}`;
    const aiResp = await ai(env, prompt);
    return articlesDb.upsert(env, tenantId, {
      source_url: undefined,
      title: aiResp.title ?? topic,
      description: aiResp.description ?? topic,
      category: opts?.category ?? aiResp.category ?? "general",
      badge: opts?.badge ?? aiResp.badge ?? "Guide",
      read_time: aiResp.readTime,
      seo_title: aiResp.seoTitle ?? aiResp.title,
      hero_angle: aiResp.heroAngle,
      highlights_json: JSON.stringify(aiResp.highlights ?? []),
      content: aiResp.content ?? "",
      cta_text: aiResp.ctaText,
    });
  },
};

// ── Battlecards CRUD ───────────────────────────────────────────────────
export const battlecardsDb = {
  async list(env: Env, tenantId: string): Promise<BattlecardRow[]> {
    const rs = await env.DB.prepare(
      "SELECT * FROM battlecards WHERE tenant_id = ?1 AND is_archived = 0 ORDER BY category, created_at DESC"
    ).bind(tenantId).all<BattlecardRow>();
    return rs.results ?? [];
  },
  async upsert(env: Env, tenantId: string, input: Partial<BattlecardRow> & { category: string; objection: string; counter_wedge: string; one_liner: string }): Promise<BattlecardRow> {
    const now = nowIso();
    const id = input.id ?? crypto.randomUUID();
    const row: BattlecardRow = {
      id, tenant_id: tenantId,
      source_id: input.source_id ?? null,
      category: input.category,
      objection: input.objection,
      counter_wedge: input.counter_wedge,
      discovery_questions_json: input.discovery_questions_json ?? "[]",
      one_liner: input.one_liner,
      metrics_json: input.metrics_json ?? "[]",
      competitor_domain: input.competitor_domain ?? null,
      is_archived: 0,
      created_at: now, updated_at: now,
    };
    await env.DB.prepare(
      `INSERT INTO battlecards
        (id,tenant_id,source_id,category,objection,counter_wedge,discovery_questions_json,one_liner,metrics_json,competitor_domain,is_archived,created_at,updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,?11,?11)
       ON CONFLICT(id) DO UPDATE SET
         category=excluded.category, objection=excluded.objection, counter_wedge=excluded.counter_wedge,
         discovery_questions_json=excluded.discovery_questions_json, one_liner=excluded.one_liner,
         metrics_json=excluded.metrics_json, competitor_domain=excluded.competitor_domain,
         updated_at=excluded.updated_at`
    ).bind(
      row.id, row.tenant_id, row.source_id, row.category, row.objection, row.counter_wedge,
      row.discovery_questions_json, row.one_liner, row.metrics_json, row.competitor_domain, now
    ).run();
    return row;
  },
  async archive(env: Env, tenantId: string, id: string): Promise<void> {
    await env.DB.prepare("UPDATE battlecards SET is_archived=1, updated_at=?1 WHERE id=?2 AND tenant_id=?3")
      .bind(nowIso(), id, tenantId).run();
  },

  /** Generate a battlecard via Gemini for a given competitor + objection. */
  async generate(env: Env, tenantId: string, input: { competitorDomain: string; objection: string; category: string }): Promise<BattlecardRow> {
    const prompt = `You are a sales-enablement strategist for ACME (roofing/insurtech intelligence studio).
Build a battlecard for competing against ${input.competitorDomain} on this objection:

"${input.objection}"

Return strict JSON:
{
  "counterWedge": "the strongest counter-positioning angle",
  "oneLiner": "snappy comeback in <140 chars",
  "discoveryQuestions": ["3-5 questions to qualify"],
  "metrics": [{"label": "...", "value": "..."}]
}`;
    const aiResp = await ai(env, prompt);
    return battlecardsDb.upsert(env, tenantId, {
      category: input.category,
      objection: input.objection,
      counter_wedge: aiResp.counterWedge ?? "",
      discovery_questions_json: JSON.stringify(aiResp.discoveryQuestions ?? []),
      one_liner: aiResp.oneLiner ?? "",
      metrics_json: JSON.stringify(aiResp.metrics ?? []),
      competitor_domain: input.competitorDomain,
    });
  },
};

// ── RSS / feed ingest cron ─────────────────────────────────────────────
export async function runContentIngest(env: Env, ctx: ExecutionContext): Promise<{ processed: number; new: number; errors: number }> {
  let processed = 0, fresh = 0, errors = 0;
  // Find sources due for refresh (last_run_at older than 30 minutes OR never
  // run). The scheduled() tick runs every 10 minutes so each source still gets
  // a chance every ~30-40 minutes — the 30-min gate just throttles per-source.
  const dueAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const rs = await env.DB.prepare(
    "SELECT * FROM content_sources WHERE is_active = 1 AND (last_run_at IS NULL OR last_run_at < ?1) ORDER BY last_run_at NULLS FIRST LIMIT 30"
  ).bind(dueAt).all<ContentSourceRow>();
  const sources = rs.results ?? [];

  for (const s of sources) {
    processed++;
    try {
      const urls = await fetchSourceItems(s);
      for (const url of urls.slice(0, 10)) {  // cap per-source per-run
        try {
          await articlesDb.ingestFromUrl(env, s.tenant_id, url, s.id, { category: s.category, badge: s.badge });
          fresh++;
        } catch (perItemErr) {
          // Don't fail the whole source for one bad item.
        }
      }
      await sourcesDb.recordSuccess(env, s.id);
    } catch (e: any) {
      errors++;
      await sourcesDb.recordFailure(env, s.id, e?.message ?? String(e));
    }
  }
  return { processed, new: fresh, errors };
}

/**
 * LLM tag pass — adds sentiment + topic tag to articles that don't have them
 * yet. Tags live in highlights_json's `__intel` slot to keep the schema stable.
 */
export async function runIntelTagger(
  env: Env, opts?: { tenantId?: string; lookbackHours?: number; maxItems?: number }
): Promise<{ scanned: number; tagged: number }> {
  const lookbackHours = opts?.lookbackHours ?? 12;
  const maxItems = opts?.maxItems ?? 40;
  const cutoff = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
  const where: string[] = ["is_archived = 0", "updated_at >= ?1"];
  const binds: unknown[] = [cutoff];
  let p = 2;
  if (opts?.tenantId) { where.push(`tenant_id = ?${p++}`); binds.push(opts.tenantId); }
  const rs = await env.DB.prepare(
    `SELECT id, tenant_id, title, description, highlights_json FROM articles
     WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ${maxItems}`
  ).bind(...binds).all<{ id: string; tenant_id: string; title: string; description: string; highlights_json: string }>();

  let scanned = 0, tagged = 0;
  for (const r of rs.results ?? []) {
    scanned++;
    let highlights: any = {};
    try { highlights = JSON.parse(r.highlights_json); } catch { highlights = {}; }
    if (highlights && typeof highlights === "object" && highlights.__intel) continue; // already tagged
    if (!env.AI) continue;
    try {
      const res = await env.AI.run("openai/gpt-4o-mini" as any, {
        messages: [
          { role: "system", content: "Extract structured intel from a roofing-industry article. Return ONLY JSON: {\"sentiment\":\"positive|neutral|negative\",\"angle\":\"competitor|industry|customer-pain|regulatory|other\",\"topic\":\"<3-5 word tag>\",\"signal\":\"<one sentence on why this matters to Acme>\"}." },
          { role: "user", content: `Title: ${r.title}\nDescription: ${r.description ?? "(none)"}` },
        ],
        max_tokens: 250,
      } as any, { gateway: { id: env.AI_GATEWAY_SLUG || "default" } } as any) as any;
      const txt = (res?.choices?.[0]?.message?.content ?? res?.response ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const intel = JSON.parse(txt);
      const newHighlights = Array.isArray(highlights) ? { __intel: intel, items: highlights } : { ...(highlights ?? {}), __intel: intel };
      await env.DB.prepare("UPDATE articles SET highlights_json = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(JSON.stringify(newHighlights), nowIso(), r.id).run();
      tagged++;
    } catch { /* keep going */ }
  }
  return { scanned, tagged };
}

/**
 * LLM-driven relevance pass over recently-ingested articles. Archives any that
 * are clearly off-topic for Acme (a roofing CRM). Runs in batches to keep
 * the worker under per-tick wallclock + AI Gateway quota.
 *
 * Heuristic before LLM: bail fast if the title/description is short and lacks
 * any roofing/insurance/CRM keyword — that alone catches most spam.
 */
export async function runRelevanceScrub(
  env: Env, opts?: { tenantId?: string; lookbackHours?: number; maxItems?: number }
): Promise<{ scanned: number; kept: number; archived: number }> {
  const lookbackHours = opts?.lookbackHours ?? 24;
  const maxItems = opts?.maxItems ?? 60;
  const cutoff = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();

  const where: string[] = ["is_archived = 0", "updated_at >= ?1"];
  const binds: unknown[] = [cutoff];
  let p = 2;
  if (opts?.tenantId) { where.push(`tenant_id = ?${p++}`); binds.push(opts.tenantId); }
  const rs = await env.DB.prepare(
    `SELECT id, tenant_id, title, description, source_url FROM articles
     WHERE ${where.join(" AND ")}
     ORDER BY updated_at DESC LIMIT ${maxItems}`
  ).bind(...binds).all<{ id: string; tenant_id: string; title: string; description: string; source_url: string }>();

  const rows = rs.results ?? [];
  let scanned = 0, kept = 0, archived = 0;
  const KW = /roof|roofing|hail|storm|claim|adjuster|insurance|inspection|inspector|gutter|shingle|metal|tpo|epdm|contractor|crew|d2d|door[- ]?to[- ]?door|construction|crm|field|sales|estimate|measurement|photo|signature|workflow|policyholder/i;

  for (const r of rows) {
    scanned++;
    // Heuristic gate first — saves an AI call on the obvious junk.
    const meta = `${r.title}\n${r.description ?? ""}`;
    if (KW.test(meta)) { kept++; continue; }
    if (!env.AI) { kept++; continue; }
    try {
      const res = await env.AI.run("openai/gpt-4o-mini" as any, {
        messages: [
          { role: "system", content: "Classify whether an article is relevant to a roofing-CRM business (Acme). Reply with ONE token: RELEVANT or OFFTOPIC. Roofing trade, storm restoration, insurance claims, contractor sales, construction tech, field-service workflows, CRM, D2D sales — all RELEVANT. Cooking, celebrity gossip, gaming, fashion, generic tech news — OFFTOPIC." },
          { role: "user", content: `Title: ${r.title}\nDescription: ${r.description ?? "(none)"}` },
        ],
        max_tokens: 4,
      } as any, { gateway: { id: env.AI_GATEWAY_SLUG || "default" } } as any) as any;
      const text: string = (res?.choices?.[0]?.message?.content ?? res?.response ?? "").trim().toUpperCase();
      if (text.startsWith("OFFTOPIC")) {
        await env.DB.prepare("UPDATE articles SET is_archived = 1, updated_at = ?1 WHERE id = ?2")
          .bind(nowIso(), r.id).run();
        archived++;
      } else {
        kept++;
      }
    } catch {
      kept++;
    }
  }
  return { scanned, kept, archived };
}

async function fetchSourceItems(s: ContentSourceRow): Promise<string[]> {
  if (s.kind === "rss" || s.kind === "sitemap") {
    const res = await fetch(s.url, { headers: { "user-agent": "contentforge-ingest/1.0" } });
    if (!res.ok) throw new Error(`fetch ${s.url} → ${res.status}`);
    const text = await res.text();
    // Cheap RSS/Atom/sitemap link extraction — no XML parser dependency.
    const linkRe = /<link[^>]*>([^<]+)<\/link>|<loc>([^<]+)<\/loc>|<link[^>]*href=["']([^"']+)["']/gi;
    const out = new Set<string>();
    for (const m of text.matchAll(linkRe)) {
      const u = m[1] || m[2] || m[3];
      if (u && /^https?:/i.test(u) && !u.includes(new URL(s.url).hostname + "/feed")) out.add(u.trim());
      if (out.size >= 30) break;
    }
    return [...out];
  }
  if (s.kind === "reddit") {
    // Reddit gates non-browser User-Agents with 403 — use a realistic one and
    // honor json endpoint convention.
    const url = s.url.endsWith(".json") ? s.url : s.url.replace(/\/?$/, "/.json");
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; contentforge-bot/1.0; +https://app.example.com)" } });
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const json: any = await res.json();
    const children: any[] = json?.data?.children ?? [];
    // Prefer external URLs (industry articles) but also keep self-posts (Reddit
    // threads can themselves be valuable for competitor + customer insight).
    return children
      .map((c) => {
        const d = c?.data ?? {};
        const external = d.url_overridden_by_dest ?? d.url;
        // Skip image hosts — we want text/article content for intel.
        if (typeof external === "string" && !/^https?:\/\/(i\.redd\.it|v\.redd\.it|i\.imgur\.com|preview\.redd\.it)/i.test(external)) {
          return external;
        }
        // Fall back to the Reddit thread itself.
        return d.permalink ? `https://www.reddit.com${d.permalink}` : null;
      })
      .filter(Boolean) as string[];
  }
  if (s.kind === "competitor") {
    // Pull the homepage (or any landing page) and extract on-domain links that
    // look like articles / blog posts / case studies. Heuristic only — the LLM
    // normalizer downstream filters out junk.
    const res = await fetch(s.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; contentforge-bot/1.0)" } });
    if (!res.ok) throw new Error(`fetch ${s.url} → ${res.status}`);
    const html = await res.text();
    const host = new URL(s.url).hostname.replace(/^www\./, "");
    const out = new Set<string>();
    const linkRe = /<a[^>]*href=["']([^"'#?]+)/gi;
    for (const m of html.matchAll(linkRe)) {
      let href = m[1].trim();
      if (!href || href.length < 3) continue;
      if (href.startsWith("//")) href = `https:${href}`;
      else if (href.startsWith("/")) href = new URL(href, s.url).toString();
      if (!/^https?:\/\//i.test(href)) continue;
      const u = new URL(href);
      const h = u.hostname.replace(/^www\./, "");
      if (h !== host) continue;
      const path = u.pathname.toLowerCase();
      if (path === "/" || path.length < 6) continue;
      // Pattern-match article-shaped URLs.
      if (!/(blog|news|article|story|case|insight|guide|resource|post|press|update)/i.test(path)
          && !/\d{4}/.test(path)
          && !/[-_][a-z0-9-]{8,}/.test(path)) continue;
      if (/\.(pdf|jpg|png|gif|webp|svg|ico|zip|css|js|woff)/i.test(path)) continue;
      out.add(u.toString().split("#")[0]);
      if (out.size >= 25) break;
    }
    return [...out];
  }
  throw new Error(`unsupported source kind: ${s.kind}`);
}

// ── HTML strip ──────────────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
