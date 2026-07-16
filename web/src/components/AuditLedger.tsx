import React, { useEffect, useState } from "react";
import { History, RefreshCw, Loader2, ChevronRight, ExternalLink } from "lucide-react";
import { api } from "../lib/api";

export default function AuditLedger() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openWf, setOpenWf] = useState<any>(null);
  const [openAssets, setOpenAssets] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.listWorkflows();
      setWorkflows(r.workflows);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openWorkflow = async (id: string) => {
    setOpenId(id); setOpenWf(null); setOpenAssets([]);
    const [wf, assets] = await Promise.all([
      api.getWorkflow(id),
      api.workflowAssets(id).catch(() => ({ assets: [] })),
    ]);
    setOpenWf(wf);
    setOpenAssets(assets.assets ?? []);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2"><History className="w-5 h-5" /> Audit Ledger</h2>
          <p className="text-xs text-studio-soft-white/60 mt-1">
            Every Node 01-26 invocation across all your workflows. Click a row to see events + assets.
          </p>
        </div>
        <button onClick={load} className="text-studio-soft-white/40 hover:text-studio-soft-white">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-studio-soft-white/60 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> loading…</div>
      ) : workflows.length === 0 ? (
        <div className="studio-glass rounded-lg p-8 text-center text-sm text-studio-soft-white/60">
          No workflows yet. Open Studio › Generations to start one.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
          <div className="space-y-1 max-h-[70vh] overflow-y-auto">
            {workflows.map((w) => (
              <button
                key={w.id}
                onClick={() => openWorkflow(w.id)}
                className={`w-full text-left studio-glass rounded-lg p-3 text-xs flex items-center gap-2 ${
                  openId === w.id ? "ring-1 ring-studio-bronze" : ""
                }`}
              >
                <ChevronRight className="w-3 h-3 text-studio-bronze shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] text-studio-soft-white/40">{w.id.slice(0, 8)}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="bg-studio-brown/40 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase">{w.mode}</span>
                    <span className="text-studio-soft-white/60">{w.event_count} events</span>
                    <span className="text-studio-bronze">· {w.asset_count} assets</span>
                  </div>
                  <div className="text-[10px] text-studio-soft-white/40">
                    {new Date(w.created_at).toLocaleString()}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="studio-glass rounded-lg p-4 min-h-[200px]">
            {!openWf ? (
              <div className="text-xs text-studio-soft-white/40 text-center py-8">Pick a workflow on the left</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="font-mono text-[10px] text-studio-soft-white/40">{openWf.workflowId}</div>
                  <div className="text-sm font-display font-bold">{openAssets.length} assets · {(openWf.audit ?? []).length} audit events</div>
                </div>

                {openAssets.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono uppercase text-studio-bronze mb-2">Assets</div>
                    <div className="grid grid-cols-3 gap-2">
                      {openAssets.map((a) => (
                        <a key={a.id} href={a.uri} target="_blank" rel="noreferrer" className="aspect-square block bg-studio-warm-black/60 rounded overflow-hidden border border-studio-bronze/20">
                          {a.media_type === "image" && <img src={a.uri} alt="" className="w-full h-full object-cover" loading="lazy" />}
                          {a.media_type === "video" && <video src={a.uri} className="w-full h-full object-cover" muted />}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-mono uppercase text-studio-bronze mb-2">Audit events (most recent first)</div>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {(openWf.audit ?? []).map((e: any) => (
                      <div key={e.eventId} className="text-[11px] flex items-start gap-2 py-1 border-b border-studio-bronze/10">
                        <span className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${e.state === "completed" ? "bg-green-400" : e.state === "running" ? "bg-studio-bronze animate-pulse" : "bg-red-400"}`} />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[10px] text-studio-bronze">{e.nodeId}</span>
                          <span className="text-studio-soft-white/60 ml-2">{e.message}</span>
                          <div className="text-[10px] text-studio-soft-white/30">{new Date(e.timestamp).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
