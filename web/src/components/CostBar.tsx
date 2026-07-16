import React, { useEffect, useState } from "react";
import { DollarSign, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useJobs } from "../lib/use-jobs";

// Bottom-bar cost tracker: today + month + all-time + inflight count.
// Auto-refresh every 30s + on every job state change.

export default function CostBar() {
  const jobs = useJobs();
  const [spend, setSpend] = useState<Awaited<ReturnType<typeof api.spend>> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSpend = async () => {
    try { const s = await api.spend(); setSpend(s); } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchSpend();
    const handle = setInterval(fetchSpend, 30_000);
    return () => clearInterval(handle);
  }, []);

  // Re-fetch when any job hits a terminal state.
  useEffect(() => {
    const terminal = jobs.jobs.filter((j) => j.status === "succeeded" || j.status === "failed");
    if (terminal.length > 0) fetchSpend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.jobs.filter((j) => j.status === "succeeded" || j.status === "failed").length]);

  return (
    <div className="fixed bottom-3 right-3 z-30">
      <div className="studio-glass rounded-lg border border-studio-bronze/30 shadow-lg overflow-hidden text-xs">
        <button onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-studio-bronze/10">
          <DollarSign className="w-3.5 h-3.5 text-studio-bronze" />
          <span className="font-mono">
            today <span className="text-studio-bronze">${(spend?.today.total ?? 0).toFixed(2)}</span>
            <span className="text-studio-soft-white/40 mx-1.5">·</span>
            mo <span className="text-studio-bronze">${(spend?.month.total ?? 0).toFixed(2)}</span>
            {spend && spend.inflight > 0 && (
              <>
                <span className="text-studio-soft-white/40 mx-1.5">·</span>
                <span className="text-studio-bronze">{spend.inflight}<Loader2 className="w-2.5 h-2.5 inline animate-spin ml-0.5" /></span>
              </>
            )}
          </span>
          {expanded ? <ChevronDown className="w-3 h-3 text-studio-soft-white/50" /> : <ChevronUp className="w-3 h-3 text-studio-soft-white/50" />}
        </button>
        {expanded && spend && (
          <div className="px-3 py-2 border-t border-studio-bronze/15 space-y-2 max-w-sm">
            <div className="text-[10px] text-studio-soft-white/50">{spend.notice}</div>
            <Section label="today"   data={spend.today} />
            <Section label="month"   data={spend.month} />
            <Section label="all time" data={spend.allTime} />
          </div>
        )}
        {loading && <div className="px-3 py-1 text-[10px] text-studio-soft-white/40">loading…</div>}
      </div>
    </div>
  );
}

function Section({ label, data }: { label: string; data: { total: number; byModel: Record<string, { count: number; cost: number; rate: number }> } }) {
  const rows = Object.entries(data.byModel).sort((a, b) => b[1].cost - a[1].cost);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono uppercase text-[10px] text-studio-soft-white/50">{label}</span>
        <span className="font-mono text-studio-bronze">${data.total.toFixed(2)}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[10px] text-studio-soft-white/30">(no gens)</div>
      ) : (
        <div className="space-y-0.5">
          {rows.slice(0, 6).map(([model, v]) => (
            <div key={model} className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-studio-soft-white/60 truncate max-w-[210px]" title={model}>{model.replace(/^replicate\//, "").replace(/^@cf\//, "")}</span>
              <span className="text-studio-bronze">×{v.count} · ${v.cost.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
