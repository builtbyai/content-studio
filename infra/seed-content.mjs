#!/usr/bin/env node
/**
 * Read articles.ts + campaigns.ts using esbuild, emit SQL to stdout.
 * Usage:
 *   cd worker && node ../infra/seed-content.mjs > ../infra/.seed-content.sql
 *   wrangler d1 execute contentforge-prod --remote --file=../infra/.seed-content.sql
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "../worker/node_modules/esbuild/lib/main.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARTICLES_FILE = path.join(ROOT, "web/src/data/articles.ts");
const CAMPAIGNS_FILE = path.join(ROOT, "web/src/data/campaigns.ts");

const TENANT = "usr_admin_demo";

function esc(s) {
  if (s == null) return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function nowIso() { return new Date().toISOString(); }

async function loadTs(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const out = transformSync(raw, {
    loader: "ts",
    format: "esm",
    target: "node18",
  }).code
    // Drop `import ... from "../types";` lines since they don't exist after transpile
    .replace(/^import .*?from\s+["'][^"']+\/types["'];?\s*$/gm, "");
  const tmp = filePath + ".tmp.mjs";
  fs.writeFileSync(tmp, out);
  try {
    return await import(pathToFileURL(tmp).href + "?v=" + Date.now());
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function main() {
  const articlesMod = await loadTs(ARTICLES_FILE);
  const campaignsMod = await loadTs(CAMPAIGNS_FILE);

  const articles = articlesMod.articles ?? articlesMod.default ?? [];
  const battlecards = campaignsMod.battlecards ?? [];

  console.error(`Loaded ${articles.length} articles, ${battlecards.length} battlecards`);

  const now = nowIso();
  const enc = new TextEncoder();
  async function sha256Hex(s) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const out = [];
  out.push("-- Seed content for contentforge.");

  for (const a of articles) {
    const urn = `urn:contentforge-seed:${a.id}`;
    const hash = await sha256Hex(urn);
    const highlights = JSON.stringify(a.highlights ?? []);
    out.push(
      `INSERT OR REPLACE INTO articles
        (id,tenant_id,url_sha256,source_id,source_url,title,slug,category,badge,read_time,seo_title,description,hero_angle,highlights_json,content,cta_text,hero_media_id,is_archived,created_at,updated_at)
       VALUES (
        ${esc(a.id)},${esc(TENANT)},${esc(hash)},NULL,${esc(urn)},${esc(a.title)},${esc(a.slug)},
        ${esc(a.category)},${esc(a.badge)},${esc(a.readTime)},${esc(a.seoTitle)},${esc(a.description)},
        ${esc(a.heroAngle)},${esc(highlights)},${esc(a.content)},${esc(a.ctaText)},NULL,0,${esc(now)},${esc(now)});`
    );
  }

  for (const b of battlecards) {
    const dq = JSON.stringify(b.discoveryQuestions ?? []);
    const mx = JSON.stringify(b.metrics ?? []);
    out.push(
      `INSERT OR REPLACE INTO battlecards
        (id,tenant_id,source_id,category,objection,counter_wedge,discovery_questions_json,one_liner,metrics_json,competitor_domain,is_archived,created_at,updated_at)
       VALUES (
        ${esc(b.id)},${esc(TENANT)},NULL,${esc(b.category)},${esc(b.objection)},${esc(b.counterWedge)},
        ${esc(dq)},${esc(b.oneLiner)},${esc(mx)},NULL,0,${esc(now)},${esc(now)});`
    );
  }

  const defaultSources = [
    { id: "src_acme_blog", kind: "rss", url: "https://blog.example.com/feed.xml", label: "Acme Blog", category: "Guides", badge: "Article" },
    { id: "src_reddit_roofing", kind: "reddit", url: "https://www.reddit.com/r/Roofing/.json", label: "r/Roofing (hot)", category: "Trends", badge: "Article" },
    { id: "src_reddit_insurance", kind: "reddit", url: "https://www.reddit.com/r/Insurance/.json", label: "r/Insurance (hot)", category: "Trends", badge: "Article" },
    { id: "src_google_news_roofing", kind: "rss", url: "https://news.google.com/rss/search?q=roofing+insurtech&hl=en-US&gl=US&ceid=US:en", label: "Google News — Roofing Insurtech", category: "News", badge: "Article" },
  ];
  for (const s of defaultSources) {
    out.push(
      `INSERT OR REPLACE INTO content_sources
        (id,tenant_id,kind,url,label,category,badge,is_active,fail_count,last_run_at,last_error,created_at,updated_at)
       VALUES (
        ${esc(s.id)},${esc(TENANT)},${esc(s.kind)},${esc(s.url)},${esc(s.label)},${esc(s.category)},${esc(s.badge)},1,0,NULL,NULL,${esc(now)},${esc(now)});`
    );
  }

  process.stdout.write(out.join("\n") + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
