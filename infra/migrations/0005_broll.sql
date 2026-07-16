-- B-Roll Workspace (Runway-style multi-shot generation with subject continuity).
-- A project owns N shots; each shot dispatches one generate job through the queue.

CREATE TABLE IF NOT EXISTS broll_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  workflow_id TEXT,
  title TEXT,
  scene_text TEXT NOT NULL,
  reference_kind TEXT NOT NULL DEFAULT 'text',     -- text | upload | generated | url
  reference_uri TEXT,
  reference_description TEXT,                      -- continuity anchor passed to every shot prompt
  style TEXT DEFAULT 'cinematic',                  -- cinematic | product | documentary | editorial | drone
  aspect_ratio TEXT DEFAULT '16:9',                -- 16:9 | 9:16 | 1:1 | 4:5
  shot_count INTEGER NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'planning',         -- planning | ready_to_render | rendering | ready | failed
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_broll_projects_user ON broll_projects(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS broll_shots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES broll_projects(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  ordinal INTEGER NOT NULL,
  title TEXT,
  angle TEXT,                                      -- wide | medium | close | extreme_close | overhead | low | dutch | pov | tracking
  beat TEXT,                                       -- intro | reveal | detail | action | transition | outro
  continuity_token TEXT,
  prompt TEXT,
  negative_prompt TEXT,
  motion_hint TEXT,
  duration_seconds INTEGER DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'planned',          -- planned | rendering | ready | failed | animating | animated
  still_asset_id TEXT,
  still_r2_uri TEXT,
  video_asset_id TEXT,
  video_r2_uri TEXT,
  last_error TEXT,
  prompt_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_broll_shots_project ON broll_shots(project_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_broll_shots_prompt ON broll_shots(prompt_id);
