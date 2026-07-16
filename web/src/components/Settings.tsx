import React, { useEffect, useState } from "react";
import { Settings as SettingsIcon, Plus, Trash2, Power, RefreshCw, Loader2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { api, type ApiSource } from "../lib/api";
import SystemStatus from "./SystemStatus";

const KIND_OPTIONS = [
  { id: "rss",    label: "RSS / Atom feed" },
  { id: "reddit", label: "Reddit (subreddit/.json)" },
  { id: "sitemap", label: "Sitemap" },
];

export default function Settings() {
  const [sources, setSources] = useState<ApiSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ url: "", label: "", kind: "rss", category: "general", badge: "Article" });
  const [busy, setBusy] = useState(false);
  const [lastIngest, setLastIngest] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { sources } = await api.listSources();
      setSources(sources);
    } catch (e: any) {
      setErr(e?.body?.error ?? "load failed");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.url.trim() || !form.label.trim()) return;
    setBusy(true); setErr(null);
    try {
      const { source } = await api.createSource(form);
      setSources((prev) => [...prev, source]);
      setForm({ url: "", label: "", kind: "rss", category: "general", badge: "Article" });
      setAdding(false);
    } catch (e: any) {
      setErr(e?.body?.message ?? "create failed");
    } finally { setBusy(false); }
  };
  const toggle = async (s: ApiSource) => {
    await api.updateSource(s.id, { is_active: s.is_active ? 0 : 1 });
    setSources((prev) => prev.map((x) => x.id === s.id ? { ...x, is_active: x.is_active ? 0 : 1 } : x));
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this source?")) return;
    await api.deleteSource(id);
    setSources((prev) => prev.filter((x) => x.id !== id));
  };
  const runNow = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.runIngestNow();
      setLastIngest(`Ingest done: ${r.new} new from ${r.processed} sources · ${r.errors} errors`);
      await load();
    } catch (e: any) {
      setErr(e?.body?.message ?? "ingest failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" /> Settings
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Configure content sources, view system health, manage credentials.
        </p>
      </div>

      <SystemStatus />

      <div className="studio-glass rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-sm">Content Sources</h3>
            <p className="text-[11px] text-studio-soft-white/50 mt-0.5">
              Worker cron pulls these every ~6h. Auto-mutes after 5 consecutive failures.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runNow} disabled={busy}
              className="flex items-center gap-1 text-xs bg-studio-brown/40 border border-studio-bronze/20 px-3 py-1.5 rounded hover:bg-studio-brown/60 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Run ingest now
            </button>
            <button
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1 text-xs bg-studio-bronze text-studio-warm-black font-semibold px-3 py-1.5 rounded"
            >
              <Plus className="w-3 h-3" /> Add source
            </button>
          </div>
        </div>

        {lastIngest && (
          <div className="text-xs text-green-300/80 bg-green-900/10 border border-green-700/30 rounded p-2">
            {lastIngest}
          </div>
        )}
        {err && (
          <div className="text-xs text-red-300 bg-red-900/15 border border-red-700/30 rounded p-2">{err}</div>
        )}

        {adding && (
          <div className="studio-glass-glow rounded p-3 space-y-2">
            <div className="grid md:grid-cols-2 gap-2">
              <input
                value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Label, e.g. Acme Blog"
                className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
              />
              <select
                value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
              >
                {KIND_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
            <input
              value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://… (RSS) or https://reddit.com/r/Roofing/.json"
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Category (e.g. Guides)"
                className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
              />
              <select
                value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })}
                className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
              >
                <option value="Article">Article</option>
                <option value="Guide">Guide</option>
                <option value="Review">Review</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={create} disabled={busy || !form.url.trim() || !form.label.trim()}
                className="bg-studio-bronze text-studio-warm-black text-xs font-semibold px-4 py-1.5 rounded disabled:opacity-50"
              >Add</button>
              <button onClick={() => setAdding(false)} className="text-xs text-studio-soft-white/50 hover:text-studio-soft-white px-2">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-xs text-studio-soft-white/60 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> loading…</div>
        ) : sources.length === 0 ? (
          <div className="text-xs text-studio-soft-white/40 py-4 text-center">No sources configured. Add one above.</div>
        ) : (
          <div className="divide-y divide-studio-bronze/10">
            {sources.map((s) => (
              <div key={s.id} className="flex items-start gap-3 py-2 text-xs">
                <button
                  onClick={() => toggle(s)}
                  title={s.is_active ? "Click to mute" : "Click to enable"}
                  className={`mt-0.5 ${s.is_active ? "text-green-400" : "text-studio-soft-white/30"}`}
                >
                  <Power className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono uppercase text-[10px] text-studio-bronze">{s.kind}</span>
                    <span className="font-semibold">{s.label}</span>
                    <span className="text-[10px] text-studio-soft-white/40">· {s.category}</span>
                    {s.fail_count > 0 && (
                      <span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> {s.fail_count} fail
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-studio-soft-white/40 mt-0.5">
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-studio-bronze hover:underline truncate flex items-center gap-1 max-w-md">
                      {s.url} <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                  </div>
                  {s.last_run_at && (
                    <div className="text-[10px] text-studio-soft-white/40 mt-0.5">
                      last run: {new Date(s.last_run_at).toLocaleString()}
                      {s.last_error && <span className="text-red-400 ml-2">· {s.last_error.slice(0, 80)}</span>}
                    </div>
                  )}
                </div>
                <button onClick={() => remove(s.id)} className="text-studio-soft-white/40 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
