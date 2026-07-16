import React, { useEffect, useState } from "react";
import {
  Sparkles, Loader2, Film, Image as ImageIcon, Play, RefreshCw, Wand2, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { api, type ScenePlanRow } from "../lib/api";
import { useJobs } from "../lib/use-jobs";
import PromptSuggest from "./PromptSuggest";

// Multi-scene progressive video composer.
//
//   1. brief → LLM planner (gpt-5 / claude-opus / gemini-2.5-pro)
//   2. operator reviews scenes, can edit any field
//   3. build chain: for each scene, gen keyframe (image), then gen video using
//      that keyframe as start frame. Each scene's job lands in the global
//      Jobs widget; results auto-attach to the scene row + drop into Media Library.
//
// Video output URLs can then be added to the Video Editor timeline.

type PlannerModelOption = { id: string; label: string; provider: string };

const DEFAULT_BRIEF =
  "A 30-second cinematic teaser for a luxury electric SUV launch — golden-hour drone shots through canyon roads, dust trails, hero close-ups of the badge, ending on a tagline reveal.";

export default function SceneComposer() {
  const jobsCtx = useJobs();

  const [models, setModels] = useState<PlannerModelOption[]>([]);
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [plannerModel, setPlannerModel] = useState("openai/gpt-5");
  const [count, setCount] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [durationPreference, setDurationPreference] = useState(5);
  const [styleHints, setStyleHints] = useState("");

  const [composition, setComposition] = useState<{
    id: string; title: string; styleSummary: string; scenes: ScenePlanRow[]; warnings: string[];
  } | null>(null);

  const [planning, setPlanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    api.listPlannerModels()
      .then(({ models }) => setModels(models))
      .catch(() => {});
  }, []);

  // Merge live job updates into the composition rows so scene cards reflect
  // real-time job status. Image media id + video media id come from the job
  // metadata once finalized.
  useEffect(() => {
    if (!composition) return;
    const liveByScene = new Map<string, typeof jobsCtx.jobs[0]>();
    for (const j of jobsCtx.jobs) if (j.scene_id) liveByScene.set(j.scene_id, j);

    setComposition((cur) => {
      if (!cur) return cur;
      let dirty = false;
      const scenes = cur.scenes.map((s) => {
        const j = liveByScene.get(s.id);
        if (!j) return s;
        const next = { ...s } as ScenePlanRow;
        let persist: { imageMediaId?: string; videoMediaId?: string; status?: ScenePlanRow["status"] } | null = null;
        if (j.kind === "image" && j.media_id && next.image_media_id !== j.media_id) {
          next.image_media_id = j.media_id; dirty = true;
          persist = { ...(persist ?? {}), imageMediaId: j.media_id };
        }
        if (j.kind === "video" && j.media_id && next.video_media_id !== j.media_id) {
          next.video_media_id = j.media_id; dirty = true;
          next.status = "completed";
          persist = { ...(persist ?? {}), videoMediaId: j.media_id, status: "completed" };
        }
        if (j.kind === "image" && j.status === "processing" && next.status === "pending") {
          next.status = "image_building"; dirty = true;
          persist = { ...(persist ?? {}), status: "image_building" };
        }
        if (j.kind === "image" && j.status === "succeeded" && next.status === "image_building") {
          next.status = "image_ready"; dirty = true;
          persist = { ...(persist ?? {}), status: "image_ready" };
        }
        if (j.kind === "video" && j.status === "processing" && next.status === "image_ready") {
          next.status = "video_building"; dirty = true;
          persist = { ...(persist ?? {}), status: "video_building" };
        }
        if (persist) api.setSceneResult(s.id, persist).catch(() => {});
        return next;
      });
      return dirty ? { ...cur, scenes } : cur;
    });
  }, [jobsCtx.jobs, composition?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = async () => {
    if (!brief.trim()) return;
    setPlanning(true); setErr(null);
    try {
      const res = await api.createComposition({
        brief: brief.trim(),
        plannerModel,
        count,
        aspectRatio,
        durationPreference,
        styleHints: styleHints.trim() || undefined,
      });
      setComposition({
        id: res.compositionId,
        title: res.title,
        styleSummary: res.styleSummary,
        scenes: res.scenes,
        warnings: res.warnings,
      });
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? e?.message ?? "planner failed");
    } finally {
      setPlanning(false);
    }
  };

  const updateScene = (idx: number, patch: Partial<ScenePlanRow>) => {
    if (!composition) return;
    const next = [...composition.scenes];
    next[idx] = { ...next[idx], ...patch };
    setComposition({ ...composition, scenes: next });
  };

  const saveScene = async (idx: number) => {
    if (!composition) return;
    const s = composition.scenes[idx];
    try {
      await api.updateScene(s.id, {
        title: s.title ?? undefined,
        imagePrompt: s.image_prompt ?? undefined,
        videoPrompt: s.video_prompt ?? undefined,
        continuity: s.continuity ?? undefined,
        durationSec: s.duration_sec,
        aspectRatio: s.aspect_ratio,
      });
    } catch {}
  };

  const buildScene = async (scene: ScenePlanRow) => {
    updateScene(scene.idx, { status: "image_building" });
    api.setSceneResult(scene.id, { status: "image_building" }).catch(() => {});
    try {
      const img = await api.generateImage({
        prompt: scene.image_prompt ?? "",
        size: scene.aspect_ratio === "9:16" ? "1024x1536" : scene.aspect_ratio === "16:9" ? "1536x1024" : "1024x1024",
        quality: "high",
      });
      updateScene(scene.idx, { image_media_id: img.id, status: "image_ready" });
      api.setSceneResult(scene.id, { imageMediaId: img.id, status: "image_ready" }).catch(() => {});

      updateScene(scene.idx, { status: "video_building" });
      api.setSceneResult(scene.id, { status: "video_building" }).catch(() => {});
      const modelKey = scene.video_model.replace("replicate/", "");
      const v = await api.generateVideo({
        async: true,
        modelKey: pickKeyFromModelString(scene.video_model),
        customOwner: !pickKeyFromModelString(scene.video_model) ? modelKey.split("/")[0] : undefined,
        customName: !pickKeyFromModelString(scene.video_model) ? modelKey.split("/")[1] : undefined,
        prompt: scene.video_prompt ?? "",
        promptImage: img.publicUrl,
        aspectRatio: scene.aspect_ratio,
        duration: scene.duration_sec,
        ...({ compositionId: composition?.id, sceneId: scene.id, sourceKind: "scene_composer" } as any),
      });
      if (!(v as any).async && (v as any).id) {
        updateScene(scene.idx, { video_media_id: (v as any).id, status: "completed" });
        api.setSceneResult(scene.id, { videoMediaId: (v as any).id, status: "completed" }).catch(() => {});
      }
      // The SSE→jobs effect above patches in-memory state on success; the
      // matching job row contains scene_id so it can also drive an automatic
      // setSceneResult elsewhere if you ever want to detach from this awaits.
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? e?.message ?? "build failed");
      updateScene(scene.idx, { status: "failed" });
      api.setSceneResult(scene.id, { status: "failed" }).catch(() => {});
    }
  };

  const buildAll = async () => {
    if (!composition) return;
    setBuilding(true);
    try {
      for (const s of composition.scenes) {
        if (s.status === "completed") continue;
        await buildScene(s);
      }
    } finally {
      setBuilding(false);
    }
  };

  const reset = () => { setComposition(null); setErr(null); };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Wand2 className="w-5 h-5" /> Scene Composer
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Brief → LLM storyboard → review → progressive build. Each scene generates a keyframe image, then uses it as the start frame for an image-to-video clip. Live status in the Jobs widget.
        </p>
      </div>

      {!composition && (
        <div className="studio-glass-glow rounded-lg p-4 space-y-4">
          <div className="relative">
            <textarea
              rows={5} value={brief} onChange={(e) => setBrief(e.target.value)}
              placeholder="Describe the piece you want to build…"
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm pr-16"
            />
            <div className="absolute top-2 right-2"><PromptSuggest current={brief} onSuggest={setBrief} kind="text" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1">
              <div className="font-mono uppercase text-studio-soft-white/50">Planner model</div>
              <select value={plannerModel} onChange={(e) => setPlannerModel(e.target.value)}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
                {models.length === 0 && <option value="openai/gpt-5">GPT-5 (default)</option>}
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <div className="font-mono uppercase text-studio-soft-white/50">Scenes</div>
              <input type="number" min={2} max={10} value={count}
                     onChange={(e) => setCount(Number(e.target.value))}
                     className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
            </label>
            <label className="space-y-1">
              <div className="font-mono uppercase text-studio-soft-white/50">Aspect</div>
              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
            <label className="space-y-1">
              <div className="font-mono uppercase text-studio-soft-white/50">Per-scene seconds</div>
              <select value={durationPreference} onChange={(e) => setDurationPreference(Number(e.target.value))}
                      className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
                <option value={4}>4s</option>
                <option value={5}>5s</option>
                <option value={6}>6s</option>
                <option value={8}>8s</option>
              </select>
            </label>
          </div>
          <label className="space-y-1 text-xs block">
            <div className="font-mono uppercase text-studio-soft-white/50">Style hints (optional)</div>
            <input value={styleHints} onChange={(e) => setStyleHints(e.target.value)}
                   placeholder="e.g. anamorphic lens, ARRI Alexa, teal/orange grade"
                   className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
          </label>
          {err && <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-xs text-red-300">{err}</div>}
          <button
            type="button" onClick={plan} disabled={planning || !brief.trim()}
            className="flex items-center gap-2 bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-2 rounded disabled:opacity-50"
          >
            {planning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {planning ? "planning…" : "Plan scenes"}
          </button>
        </div>
      )}

      {composition && (
        <>
          <div className="studio-glass rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-display font-bold text-studio-bronze">{composition.title}</div>
                <div className="text-[11px] text-studio-soft-white/60 mt-0.5">{composition.styleSummary}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={buildAll} disabled={building}
                  className="flex items-center gap-1.5 bg-studio-bronze text-studio-warm-black font-semibold text-xs px-3 py-1.5 rounded disabled:opacity-50">
                  <Play className="w-3.5 h-3.5" /> {building ? "Building…" : "Build all scenes"}
                </button>
                <button onClick={reset}
                  className="text-[11px] text-studio-soft-white/60 hover:text-studio-bronze">new brief</button>
              </div>
            </div>
            {composition.warnings.length > 0 && (
              <ul className="text-[11px] text-yellow-300/80 list-disc pl-4">
                {composition.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            {composition.scenes.map((s, idx) => (
              <SceneCard
                key={s.id}
                scene={s}
                onChange={(patch) => updateScene(idx, patch)}
                onCommit={() => saveScene(idx)}
                onBuild={() => buildScene(s)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function pickKeyFromModelString(s: string): string | undefined {
  // Mirror of the worker's REPLICATE_MODELS keys. Used so we send `modelKey`
  // (matching curated registry) when possible; else fall back to custom.
  const map: Record<string, string> = {
    "replicate/alibaba/happyhorse-1.0": "happyhorse",
    "replicate/wan-video/wan-2.5-t2v-fast": "wan_t2v",
    "replicate/wan-video/wan-2.5-i2v-fast": "wan_i2v",
    "replicate/kwaivgi/kling-v2.1-master": "kling_t2v",
    "replicate/kwaivgi/kling-v2.1": "kling_i2v",
    "replicate/bytedance/seedance-1-pro": "seedance",
    "replicate/google/veo-3-fast": "veo3_fast",
    "replicate/google/veo-3": "veo3",
  };
  return map[s];
}

function SceneCard({
  scene, onChange, onCommit, onBuild,
}: {
  scene: ScenePlanRow;
  onChange: (patch: Partial<ScenePlanRow>) => void;
  onCommit: () => void;
  onBuild: () => void;
}) {
  const [open, setOpen] = useState(false);
  const statusLabel: Record<string, string> = {
    pending: "pending",
    image_building: "image…",
    image_ready: "image ✓",
    video_building: "video…",
    completed: "done",
    failed: "failed",
  };
  const isWorking = scene.status === "image_building" || scene.status === "video_building";

  return (
    <div className="studio-glass rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-3 border-b border-studio-bronze/10">
        <span className="text-[10px] font-mono text-studio-soft-white/40">#{scene.idx + 1}</span>
        <input
          value={scene.title ?? ""} onChange={(e) => onChange({ title: e.target.value })}
          onBlur={onCommit}
          className="flex-1 bg-transparent text-sm font-display font-bold text-studio-bronze focus:outline-none"
        />
        <span className={`text-[10px] font-mono ${scene.status === "completed" ? "text-emerald-400" : scene.status === "failed" ? "text-red-300" : isWorking ? "text-studio-bronze" : "text-studio-soft-white/50"}`}>
          {statusLabel[scene.status] ?? scene.status}
        </span>
        <button onClick={onBuild} disabled={isWorking || scene.status === "completed"}
          className="flex items-center gap-1 text-[11px] bg-studio-bronze/15 hover:bg-studio-bronze/25 border border-studio-bronze/40 rounded px-2 py-1 text-studio-bronze disabled:opacity-50">
          {isWorking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          build
        </button>
        <button onClick={() => setOpen((v) => !v)} className="text-studio-soft-white/50 hover:text-studio-bronze">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {open && (
        <div className="p-3 space-y-3 text-xs">
          <Field label="Image prompt (keyframe)" icon={<ImageIcon className="w-3 h-3" />}
                 right={<PromptSuggest current={scene.image_prompt ?? ""} onSuggest={(v) => { onChange({ image_prompt: v }); onCommit(); }} kind="image" />}>
            <textarea rows={3} value={scene.image_prompt ?? ""}
              onChange={(e) => onChange({ image_prompt: e.target.value })} onBlur={onCommit}
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
          </Field>
          <Field label="Video prompt (motion)" icon={<Film className="w-3 h-3" />}
                 right={<PromptSuggest current={scene.video_prompt ?? ""} onSuggest={(v) => { onChange({ video_prompt: v }); onCommit(); }} kind="video" />}>
            <textarea rows={3} value={scene.video_prompt ?? ""}
              onChange={(e) => onChange({ video_prompt: e.target.value })} onBlur={onCommit}
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
          </Field>
          <Field label="Continuity from prior scene">
            <textarea rows={2} value={scene.continuity ?? ""}
              onChange={(e) => onChange({ continuity: e.target.value })} onBlur={onCommit}
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, icon, children, right }: { label: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <div className="flex items-center gap-1 font-mono uppercase text-[10px] text-studio-soft-white/50">
        {icon}
        <span>{label}</span>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </label>
  );
}
