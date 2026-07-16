import React, { useState } from "react";
import { Sparkles, Loader2, Play, X, Plus, ChevronDown, ChevronUp, Image as ImageIcon, Film, Type, Wand2, ArrowDown } from "lucide-react";
import { api } from "../lib/api";
import { useJobs } from "../lib/use-jobs";
import PromptSuggest from "./PromptSuggest";

// Chainable generation pipeline. Each node has:
//   kind: text | image | video
//   prompt template (can reference {{prev_image}} or {{prev_text}})
//   provider/model
//
// "Run" executes the chain top-to-bottom. Each node's output becomes available
// as {{prev_*}} variables for the next node. Designed for storyboard-style
// flows: idea text → keyframe image → cinematic video → second shot, etc.

type NodeKind = "text" | "image" | "video";

interface ChainNode {
  id: string;
  kind: NodeKind;
  label: string;
  prompt: string;
  // Provider/model picks per kind:
  imageQuality?: "low" | "medium" | "high" | "auto";
  imageSize?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  videoModelKey?: string;
  aspectRatio?: string;
  duration?: number;
  open?: boolean;
}

interface NodeResult {
  nodeId: string;
  kind: NodeKind;
  publicUrl?: string;
  text?: string;
  mediaId?: string;
  status: "pending" | "running" | "done" | "failed";
  error?: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);

const seed: ChainNode[] = [
  { id: uid(), kind: "text",  label: "Brief → headline",         prompt: "Write a 6-word cinematic headline for this brief: A luxury EV launch teaser, golden hour through canyon roads.", open: false },
  { id: uid(), kind: "image", label: "Keyframe hero shot",       prompt: "Cinematic wide aerial of a black luxury EV racing along a winding sandstone canyon at golden hour, dust trail, anamorphic flare, shallow DOF, 35mm grain", imageQuality: "high", imageSize: "1536x1024", open: false },
  { id: uid(), kind: "video", label: "Animate keyframe",         prompt: "Slow drone push-in as the car races forward, motion blur on wheels, sun flare crossing the frame, gentle camera shake", videoModelKey: "veo3_fast", aspectRatio: "16:9", duration: 6, open: false },
];

export default function WorkflowComposer() {
  const jobsCtx = useJobs();
  const [nodes, setNodes] = useState<ChainNode[]>(seed);
  const [results, setResults] = useState<Record<string, NodeResult>>({});
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const update = (id: string, patch: Partial<ChainNode>) =>
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));

  const addNode = (kind: NodeKind) => {
    const labels: Record<NodeKind, string> = { text: "New text", image: "New image", video: "New video" };
    setNodes((prev) => [...prev, { id: uid(), kind, label: labels[kind], prompt: "", open: true }]);
  };

  const removeNode = (id: string) => setNodes((prev) => prev.filter((n) => n.id !== id));

  const moveNode = (id: string, dir: -1 | 1) =>
    setNodes((prev) => {
      const idx = prev.findIndex((n) => n.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  // Replace {{prev_*}} tokens in a prompt using the most recent matching result.
  const interpolate = (prompt: string, allResults: Record<string, NodeResult>, beforeIdx: number): string => {
    let out = prompt;
    // Walk backwards for nearest prev_text / prev_image / prev_video
    let prevText: string | undefined, prevImage: string | undefined, prevVideo: string | undefined;
    for (let i = beforeIdx - 1; i >= 0; i--) {
      const r = allResults[nodes[i].id];
      if (!r) continue;
      if (!prevText && r.kind === "text" && r.text) prevText = r.text;
      if (!prevImage && r.kind === "image" && r.publicUrl) prevImage = r.publicUrl;
      if (!prevVideo && r.kind === "video" && r.publicUrl) prevVideo = r.publicUrl;
    }
    out = out
      .replace(/\{\{\s*prev_text\s*\}\}/g, prevText ?? "")
      .replace(/\{\{\s*prev_image\s*\}\}/g, prevImage ?? "")
      .replace(/\{\{\s*prev_video\s*\}\}/g, prevVideo ?? "");
    return out;
  };

  // Find the most recent image URL upstream from index i, regardless of token usage.
  const upstreamImage = (allResults: Record<string, NodeResult>, beforeIdx: number): string | undefined => {
    for (let i = beforeIdx - 1; i >= 0; i--) {
      const r = allResults[nodes[i].id];
      if (r && r.kind === "image" && r.publicUrl) return r.publicUrl;
    }
    return undefined;
  };

  const runChain = async () => {
    setRunning(true); setErr(null);
    const acc: Record<string, NodeResult> = {};
    setResults({});
    try {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const promptText = interpolate(n.prompt, acc, i);
        acc[n.id] = { nodeId: n.id, kind: n.kind, status: "running" };
        setResults({ ...acc });
        try {
          if (n.kind === "text") {
            const res = await api.chat({
              messages: [
                { role: "system", content: "You are a concise creative director. Return only the requested text, no preamble." },
                { role: "user", content: promptText },
              ],
              max_tokens: 800,
            });
            acc[n.id] = { nodeId: n.id, kind: "text", text: res.content, status: "done" };
          } else if (n.kind === "image") {
            const res = await api.generateImage({
              prompt: promptText,
              quality: n.imageQuality ?? "high",
              size: n.imageSize ?? "1024x1024",
              output_format: "png",
            });
            acc[n.id] = {
              nodeId: n.id, kind: "image",
              publicUrl: (res as any).publicUrl,
              mediaId: (res as any).id,
              status: "done",
            };
          } else if (n.kind === "video") {
            const refImage = upstreamImage(acc, i);
            const res = await api.generateVideo({
              modelKey: n.videoModelKey ?? "veo3_fast",
              prompt: promptText,
              aspectRatio: n.aspectRatio ?? "16:9",
              duration: n.duration ?? 5,
              promptImage: refImage,
              async: true,
              ...({ sourceKind: "workflow_composer" } as any),
            });
            const r = res as any;
            if (r.async) {
              // Track the resulting job; status reflected via SSE in jobsCtx.
              acc[n.id] = { nodeId: n.id, kind: "video", status: "running" };
              // Poll job state till terminal or timeout.
              const deadline = Date.now() + 6 * 60_000;
              while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 4_000));
                // Latest snapshot of jobs lives in jobsCtx; we re-read via api as fallback.
                try {
                  const j = await api.getJob(r.jobId);
                  if (j.job.status === "succeeded") {
                    acc[n.id] = {
                      nodeId: n.id, kind: "video",
                      publicUrl: j.job.output_url ?? undefined,
                      mediaId: j.job.media_id ?? undefined,
                      status: "done",
                    };
                    break;
                  }
                  if (j.job.status === "failed" || j.job.status === "canceled") {
                    acc[n.id] = { nodeId: n.id, kind: "video", status: "failed", error: j.job.error ?? j.job.status };
                    break;
                  }
                } catch { /* keep polling */ }
              }
              if (acc[n.id].status === "running") {
                acc[n.id] = { nodeId: n.id, kind: "video", status: "failed", error: "timed out waiting for job" };
              }
            } else {
              acc[n.id] = {
                nodeId: n.id, kind: "video",
                publicUrl: r.publicUrl, mediaId: r.id, status: "done",
              };
            }
          }
        } catch (e: any) {
          acc[n.id] = { nodeId: n.id, kind: n.kind, status: "failed", error: e?.body?.message ?? e?.body?.error ?? e?.message ?? "node failed" };
        }
        setResults({ ...acc });
        if (acc[n.id].status === "failed") {
          setErr(`Node "${n.label}" failed: ${acc[n.id].error}`);
          break;
        }
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Wand2 className="w-5 h-5" /> Workflow Composer
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Chainable text → image → video pipeline. Use <code className="text-studio-bronze">{"{{prev_text}}"}</code>, <code className="text-studio-bronze">{"{{prev_image}}"}</code>, <code className="text-studio-bronze">{"{{prev_video}}"}</code> to splice upstream outputs into the next node's prompt. Video nodes automatically use the most recent upstream image as the start frame.
        </p>
      </div>

      <div className="studio-glass-glow rounded-lg p-4 flex items-center gap-2 flex-wrap">
        <button onClick={runChain} disabled={running || nodes.length === 0}
          className="flex items-center gap-2 bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-2 rounded disabled:opacity-50">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {running ? "running chain…" : "Run chain"}
        </button>
        <div className="text-studio-soft-white/40">|</div>
        <button onClick={() => addNode("text")} className="flex items-center gap-1 text-xs text-studio-bronze hover:underline"><Plus className="w-3 h-3" /> Text</button>
        <button onClick={() => addNode("image")} className="flex items-center gap-1 text-xs text-studio-bronze hover:underline"><Plus className="w-3 h-3" /> Image</button>
        <button onClick={() => addNode("video")} className="flex items-center gap-1 text-xs text-studio-bronze hover:underline"><Plus className="w-3 h-3" /> Video</button>
        {err && <div className="ml-auto text-[11px] text-red-300 truncate max-w-[420px]" title={err}>{err}</div>}
      </div>

      <div className="space-y-2">
        {nodes.map((n, i) => {
          const res = results[n.id];
          return (
            <React.Fragment key={n.id}>
              <NodeCard
                node={n}
                result={res}
                onChange={(p) => update(n.id, p)}
                onRemove={() => removeNode(n.id)}
                onMove={(d) => moveNode(n.id, d)}
                isFirst={i === 0}
                isLast={i === nodes.length - 1}
              />
              {i < nodes.length - 1 && (
                <div className="flex justify-center text-studio-bronze/50">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function NodeCard({
  node, result, onChange, onRemove, onMove, isFirst, isLast,
}: {
  node: ChainNode;
  result?: NodeResult;
  onChange: (p: Partial<ChainNode>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  isFirst: boolean; isLast: boolean;
}) {
  const Icon = node.kind === "text" ? Type : node.kind === "image" ? ImageIcon : Film;
  const status = result?.status ?? "idle";
  const statusColor =
    status === "done" ? "text-emerald-400" :
    status === "running" ? "text-studio-bronze" :
    status === "failed" ? "text-red-300" : "text-studio-soft-white/40";

  return (
    <div className="studio-glass rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-2.5 border-b border-studio-bronze/10">
        <Icon className="w-4 h-4 text-studio-bronze" />
        <input
          value={node.label} onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1 bg-transparent text-sm font-display font-bold text-studio-bronze focus:outline-none"
        />
        <span className={`text-[10px] font-mono uppercase ${statusColor}`}>
          {status === "running" ? "running…" : status === "done" ? "done" : status === "failed" ? "failed" : "idle"}
        </span>
        <button onClick={() => onMove(-1)} disabled={isFirst}
                className="text-studio-soft-white/50 hover:text-studio-bronze disabled:opacity-30">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onMove(1)} disabled={isLast}
                className="text-studio-soft-white/50 hover:text-studio-bronze disabled:opacity-30">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button onClick={onRemove} className="text-red-300 hover:text-red-200">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-2 text-xs">
        <div className="relative">
          <textarea
            rows={3} value={node.prompt} onChange={(e) => onChange({ prompt: e.target.value })}
            placeholder={`Prompt for ${node.kind}…`}
            className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 font-mono pr-16"
          />
          <div className="absolute top-1.5 right-1.5">
            <PromptSuggest current={node.prompt} onSuggest={(v) => onChange({ prompt: v })} kind={node.kind === "video" ? "video" : node.kind === "image" ? "image" : "text"} />
          </div>
        </div>
        {node.kind === "image" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Quality</div>
              <select value={node.imageQuality ?? "high"} onChange={(e) => onChange({ imageQuality: e.target.value as any })}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="auto">auto</option>
              </select>
            </label>
            <label className="space-y-1">
              <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Size</div>
              <select value={node.imageSize ?? "1024x1024"} onChange={(e) => onChange({ imageSize: e.target.value as any })}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
                <option value="1024x1024">1024×1024</option>
                <option value="1024x1536">1024×1536</option>
                <option value="1536x1024">1536×1024</option>
                <option value="auto">auto</option>
              </select>
            </label>
          </div>
        )}
        {node.kind === "video" && (
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Model</div>
              <select value={node.videoModelKey ?? "veo3_fast"} onChange={(e) => onChange({ videoModelKey: e.target.value })}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
                <option value="veo3_fast">Veo 3 Fast</option>
                <option value="veo3">Veo 3</option>
                <option value="seedance">Seedance 1 Pro</option>
                <option value="kling_t2v">Kling 2.1</option>
                <option value="kling_i2v">Kling 2.1 I2V</option>
                <option value="wan_t2v">Wan 2.5 T2V</option>
                <option value="wan_i2v">Wan 2.5 I2V</option>
                <option value="happyhorse">HappyHorse 1.0</option>
              </select>
            </label>
            <label className="space-y-1">
              <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Aspect</div>
              <select value={node.aspectRatio ?? "16:9"} onChange={(e) => onChange({ aspectRatio: e.target.value })}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
                <option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
              </select>
            </label>
            <label className="space-y-1">
              <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Seconds</div>
              <select value={node.duration ?? 5} onChange={(e) => onChange({ duration: Number(e.target.value) })}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
                {[4, 5, 6, 8, 10].map((d) => <option key={d} value={d}>{d}s</option>)}
              </select>
            </label>
          </div>
        )}
        {result && (
          <div className="pt-2 border-t border-studio-bronze/15">
            {result.status === "running" && (
              <div className="flex items-center gap-2 text-studio-bronze">
                <Loader2 className="w-3 h-3 animate-spin" /> running…
              </div>
            )}
            {result.status === "done" && result.text && (
              <div className="text-studio-soft-white/80 whitespace-pre-wrap">{result.text}</div>
            )}
            {result.status === "done" && result.publicUrl && result.kind === "image" && (
              <img src={result.publicUrl} alt="" className="max-w-full max-h-48 rounded border border-studio-bronze/20" />
            )}
            {result.status === "done" && result.publicUrl && result.kind === "video" && (
              <video src={result.publicUrl} controls className="max-w-full max-h-64 rounded border border-studio-bronze/20" />
            )}
            {result.status === "failed" && (
              <div className="text-red-300/80">{result.error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
