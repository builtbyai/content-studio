import React, { useEffect, useMemo, useState } from "react";
import {
  Sparkles, Loader2, Wand2, Maximize2, Image as ImageIcon, Music2, Mic, Video,
  FolderOpen, X, Download, Activity,
} from "lucide-react";
import { api } from "../lib/api";
import { useJobs } from "../lib/use-jobs";
import MediaPicker from "./MediaPicker";
import PromptSuggest from "./PromptSuggest";

// Surfaces all non-primary Replicate models — upscale, bg-remove, music, voice
// clone, lip-sync, frame interpolation, Whisper transcription, FLUX dev, Ideogram.
// Every dispatch lands as a background job → Jobs widget tracks.

interface ReplicateModel {
  key: string; owner: string; name: string; label: string;
  mediaType: "video" | "image";
  needsImage: boolean; unitPriceUsd: number;
  ui: { aspectRatios?: string[]; durations?: number[]; needsImage?: boolean };
  defaults: Record<string, unknown>;
}

const GROUPS: Array<{ label: string; modelKeys: string[]; Icon: any; hint: string }> = [
  { label: "Image enhance", modelKeys: ["upscale_image", "remove_bg", "flux_dev", "ideogram"], Icon: ImageIcon, hint: "Upscale, background-remove, or generate a higher-fidelity image" },
  { label: "Video enhance", modelKeys: ["upscale_video", "interpolate_video"], Icon: Maximize2, hint: "4× upscale or interpolate frames for buttery slow-mo" },
  { label: "Audio",         modelKeys: ["music_gen", "voice_clone"], Icon: Music2, hint: "Generate music from text, or clone a voice for TTS" },
  { label: "Lip-sync",      modelKeys: ["lip_sync"], Icon: Video, hint: "Sync a face video to a separate audio track" },
  { label: "Transcription", modelKeys: ["whisper"], Icon: Mic, hint: "Speech-to-text via Whisper large-v3" },
];

export default function EnhanceLab() {
  const jobsCtx = useJobs();
  const [models, setModels] = useState<ReplicateModel[]>([]);
  const [hasToken, setHasToken] = useState<boolean>(true);
  const [active, setActive] = useState<string>("upscale_image");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [duration, setDuration] = useState<number>(10);
  const [extra, setExtra] = useState("{}");
  const [picker, setPicker] = useState<"image" | "audio" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastJob, setLastJob] = useState<{ jobId: string; predictionId: string; mediaUrl?: string } | null>(null);

  useEffect(() => {
    api.listReplicateModels()
      .then(({ models, hasToken }) => { setModels(models as ReplicateModel[]); setHasToken(hasToken); })
      .catch((e: any) => setErr(e?.body?.message ?? "failed to load models"));
  }, []);

  const byKey = useMemo(() => Object.fromEntries(models.map((m) => [m.key, m])), [models]);
  const spec = byKey[active] as ReplicateModel | undefined;

  // Track the most recent enhance job from this lab via jobsCtx.
  const liveJob = lastJob ? jobsCtx.jobs.find((j) => j.id === lastJob.jobId) : undefined;
  const liveMediaUrl = liveJob?.output_url ?? lastJob?.mediaUrl;

  const submit = async () => {
    if (!spec) return;
    setBusy(true); setErr(null); setLastJob(null);
    try {
      let extraObj: Record<string, unknown> = {};
      try { extraObj = JSON.parse(extra || "{}"); } catch { setErr("extra JSON invalid"); setBusy(false); return; }
      const input: Record<string, unknown> = { ...(spec.defaults ?? {}), ...extraObj };
      if (prompt.trim()) input.prompt = prompt.trim();
      if (imageUrl) {
        input.image = imageUrl; input.input_image = imageUrl;
        // Some models call it "subject" or "video"
        if (spec.key === "lip_sync") input.face = imageUrl;
        if (spec.key === "upscale_video" || spec.key === "interpolate_video") input.video = imageUrl;
        if (spec.key === "whisper") input.audio = imageUrl;
        if (spec.key === "voice_clone") input.speaker = imageUrl;
      }
      if (audioUrl) {
        input.audio = audioUrl; input.audio_path = audioUrl;
      }
      if (spec.key === "music_gen") {
        input.duration = duration;
      }

      const res = await api.replicateGenerate({
        modelKey: spec.key,
        prompt: prompt.trim() || undefined,
        input,
        sourceKind: "workflow_composer",
      });
      setLastJob({ jobId: res.jobId, predictionId: res.predictionId, mediaUrl: res.media?.publicUrl });
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? e?.message ?? "failed to dispatch");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Wand2 className="w-5 h-5" /> Enhance Lab
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Upscale, background-remove, generate music, clone voices, lip-sync, frame interpolation, transcription. Dispatches as background jobs.
        </p>
      </div>

      {!hasToken && (
        <div className="studio-card p-4 border-yellow-700/40 bg-yellow-900/10 text-xs text-yellow-200">
          REPLICATE_API_TOKEN not set — Enhance Lab requires it.
        </div>
      )}

      {/* Group tabs */}
      <div className="studio-glass rounded-lg p-2 flex items-center gap-1 overflow-x-auto">
        {GROUPS.map((g) => {
          const Icon = g.Icon;
          return (
            <div key={g.label} className="flex items-center gap-1">
              <span className="text-[10px] font-mono uppercase text-studio-soft-white/40 px-2"><Icon className="w-3 h-3 inline mr-1" />{g.label}</span>
              <div className="flex items-center gap-1">
                {g.modelKeys.map((k) => {
                  const m = byKey[k];
                  if (!m) return null;
                  return (
                    <button key={k} onClick={() => setActive(k)}
                      title={`${m.label} — ~$${m.unitPriceUsd.toFixed(2)}/job`}
                      className={`text-[11px] px-2.5 py-1.5 rounded ${active === k ? "bg-studio-bronze text-studio-warm-black font-semibold" : "border border-studio-bronze/30 text-studio-bronze hover:bg-studio-bronze/10"}`}>
                      {m.label.split(" — ")[0]}
                    </button>
                  );
                })}
              </div>
              <span className="text-studio-soft-white/30 mx-2">|</span>
            </div>
          );
        })}
      </div>

      {spec && (
        <div className="studio-glass-glow rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="text-sm font-display font-bold text-studio-bronze">{spec.label}</div>
            <span className="text-[10px] font-mono text-studio-soft-white/50">{spec.owner}/{spec.name}</span>
            <span className="text-[10px] font-mono text-studio-bronze ml-auto">≈ ${spec.unitPriceUsd.toFixed(2)}/job</span>
          </div>

          {/* Per-spec inputs */}
          {(spec.key === "flux_dev" || spec.key === "ideogram" || spec.key === "music_gen" || spec.key === "voice_clone") && (
            <div className="relative">
              <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder={spec.key === "music_gen" ? "Describe the music — instruments, mood, tempo…"
                  : spec.key === "voice_clone" ? "Text to speak in the cloned voice"
                  : "Describe the image…"}
                className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm pr-16" />
              <div className="absolute top-2 right-2">
                <PromptSuggest current={prompt} onSuggest={setPrompt} kind={spec.key === "music_gen" ? "text" : spec.key === "voice_clone" ? "text" : "image"} />
              </div>
            </div>
          )}

          {(spec.needsImage || spec.key === "upscale_image" || spec.key === "remove_bg" || spec.key === "whisper" || spec.key === "upscale_video" || spec.key === "interpolate_video" || spec.key === "lip_sync" || spec.key === "voice_clone") && (
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => setPicker("image")}
                className="flex items-center gap-1 bg-studio-bronze/15 hover:bg-studio-bronze/25 border border-studio-bronze/40 rounded px-3 py-1.5 text-studio-bronze">
                <FolderOpen className="w-3 h-3" />
                {spec.key === "whisper" || spec.key === "voice_clone" ? "Pick audio / voice sample" :
                 spec.key === "upscale_video" || spec.key === "interpolate_video" || spec.key === "lip_sync" ? "Pick source video" :
                 "Pick source image"}
              </button>
              {imageUrl && (
                <>
                  <span className="font-mono text-[10px] text-studio-soft-white/50 truncate max-w-xs">{imageUrl}</span>
                  <button onClick={() => setImageUrl("")} className="text-red-300 hover:text-red-200"><X className="w-3 h-3" /></button>
                </>
              )}
            </div>
          )}

          {spec.key === "lip_sync" && (
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => setPicker("audio")}
                className="flex items-center gap-1 bg-studio-bronze/15 hover:bg-studio-bronze/25 border border-studio-bronze/40 rounded px-3 py-1.5 text-studio-bronze">
                <FolderOpen className="w-3 h-3" /> Pick voice audio
              </button>
              {audioUrl && (
                <>
                  <span className="font-mono text-[10px] text-studio-soft-white/50 truncate max-w-xs">{audioUrl}</span>
                  <button onClick={() => setAudioUrl("")} className="text-red-300 hover:text-red-200"><X className="w-3 h-3" /></button>
                </>
              )}
            </div>
          )}

          {spec.key === "music_gen" && (
            <label className="space-y-1 block text-xs">
              <div className="font-mono uppercase text-studio-soft-white/50">Duration (seconds)</div>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
                {[5, 10, 15, 20, 30].map((d) => <option key={d} value={d}>{d}s</option>)}
              </select>
            </label>
          )}

          <details className="text-xs">
            <summary className="font-mono uppercase text-studio-soft-white/50 cursor-pointer">Advanced — extra JSON params</summary>
            <textarea rows={4} value={extra} onChange={(e) => setExtra(e.target.value)}
                      placeholder='{"scale": 4, "face_enhance": false}'
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 font-mono mt-1" />
          </details>

          {err && <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-xs text-red-300">{err}</div>}

          <button onClick={submit} disabled={busy || !hasToken}
            className="flex items-center gap-2 bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-2 rounded disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? "dispatching…" : "Run enhance job"}
          </button>

          {lastJob && (
            <div className="pt-3 border-t border-studio-bronze/15 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Activity className="w-3 h-3 text-studio-bronze" />
                <span className="text-studio-soft-white/70">Job <span className="font-mono text-studio-bronze">{lastJob.jobId.slice(0, 8)}</span> · prediction <span className="font-mono text-studio-bronze">{lastJob.predictionId.slice(0, 8)}</span></span>
                <span className="ml-auto font-mono text-studio-bronze">{liveJob?.status ?? "queued"}</span>
              </div>
              {liveMediaUrl && (
                <div className="flex items-center gap-2">
                  {spec.mediaType === "image" ? (
                    <img src={liveMediaUrl} alt="" className="max-w-full max-h-64 rounded border border-studio-bronze/20" />
                  ) : (
                    <video src={liveMediaUrl} controls className="max-w-full max-h-64 rounded border border-studio-bronze/20" />
                  )}
                  <a href={liveMediaUrl} target="_blank" rel="noreferrer" className="text-studio-bronze hover:underline flex items-center gap-1"><Download className="w-3 h-3" /> open</a>
                </div>
              )}
              {liveJob?.error && (
                <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-red-300">{liveJob.error}</div>
              )}
            </div>
          )}
        </div>
      )}

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        filter="all"
        multi={false}
        onPick={(selected) => {
          if (selected[0]) {
            if (picker === "audio") setAudioUrl(selected[0].public_url);
            else setImageUrl(selected[0].public_url);
          }
        }}
      />
    </div>
  );
}
