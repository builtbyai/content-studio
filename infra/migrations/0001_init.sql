-- contentforge D1 schema, single initial migration.
-- Mirrors the reference auth service's user/session hash format so the same admin row is portable.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              TEXT    PRIMARY KEY,
  email           TEXT    NOT NULL UNIQUE,
  password_hash   TEXT    NOT NULL,            -- SHA-256(password||salt) hex
  salt            TEXT    NOT NULL,
  role            TEXT    NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS connected_channels (
  id                      TEXT    PRIMARY KEY,
  user_id                 TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform                TEXT    NOT NULL,        -- 'linkedin' | 'instagram' | 'x' | 'tiktok' | 'youtube' | ...
  postiz_integration_id   TEXT    NOT NULL UNIQUE,
  display_name            TEXT    NOT NULL,
  status                  TEXT    NOT NULL DEFAULT 'active',  -- 'active' | 'disabled' | 'error'
  last_synced_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS channels_user ON connected_channels(user_id);

CREATE TABLE IF NOT EXISTS drafts (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL,         -- 'campaign' | 'workflow' | 'free'
  payload_json  TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS drafts_user ON drafts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schedules (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_id        TEXT    REFERENCES drafts(id) ON DELETE SET NULL,
  channel_id      TEXT    NOT NULL REFERENCES connected_channels(id) ON DELETE CASCADE,
  postiz_post_id  TEXT,                              -- nullable until Postiz accepts
  scheduled_for   INTEGER NOT NULL,                  -- unix seconds
  status          TEXT    NOT NULL DEFAULT 'pending', -- 'pending'|'scheduled'|'published'|'failed'|'cancelled'
  last_error      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS schedules_user_time ON schedules(user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS schedules_status ON schedules(status, scheduled_for);
CREATE INDEX IF NOT EXISTS schedules_postiz ON schedules(postiz_post_id);

CREATE TABLE IF NOT EXISTS media (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key        TEXT    NOT NULL UNIQUE,
  mime          TEXT    NOT NULL,
  bytes         INTEGER NOT NULL DEFAULT 0,
  source        TEXT    NOT NULL,                  -- 'upload'|'gemini'|'veo'|'external'
  original_url  TEXT,
  public_url    TEXT    NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS media_user ON media(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_log (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL,
  kind          TEXT    NOT NULL,
  status        TEXT    NOT NULL,        -- 'queued'|'running'|'retry'|'done'|'dead'
  attempts      INTEGER NOT NULL DEFAULT 0,
  payload_json  TEXT    NOT NULL,
  error         TEXT,
  created_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_user_time ON job_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_events (
  id                 TEXT    PRIMARY KEY,
  postiz_event_id    TEXT    NOT NULL UNIQUE,    -- idempotency key
  kind               TEXT    NOT NULL,
  payload_json       TEXT    NOT NULL,
  signature          TEXT    NOT NULL,
  processed          INTEGER NOT NULL DEFAULT 0,
  received_at        INTEGER NOT NULL,
  processed_at       INTEGER
);
CREATE INDEX IF NOT EXISTS webhooks_received ON webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS webhooks_processed ON webhook_events(processed, received_at);
