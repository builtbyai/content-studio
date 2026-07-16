import React, { useEffect, useMemo, useState } from "react";
import { Calendar as CalIcon, Loader2, RefreshCw, Plus, Trash2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { api, type Channel, type Schedule, subscribeScheduleEvents } from "../lib/api";

// Weekly grid view of D1-backed schedules. Same data source as the Queue
// sub-tab (Scheduler.tsx) — both call /api/posts. SSE keeps statuses live.

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekStart(d = new Date()): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const wd = (r.getDay() + 6) % 7; // Mon = 0
  r.setDate(r.getDate() - wd);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function PlanWeekly() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const weekStartDate = useMemo(() => addDays(weekStart(), weekOffset * 7), [weekOffset]);
  const weekEndDate = useMemo(() => addDays(weekStartDate, 7), [weekStartDate]);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const fromTs = Math.floor(weekStartDate.getTime() / 1000);
      const toTs = Math.floor(weekEndDate.getTime() / 1000);
      const [ch, sch] = await Promise.all([
        api.listChannels(),
        api.listSchedules(fromTs - 7 * 86400, toTs + 7 * 86400),  // pull a small buffer
      ]);
      setChannels(ch.channels);
      setSchedules(sch.schedules);
    } catch (e: any) {
      setErr(e?.body?.error ?? "load failed");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [weekOffset]);

  useEffect(() => {
    const off = subscribeScheduleEvents((e) => {
      setSchedules((prev) => prev.map((s) => s.id === e.scheduleId ? { ...s, status: e.status } : s));
    });
    return off;
  }, []);

  const cancel = async (id: string) => {
    if (!confirm("Cancel this scheduled post?")) return;
    await api.cancelSchedule(id);
    setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, status: "cancelled" } : s));
  };

  // Group schedules by day-of-week within the visible week.
  const byDay: Schedule[][] = useMemo(() => {
    const grid: Schedule[][] = Array.from({ length: 7 }, () => []);
    for (const s of schedules) {
      const d = new Date(s.scheduled_for * 1000);
      if (d >= weekStartDate && d < weekEndDate) {
        const wd = (d.getDay() + 6) % 7;
        grid[wd].push(s);
      }
    }
    for (const list of grid) list.sort((a, b) => a.scheduled_for - b.scheduled_for);
    return grid;
  }, [schedules, weekStartDate, weekEndDate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <CalIcon className="w-5 h-5" /> Weekly Plan
          </h2>
          <p className="text-xs text-studio-soft-white/60 mt-1">
            Live D1-backed grid. Same data as the Queue sub-tab. SSE keeps statuses live.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(weekOffset - 1)} className="text-xs px-2 py-1 rounded bg-studio-brown/40 border border-studio-bronze/20 hover:bg-studio-brown/60">‹</button>
          <span className="text-xs font-mono">
            {weekStartDate.toLocaleDateString()} → {addDays(weekEndDate, -1).toLocaleDateString()}
          </span>
          <button onClick={() => setWeekOffset(weekOffset + 1)} className="text-xs px-2 py-1 rounded bg-studio-brown/40 border border-studio-bronze/20 hover:bg-studio-brown/60">›</button>
          <button onClick={() => setWeekOffset(0)} className="text-[10px] px-2 py-1 rounded bg-studio-brown/40 border border-studio-bronze/20 hover:bg-studio-brown/60 font-mono uppercase">this week</button>
          <button onClick={load} disabled={loading} className="text-studio-soft-white/50 hover:text-studio-soft-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {err && <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-xs text-red-300">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {DAYS.map((day, i) => {
          const d = addDays(weekStartDate, i);
          const items = byDay[i] ?? [];
          return (
            <div key={day} className="studio-glass rounded-lg p-2 min-h-[160px]">
              <div className="flex items-baseline justify-between mb-2 px-1">
                <div className="text-[10px] font-mono uppercase text-studio-bronze">{day}</div>
                <div className="text-[10px] text-studio-soft-white/40">{d.getDate()}</div>
              </div>
              <div className="space-y-1.5">
                {items.length === 0 && (
                  <div className="text-[10px] text-studio-soft-white/30 px-1 py-2">no posts</div>
                )}
                {items.map((s) => {
                  const ch = channels.find((c) => c.id === s.channel_id);
                  const t = new Date(s.scheduled_for * 1000);
                  return (
                    <div key={s.id} className="bg-studio-brown/30 border border-studio-bronze/15 rounded p-1.5 text-[11px] group">
                      <div className="flex items-center justify-between">
                        <StatusBadge status={s.status} />
                        <span className="font-mono text-studio-soft-white/50">
                          {t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="text-studio-soft-white/80 truncate mt-1">
                        {ch ? `${ch.platform}` : s.channel_id.slice(0, 8)}
                      </div>
                      {s.status !== "published" && s.status !== "cancelled" && (
                        <button
                          onClick={() => cancel(s.id)}
                          className="opacity-0 group-hover:opacity-100 text-studio-soft-white/40 hover:text-red-400 mt-1"
                          title="Cancel"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-studio-soft-white/50">
        💡 Compose new posts in <strong>Plan › Queue</strong> — they'll appear here on the right day.
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "published") return <CheckCircle2 className="w-3 h-3 text-green-400" />;
  if (status === "failed")    return <XCircle className="w-3 h-3 text-red-400" />;
  if (status === "cancelled") return <XCircle className="w-3 h-3 text-studio-soft-white/30" />;
  if (status === "pending")   return <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />;
  return <Clock className="w-3 h-3 text-blue-400" />;
}
