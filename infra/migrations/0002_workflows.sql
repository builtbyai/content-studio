-- 26-node Workflow Studio schema (per spec section 10).
-- Adapted for D1 (SQLite) — TEXT timestamps kept as ISO strings to match spec.
-- Tenants share the existing users table; tenant_id maps to organisations later.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workflows (
  id                       TEXT PRIMARY KEY,
  tenant_id                TEXT NOT NULL,
  user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode                     TEXT NOT NULL,                 -- 'draft'|'estimate_only'|'execute'|'review_only'|'export_only'
  status                   TEXT NOT NULL DEFAULT 'idle',
  budget_json              TEXT NOT NULL,                 -- BudgetEnvelope
  provider_policy_json     TEXT NOT NULL,                 -- ProviderPolicy
  compliance_policy_json   TEXT NOT NULL,                 -- CompliancePolicy
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workflows_user ON workflows(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflows_tenant ON workflows(tenant_id, status);

CREATE TABLE IF NOT EXISTS workflow_nodes (
  id                     TEXT PRIMARY KEY,
  workflow_id            TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_id                TEXT NOT NULL,                  -- 'node_01_brief_intake' etc.
  run_id                 TEXT NOT NULL,
  state                  TEXT NOT NULL,                  -- NodeState enum
  input_hash             TEXT NOT NULL,
  output_hash            TEXT,
  retries                INTEGER NOT NULL DEFAULT 0,
  parent_node_ids_json   TEXT NOT NULL DEFAULT '[]',
  child_node_ids_json    TEXT NOT NULL DEFAULT '[]',
  started_at             TEXT,
  completed_at           TEXT
);
CREATE INDEX IF NOT EXISTS workflow_nodes_wf ON workflow_nodes(workflow_id, node_id);
CREATE INDEX IF NOT EXISTS workflow_nodes_state ON workflow_nodes(state);
CREATE INDEX IF NOT EXISTS workflow_nodes_run ON workflow_nodes(run_id);

CREATE TABLE IF NOT EXISTS workflow_audit_events (
  id              TEXT PRIMARY KEY,
  workflow_id     TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_id         TEXT NOT NULL,
  state           TEXT NOT NULL,
  message         TEXT NOT NULL,
  metadata_json   TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_wf_time ON workflow_audit_events(workflow_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generated_assets (
  id               TEXT PRIMARY KEY,
  workflow_id      TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  provider_id      TEXT NOT NULL,                       -- 'openai'|'gemini'|'runway'|'openrouter'|'custom'
  model_id         TEXT NOT NULL,
  media_type       TEXT NOT NULL,                       -- 'image'|'video'|'text'|'html'|'pdf'|'json'|'csv'
  uri              TEXT NOT NULL,                       -- usually an R2 public URL
  checksum         TEXT NOT NULL,
  prompt_id        TEXT NOT NULL,
  variant_id       TEXT,
  metadata_json    TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_wf ON generated_assets(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assets_prompt ON generated_assets(prompt_id);

CREATE TABLE IF NOT EXISTS prospects (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  company_name          TEXT NOT NULL,
  website               TEXT,
  location              TEXT,
  fit_score             REAL NOT NULL,
  source_evidence_json  TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prospects_tenant ON prospects(tenant_id, fit_score DESC);
CREATE INDEX IF NOT EXISTS prospects_company ON prospects(company_name);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id                          TEXT PRIMARY KEY,
  prospect_id                 TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  channel                     TEXT NOT NULL,             -- 'email'|'linkedin'|'form'|'voicemail'
  subject                     TEXT,
  body                        TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'draft',  -- 'draft'|'awaiting_approval'|'queued'|'sent'|'failed'|'cancelled'
  requires_human_approval     INTEGER NOT NULL DEFAULT 1,
  scheduled_at                TEXT,
  sent_at                     TEXT,
  created_at                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS outreach_prospect ON outreach_messages(prospect_id);
CREATE INDEX IF NOT EXISTS outreach_status ON outreach_messages(status, scheduled_at);
