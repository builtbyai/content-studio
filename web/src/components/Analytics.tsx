import React, { useEffect, useState } from "react";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { api, type Channel } from "../lib/api";

export default function Analytics() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listChannels().then((r) => {
      setChannels(r.channels);
      if (r.channels[0]) setSelected(r.channels[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setData(null); setErr(null);
    api.analytics(selected, days)
      .then((r) => setData(r.analytics))
      .catch((e) => setErr(e?.body?.message ?? "failed"));
  }, [selected, days]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> Analytics
          </h2>
          <p className="text-xs text-studio-soft-white/60 mt-1">
            Postiz-sourced metrics, per channel. Engagement, impressions, follower trends.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selected} onChange={(e) => setSelected(e.target.value)}
            className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-1.5 text-xs"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.platform} · {c.display_name}</option>
            ))}
          </select>
          <select
            value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-1.5 text-xs"
          >
            <option value={7}>7d</option>
            <option value={30}>30d</option>
            <option value={90}>90d</option>
          </select>
        </div>
      </div>

      {loading || (!data && !err) ? (
        <div className="text-studio-soft-white/60 text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> loading…
        </div>
      ) : err ? (
        <div className="bg-red-900/20 border border-red-700/40 rounded p-3 text-xs text-red-300">
          {err}
        </div>
      ) : (
        // Postiz's analytics shape varies; render JSON until we pin the contract.
        <div className="studio-glass rounded-lg p-4 overflow-auto">
          <pre className="text-[11px] font-mono text-studio-soft-white/80 whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
