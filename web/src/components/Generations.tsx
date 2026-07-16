import React, { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, RefreshCw, ExternalLink, Wand2, Send } from "lucide-react";
import { api } from "../lib/api";
import SendToScheduler from "./SendToScheduler";
import MediaThumb from "./MediaThumb";

interface Asset {
  id: string;
  workflow_id: string;
  provider_id: string;
  model_id: string;
  media_type: string;
  uri: string;
  prompt_id: string;
  metadata_json?: string;
  created_at: string;
  review?: {
    assetId: string;
    overall: number;
    safety: number;
    brandAdherence: number;
    productConsistency: number;
    failureTags: string[];
  } | null;
}

interface RunLog { line: string; kind: "info" | "ok" | "err"; }

// Visible end-to-end driver for the 26-node creative pipeline.
//   Brief → Node 01 → Node 05 → Node 07 → Node 11 → consumer drives Node 09 → Node 13
// Live SSE updates the grid as each asset lands in R2.
export default function Generations() {
  const [brief, setBrief] = useState(() => {
    try {
      const seeded = sessionStorage.getItem("contentforge:prefilled-brief");
      if (seeded) {
        sessionStorage.removeItem("contentforge:prefilled-brief");
        return seeded;
      }
    } catch {}
    return "Premium dark slate roof tiles on a modern Texas luxury home at golden hour, drone shot, cinematic depth.";
  });
  const [conceptCount, setConceptCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<RunLog[]>([]);
  const [recent, setRecent] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWfId, setActiveWfId] = useState<string | null>(null);
  const [schedTarget, setSchedTarget] = useState<{ url: string; copy: string } | null>(null);

  const TEMPLATES = [
    { key: "winter",   label: "❄️ Winter campaign",  brief: "Winter field-campaign suite for Acme — drone roof scan in snow conditions, adjuster evidence center, winter estimator. Cinematic golden-hour drone shots with snow-dusted slate tiles." },
    { key: "storm",    label: "🌪️ Storm response",   brief: "Hail-storm restoration field-team in action. Drone audit shot revealing damage patterns, branded inspection app on tablet, contractor signing storm-restoration claim with adjuster." },
    { key: "luxury",   label: "🏡 Luxury home showcase", brief: "Premium slate-tile installation on Texas luxury estate, bronze flashing details, golden-hour drone hero shot, architectural precision." },
    { key: "drone",    label: "🛰️ Drone tech demo",  brief: "Self-flying drone hovering above a residential roof at sunset, sensor array visible, scanning shingles for hail damage. Sleek tech aesthetic with subtle Acme bronze accent lighting." },
    { key: "solar",    label: "☀️ Solar shingles",    brief: "Tough Solar Shingles — premium glass photovoltaic roof tiles on luxury housing. Modern architecture, soft daylight, dramatic perspective showing the panels seamlessly integrated as roofing." },
  ];
  const refreshTimer = useRef<number | null>(null);

  const append = (line: string, kind: RunLog["kind"] = "info") =>
    setLog((prev) => [{ line, kind }, ...prev].slice(0, 30));

  const load = async () => {
    try {
      const { assets } = await api.recentAssets(60);
      setRecent(assets);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // SSE subscription — listens for "generated" events broadcast by the queue consumer.
  useEffect(() => {
    const es = new EventSource("/api/events/stream", { withCredentials: true } as EventSourceInit);
    es.addEventListener("schedule", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (data.kind === "generated" && Array.isArray(data.assets)) {
          append(`✓ asset (${data.assets[0]?.modelId ?? "?"}) for prompt ${data.promptId?.slice(0, 8)}`, "ok");
          // Lazy refresh
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = window.setTimeout(load, 800) as any;
        }
      } catch {}
    });
    es.onerror = () => { /* SSE auto-reconnects */ };
    return () => es.close();
  }, []);

  const generate = async () => {
    if (!brief.trim() || busy) return;
    setBusy(true); setLog([]); setActiveWfId(null);
    try {
      append("⤷ creating workflow…");
      const wf = await api.createWorkflow({ mode: "execute" });
      setActiveWfId(wf.workflowId);
      append(`workflow ${wf.workflowId.slice(0, 8)} created`, "ok");

      append("⤷ Node 01 + 05 (brief intake → concept gen)…");
      const exec = await api.executeWorkflow(wf.workflowId, {
        brief: { rawBrief: brief.trim(), uploadedAssetIds: [], desiredOutputs: ["image"] },
        conceptCount,
      });
      const concepts = exec.concepts?.data?.concepts ?? [];
      if (concepts.length === 0) { append("no concepts produced — abort", "err"); setBusy(false); return; }
      append(`${concepts.length} concepts: ${concepts.map((c) => c.title).join(" · ")}`, "ok");

      append("⤷ Node 07 + 11 (prompt builder → dispatcher)…");
      const disp = await api.dispatchWorkflow(wf.workflowId, concepts);
      append(`${disp.dispatchedJobIds.length} jobs queued — generation runs async`, "ok");

      append("listening for live results via SSE…");
    } catch (e: any) {
      append(`error: ${e?.body?.message ?? e?.body?.error ?? "unknown"}`, "err");
    } finally {
      setBusy(false);
    }
  };

  const runFull = async () => {
    if (!brief.trim() || busy) return;
    setBusy(true); setLog([]); setActiveWfId(null);
    try {
      append("⤷ /api/workflows/run-full (Phase 1 chain in one call)…");
      const r = await api.runFullWorkflow({
        brief: { rawBrief: brief.trim(), uploadedAssetIds: [], desiredOutputs: ["image"] },
        conceptCount,
      });
      setActiveWfId(r.workflowId);
      append(`workflow ${r.workflowId.slice(0, 8)} · brand ${r.brand?.name ?? "?"} · ${r.conceptCount} concepts · ${r.promptCount} prompts`, "ok");
      append(`${r.dispatchedJobIds.length} jobs queued — listening for SSE…`, "ok");
    } catch (e: any) {
      append(`error: ${e?.body?.message ?? e?.body?.error ?? "unknown"}`, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Wand2 className="w-5 h-5" /> Generations
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          One-shot: brief → concepts → prompts → parallel provider dispatch → R2-stored assets. All audit-ledger-backed.
        </p>
      </div>

      <div className="studio-glass-glow rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] font-mono uppercase text-studio-bronze self-center mr-1">templates:</span>
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => setBrief(t.brief)}
              className="text-[11px] bg-studio-brown/40 hover:bg-studio-brown/60 border border-studio-bronze/15 rounded px-2 py-1"
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          rows={3} value={brief} onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe the creative brief…"
          className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs flex items-center gap-2">
            <span className="text-studio-soft-white/60">Concepts:</span>
            <select
              value={conceptCount} onChange={(e) => setConceptCount(Number(e.target.value))}
              className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1 text-xs"
            >
              {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button
            onClick={generate} disabled={busy || !brief.trim()}
            className="ml-auto flex items-center gap-2 bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-2 rounded disabled:opacity-50"
            title="2-step: execute (Nodes 01+05) then dispatch (Nodes 07+11)"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? "running…" : "Generate"}
          </button>
          <button
            onClick={runFull} disabled={busy || !brief.trim()}
            className="flex items-center gap-2 bg-studio-brown/60 border border-studio-bronze/40 text-studio-soft-white font-semibold text-xs px-4 py-2 rounded disabled:opacity-50"
            title="Single call: Nodes 01 → 02 → 03 → 04 → 05 → 07 → 08 → 10 → 11"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            Run full pipeline
          </button>
        </div>
        {log.length > 0 && (
          <div className="font-mono text-[10px] bg-studio-warm-black/60 border border-studio-bronze/15 rounded p-2 max-h-40 overflow-y-auto">
            {log.map((l, i) => (
              <div key={i} className={l.kind === "ok" ? "text-green-400" : l.kind === "err" ? "text-red-400" : "text-studio-soft-white/70"}>
                {l.line}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-display font-bold">Recent generations</h3>
          <button onClick={load} className="text-studio-soft-white/40 hover:text-studio-soft-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {loading ? (
          <div className="text-xs text-studio-soft-white/60 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> loading…</div>
        ) : recent.length === 0 ? (
          <div className="studio-glass rounded-lg p-8 text-center text-sm text-studio-soft-white/60">
            No generations yet. Type a brief above and click Generate.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {recent.map((a) => (
              <div key={a.id} className={`studio-glass rounded-lg overflow-hidden flex flex-col ${activeWfId === a.workflow_id ? "ring-2 ring-studio-bronze" : ""}`}>
                <div className="aspect-square bg-studio-warm-black/60 relative">
                  <MediaThumb
                    url={a.uri}
                    mime={a.media_type === "video" ? "video/mp4" : a.media_type === "image" ? "image/png" : "application/octet-stream"}
                  />
                  {a.review && typeof a.review.overall === "number" && (
                    <div
                      className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                        a.review.overall >= 0.8 ? "bg-green-600/90 text-white" :
                        a.review.overall >= 0.6 ? "bg-yellow-600/90 text-white" :
                                                  "bg-red-600/90 text-white"
                      }`}
                      title={`safety ${a.review.safety} · brand ${a.review.brandAdherence} · product ${a.review.productConsistency}${a.review.failureTags?.length ? " · ⚠ " + a.review.failureTags.join(", ") : ""}`}
                    >
                      {Math.round(a.review.overall * 100)}
                    </div>
                  )}
                </div>
                <div className="p-2 text-[10px] font-mono space-y-0.5">
                  <div className="text-studio-bronze">{a.provider_id}/{a.model_id.split("/").pop()}</div>
                  <div className="text-studio-soft-white/50">wf {a.workflow_id.slice(0, 8)}</div>
                  <div className="flex items-center justify-between mt-1">
                    <a href={a.uri} target="_blank" rel="noreferrer" className="text-studio-bronze hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> open
                    </a>
                    <button
                      onClick={() => setSchedTarget({ url: a.uri, copy: "" })}
                      className="text-studio-bronze hover:underline flex items-center gap-1"
                      title="Send to Scheduler"
                    >
                      <Send className="w-3 h-3" /> schedule
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SendToScheduler
        open={!!schedTarget}
        onClose={() => setSchedTarget(null)}
        mediaUrl={schedTarget?.url ?? ""}
        initialCopy={schedTarget?.copy ?? brief.slice(0, 240)}
      />
    </div>
  );
}
