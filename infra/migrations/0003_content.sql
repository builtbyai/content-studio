-- 0003_content.sql — D1-backed articles + battlecards + ingest sources.
-- Replaces the static articles.ts / hardcoded battlecards seed inside the SPA.

PRAGMA foreign_keys = ON;

-- ── Sources ─────────────────────────────────────────────────────────────
-- Where content comes from. Each row is one feed/scrape job. The cron walks
-- this table every 6h and dispatches an ingest job per active source.
CREATE TABLE IF NOT EXISTS content_sources (
  id                TEXT    PRIMARY KEY,
  tenant_id         TEXT    NOT NULL,           -- maps to user_id for single-tenant
  kind              TEXT    NOT NULL,           -- 'rss' | 'reddit' | 'sitemap' | 'manual' | 'competitor'
  url               TEXT    NOT NULL,
  label             TEXT    NOT NULL,
  category          TEXT    NOT NULL DEFAULT 'general',
  badge             TEXT    NOT NULL DEFAULT 'Article',  -- maps to seed Article.badge
  is_active         INTEGER NOT NULL DEFAULT 1,
  fail_count        INTEGER NOT NULL DEFAULT 0,
  last_run_at       TEXT,
  last_error        TEXT,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS content_sources_active ON content_sources(is_active, last_run_at);
CREATE INDEX IF NOT EXISTS content_sources_tenant ON content_sources(tenant_id);

-- ── Articles ─────────────────────────────────────────────────────────────
-- The unified row backing the existing Article type. Sourced from ingest cron
-- OR a manual /api/articles/from-url paste OR Gemini drafted via /api/articles.
CREATE TABLE IF NOT EXISTS articles (
  id              TEXT    PRIMARY KEY,
  tenant_id       TEXT    NOT NULL,
  url_sha256      TEXT    NOT NULL UNIQUE,        -- dedup key
  source_id       TEXT    REFERENCES content_sources(id) ON DELETE SET NULL,
  source_url      TEXT,
  title           TEXT    NOT NULL,
  slug            TEXT    NOT NULL,
  category        TEXT    NOT NULL DEFAULT 'general',
  badge           TEXT    NOT NULL DEFAULT 'Article',  -- 'Article'|'Guide'|'Review'
  read_time       TEXT,                            -- '5 min read'
  seo_title       TEXT    NOT NULL,
  description     TEXT    NOT NULL,
  hero_angle      TEXT,
  highlights_json TEXT    NOT NULL DEFAULT '[]',   -- string[]
  content         TEXT    NOT NULL,
  cta_text        TEXT,
  hero_media_id   TEXT    REFERENCES media(id) ON DELETE SET NULL,
  is_archived     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS articles_tenant_time ON articles(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS articles_badge ON articles(badge);

-- ── Battlecards ─────────────────────────────────────────────────────────
-- Same shape as the BattlecardItem in types.ts, plus tenancy + sourcing.
CREATE TABLE IF NOT EXISTS battlecards (
  id                       TEXT    PRIMARY KEY,
  tenant_id                TEXT    NOT NULL,
  source_id                TEXT    REFERENCES content_sources(id) ON DELETE SET NULL,
  category                 TEXT    NOT NULL,                  -- 'lead_generation'|'storm_response'|...
  objection                TEXT    NOT NULL,
  counter_wedge            TEXT    NOT NULL,
  discovery_questions_json TEXT    NOT NULL DEFAULT '[]',
  one_liner                TEXT    NOT NULL,
  metrics_json             TEXT    NOT NULL DEFAULT '[]',
  competitor_domain        TEXT,                              -- 'roofflowai.com' etc.
  is_archived              INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT    NOT NULL,
  updated_at               TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS battlecards_tenant_category ON battlecards(tenant_id, category);
CREATE INDEX IF NOT EXISTS battlecards_competitor ON battlecards(competitor_domain);

-- ── Ingest job log (specialised view of job_log for sources) ─────────────
-- job_log already exists; we just use it with kind='ingest' + payload_json
-- containing { sourceId, url } so we don't need a new table.
