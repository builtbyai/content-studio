-- Background generation jobs + multi-scene composition tables.
--
-- generation_jobs: every async media generation lands a row. Lab dispatches,
--   Scene Composer builds, Workflow Composer chains, batch fan-outs — all use
--   this single table. The /api/jobs endpoint + SSE broadcasts are read off it.
--
-- compositions: a single "Scene Composer" project — the brief + planner choice.
-- scenes:       individual storyboard rows inside a composition.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS generation_jobs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                  -- 'video' | 'image' | 'text'
  provider        TEXT NOT NULL,                  -- 'replicate' | 'workers-ai' | 'openai' | ...
  model           TEXT NOT NULL,                  -- 'replicate/google/veo-3-fast' etc.
  status          TEXT NOT NULL DEFAULT 'queued', -- 'queued'|'processing'|'succeeded'|'failed'|'canceled'
  prompt          TEXT,                            -- truncated for display
  params_json     TEXT NOT NULL DEFAULT '{}',
  prediction_id   TEXT,                            -- Replicate prediction id, when applicable
  output_url      TEXT,                            -- final mirrored R2 url
  media_id        TEXT,                            -- FK into media table once finalized
  error           TEXT,
  -- Grouping. Set by batch dispatch + scene composer + workflow composer so
  -- the UI can show "3/8 done" style progress.
  batch_id        TEXT,
  scene_id        TEXT,                            -- FK into scenes
  composition_id  TEXT,                            -- FK into compositions
  workflow_run_id TEXT,                            -- FK into workflows.id (existing 26-node)
  source_kind     TEXT,                            -- 'video_lab'|'image_lab'|'scene_composer'|'workflow_composer'|'workflow_runner'|'broll'
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  finished_at     INTEGER
);
CREATE INDEX IF NOT EXISTS generation_jobs_user_status
  ON generation_jobs(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS generation_jobs_user_recent
  ON generation_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generation_jobs_batch
  ON generation_jobs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS generation_jobs_scene
  ON generation_jobs(scene_id) WHERE scene_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS generation_jobs_prediction
  ON generation_jobs(prediction_id) WHERE prediction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS compositions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT 'Untitled composition',
  brief           TEXT NOT NULL,
  planner_model   TEXT NOT NULL,                  -- 'openai/gpt-5' | 'anthropic/claude-opus' | 'google-ai-studio/gemini-2.5-pro'
  scenes_count    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'planning', -- 'planning'|'planned'|'building'|'completed'|'failed'
  notes           TEXT,
  meta_json       TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS compositions_user
  ON compositions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS scenes (
  id                 TEXT PRIMARY KEY,
  composition_id     TEXT NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idx                INTEGER NOT NULL,
  title              TEXT,
  image_prompt       TEXT,
  video_prompt       TEXT,
  continuity         TEXT,
  duration_sec       INTEGER NOT NULL DEFAULT 5,
  aspect_ratio       TEXT NOT NULL DEFAULT '16:9',
  image_media_id     TEXT,
  video_media_id     TEXT,
  image_provider     TEXT NOT NULL DEFAULT 'openai',
  image_model        TEXT NOT NULL DEFAULT 'openai/gpt-image-2',
  video_provider     TEXT NOT NULL DEFAULT 'replicate',
  video_model        TEXT NOT NULL DEFAULT 'replicate/google/veo-3-fast',
  status             TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'image_building'|'image_ready'|'video_building'|'completed'|'failed'
  meta_json          TEXT NOT NULL DEFAULT '{}',
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scenes_composition
  ON scenes(composition_id, idx);
CREATE INDEX IF NOT EXISTS scenes_user_status
  ON scenes(user_id, status);
