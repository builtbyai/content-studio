import React, { useEffect, useMemo, useState } from "react";
import { Calendar as CalIcon, Loader2, Trash2, Clock, CheckCircle2, XCircle, AlertCircle, Send } from "lucide-react";
import { api, type Channel, type Schedule, subscribeScheduleEvents } from "../lib/api";

// Calendar-aware scheduler view. Reads from D1, supports quick compose,
// listens to SSE for live status changes.

export default function Scheduler() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const range = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return { from: now - 7 * 86400, to: now + 30 * 86400 };
  }, []);

  const load = async () => {
    try {
      const [ch, sch] = await Promise.all([
        api.listChannels(),
        api.listSchedules(range.from, range.to),
      ]);
      setChannels(ch.channels);
      setSchedules(sch.schedules);
    } catch (e: any) {
      setErr(e?.body?.error ?? "load failed");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Live status updates via SSE.
  useEffect(() => {
    const off = subscribeScheduleEvents((e) => {
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === e.scheduleId
            ? { ...s, status: e.status, postiz_post_id: (e as any).postizPostId ?? s.postiz_post_id }
            : s
        )
      );
    });
    return off;
  }, []);

  const cancel = async (id: string) => {
    if (!confirm("Cancel this scheduled post?")) return;
    await api.cancelSchedule(id);
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, status: "cancelled" } : s)));
  };

  // Group by day for the calendar list.
  const byDay = useMemo(() => {
    const m = new Map<string, Schedule[]>();
    for (const s of schedules) {
      const d = new Date(s.scheduled_for * 1000);
      const key = d.toISOString().slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [schedules]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <CalIcon className="w-5 h-5" /> Scheduler
          </h2>
          <p className="text-xs text-studio-soft-white/60 mt-1">
            Live view of pending and recent posts. Publishing runs through Postiz + Temporal.
          </p>
        </div>
        <button
          onClick={() => setComposeOpen((v) => !v)}
          className="flex items-center gap-2 text-xs bg-studio-bronze text-studio-warm-black font-semibold px-3 py-1.5 rounded"
        >
          <Send className="w-3.5 h-3.5" /> {composeOpen ? "Close" : "Compose"}
        </button>
      </div>

      {composeOpen && <Compose channels={channels} onCreated={(s) => setSchedules((prev) => [s, ...prev])} />}

      {err && (
        <div className="flex items-center gap-2 bg-red-900/20 border border-red-700/40 rounded p-3 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400" /> {err}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-studio-soft-white/60 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> loading…
        </div>
      ) : byDay.length === 0 ? (
        <div className="studio-glass rounded-lg p-8 text-center text-sm text-studio-soft-white/60">
          Nothing scheduled yet. Use the Copilot/Workflow tabs to draft, then send to scheduler.
        </div>
      ) : (
        <div className="space-y-4">
          {byDay.map(([day, items]) => (
            <div key={day}>
              <div className="text-xs font-mono uppercase text-studio-bronze mb-2">{day}</div>
              <div className="space-y-2">
                {items.map((s) => {
                  const channel = channels.find((c) => c.id === s.channel_id);
                  return (
                    <div key={s.id} className="studio-glass rounded-lg p-3 flex items-center gap-3">
                      <StatusBadge status={s.status} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono uppercase text-studio-soft-white/70">
                          {channel ? `${channel.platform} · ${channel.display_name}` : s.channel_id}
                        </div>
                        <div className="text-[10px] text-studio-soft-white/50">
                          <Clock className="inline w-3 h-3 mr-1" />
                          {new Date(s.scheduled_for * 1000).toLocaleString()}
                          {s.last_error && <span className="text-red-400 ml-2">{s.last_error}</span>}
                        </div>
                      </div>
                      {s.status !== "published" && s.status !== "cancelled" && (
                        <button
                          onClick={() => cancel(s.id)}
                          className="text-studio-soft-white/40 hover:text-red-400"
                          title="Cancel"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { Icon: any; color: string }> = {
    pending:   { Icon: Loader2,      color: "text-yellow-400 animate-spin" },
    scheduled: { Icon: Clock,        color: "text-blue-400" },
    published: { Icon: CheckCircle2, color: "text-green-400" },
    failed:    { Icon: XCircle,      color: "text-red-400" },
    cancelled: { Icon: XCircle,      color: "text-studio-soft-white/30" },
  };
  const { Icon, color } = map[status] ?? map.pending;
  return <Icon className={`w-4 h-4 shrink-0 ${color}`} />;
}

function Compose({ channels, onCreated }: { channels: Channel[]; onCreated: (s: Schedule) => void }) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!channelId && channels[0]) setChannelId(channels[0].id);
  }, [channels, channelId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelId || !content.trim()) return;
    setBusy(true);
    try {
      const { schedule } = await api.schedulePost({
        channelId,
        scheduledFor: new Date(when).toISOString(),
        content: content.trim(),
        draftKind: "free",
      });
      onCreated(schedule);
      setContent("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="studio-glass-glow rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select
          value={channelId} onChange={(e) => setChannelId(e.target.value)}
          className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm"
        >
          {channels.length === 0 && <option value="">No channels connected</option>}
          {channels.map((c) => (
            <option key={c.id} value={c.id}>{c.platform} · {c.display_name}</option>
          ))}
        </select>
        <input
          type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
          className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm"
        />
      </div>
      <textarea
        rows={5} value={content} onChange={(e) => setContent(e.target.value)}
        placeholder="What's the post?"
        className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm"
      />
      <button
        type="submit" disabled={busy || !channelId || !content.trim()}
        className="bg-studio-bronze text-studio-warm-black text-xs font-semibold px-4 py-2 rounded disabled:opacity-50"
      >
        {busy ? "scheduling…" : "Schedule"}
      </button>
    </form>
  );
}
