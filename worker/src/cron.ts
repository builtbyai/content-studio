import type { Env } from "./env";
import { db } from "./db";
import { postiz } from "./postiz";

// Scheduled reconciliation: every minute, look at any schedule whose status is
// 'scheduled' or 'pending' and is due within the next 15 minutes; ask Postiz
// for its current state and reconcile. This is the fallback for missed/dropped
// webhook deliveries (e.g. Cloudflare tunnel flap on postiz-host).

export async function runReconciliation(env: Env): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) + 15 * 60;
  const rows = await db.listPendingForReconcile(env, cutoff, 50);
  if (rows.length === 0) return;

  for (const row of rows) {
    if (!row.postiz_post_id) continue; // not yet handed to Postiz; queue handles it
    try {
      const remote = await postiz.getPost(env, row.postiz_post_id);
      const mapped = mapState(remote.state);
      if (mapped && mapped !== row.status) {
        await db.updateScheduleStatus(env, row.id, {
          status: mapped,
          last_error: remote.error ?? null,
        });
        const dor = env.SCHEDULE_ROOM.get(env.SCHEDULE_ROOM.idFromName(row.user_id));
        await dor.fetch("https://room/broadcast", {
          method: "POST",
          body: JSON.stringify({
            scheduleId: row.id,
            status: mapped,
            source: "reconcile",
            at: Math.floor(Date.now() / 1000),
          }),
        });
      }
    } catch {
      // Ignore individual failures; next run picks them up.
    }
  }
}

function mapState(s: string): string | null {
  switch (s) {
    case "PUBLISHED":
      return "published";
    case "ERROR":
      return "failed";
    case "QUEUE":
    case "DRAFT":
      return "scheduled";
    default:
      return null;
  }
}
