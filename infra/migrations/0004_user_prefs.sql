-- user_prefs: notification email + per-event toggles.
-- competitor_reports: persisted Node 18 outputs, customizable length, indexed by tenant.

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notify_email         TEXT,
  notify_on_generated  INTEGER NOT NULL DEFAULT 0,
  notify_on_published  INTEGER NOT NULL DEFAULT 1,
  notify_on_failed     INTEGER NOT NULL DEFAULT 1,
  notify_cost_threshold_usd REAL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitor_reports (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competitor_domains_json TEXT NOT NULL,
  our_value_props_json    TEXT NOT NULL,
  depth               TEXT NOT NULL DEFAULT 'standard',  -- brief|standard|deep|max
  report_json         TEXT NOT NULL,                     -- full Node 18 output
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS competitor_reports_user_time ON competitor_reports(user_id, created_at DESC);
