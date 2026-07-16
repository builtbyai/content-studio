import type { Env } from "./env";

// Thin typed helpers over D1. Prepared statements get built per-call;
// D1's binding caches plan for us.

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  role: string;
  created_at: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
}

export interface ChannelRow {
  id: string;
  user_id: string;
  platform: string;
  postiz_integration_id: string;
  display_name: string;
  status: string;
  last_synced_at: number;
}

export interface DraftRow {
  id: string;
  user_id: string;
  kind: string; // 'campaign' | 'workflow' | 'free'
  payload_json: string;
  created_at: number;
  updated_at: number;
}

export interface ScheduleRow {
  id: string;
  user_id: string;
  draft_id: string | null;
  channel_id: string;
  postiz_post_id: string | null;
  scheduled_for: number;
  status: string; // 'pending' | 'scheduled' | 'published' | 'failed' | 'cancelled'
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface MediaRow {
  id: string;
  user_id: string;
  r2_key: string;
  mime: string;
  bytes: number;
  source: string; // 'upload' | 'gemini' | 'veo' | 'external'
  original_url: string | null;
  public_url: string;
  created_at: number;
}

export interface JobLogRow {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  attempts: number;
  payload_json: string;
  error: string | null;
  created_at: number;
  finished_at: number | null;
}

export const db = {
  // --- users ---
  async userByEmail(env: Env, email: string): Promise<UserRow | null> {
    return env.DB.prepare("SELECT * FROM users WHERE email = ?1")
      .bind(email.toLowerCase().trim())
      .first<UserRow>();
  },
  async userById(env: Env, id: string): Promise<UserRow | null> {
    return env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRow>();
  },

  // --- sessions ---
  async createSession(env: Env, userId: string, ttlSeconds: number): Promise<string> {
    const id = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)"
    )
      .bind(id, userId, expiresAt)
      .run();
    return id;
  },
  async sessionWithUser(env: Env, id: string): Promise<{ session: SessionRow; user: UserRow } | null> {
    const row = await env.DB.prepare(
      `SELECT s.id AS sid, s.user_id, s.expires_at,
              u.id AS uid, u.email, u.password_hash, u.salt, u.role, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?1 AND s.expires_at > ?2`
    )
      .bind(id, Math.floor(Date.now() / 1000))
      .first<any>();
    if (!row) return null;
    return {
      session: { id: row.sid, user_id: row.user_id, expires_at: row.expires_at },
      user: {
        id: row.uid,
        email: row.email,
        password_hash: row.password_hash,
        salt: row.salt,
        role: row.role,
        created_at: row.created_at,
      },
    };
  },
  async deleteSession(env: Env, id: string): Promise<void> {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(id).run();
  },

  // --- channels ---
  async listChannels(env: Env, userId: string): Promise<ChannelRow[]> {
    const rs = await env.DB.prepare(
      "SELECT * FROM connected_channels WHERE user_id = ?1 ORDER BY platform"
    )
      .bind(userId)
      .all<ChannelRow>();
    return rs.results ?? [];
  },
  async upsertChannel(env: Env, c: Omit<ChannelRow, "last_synced_at"> & { last_synced_at?: number }) {
    await env.DB.prepare(
      `INSERT INTO connected_channels
         (id, user_id, platform, postiz_integration_id, display_name, status, last_synced_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(postiz_integration_id) DO UPDATE SET
         display_name = excluded.display_name,
         status = excluded.status,
         last_synced_at = excluded.last_synced_at`
    )
      .bind(
        c.id,
        c.user_id,
        c.platform,
        c.postiz_integration_id,
        c.display_name,
        c.status,
        c.last_synced_at ?? Math.floor(Date.now() / 1000)
      )
      .run();
  },
  async channelById(env: Env, userId: string, id: string): Promise<ChannelRow | null> {
    return env.DB.prepare("SELECT * FROM connected_channels WHERE id = ?1 AND user_id = ?2")
      .bind(id, userId)
      .first<ChannelRow>();
  },

  // --- drafts ---
  async createDraft(env: Env, userId: string, kind: string, payload: unknown): Promise<DraftRow> {
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const payload_json = JSON.stringify(payload);
    await env.DB.prepare(
      "INSERT INTO drafts (id, user_id, kind, payload_json, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5)"
    )
      .bind(id, userId, kind, payload_json, now)
      .run();
    return { id, user_id: userId, kind, payload_json, created_at: now, updated_at: now };
  },

  // --- schedules ---
  async createSchedule(
    env: Env,
    row: Omit<ScheduleRow, "created_at" | "updated_at" | "id" | "postiz_post_id" | "last_error"> & {
      id?: string;
    }
  ): Promise<ScheduleRow> {
    const now = Math.floor(Date.now() / 1000);
    const id = row.id ?? crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO schedules
         (id, user_id, draft_id, channel_id, postiz_post_id, scheduled_for, status, last_error, created_at, updated_at)
       VALUES (?1,?2,?3,?4,NULL,?5,?6,NULL,?7,?7)`
    )
      .bind(id, row.user_id, row.draft_id, row.channel_id, row.scheduled_for, row.status, now)
      .run();
    return {
      id,
      user_id: row.user_id,
      draft_id: row.draft_id,
      channel_id: row.channel_id,
      postiz_post_id: null,
      scheduled_for: row.scheduled_for,
      status: row.status,
      last_error: null,
      created_at: now,
      updated_at: now,
    };
  },
  async updateScheduleStatus(
    env: Env,
    id: string,
    fields: Partial<Pick<ScheduleRow, "status" | "postiz_post_id" | "last_error">>
  ): Promise<void> {
    const updates: string[] = [];
    const binds: unknown[] = [];
    let i = 1;
    if (fields.status !== undefined) {
      updates.push(`status = ?${i++}`);
      binds.push(fields.status);
    }
    if (fields.postiz_post_id !== undefined) {
      updates.push(`postiz_post_id = ?${i++}`);
      binds.push(fields.postiz_post_id);
    }
    if (fields.last_error !== undefined) {
      updates.push(`last_error = ?${i++}`);
      binds.push(fields.last_error);
    }
    updates.push(`updated_at = ?${i++}`);
    binds.push(Math.floor(Date.now() / 1000));
    binds.push(id);
    await env.DB.prepare(`UPDATE schedules SET ${updates.join(", ")} WHERE id = ?${i}`)
      .bind(...binds)
      .run();
  },
  async scheduleById(env: Env, userId: string, id: string): Promise<ScheduleRow | null> {
    return env.DB.prepare("SELECT * FROM schedules WHERE id = ?1 AND user_id = ?2")
      .bind(id, userId)
      .first<ScheduleRow>();
  },
  async listSchedulesWindow(env: Env, userId: string, fromTs: number, toTs: number): Promise<ScheduleRow[]> {
    const rs = await env.DB.prepare(
      `SELECT * FROM schedules
       WHERE user_id = ?1 AND scheduled_for BETWEEN ?2 AND ?3
       ORDER BY scheduled_for ASC`
    )
      .bind(userId, fromTs, toTs)
      .all<ScheduleRow>();
    return rs.results ?? [];
  },
  async listPendingForReconcile(env: Env, untilTs: number, limit = 50): Promise<ScheduleRow[]> {
    const rs = await env.DB.prepare(
      `SELECT * FROM schedules
       WHERE status IN ('scheduled','pending') AND scheduled_for <= ?1
       ORDER BY scheduled_for ASC LIMIT ?2`
    )
      .bind(untilTs, limit)
      .all<ScheduleRow>();
    return rs.results ?? [];
  },

  // --- media ---
  async insertMedia(env: Env, m: Omit<MediaRow, "created_at">): Promise<MediaRow> {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO media (id, user_id, r2_key, mime, bytes, source, original_url, public_url, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
    )
      .bind(m.id, m.user_id, m.r2_key, m.mime, m.bytes, m.source, m.original_url, m.public_url, now)
      .run();
    return { ...m, created_at: now };
  },
  /**
   * Idempotent insert. r2_key is UNIQUE in the media table; multiple finalize
   * paths (sync POST, client poll, webhook) can race on the same Replicate
   * prediction. INSERT OR IGNORE keeps the first writer, then we SELECT the
   * winning row so the caller always gets a consistent record.
   */
  async insertOrGetMedia(env: Env, m: Omit<MediaRow, "created_at">): Promise<MediaRow> {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO media (id, user_id, r2_key, mime, bytes, source, original_url, public_url, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
    )
      .bind(m.id, m.user_id, m.r2_key, m.mime, m.bytes, m.source, m.original_url, m.public_url, now)
      .run();
    const row = await env.DB.prepare(
      "SELECT * FROM media WHERE r2_key = ?1 LIMIT 1"
    ).bind(m.r2_key).first<MediaRow>();
    if (!row) throw new Error(`insertOrGetMedia: row missing after upsert for ${m.r2_key}`);
    return row;
  },
  async listMedia(env: Env, userId: string, limit = 100): Promise<MediaRow[]> {
    const rs = await env.DB.prepare(
      "SELECT * FROM media WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    )
      .bind(userId, limit)
      .all<MediaRow>();
    return rs.results ?? [];
  },
  async deleteMedia(env: Env, userId: string, id: string): Promise<MediaRow | null> {
    const row = await env.DB.prepare("SELECT * FROM media WHERE id = ?1 AND user_id = ?2")
      .bind(id, userId)
      .first<MediaRow>();
    if (!row) return null;
    await env.DB.prepare("DELETE FROM media WHERE id = ?1").bind(id).run();
    return row;
  },

  // --- job log ---
  async logJob(env: Env, j: Omit<JobLogRow, "created_at" | "finished_at" | "id"> & { id?: string }) {
    const id = j.id ?? crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO job_log (id, user_id, kind, status, attempts, payload_json, error, created_at, finished_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,NULL)`
    )
      .bind(id, j.user_id, j.kind, j.status, j.attempts, j.payload_json, j.error, now)
      .run();
    return id;
  },
  async finishJob(env: Env, id: string, status: string, error: string | null) {
    await env.DB.prepare(
      "UPDATE job_log SET status = ?1, error = ?2, finished_at = ?3 WHERE id = ?4"
    )
      .bind(status, error, Math.floor(Date.now() / 1000), id)
      .run();
  },

  // --- webhooks ---
  async recordWebhookEvent(env: Env, e: {
    id?: string;
    postiz_event_id: string;
    kind: string;
    payload_json: string;
    signature: string;
  }): Promise<{ id: string; alreadyProcessed: boolean }> {
    const id = e.id ?? crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO webhook_events (id, postiz_event_id, kind, payload_json, signature, processed, received_at, processed_at)
         VALUES (?1,?2,?3,?4,?5,0,?6,NULL)`
      )
        .bind(id, e.postiz_event_id, e.kind, e.payload_json, e.signature, now)
        .run();
      return { id, alreadyProcessed: false };
    } catch {
      // UNIQUE violation on postiz_event_id → already seen
      const existing = await env.DB.prepare("SELECT id, processed FROM webhook_events WHERE postiz_event_id = ?1")
        .bind(e.postiz_event_id)
        .first<{ id: string; processed: number }>();
      return { id: existing?.id ?? id, alreadyProcessed: !!existing?.processed };
    }
  },
  async markWebhookProcessed(env: Env, id: string) {
    await env.DB.prepare("UPDATE webhook_events SET processed = 1, processed_at = ?1 WHERE id = ?2")
      .bind(Math.floor(Date.now() / 1000), id)
      .run();
  },
};
