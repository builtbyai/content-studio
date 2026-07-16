import React, { useEffect, useState } from "react";
import { Film, Sparkles, Loader2, FolderOpen, Plus, X, Download, RefreshCw, Layers } from "lucide-react";
import { api } from "../lib/api";
import MediaPicker from "./MediaPicker";
import { useJobs } from "../lib/use-jobs";
import PromptSuggest from "./PromptSuggest";

// Replicate-backed video generation. Hits /api/video/generate which:
//   1. POSTs to api.replicate.com/v1/models/{owner}/{name}/predictions
//   2. Polls inline up to ~110s (Replicate's Prefer: wait + our own poll loop)
//   3. Mirrors the result MP4 into R2 + records a media row
//
// Long-running jobs flip to async mode and are tracked via /api/video/predictions/:id.

interface VideoModel {
  key: string;
  owner: string;
  name: string;
  label: string;
  mediaType: "video" | "image";
  needsImage: boolean;
  unitPriceUsd: number;
  ui: {
    aspectRatios?: string[];
    durations?: number[];
    needsImage?: boolean;
  };
  defaults: Record<string, unknown>;
}

interface Generation {
  id: string;
  predictionId: string;
  model: string;
  mediaType: "video" | "image";
  publicUrl: string;
  bytes: number;
  promptUsed: string;
  status?: string;
}

const DEFAULT_PROMPT =
  "A drone shot gliding over a snow-capped mountain range at golden hour, ribbons of light catching the peaks, cinematic, 35mm, shallow grain";

export default function VideoLab() {
  const jobsCtx = useJobs();
  const [models, setModels] = useState<VideoModel[]>([]);
  const [hasToken, setHasToken] = useState<boolean>(true);
  const [modelKey, setModelKey] = useState<string>("happyhorse");
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [duration, setDuration] = useState<number | undefined>(5);
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [seed, setSeed] = useState<string>("");
  const [promptImage, setPromptImage] = useState<string>("");
  const [promptImageOut, setPromptImageOut] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [outPickerOpen, setOutPickerOpen] = useState(false);
  const [customOwner, setCustomOwner] = useState("");
  const [customName, setCustomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState<string | null>(null);
  const [results, setResults] = useState<Generation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [runInBackground, setRunInBackground] = useState<boolean>(true);
  const [batchOpen, setBatchOpen] = useState<boolean>(false);
  const [batchPrompts, setBatchPrompts] = useState<string>("");
  const [batchId, setBatchId] = useState<string | null>(null);

  useEffect(() => {
    api.listVideoModels()
      .then(({ models, hasToken }) => {
        setModels(models);
        setHasToken(hasToken);
      })
      .catch((e: any) => setErr(e?.body?.message ?? "failed to load model list"));
  }, []);

  const isCustom = modelKey === "__custom__";
  const selected = isCustom ? null : models.find((m) => m.key === modelKey);
  const aspectOptions = selected?.ui.aspectRatios ?? ["16:9", "9:16", "1:1"];
  const durationOptions = selected?.ui.durations ?? [5, 10];
  const needsImage = !!selected?.needsImage;

  useEffect(() => {
    // Reset aspect ratio / duration if the new model doesn't support the current one.
    if (selected) {
      if (!selected.ui.aspectRatios?.includes(aspectRatio)) {
        setAspectRatio(selected.ui.aspectRatios?.[0] ?? "16:9");
      }
      if (duration && !selected.ui.durations?.includes(duration)) {
        setDuration(selected.ui.durations?.[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  const pollUntilDone = async (predictionId: string, promptUsed: string, modelLabel: string) => {
    setPolling(predictionId);
    const deadline = Date.now() + 10 * 60 * 1000; // hard cap 10 minutes
    let last: any;
    try {
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        last = await api.getVideoPrediction(predictionId);
        if (last.status === "succeeded" && last.media) {
          setResults((prev) => [{
            id: last.media.id,
            predictionId,
            model: modelLabel,
            mediaType: "video",
            publicUrl: last.media.publicUrl,
            bytes: 0,
            promptUsed,
          }, ...prev]);
          return;
        }
        if (last.status === "failed" || last.status === "canceled") {
          setErr(last.error ?? `Replicate ${last.status}`);
          return;
        }
      }
      setErr("Generation still running after 10 minutes — check Media Library later.");
    } finally {
      setPolling(null);
    }
  };

  const buildPayload = (overridePrompt?: string, overrideBatchId?: string): any => {
    const payload: any = {
      prompt: (overridePrompt ?? prompt).trim(),
      aspectRatio,
      ...(duration ? { duration } : {}),
      ...(seed.trim() ? { seed: Number(seed) } : {}),
      ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
      ...(promptImage ? { promptImage } : {}),
      ...(promptImageOut ? { promptImageOut } : {}),
      ...(runInBackground ? { async: true } : {}),
      ...(overrideBatchId ? { batchId: overrideBatchId, sourceKind: "video_lab" } : { sourceKind: "video_lab" }),
    };
    if (isCustom) { payload.customOwner = customOwner.trim(); payload.customName = customName.trim(); }
    else { payload.modelKey = modelKey; }
    return payload;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && !promptImage) return;
    if (isCustom && (!customOwner.trim() || !customName.trim())) {
      setErr("Custom model requires owner and name (e.g. owner=alibaba, name=happyhorse-1.0)");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.generateVideo(buildPayload());
      if ((res as any).async) {
        // Background mode — Jobs widget picks it up. Don't block the form.
        return;
      } else {
        const r = res as any;
        setResults((prev) => [{
          id: r.id,
          predictionId: r.predictionId,
          model: r.model,
          mediaType: r.mediaType,
          publicUrl: r.publicUrl,
          bytes: r.bytes ?? 0,
          promptUsed: prompt.trim(),
        }, ...prev]);
      }
    } catch (e: any) {
      const body = e?.body ?? {};
      if (body.predictionId && !runInBackground) {
        await pollUntilDone(body.predictionId, prompt.trim(), selected?.label ?? modelKey);
      } else {
        setErr(body.message ?? body.error ?? e?.message ?? "video generation failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitBatch = async () => {
    const lines = batchPrompts.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setBusy(true); setErr(null);
    const bid = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setBatchId(bid);
    try {
      await Promise.all(lines.map((p) => api.generateVideo(buildPayload(p, bid))));
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.message ?? "batch dispatch failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Film className="w-5 h-5" /> Video Lab
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Direct to <a href="https://replicate.com" target="_blank" rel="noreferrer" className="text-studio-bronze underline">Replicate</a>.
          Outputs are mirrored into R2 + visible in Media Library and the Video Editor.
        </p>
      </div>

      {!hasToken && (
        <div className="studio-card p-4 border-yellow-700/40 bg-yellow-900/10 text-xs text-yellow-200">
          <strong>REPLICATE_API_TOKEN not set on the worker.</strong> Run
          <code className="ml-1 px-1.5 py-0.5 rounded bg-studio-warm-black/60 text-studio-bronze">wrangler secret put REPLICATE_API_TOKEN</code> from <code>worker/</code>.
        </div>
      )}

      <form onSubmit={submit} className="studio-glass-glow rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <label className="space-y-1 md:col-span-2">
            <div className="font-mono uppercase text-studio-soft-white/50">Model</div>
            <select
              value={modelKey} onChange={(e) => setModelKey(e.target.value)}
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5"
            >
              {models.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} — ~${m.unitPriceUsd.toFixed(2)}/clip {m.needsImage ? "· needs image" : ""}
                </option>
              ))}
              <option value="__custom__">Custom — owner/name…</option>
            </select>
          </label>

          {isCustom && (
            <>
              <label className="space-y-1">
                <div className="font-mono uppercase text-studio-soft-white/50">Owner</div>
                <input
                  value={customOwner} onChange={(e) => setCustomOwner(e.target.value)}
                  placeholder="alibaba"
                  className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5"
                />
              </label>
              <label className="space-y-1">
                <div className="font-mono uppercase text-studio-soft-white/50">Model name</div>
                <input
                  value={customName} onChange={(e) => setCustomName(e.target.value)}
                  placeholder="happyhorse-1.0"
                  className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5"
                />
              </label>
            </>
          )}
        </div>

        <div className="relative">
          <textarea
            rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the shot — subject, lens, motion, lighting…"
            className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm pr-16"
          />
          <div className="absolute top-2 right-2"><PromptSuggest current={prompt} onSuggest={setPrompt} kind="video" /></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {aspectOptions.length > 0 && (
            <label className="space-y-1">
              <div className="font-mono uppercase text-studio-soft-white/50">Aspect</div>
              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
                {aspectOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          )}
          {durationOptions.length > 0 && (
            <label className="space-y-1">
              <div className="font-mono uppercase text-studio-soft-white/50">Duration</div>
              <select value={duration ?? ""} onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
                <option value="">model default</option>
                {durationOptions.map((d) => <option key={d} value={d}>{d}s</option>)}
              </select>
            </label>
          )}
          <label className="space-y-1">
            <div className="font-mono uppercase text-studio-soft-white/50">Seed</div>
            <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random"
                   className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
          </label>
          <label className="space-y-1">
            <div className="font-mono uppercase text-studio-soft-white/50">Negative</div>
            <input value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="blurry, lowres"
                   className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-studio-bronze/15">
          <FrameSlot
            label={needsImage ? "Start / intro frame (required for I2V)" : "Start / intro frame (optional)"}
            url={promptImage}
            required={needsImage}
            onPick={() => setPickerOpen(true)}
            onClear={() => setPromptImage("")}
          />
          <FrameSlot
            label="End / outro frame (optional — model dependent)"
            url={promptImageOut}
            onPick={() => setOutPickerOpen(true)}
            onClear={() => setPromptImageOut("")}
          />
        </div>

        {err && (
          <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-xs text-red-300">{err}</div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || !prompt.trim() || (needsImage && !promptImage) || (isCustom && (!customOwner || !customName))}
            className="flex items-center gap-2 bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-2 rounded disabled:opacity-50"
          >
            {busy || polling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {polling ? `polling ${polling.slice(0, 8)}…` : busy ? "queueing…" : runInBackground ? "Queue in background" : "Generate now"}
          </button>
          <label className="flex items-center gap-1.5 text-[11px] text-studio-soft-white/70 cursor-pointer">
            <input type="checkbox" checked={runInBackground} onChange={(e) => setRunInBackground(e.target.checked)} />
            Background (Jobs widget tracks)
          </label>
          <button
            type="button" onClick={() => setBatchOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-studio-bronze hover:underline"
          >
            <Layers className="w-3 h-3" /> {batchOpen ? "hide batch" : "batch mode"}
          </button>
        </div>
        {polling && (
          <p className="text-[11px] text-studio-soft-white/50">
            Long-running prediction. The result will land in Media Library when ready — feel free to navigate away.
          </p>
        )}
        {batchOpen && (
          <div className="pt-3 border-t border-studio-bronze/15 space-y-2">
            <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Batch prompts — one per line, all run with current settings</div>
            <textarea rows={5} value={batchPrompts}
              onChange={(e) => setBatchPrompts(e.target.value)}
              placeholder={"A neon-lit Tokyo alley at midnight, rain pooling on asphalt\nA drone shot over dune sea at sunrise, slow camera rise\nMacro of pour-over coffee bloom, slow steam curl"}
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm font-mono" />
            <button type="button" onClick={submitBatch} disabled={busy || !batchPrompts.trim()}
              className="flex items-center gap-2 bg-studio-bronze/15 hover:bg-studio-bronze/25 border border-studio-bronze/40 rounded px-3 py-1.5 text-studio-bronze text-xs disabled:opacity-50">
              <Sparkles className="w-3 h-3" /> Queue batch ({batchPrompts.split("\n").filter((s) => s.trim()).length})
            </button>
            {batchId && (
              <div className="text-[11px] text-studio-soft-white/60">
                Batch <span className="font-mono text-studio-bronze">{batchId}</span> · {jobsCtx.byBatch(batchId).filter((j) => j.status === "succeeded").length}/{jobsCtx.byBatch(batchId).length} done
              </div>
            )}
          </div>
        )}
      </form>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        filter="image"
        multi={false}
        onPick={(selected) => {
          if (selected[0]) setPromptImage(selected[0].public_url);
        }}
      />
      <MediaPicker
        open={outPickerOpen}
        onClose={() => setOutPickerOpen(false)}
        filter="image"
        multi={false}
        onPick={(selected) => {
          if (selected[0]) setPromptImageOut(selected[0].public_url);
        }}
      />

      {/* (FrameSlot component below) */}
      {results.length > 0 && (
        <div>
          <div className="text-xs font-mono uppercase text-studio-bronze mb-2">Recent generations</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.map((r) => (
              <div key={r.predictionId} className="studio-glass rounded-lg overflow-hidden">
                {r.mediaType === "video" ? (
                  <video src={r.publicUrl} controls className="w-full bg-studio-warm-black" />
                ) : (
                  <img src={r.publicUrl} alt="" className="w-full bg-studio-warm-black" />
                )}
                <div className="p-3 text-[11px] space-y-1">
                  <div className="font-mono text-studio-bronze">{r.model}</div>
                  <div className="text-studio-soft-white/70 line-clamp-2" title={r.promptUsed}>
                    {r.promptUsed}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-studio-soft-white/40">{r.predictionId.slice(0, 12)}</span>
                    <a href={r.publicUrl} target="_blank" rel="noreferrer"
                       className="flex items-center gap-1 text-studio-bronze hover:underline">
                      <Download className="w-3 h-3" /> open
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FrameSlot({
  label, url, required, onPick, onClear,
}: { label: string; url: string; required?: boolean; onPick: () => void; onClear: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">
          {label} {required && <span className="text-yellow-300">*</span>}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <button type="button" onClick={onPick} className="text-studio-bronze hover:underline flex items-center gap-1">
            <FolderOpen className="w-3 h-3" /> pick
          </button>
          {url && (
            <button type="button" onClick={onClear} className="text-red-300 hover:underline flex items-center gap-1">
              <X className="w-3 h-3" /> clear
            </button>
          )}
        </div>
      </div>
      {url ? (
        <div className="relative w-full aspect-video rounded overflow-hidden border border-studio-bronze/20 bg-studio-warm-black">
          <img src={url} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-full aspect-video rounded border border-dashed border-studio-bronze/20 bg-studio-warm-black/40 flex items-center justify-center text-[10px] text-studio-soft-white/40">
          empty
        </div>
      )}
    </div>
  );
}
