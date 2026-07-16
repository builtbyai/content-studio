import React, { useEffect, useState } from "react";
import { TrendingUp, Loader2, RefreshCw, ExternalLink, Tag, Activity } from "lucide-react";
import { api } from "../lib/api";

// Tagged article signal feed — sentiment + angle + topic + 1-line "signal".
// Powered by the worker's hourly intel tagger pass.

export default function IntelSignals() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.intelSignals>>["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [tagging, setTagging] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [angle, setAngle] = useState<"all" | "competitor" | "industry" | "customer-pain" | "regulatory">("all");

  const refresh = async () => {
    setLoading(true);
    try { const { items } = await api.intelSignals(120); setItems(items); }
    catch {} finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const trigger = async () => {
    setTagging(true);
    try { await api.triggerIntelTag(); await refresh(); }
    catch {} finally { setTagging(false); }
  };

  const seed = async () => {
    setSeeding(true);
    try { await api.seedRoofingSources(); }
    catch {} finally { setSeeding(false); }
  };

  const filtered = angle === "all" ? items : items.filter((x) => x.intel?.angle === angle);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <TrendingUp className="w-5 h-5" /> Intel Signals
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Auto-ingested + LLM-tagged feed: subreddits, competitor blogs, industry RSS. Sentiment + angle + topic + 1-line strategic signal per item.
        </p>
      </div>

      <div className="studio-glass rounded-lg p-3 flex items-center gap-2 flex-wrap text-xs">
        <button onClick={refresh} disabled={loading}
          className="flex items-center gap-1 border border-studio-bronze/30 rounded px-2.5 py-1 text-studio-bronze hover:bg-studio-bronze/10">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} refresh
        </button>
        <button onClick={trigger} disabled={tagging}
          className="flex items-center gap-1 border border-studio-bronze/30 rounded px-2.5 py-1 text-studio-bronze hover:bg-studio-bronze/10">
          {tagging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tag className="w-3 h-3" />} re-tag now
        </button>
        <button onClick={seed} disabled={seeding}
          className="flex items-center gap-1 border border-studio-bronze/30 rounded px-2.5 py-1 text-studio-bronze hover:bg-studio-bronze/10">
          {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />} seed roofing sources
        </button>
        <div className="text-studio-soft-white/40">|</div>
        <span className="font-mono uppercase text-[10px] text-studio-soft-white/50">Angle</span>
        <select value={angle} onChange={(e) => setAngle(e.target.value as any)}
                className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
          <option value="all">all</option>
          <option value="competitor">competitor</option>
          <option value="industry">industry</option>
          <option value="customer-pain">customer pain</option>
          <option value="regulatory">regulatory</option>
        </select>
        <span className="ml-auto text-studio-soft-white/40 font-mono">{filtered.length} signals</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((x) => (
          <div key={x.id} className="studio-glass rounded-lg p-3 space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-display font-bold text-studio-bronze truncate" title={x.title}>{x.title}</div>
                <div className="text-studio-soft-white/70 text-[11px] line-clamp-2" title={x.description}>{x.description}</div>
              </div>
              <a href={x.source_url} target="_blank" rel="noreferrer" className="text-studio-bronze hover:underline flex items-center gap-1 text-[10px]">
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            {x.intel && (
              <div className="border-t border-studio-bronze/15 pt-2 space-y-1">
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <span className={`px-1.5 py-0.5 rounded ${SENTIMENT_BG[x.intel.sentiment] ?? "bg-studio-bronze/20"}`}>{x.intel.sentiment}</span>
                  <span className="px-1.5 py-0.5 rounded bg-studio-bronze/15 text-studio-bronze">{x.intel.angle}</span>
                  <span className="px-1.5 py-0.5 rounded bg-studio-warm-black text-studio-soft-white/70 truncate" title={x.intel.topic}>{x.intel.topic}</span>
                </div>
                <div className="text-studio-soft-white/80 italic">"{x.intel.signal}"</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const SENTIMENT_BG: Record<string, string> = {
  positive: "bg-emerald-700/40 text-emerald-300",
  neutral: "bg-studio-bronze/15 text-studio-bronze",
  negative: "bg-red-700/40 text-red-300",
};
