import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Wand2, Loader2, CheckCircle2, XCircle, Clock, FileText, Palette,
  Box, Layers, ListChecks, DollarSign, GitBranch, Image as ImageIcon, ShieldCheck, ExternalLink,
} from "lucide-react";
import { api } from "../lib/api";

// Phase 1 + queue-side node graph the runner visualises.
// Layout: 3 columns (Intake → Planning → Dispatch+Generate) so we can show
// concept → prompt → cost → dispatch fan-out, plus the consumer chain (09/13/14).
interface NodeDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  col: 0 | 1 | 2 | 3;
  row: number;
  parents?: string[];   // upstream node ids
}

const NODES: NodeDef[] = [
  { id: "node_01_brief_intake",        label: "01 · Brief Intake",         icon: FileText,    col: 0, row: 0 },
  { id: "node_02_brand_resolver",      label: "02 · Brand Resolver",       icon: Palette,     col: 0, row: 1, parents: ["node_01_brief_intake"] },
  { id: "node_03_asset_registry",      label: "03 · Asset Registry",       icon: Box,         col: 0, row: 2, parents: ["node_02_brand_resolver"] },
  { id: "node_04_platform_mapper",     label: "04 · Platform Mapper",      icon: Layers,      col: 0, row: 3, parents: ["node_01_brief_intake"] },

  { id: "node_05_concept_generation",  label: "05 · Concept Gen",          icon: Sparkles,    col: 1, row: 0, parents: ["node_02_brand_resolver", "node_04_platform_mapper"] },
  { id: "node_07_prompt_builder",      label: "07 · Prompt Builder",       icon: ListChecks,  col: 1, row: 1, parents: ["node_05_concept_generation"] },
  { id: "node_08_capability_resolver", label: "08 · Capability Resolver",  icon: GitBranch,   col: 1, row: 2, parents: ["node_07_prompt_builder"] },
  { id: "node_10_cost_governor",       label: "10 · Cost Governor",        icon: DollarSign,  col: 1, row: 3, parents: ["node_08_capability_resolver"] },

  { id: "node_11_dispatcher",          label: "11 · Dispatcher",           icon: GitBranch,   col: 2, row: 0, parents: ["node_10_cost_governor"] },
  { id: "node_09_provider_adapter",    label: "09 · Provider Adapter",     icon: Wand2,       col: 2, row: 1, parents: ["node_11_dispatcher"] },

  { id: "node_13_normalizer",          label: "13 · Normalize → R2",       icon: ImageIcon,   col: 3, row: 0, parents: ["node_09_provider_adapter"] },
  { id: "node_14_review",              label: "14 · Quality Review",       icon: ShieldCheck, col: 3, row: 1, parents: ["node_13_normalizer"] },
];

type NodeState = "idle" | "running" | "completed" | "failed_recoverable" | "failed_terminal" | "review_required" | "queued";

interface NodeRuntime {
  state: NodeState;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
}

interface AssetTile { id: string; uri: string; modelId: string; reviewScore?: number; }

export default function WorkflowRunner() {
  const [brief, setBrief] = useState(() => {
    try { const seeded = sessionStorage.getItem("contentforge:prefilled-brief"); if (seeded) { sessionStorage.removeItem("contentforge:prefilled-brief"); return seeded; } } catch {}
    return "Premium dark slate roof tiles on a modern Texas luxury home at golden hour, drone shot, cinematic depth.";
  });
  const [conceptCount, setConceptCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Record<string, NodeRuntime>>({});
  const [assets, setAssets] = useState<AssetTile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [totalSpent, setTotalSpent] = useState(0);

  // SSE subscription — listens for node events + generated events for the active workflow.
  // Use a ref for workflowId so the EventSource doesn't get re-created on every workflow change
  // (which would drop in-flight events fired by the queue consumer during reconnect).
  const esRef = useRef<EventSource | null>(null);
  const activeWfRef = useRef<string | null>(null);
  useEffect(() => { activeWfRef.current = workflowId; }, [workflowId]);

  useEffect(() => {
    const es = new EventSource("/api/events/stream", { withCredentials: true } as EventSourceInit);
    esRef.current = es;
    es.addEventListener("schedule", (ev) => {
      try {
        const d = JSON.parse((ev as MessageEvent).data);
        // Only react to events for the workflow we're currently running.
        const wf = activeWfRef.current;
        if (d.workflowId && wf && d.workflowId !== wf) return;

        if (d.kind === "node") {
          setRuntime((prev) => {
            const cur: NodeRuntime = prev[d.nodeId] ?? { state: "idle" };
            const next: NodeRuntime = { ...cur };
            if (d.state === "running") {
              next.state = "running";
              next.startedAt = d.at ?? Date.now();
            } else {
              next.state = (d.state as NodeState) ?? "completed";
              next.finishedAt = d.at ?? Date.now();
              if (next.startedAt) next.durationMs = next.finishedAt - next.startedAt;
            }
            return { ...prev, [d.nodeId]: next };
          });
        } else if (d.kind === "node_failed") {
          // Queue consumer reported a terminal-ish failure for a generate job.
          // Mark Node 09 + downstream as failed so user sees the dead state.
          const failState: NodeState = d.terminal ? "failed_terminal" : "failed_recoverable";
          setRuntime((prev) => ({
            ...prev,
            node_09_provider_adapter: { ...(prev.node_09_provider_adapter ?? { state: "idle" }), state: failState, finishedAt: Date.now() },
            node_13_normalizer:       { ...(prev.node_13_normalizer ?? { state: "idle" }), state: failState, finishedAt: Date.now() },
            node_14_review:           { ...(prev.node_14_review ?? { state: "idle" }), state: failState, finishedAt: Date.now() },
          }));
          if (d.error) setError(String(d.error));
        } else if (d.kind === "generated") {
          // Surface Node 09 → 13 → 14 results.
          setRuntime((prev) => ({
            ...prev,
            node_09_provider_adapter: { ...(prev.node_09_provider_adapter ?? { state: "idle" }), state: "completed", finishedAt: Date.now() },
            node_13_normalizer:       { ...(prev.node_13_normalizer ?? { state: "idle" }), state: "completed", finishedAt: Date.now() },
            node_14_review:           { ...(prev.node_14_review ?? { state: "idle" }),
                                         state: d.review?.failedCount > 0 ? "review_required" : "completed",
                                         finishedAt: Date.now() },
          }));
          if (Array.isArray(d.assets)) {
            setAssets((prev) => {
              const next = [...prev];
              for (const a of d.assets) {
                if (!next.some((x) => x.id === a.id)) {
                  next.push({ id: a.id, uri: a.uri, modelId: a.modelId, reviewScore: d.review?.avgOverall });
                }
              }
              return next;
            });
          }
          if (d.spent?.estimatedCostUsd) setTotalSpent((t) => Math.round((t + d.spent.estimatedCostUsd) * 1000) / 1000);
        }
      } catch {}
    });
    return () => es.close();
  }, []);

  const reset = () => {
    setRuntime({});
    setAssets([]);
    setError(null);
    setTotalSpent(0);
  };

  const run = async () => {
    if (!brief.trim() || busy) return;
    reset();
    setBusy(true);
    try {
      // Pre-mark Phase 1 nodes as "queued" so the user sees the full graph
      const initialQueued: Record<string, NodeRuntime> = {};
      for (const n of NODES) initialQueued[n.id] = { state: "queued" };
      setRuntime(initialQueued);

      const r = await api.runFullWorkflow({
        brief: { rawBrief: brief.trim(), uploadedAssetIds: [], desiredOutputs: ["image"] },
        conceptCount,
      });
      setWorkflowId(r.workflowId);
      // Server has now finished Phase 1 (nodes 01-11). Mark those completed if SSE hasn't already.
      setRuntime((prev) => {
        const next = { ...prev };
        for (const id of ["node_01_brief_intake", "node_02_brand_resolver", "node_03_asset_registry", "node_04_platform_mapper",
                          "node_05_concept_generation", "node_07_prompt_builder", "node_08_capability_resolver",
                          "node_10_cost_governor", "node_11_dispatcher"]) {
          if (next[id]?.state !== "completed") next[id] = { ...next[id], state: "completed", finishedAt: Date.now() };
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.body?.message ?? e?.body?.error ?? "run failed");
    } finally {
      setBusy(false);
    }
  };

  // Layout: 4 columns, max 4 rows per column. Compute a fixed grid.
  const cols = 4;
  const maxRow = NODES.reduce((m, n) => Math.max(m, n.row), 0);
  const grid = useMemo(() => {
    const g: (NodeDef | null)[][] = Array.from({ length: maxRow + 1 }, () => Array(cols).fill(null));
    for (const n of NODES) g[n.row][n.col] = n;
    return g;
  }, [maxRow]);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-studio-bronze" /> Workflow Runner
        </h2>
        <p className="text-xs text-studio-text-muted mt-1">
          Live Phase-1 pipeline. Type a brief → watch 12 nodes light up in real time as they execute. R2-stored assets stream in below.
        </p>
      </header>

      {/* Brief composer */}
      <section className="studio-card-raised p-4 space-y-3">
        <textarea
          rows={3} value={brief} onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe the creative brief…"
          className="studio-input w-full px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-studio-text-muted">Concepts:</span>
            <select
              value={conceptCount} onChange={(e) => setConceptCount(Number(e.target.value))}
              className="studio-input px-2 py-1.5"
            >
              {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button
            onClick={run} disabled={busy || !brief.trim()}
            className="studio-btn-primary px-4 py-2 rounded-lg text-xs flex items-center gap-2 ml-auto disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? "Running pipeline…" : "Run pipeline"}
          </button>
          {workflowId && (
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); }}
              className="text-studio-text-subtle font-mono"
              title={workflowId}
            >
              wf {workflowId.slice(0, 8)}
            </a>
          )}
          {totalSpent > 0 && (
            <span className="font-mono text-studio-bronze text-[11px]">
              spend ${totalSpent.toFixed(3)}
            </span>
          )}
        </div>
        {error && <div className="bg-studio-danger/10 border border-studio-danger/40 rounded p-2 text-xs text-studio-danger">{error}</div>}
      </section>

      {/* Live node graph */}
      <section className="studio-card-raised p-4 overflow-x-auto">
        <div className="text-[10px] font-mono uppercase tracking-widest text-studio-text-subtle mb-3">Pipeline execution</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(180px, 1fr))`, gridAutoRows: "min-content" }}>
          {/* render in row-major order so we can use grid-row to position */}
          {NODES.map((n) => (
            <NodeCard
              key={n.id}
              node={n}
              rt={runtime[n.id]}
            />
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 text-[10px] font-mono text-studio-text-subtle">
          <span className="inline-flex items-center gap-1"><span className="studio-dot studio-dot-info" /> running</span>
          <span className="inline-flex items-center gap-1"><span className="studio-dot studio-dot-success" /> completed</span>
          <span className="inline-flex items-center gap-1"><span className="studio-dot studio-dot-warning" /> review</span>
          <span className="inline-flex items-center gap-1"><span className="studio-dot studio-dot-danger" /> failed</span>
        </div>
      </section>

      {/* Live asset stream */}
      {assets.length > 0 && (
        <section>
          <h3 className="text-sm font-display font-bold mb-3">Assets streaming in ({assets.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {assets.map((a) => (
              <a key={a.id} href={a.uri} target="_blank" rel="noreferrer" className="studio-card overflow-hidden block hover:border-studio-border-strong transition-colors group">
                <div className="aspect-square bg-studio-surface-2 relative">
                  <img src={a.uri} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {a.reviewScore != null && (
                    <div className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                      a.reviewScore >= 0.8 ? "bg-studio-success/90 text-studio-bg" :
                      a.reviewScore >= 0.6 ? "bg-studio-warning/90 text-studio-bg" :
                                              "bg-studio-danger/90 text-studio-bg"
                    }`}>
                      {Math.round(a.reviewScore * 100)}
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5 text-[10px] font-mono text-studio-text-subtle flex items-center justify-between">
                  <span className="truncate">{a.modelId.split("/").pop()}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NodeCard({ node, rt }: { node: NodeDef; rt: NodeRuntime | undefined }) {
  const state = rt?.state ?? "idle";
  const Icon = node.icon;

  const stateStyles: Record<string, { ring: string; dot: string; text: string }> = {
    idle:               { ring: "border-studio-border",        dot: "bg-studio-text-subtle",  text: "idle" },
    queued:             { ring: "border-studio-border",        dot: "bg-studio-text-subtle/60", text: "queued" },
    running:            { ring: "border-studio-info/60",       dot: "bg-studio-info animate-pulse", text: "running…" },
    completed:          { ring: "border-studio-success/40",    dot: "bg-studio-success",      text: "completed" },
    review_required:    { ring: "border-studio-warning/50",    dot: "bg-studio-warning",      text: "review" },
    failed_recoverable: { ring: "border-studio-warning/50",    dot: "bg-studio-warning",      text: "failed (recoverable)" },
    failed_terminal:    { ring: "border-studio-danger/50",     dot: "bg-studio-danger",       text: "failed" },
  };
  const s = stateStyles[state] ?? stateStyles.idle;
  const dur = rt?.durationMs;

  return (
    <div
      className={`studio-card p-2.5 border ${s.ring} transition-colors`}
      style={{ gridColumn: node.col + 1, gridRow: node.row + 1 }}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${state === "running" ? "text-studio-info" : state === "completed" ? "text-studio-success" : "text-studio-text-muted"}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold truncate">{node.label}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot}`} />
            <span className="text-[10px] font-mono text-studio-text-subtle">{s.text}</span>
            {dur != null && state === "completed" && (
              <span className="text-[10px] font-mono text-studio-text-subtle ml-auto">{(dur / 1000).toFixed(1)}s</span>
            )}
            {state === "running" && rt?.startedAt && (
              <RunningTimer startedAt={rt.startedAt} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RunningTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  return <span className="text-[10px] font-mono text-studio-info ml-auto">{((now - startedAt) / 1000).toFixed(1)}s</span>;
}
