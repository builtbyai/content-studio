import React, { useEffect, useState } from "react";
import { DollarSign, Loader2, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

export default function CostPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await api.costSummary(days)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [days]);

  return (
    <div className="studio-glass rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-sm flex items-center gap-2"><DollarSign className="w-4 h-4" /> Generation Spend</h3>
          <p className="text-[11px] text-studio-soft-white/50 mt-0.5">
            From workflow_audit_events. Image+text generation only — does NOT include AI Gateway analytics (use dashboard for that).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1 text-xs">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button onClick={load} className="text-studio-soft-white/40 hover:text-studio-soft-white"><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </div>
      {loading && !data ? (
        <div className="text-xs text-studio-soft-white/60 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> loading…</div>
      ) : (
        <>
          <div className="text-2xl font-display font-bold text-studio-bronze">${data?.grandTotalUsd ?? 0}</div>
          {(data?.byProvider ?? []).length === 0 ? (
            <div className="text-xs text-studio-soft-white/40">No spend in this window.</div>
          ) : (
            <div className="space-y-1 text-xs">
              {(data?.byProvider ?? []).map((p: any) => (
                <div key={p.provider} className="flex items-center justify-between py-1 border-b border-studio-bronze/10">
                  <div>
                    <div className="font-semibold">{p.provider}</div>
                    <div className="text-[10px] text-studio-soft-white/50">{p.models.join(", ")}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div>${p.totalUsd}</div>
                    <div className="text-[10px] text-studio-soft-white/50">{p.count} calls</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
