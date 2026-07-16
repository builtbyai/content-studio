import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Film, FolderOpen, X, Play, Pause, RotateCcw, Scissors,
  GripVertical, Download, Upload, Loader2, ChevronLeft, ChevronRight,
  Sliders, Wand2, Move, Copy,
} from "lucide-react";
import { api, type MediaItem } from "../lib/api";
import MediaPicker from "./MediaPicker";
import TimelinePanel, { type TimelineClip } from "./timeline/TimelinePanel";

// Browser-native timeline editor — no ffmpeg.wasm.
// v2: color grading, masks, keyframed motion, transitions, split-at-playhead.
//
// Render pipeline:
//   1. Single canvas + AudioContext destination drives a MediaRecorder.
//   2. For each clip, we set currentTime=trimStart, playbackRate=speed, play.
//   3. Every animation frame we draw the clip into the canvas applying, in
//      order: motion transform (scale/rotate/translate), mask clip-path, and
//      color filter via ctx.filter. Then audio routes through the same graph.
//   4. Transitions: clip N can request fadeIn/fadeOut (dip-to-black) or a
//      crossfade with clip N+1 — when crossfade, clip N+1 begins playing
//      fadeOut seconds early and we draw both with alpha ramps.
//   5. Output: WebM blob → upload to Media Library.

type Easing = "linear";

interface ColorGrade {
  exposure: number;        // -1..1   → brightness multiplier 0..2
  contrast: number;        // -1..1   → 0..2
  saturation: number;      // -1..1   → 0..2
  hueDeg: number;          // -180..180
  temperature: number;     // -1..1   sepia-blend hack
  blur: number;            // 0..8 px
}

interface ClipMask {
  shape: "none" | "rect" | "ellipse";
  // All in 0..1 normalized to output canvas dimensions.
  x: number; y: number; w: number; h: number;
  feather: number;         // 0..0.3
}

interface MotionKey {
  t: number;               // 0..1 along clip output duration
  x: number; y: number;    // 0..1 translate
  scale: number;           // 0.1..3
  rotateDeg: number;       // -180..180
  opacity: number;         // 0..1
}

type TransitionKind = "cut" | "fade_out" | "crossfade";

interface TextLayer {
  id: string;
  text: string;
  // Position 0..1 of canvas
  x: number; y: number;
  fontPx: number;
  weight: "normal" | "bold";
  family: string;        // e.g. "system-ui", "'Space Grotesk', sans-serif"
  color: string;
  background: string;    // "transparent" or any rgba
  paddingPx: number;
  startSec: number;      // local timeline position within the clip output
  endSec: number;        // local timeline position within the clip output
  fadeSec: number;       // in/out fade
  align: "left" | "center" | "right";
}

interface Clip {
  id: string;
  mediaId: string;
  publicUrl: string;
  name: string;
  duration: number;       // intrinsic clip duration, seconds
  trimStart: number;
  trimEnd: number;
  speed: number;          // 0.25..4
  // v2:
  color: ColorGrade;
  mask: ClipMask;
  motion: MotionKey[];    // sorted by t; at least 1
  fadeIn: number;
  transitionOutKind: TransitionKind;
  transitionOutSec: number;
  textLayers: TextLayer[];
}

type Resolution = "1280x720" | "1920x1080" | "1080x1920" | "720x720";

const defaultColor = (): ColorGrade => ({
  exposure: 0, contrast: 0, saturation: 0, hueDeg: 0, temperature: 0, blur: 0,
});
const defaultMask = (): ClipMask => ({ shape: "none", x: 0, y: 0, w: 1, h: 1, feather: 0 });
const defaultMotion = (): MotionKey[] => ([
  { t: 0, x: 0, y: 0, scale: 1, rotateDeg: 0, opacity: 1 },
]);

function fmt(t: number): string {
  if (!isFinite(t)) return "00:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function uid(): string { return Math.random().toString(36).slice(2, 9); }

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function clipOutputDuration(c: Clip): number {
  return Math.max(0, (c.trimEnd - c.trimStart)) / Math.max(0.01, c.speed);
}

function colorFilterFor(c: ColorGrade): string {
  // Compose CSS filter string usable by ctx.filter and CSS.
  const brightness = (1 + c.exposure).toFixed(3);
  const contrast = (1 + c.contrast).toFixed(3);
  const saturate = (1 + c.saturation).toFixed(3);
  const hue = `${c.hueDeg.toFixed(1)}deg`;
  const sepia = `${Math.max(0, c.temperature).toFixed(3)}`;
  const blur = `${c.blur.toFixed(1)}px`;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) hue-rotate(${hue}) sepia(${sepia}) blur(${blur})`;
}

function sampleMotion(keys: MotionKey[], localT: number): MotionKey {
  // localT is 0..1 along the clip's output timeline.
  if (keys.length === 0) return { t: 0, x: 0, y: 0, scale: 1, rotateDeg: 0, opacity: 1 };
  if (keys.length === 1 || localT <= keys[0].t) return keys[0];
  if (localT >= keys[keys.length - 1].t) return keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (localT >= a.t && localT <= b.t) {
      const u = (localT - a.t) / Math.max(0.0001, b.t - a.t);
      return {
        t: localT,
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        scale: a.scale + (b.scale - a.scale) * u,
        rotateDeg: a.rotateDeg + (b.rotateDeg - a.rotateDeg) * u,
        opacity: a.opacity + (b.opacity - a.opacity) * u,
      };
    }
  }
  return keys[keys.length - 1];
}

function applyMaskPath(ctx: CanvasRenderingContext2D, mask: ClipMask, w: number, h: number) {
  if (mask.shape === "none") return;
  const x = mask.x * w, y = mask.y * h;
  const mw = mask.w * w, mh = mask.h * h;
  ctx.beginPath();
  if (mask.shape === "rect") {
    ctx.rect(x, y, mw, mh);
  } else {
    ctx.ellipse(x + mw / 2, y + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
  }
  ctx.clip();
  if (mask.feather > 0) {
    // Feather via shadowBlur on a soft inner stroke — approximate, cheap.
    ctx.shadowBlur = mask.feather * Math.min(w, h);
    ctx.shadowColor = "#000";
  }
}

function drawTextLayers(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  localOutSec: number,
  outW: number, outH: number,
) {
  for (const tl of clip.textLayers) {
    if (localOutSec < tl.startSec || localOutSec > tl.endSec) continue;
    const intoEnd = tl.endSec - localOutSec;
    const intoStart = localOutSec - tl.startSec;
    let alpha = 1;
    if (tl.fadeSec > 0) {
      alpha = Math.min(1, Math.min(intoStart, intoEnd) / Math.max(0.01, tl.fadeSec));
      if (!isFinite(alpha) || alpha < 0) alpha = 0;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${tl.weight === "bold" ? "bold " : ""}${tl.fontPx}px ${tl.family}`;
    ctx.textBaseline = "top";
    ctx.textAlign = tl.align;
    // Measure for background.
    const measure = ctx.measureText(tl.text);
    const w = measure.width + tl.paddingPx * 2;
    const h = tl.fontPx + tl.paddingPx * 2;
    const cx = tl.x * outW;
    const cy = tl.y * outH;
    const bgX = tl.align === "left" ? cx : tl.align === "right" ? cx - w : cx - w / 2;
    const bgY = cy;
    if (tl.background !== "transparent" && tl.background) {
      ctx.fillStyle = tl.background;
      ctx.fillRect(bgX, bgY, w, h);
    }
    ctx.fillStyle = tl.color;
    ctx.fillText(tl.text, cx + (tl.align === "center" ? 0 : tl.align === "left" ? tl.paddingPx : -tl.paddingPx), cy + tl.paddingPx);
    ctx.restore();
  }
}

function drawClipFrame(
  ctx: CanvasRenderingContext2D,
  v: HTMLVideoElement,
  clip: Clip,
  localProgress: number,
  outW: number, outH: number,
  globalAlpha: number,
  localOutSec?: number,
) {
  ctx.save();
  ctx.globalAlpha = globalAlpha;
  ctx.filter = colorFilterFor(clip.color);

  // Motion transform — translate is in 0..1 of canvas size; scale around clip center.
  const m = sampleMotion(clip.motion, localProgress);
  const tx = m.x * outW;
  const ty = m.y * outH;
  ctx.translate(outW / 2 + tx, outH / 2 + ty);
  ctx.rotate((m.rotateDeg * Math.PI) / 180);
  ctx.scale(m.scale, m.scale);
  ctx.globalAlpha *= m.opacity;

  applyMaskPath(ctx, clip.mask, outW, outH);

  // Letterbox the video into the (pre-transform) canvas frame.
  const vw = v.videoWidth || outW;
  const vh = v.videoHeight || outH;
  const scale = Math.min(outW / vw, outH / vh);
  const dw = vw * scale, dh = vh * scale;
  ctx.drawImage(v, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  // Text layers live above the transform — drawn in canvas space, not clip
  // space, so position is stable independent of motion/scale.
  if (localOutSec !== undefined && clip.textLayers.length > 0) {
    drawTextLayers(ctx, clip, localOutSec, outW, outH);
  }
}

export default function VideoEditor() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resolution, setResolution] = useState<Resolution>("1280x720");
  const [fps, setFps] = useState<number>(30);

  const [isPlaying, setIsPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [timelineTime, setTimelineTime] = useState(0);
  // Per-clip absolute start position on timeline (in seconds). Defaults to
  // sequential layout (each clip starts where the previous ends). This lets
  // the user drag clips on the timeline to introduce gaps or overlap.
  const [clipPositions, setClipPositions] = useState<Record<string, { startSec: number; trackId: number }>>({});
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [rendered, setRendered] = useState<{ url: string; blob: Blob } | null>(null);
  const [uploaded, setUploaded] = useState<{ publicUrl: string; mediaId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"trim" | "color" | "mask" | "motion" | "transition" | "text">("trim");

  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopFlagRef = useRef<boolean>(false);

  const activeClip = clips.find((c) => c.id === activeClipId) ?? null;

  const totalDuration = useMemo(
    () => clips.reduce((acc, c, i) => {
      const dur = clipOutputDuration(c);
      const overlap = (i < clips.length - 1 && c.transitionOutKind === "crossfade")
        ? Math.min(c.transitionOutSec, dur) : 0;
      return acc + dur - overlap;
    }, 0),
    [clips]
  );

  // Project our internal Clip[] into TimelineClip[] for the timeline.
  // Layout: if no explicit clipPositions are set for a clip, it falls back to
  // the sequential layout (each clip starts where the previous's output ends).
  const timelineClips = useMemo<TimelineClip[]>(() => {
    let cursor = 0;
    return clips.map((c) => {
      const outDur = clipOutputDuration(c);
      const overlapNext = c.transitionOutKind === "crossfade" ? Math.min(c.transitionOutSec, outDur) : 0;
      const seqStart = cursor;
      cursor += outDur - overlapNext;
      const explicit = clipPositions[c.id];
      return {
        id: c.id,
        trackId: explicit?.trackId ?? 0,
        startSec: explicit?.startSec ?? seqStart,
        durationSec: outDur,
        label: c.name,
        pseudoWaveSeed: hashStr(c.id),
      };
    });
  }, [clips, clipPositions]);

  // Total span shown on the timeline ruler.
  const timelineSpan = useMemo(
    () => Math.max(totalDuration, ...timelineClips.map((c) => c.startSec + c.durationSec), 10),
    [timelineClips, totalDuration]
  );

  // ─── Media intake ──────────────────────────────────────────────────────────
  const addFromLibrary = (selected: MediaItem[]) => {
    const next: Clip[] = [...clips];
    for (const m of selected) {
      if (!m.mime.startsWith("video/")) continue;
      next.push({
        id: uid(),
        mediaId: m.id,
        publicUrl: m.public_url,
        name: m.r2_key.split("/").pop() ?? "clip",
        duration: 0, trimStart: 0, trimEnd: 0, speed: 1,
        color: defaultColor(),
        mask: defaultMask(),
        motion: defaultMotion(),
        fadeIn: 0,
        transitionOutKind: "cut",
        transitionOutSec: 0.5,
        textLayers: [],
      });
    }
    setClips(next);
    if (!activeClipId && next.length > 0) setActiveClipId(next[next.length - 1].id);
  };

  const updateClip = (id: string, patch: Partial<Clip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const updateClipColor = (id: string, patch: Partial<ColorGrade>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, color: { ...c.color, ...patch } } : c)));
  };
  const updateClipMask = (id: string, patch: Partial<ClipMask>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, mask: { ...c.mask, ...patch } } : c)));
  };
  const updateClipMotionKey = (id: string, idx: number, patch: Partial<MotionKey>) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const motion = c.motion.map((k, i) => (i === idx ? { ...k, ...patch } : k));
      return { ...c, motion };
    }));
  };
  const addMotionKey = (id: string, atT: number) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const sample = sampleMotion(c.motion, atT);
      const next = [...c.motion, { ...sample, t: atT }].sort((a, b) => a.t - b.t);
      return { ...c, motion: next };
    }));
  };
  const removeMotionKey = (id: string, idx: number) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id || c.motion.length <= 1) return c;
      return { ...c, motion: c.motion.filter((_, i) => i !== idx) };
    }));
  };

  const removeClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (activeClipId === id) setActiveClipId(null);
  };

  const moveClip = (id: string, dir: -1 | 1) => {
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const duplicateClip = (id: string) => {
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const src = prev[idx];
      const copy: Clip = JSON.parse(JSON.stringify(src));
      copy.id = uid();
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  // Split the active clip at the current preview time (must be inside the
  // trim window). Produces two adjacent clips referencing the same media.
  const splitActiveAtPlayhead = () => {
    if (!activeClip) return;
    const v = videoRefs.current[activeClip.id];
    if (!v) return;
    const cut = v.currentTime;
    if (cut <= activeClip.trimStart + 0.05 || cut >= activeClip.trimEnd - 0.05) return;
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === activeClip.id);
      if (idx < 0) return prev;
      const head: Clip = { ...prev[idx], trimEnd: cut, id: uid() };
      const tail: Clip = { ...prev[idx], trimStart: cut, id: uid(), fadeIn: 0 };
      const next = [...prev];
      next.splice(idx, 1, head, tail);
      return next;
    });
  };

  // ─── Preview canvas ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeClip) return;
    const v = videoRefs.current[activeClip.id];
    const canvas = previewCanvasRef.current;
    if (!v || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const tick = () => {
      if (v.readyState >= 2) {
        const w = canvas.width = v.videoWidth || 1280;
        const h = canvas.height = v.videoHeight || 720;
        // Clear, then apply color/mask/motion just like the render path.
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
        const local = (v.currentTime - activeClip.trimStart) /
                      Math.max(0.001, activeClip.trimEnd - activeClip.trimStart);
        const localOutSec = Math.max(0, Math.min(1, local)) * clipOutputDuration(activeClip);
        drawClipFrame(ctx, v, activeClip, Math.max(0, Math.min(1, local)), w, h, 1, localOutSec);
        setPreviewTime(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeClipId, activeClip?.color, activeClip?.mask, activeClip?.motion]);

  const togglePreviewPlay = () => {
    if (!activeClip) return;
    const v = videoRefs.current[activeClip.id];
    if (!v) return;
    if (v.paused) {
      v.currentTime = Math.max(v.currentTime, activeClip.trimStart);
      v.playbackRate = activeClip.speed;
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const resetPreview = () => {
    if (!activeClip) return;
    const v = videoRefs.current[activeClip.id];
    if (!v) return;
    v.pause();
    v.currentTime = activeClip.trimStart;
    setIsPlaying(false);
  };

  // ─── Render pipeline ──────────────────────────────────────────────────────
  const renderTimeline = async () => {
    if (clips.length === 0) return;
    setRendering(true); setRenderProgress(0); setErr(null); setRendered(null); setUploaded(null);
    stopFlagRef.current = false;

    const [outW, outH] = resolution.split("x").map(Number);
    const canvas = document.createElement("canvas");
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) { setErr("canvas 2d unavailable"); setRendering(false); return; }
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, outW, outH);

    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AC();
    const audioDest = audioCtx.createMediaStreamDestination();
    const sourceCache: Record<string, MediaElementAudioSourceNode> = {};
    for (const c of clips) {
      const v = videoRefs.current[c.id];
      if (!v) continue;
      try {
        if (!sourceCache[c.id]) {
          const src = audioCtx.createMediaElementSource(v);
          src.connect(audioDest);
          sourceCache[c.id] = src;
        }
      } catch {}
      v.muted = true;
    }

    const videoStream = canvas.captureStream(fps);
    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks(),
    ]);

    const mimeCandidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    const stopPromise = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    recorder.start(250);

    try {
      let consumed = 0;
      for (let i = 0; i < clips.length; i++) {
        if (stopFlagRef.current) break;
        const clip = clips[i];
        const v = videoRefs.current[clip.id];
        if (!v) continue;
        const outDur = clipOutputDuration(clip);
        const next = clips[i + 1];
        const nextV = next ? videoRefs.current[next.id] : null;

        // Seek to trimStart.
        await new Promise<void>((resolve) => {
          const onSeeked = () => { v.removeEventListener("seeked", onSeeked); resolve(); };
          v.addEventListener("seeked", onSeeked);
          v.currentTime = clip.trimStart;
        });
        v.playbackRate = Math.min(4, Math.max(0.25, clip.speed));
        v.muted = false;
        await v.play();

        let crossfadeStarted = false;

        await new Promise<void>((resolve) => {
          const draw = () => {
            if (stopFlagRef.current) { resolve(); return; }
            // Output progress (0..1 along this clip's output timeline).
            const localProgress = Math.min(1, Math.max(0,
              (v.currentTime - clip.trimStart) / Math.max(0.001, clip.trimEnd - clip.trimStart)));
            const localOutSec = localProgress * outDur;
            const remainingSec = outDur - localOutSec;

            // Compute alpha from fadeIn / fadeOut (dip-to-black).
            let alpha = 1;
            if (clip.fadeIn > 0 && localOutSec < clip.fadeIn) {
              alpha = localOutSec / clip.fadeIn;
            }
            if (next && clip.transitionOutKind === "fade_out" && remainingSec < clip.transitionOutSec) {
              alpha = Math.min(alpha, remainingSec / Math.max(0.01, clip.transitionOutSec));
            }
            ctx.fillStyle = "#000"; ctx.fillRect(0, 0, outW, outH);
            ctx.filter = "none";
            drawClipFrame(ctx, v, clip, localProgress, outW, outH, Math.max(0, alpha), localOutSec);

            if (next && nextV && clip.transitionOutKind === "crossfade"
                && remainingSec < clip.transitionOutSec && !crossfadeStarted) {
              crossfadeStarted = true;
              nextV.currentTime = next.trimStart;
              nextV.playbackRate = Math.min(4, Math.max(0.25, next.speed));
              nextV.muted = false;
              nextV.play().catch(() => {});
            }
            if (crossfadeStarted && nextV) {
              const overlap = clip.transitionOutSec;
              const u = Math.max(0, Math.min(1, (overlap - remainingSec) / Math.max(0.01, overlap)));
              const nextLocal = Math.min(1, Math.max(0,
                (nextV.currentTime - next.trimStart) / Math.max(0.001, next.trimEnd - next.trimStart)));
              ctx.filter = "none";
              drawClipFrame(ctx, nextV, next, nextLocal, outW, outH, u, 0);
            }

            const totalProgress = (consumed + localOutSec) / Math.max(0.001, totalDuration);
            setRenderProgress(Math.min(1, Math.max(0, totalProgress)));

            if (v.currentTime >= clip.trimEnd || v.ended) {
              v.pause();
              v.muted = true;
              // If we crossfaded, we already advanced `next` — subtract overlap
              // from the consumed accounting so total progress stays accurate.
              const overlap = (next && clip.transitionOutKind === "crossfade")
                ? Math.min(clip.transitionOutSec, outDur) : 0;
              consumed += outDur - overlap;
              setRenderProgress(consumed / Math.max(0.001, totalDuration));
              resolve();
              return;
            }
            requestAnimationFrame(draw);
          };
          requestAnimationFrame(draw);
        });
      }
    } finally {
      try { recorder.stop(); } catch {}
      await stopPromise;
      try { audioCtx.close(); } catch {}
      for (const c of clips) {
        const v = videoRefs.current[c.id];
        if (v) v.muted = false;
      }
    }

    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) {
      setErr("Render produced an empty file — try a shorter timeline or different codec.");
      setRendering(false);
      return;
    }
    const url = URL.createObjectURL(blob);
    setRendered({ url, blob });
    setRenderProgress(1);
    setRendering(false);
  };

  const cancelRender = () => { stopFlagRef.current = true; };

  const uploadRendered = async () => {
    if (!rendered) return;
    setBusy(true); setErr(null);
    try {
      const file = new File([rendered.blob], `timeline-${Date.now()}.webm`, { type: rendered.blob.type });
      const res = await api.uploadMedia(file);
      setUploaded({ publicUrl: res.publicUrl, mediaId: res.id });
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? "upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Film className="w-5 h-5" /> Video Editor
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Drop clips on the timeline. Trim, color-grade, mask, animate motion, set transitions, then render to WebM.
          Output saves straight to Media Library.
        </p>
      </div>

      <div className="studio-glass rounded-lg p-3 flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button" onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 bg-studio-bronze/15 hover:bg-studio-bronze/25 border border-studio-bronze/40 rounded px-3 py-1.5 text-studio-bronze"
        >
          <FolderOpen className="w-3.5 h-3.5" /> Add clips
        </button>
        <div className="text-studio-soft-white/40">|</div>
        <label className="flex items-center gap-2">
          <span className="font-mono uppercase text-studio-soft-white/50">Resolution</span>
          <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)}
                  className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
            <option value="1280x720">1280×720</option>
            <option value="1920x1080">1920×1080</option>
            <option value="1080x1920">1080×1920 portrait</option>
            <option value="720x720">720×720 square</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="font-mono uppercase text-studio-soft-white/50">FPS</span>
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))}
                  className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
            <option value={24}>24</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <div className="ml-auto text-studio-soft-white/60 font-mono">
          {fmt(totalDuration)} · {clips.length} clip{clips.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="studio-glass rounded-lg p-3 space-y-3">
          <div className="aspect-video bg-studio-warm-black rounded overflow-hidden flex items-center justify-center">
            <canvas ref={previewCanvasRef} className="max-w-full max-h-full" />
          </div>
          {activeClip ? (
            <div className="flex items-center gap-2 text-xs">
              <button onClick={togglePreviewPlay} className="bg-studio-bronze text-studio-warm-black rounded p-1.5">
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button onClick={resetPreview} className="border border-studio-bronze/30 rounded p-1.5 text-studio-bronze" title="reset">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button onClick={splitActiveAtPlayhead} className="border border-studio-bronze/30 rounded p-1.5 text-studio-bronze" title="split at playhead">
                <Scissors className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => duplicateClip(activeClip.id)} className="border border-studio-bronze/30 rounded p-1.5 text-studio-bronze" title="duplicate">
                <Copy className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-studio-soft-white/70">
                {fmt(previewTime)} / {fmt(activeClip.duration)}
              </span>
              <span className="ml-auto text-studio-soft-white/40 truncate max-w-[200px]" title={activeClip.name}>{activeClip.name}</span>
            </div>
          ) : (
            <div className="text-xs text-studio-soft-white/50">Add a clip and select it to preview.</div>
          )}
        </div>

        <div className="studio-glass rounded-lg p-3 space-y-3 text-xs">
          <div className="flex items-center gap-1 border-b border-studio-bronze/15 pb-2">
            {([
              ["trim", "Trim", <Scissors className="w-3 h-3" />],
              ["color", "Color", <Sliders className="w-3 h-3" />],
              ["mask", "Mask", <Wand2 className="w-3 h-3" />],
              ["motion", "Motion", <Move className="w-3 h-3" />],
              ["text", "Text", <Sliders className="w-3 h-3" />],
              ["transition", "Trans.", <ChevronRight className="w-3 h-3" />],
            ] as const).map(([k, label, icon]) => (
              <button key={k} onClick={() => setInspectorTab(k as any)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase ${inspectorTab === k ? "bg-studio-bronze text-studio-warm-black" : "text-studio-soft-white/60 hover:bg-studio-bronze/10"}`}>
                {icon}<span>{label}</span>
              </button>
            ))}
          </div>
          {activeClip ? (
            <>
              {inspectorTab === "trim" && (
                <TrimControls clip={activeClip} onChange={(p) => updateClip(activeClip.id, p)} />
              )}
              {inspectorTab === "color" && (
                <ColorControls clip={activeClip} onChange={(p) => updateClipColor(activeClip.id, p)} />
              )}
              {inspectorTab === "mask" && (
                <MaskControls clip={activeClip} onChange={(p) => updateClipMask(activeClip.id, p)} />
              )}
              {inspectorTab === "motion" && (
                <MotionControls
                  clip={activeClip}
                  onChangeKey={(i, p) => updateClipMotionKey(activeClip.id, i, p)}
                  onAddKey={(t) => addMotionKey(activeClip.id, t)}
                  onRemoveKey={(i) => removeMotionKey(activeClip.id, i)}
                />
              )}
              {inspectorTab === "transition" && (
                <TransitionControls clip={activeClip} onChange={(p) => updateClip(activeClip.id, p)} />
              )}
              {inspectorTab === "text" && (
                <TextLayerControls
                  clip={activeClip}
                  onChange={(layers) => updateClip(activeClip.id, { textLayers: layers })}
                />
              )}
            </>
          ) : (
            <div className="text-studio-soft-white/50">No clip selected.</div>
          )}
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="studio-glass rounded-lg p-3 text-xs text-studio-soft-white/50 py-6 text-center border border-dashed border-studio-bronze/20">
          Empty timeline. Click <strong className="text-studio-bronze">Add clips</strong> to start.
        </div>
      ) : (
        <TimelinePanel
          clips={timelineClips}
          totalDurationSec={timelineSpan}
          currentTimeSec={timelineTime}
          selectedClipId={activeClipId}
          fps={fps}
          onScrub={setTimelineTime}
          onClipSelect={(id) => setActiveClipId(id)}
          onClipMove={(id, newStartSec, newTrackId) => {
            setClipPositions((prev) => ({
              ...prev,
              [id]: { startSec: newStartSec, trackId: newTrackId ?? prev[id]?.trackId ?? 0 },
            }));
          }}
          onClipResize={(id, edge, newSec) => {
            // Map timeline trims back to per-clip trim values.
            const c = clips.find((c) => c.id === id);
            if (!c) return;
            const pos = clipPositions[id]?.startSec ?? 0;
            const outDur = clipOutputDuration(c);
            if (edge === "start") {
              // Move the timeline start without changing trim — just shift position.
              setClipPositions((prev) => ({
                ...prev,
                [id]: { startSec: newSec, trackId: prev[id]?.trackId ?? 0 },
              }));
            } else if (edge === "end") {
              // newSec is the new end position in timeline space. Re-derive
              // the desired output duration → adjust trimEnd (snap to media bounds).
              const newOutDur = Math.max(0.1, newSec - pos);
              const targetTrimSpan = newOutDur * Math.max(0.01, c.speed);
              updateClip(id, { trimEnd: Math.min(c.duration || c.trimStart + targetTrimSpan, c.trimStart + targetTrimSpan) });
            }
          }}
          onClipDelete={removeClip}
        />
      )}

      <div className="studio-glass-glow rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {!rendering ? (
            <button
              type="button" onClick={renderTimeline} disabled={clips.length === 0}
              className="flex items-center gap-2 bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-2 rounded disabled:opacity-50"
            >
              <Film className="w-3.5 h-3.5" /> Render timeline ({fmt(totalDuration)})
            </button>
          ) : (
            <button
              type="button" onClick={cancelRender}
              className="flex items-center gap-2 border border-red-700/40 text-red-300 text-xs px-4 py-2 rounded"
            >
              <X className="w-3.5 h-3.5" /> Cancel render
            </button>
          )}
          {rendered && !uploaded && (
            <button
              type="button" onClick={uploadRendered} disabled={busy}
              className="flex items-center gap-2 border border-studio-bronze/40 text-studio-bronze text-xs px-4 py-2 rounded disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Save to Media Library
            </button>
          )}
          {rendered && (
            <a href={rendered.url} download={`timeline-${Date.now()}.webm`}
              className="flex items-center gap-2 border border-studio-bronze/40 text-studio-bronze text-xs px-4 py-2 rounded">
              <Download className="w-3.5 h-3.5" /> Download .webm
            </a>
          )}
          {rendering && (
            <div className="text-xs text-studio-soft-white/60">
              Rendering… {Math.round(renderProgress * 100)}%
            </div>
          )}
        </div>
        {rendering && (
          <div className="h-1.5 bg-studio-warm-black rounded overflow-hidden">
            <div className="h-full bg-studio-bronze transition-all" style={{ width: `${renderProgress * 100}%` }} />
          </div>
        )}
        {rendered && (
          <video src={rendered.url} controls className="w-full max-h-64 bg-studio-warm-black rounded" />
        )}
        {uploaded && (
          <div className="text-xs text-studio-bronze">
            Saved to Media Library. <a href={uploaded.publicUrl} target="_blank" rel="noreferrer" className="underline">View on R2</a>
          </div>
        )}
        {err && (
          <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-xs text-red-300">{err}</div>
        )}
      </div>

      <div className="hidden">
        {clips.map((c) => (
          <video
            key={c.id}
            ref={(el) => {
              if (el) videoRefs.current[c.id] = el;
              else delete videoRefs.current[c.id];
            }}
            src={c.publicUrl}
            crossOrigin="anonymous"
            preload="auto"
            playsInline
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setClips((prev) => prev.map((p) =>
                p.id === c.id && (p.duration === 0 || p.trimEnd === 0)
                  ? { ...p, duration: v.duration, trimEnd: v.duration }
                  : p
              ));
            }}
          />
        ))}
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        filter="video"
        multi
        onPick={addFromLibrary}
      />
    </div>
  );
}

function Slider({
  label, value, min, max, step, fmt, onChange,
}: { label: string; value: number; min: number; max: number; step: number; fmt?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] uppercase text-studio-soft-white/50">{label}</span>
        <span className="font-mono text-studio-bronze">{fmt ? fmt(value) : value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             className="w-full accent-studio-bronze" />
    </div>
  );
}

function TrimControls({ clip, onChange }: { clip: Clip; onChange: (p: Partial<Clip>) => void }) {
  return (
    <div className="space-y-3">
      <Slider label="trim in" value={clip.trimStart} min={0} max={clip.duration || 0} step={0.05}
              fmt={(v) => `${v.toFixed(2)}s`}
              onChange={(v) => onChange({ trimStart: Math.min(v, Math.max(0, clip.trimEnd - 0.1)) })} />
      <Slider label="trim out" value={clip.trimEnd} min={0} max={clip.duration || 0} step={0.05}
              fmt={(v) => `${v.toFixed(2)}s`}
              onChange={(v) => onChange({ trimEnd: Math.max(v, clip.trimStart + 0.1) })} />
      <Slider label="speed" value={clip.speed} min={0.25} max={4} step={0.05}
              fmt={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => onChange({ speed: v })} />
      <Slider label="fade in" value={clip.fadeIn} min={0} max={2} step={0.05}
              fmt={(v) => `${v.toFixed(2)}s`}
              onChange={(v) => onChange({ fadeIn: v })} />
      <div className="pt-2 border-t border-studio-bronze/15 text-studio-soft-white/50">
        Output: <span className="text-studio-bronze font-mono">{clipOutputDuration(clip).toFixed(2)}s</span>
      </div>
    </div>
  );
}

const LUT_PRESETS: Record<string, ColorGrade> = {
  "neutral":        { exposure: 0,    contrast: 0,    saturation: 0,    hueDeg: 0,   temperature: 0,    blur: 0 },
  "teal+orange":    { exposure: 0.05, contrast: 0.15, saturation: 0.10, hueDeg: -8,  temperature: 0.18, blur: 0 },
  "cinematic":      { exposure: -0.10, contrast: 0.20, saturation: -0.05, hueDeg: 4, temperature: 0.10, blur: 0 },
  "vintage film":   { exposure: -0.05, contrast: -0.05, saturation: -0.15, hueDeg: -6, temperature: 0.35, blur: 0.3 },
  "b&w":            { exposure: 0,    contrast: 0.20, saturation: -1.0,  hueDeg: 0,   temperature: 0,    blur: 0 },
  "cyberpunk":      { exposure: 0.10, contrast: 0.35, saturation: 0.55,  hueDeg: 24,  temperature: -0.25, blur: 0 },
  "cold steel":     { exposure: -0.05, contrast: 0.15, saturation: -0.20, hueDeg: -16, temperature: -0.20, blur: 0 },
  "soft pastel":    { exposure: 0.10, contrast: -0.15, saturation: -0.20, hueDeg: 8,  temperature: 0.05, blur: 0.5 },
  "high contrast":  { exposure: 0,    contrast: 0.50, saturation: 0.10,  hueDeg: 0,   temperature: 0,    blur: 0 },
  "muted":          { exposure: -0.03, contrast: -0.10, saturation: -0.40, hueDeg: 0, temperature: 0,    blur: 0 },
};

function ColorControls({ clip, onChange }: { clip: Clip; onChange: (p: Partial<ColorGrade>) => void }) {
  const reset = () => onChange(defaultColor());
  const applyPreset = (name: string) => {
    const p = LUT_PRESETS[name];
    if (p) onChange(p);
  };
  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase text-studio-soft-white/50 mb-1">Presets</div>
        <div className="flex flex-wrap gap-1">
          {Object.keys(LUT_PRESETS).map((name) => (
            <button key={name} onClick={() => applyPreset(name)}
              className="text-[10px] px-1.5 py-0.5 rounded border border-studio-bronze/30 text-studio-bronze hover:bg-studio-bronze/10">
              {name}
            </button>
          ))}
        </div>
      </div>
      <Slider label="exposure"    value={clip.color.exposure}    min={-1} max={1} step={0.02} onChange={(v) => onChange({ exposure: v })} />
      <Slider label="contrast"    value={clip.color.contrast}    min={-1} max={1} step={0.02} onChange={(v) => onChange({ contrast: v })} />
      <Slider label="saturation"  value={clip.color.saturation}  min={-1} max={1} step={0.02} onChange={(v) => onChange({ saturation: v })} />
      <Slider label="hue rotate"  value={clip.color.hueDeg}      min={-180} max={180} step={1} fmt={(v) => `${v.toFixed(0)}°`} onChange={(v) => onChange({ hueDeg: v })} />
      <Slider label="temperature" value={clip.color.temperature} min={-1} max={1} step={0.02} onChange={(v) => onChange({ temperature: v })} />
      <Slider label="blur"        value={clip.color.blur}        min={0} max={8} step={0.1} fmt={(v) => `${v.toFixed(1)}px`} onChange={(v) => onChange({ blur: v })} />
      <button onClick={reset} className="text-[10px] text-studio-bronze hover:underline">reset color</button>
    </div>
  );
}

function MaskControls({ clip, onChange }: { clip: Clip; onChange: (p: Partial<ClipMask>) => void }) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase text-studio-soft-white/50">Shape</span>
        <select value={clip.mask.shape} onChange={(e) => onChange({ shape: e.target.value as any })}
                className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1 text-xs">
          <option value="none">none</option>
          <option value="rect">rectangle</option>
          <option value="ellipse">ellipse</option>
        </select>
      </label>
      {clip.mask.shape !== "none" && (
        <>
          <Slider label="x"       value={clip.mask.x} min={0} max={1} step={0.01} onChange={(v) => onChange({ x: v })} />
          <Slider label="y"       value={clip.mask.y} min={0} max={1} step={0.01} onChange={(v) => onChange({ y: v })} />
          <Slider label="width"   value={clip.mask.w} min={0.05} max={1} step={0.01} onChange={(v) => onChange({ w: v })} />
          <Slider label="height"  value={clip.mask.h} min={0.05} max={1} step={0.01} onChange={(v) => onChange({ h: v })} />
          <Slider label="feather" value={clip.mask.feather} min={0} max={0.3} step={0.01} onChange={(v) => onChange({ feather: v })} />
        </>
      )}
    </div>
  );
}

function MotionControls({
  clip, onChangeKey, onAddKey, onRemoveKey,
}: {
  clip: Clip;
  onChangeKey: (i: number, p: Partial<MotionKey>) => void;
  onAddKey: (t: number) => void;
  onRemoveKey: (i: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-studio-soft-white/50 text-[10px] font-mono uppercase">Keyframes ({clip.motion.length})</span>
        <button onClick={() => onAddKey(Math.min(1, (clip.motion[clip.motion.length - 1]?.t ?? 0) + 0.25))}
                className="text-[10px] text-studio-bronze hover:underline">+ add key</button>
      </div>
      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
        {clip.motion.map((k, i) => (
          <div key={i} className="border border-studio-bronze/15 rounded p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-studio-bronze">key #{i + 1}</span>
              <button onClick={() => onRemoveKey(i)} disabled={clip.motion.length <= 1}
                      className="text-[10px] text-red-300 hover:underline disabled:opacity-30">remove</button>
            </div>
            <Slider label="time"    value={k.t} min={0} max={1} step={0.01} onChange={(v) => onChangeKey(i, { t: v })} />
            <Slider label="x"       value={k.x} min={-0.5} max={0.5} step={0.01} onChange={(v) => onChangeKey(i, { x: v })} />
            <Slider label="y"       value={k.y} min={-0.5} max={0.5} step={0.01} onChange={(v) => onChangeKey(i, { y: v })} />
            <Slider label="scale"   value={k.scale} min={0.1} max={3} step={0.02} onChange={(v) => onChangeKey(i, { scale: v })} />
            <Slider label="rotate"  value={k.rotateDeg} min={-180} max={180} step={1} fmt={(v) => `${v.toFixed(0)}°`} onChange={(v) => onChangeKey(i, { rotateDeg: v })} />
            <Slider label="opacity" value={k.opacity} min={0} max={1} step={0.02} onChange={(v) => onChangeKey(i, { opacity: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TextLayerControls({ clip, onChange }: { clip: Clip; onChange: (next: TextLayer[]) => void }) {
  const layers = clip.textLayers;
  const outDur = clipOutputDuration(clip);
  const add = () => {
    const l: TextLayer = {
      id: uid(),
      text: "Hello world",
      x: 0.5, y: 0.5,
      fontPx: 72,
      weight: "bold",
      family: "system-ui, -apple-system, sans-serif",
      color: "#FFFFFF",
      background: "rgba(0,0,0,0.55)",
      paddingPx: 12,
      startSec: 0,
      endSec: Math.max(1, outDur),
      fadeSec: 0.3,
      align: "center",
    };
    onChange([...layers, l]);
  };
  const update = (id: string, patch: Partial<TextLayer>) =>
    onChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => onChange(layers.filter((l) => l.id !== id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase text-studio-soft-white/50">Text layers ({layers.length})</span>
        <button onClick={add} className="text-[10px] text-studio-bronze hover:underline">+ add</button>
      </div>
      <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
        {layers.map((l) => (
          <div key={l.id} className="border border-studio-bronze/15 rounded p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-studio-bronze truncate max-w-[170px]" title={l.text}>{l.text || "(empty)"}</span>
              <button onClick={() => remove(l.id)} className="text-[10px] text-red-300 hover:underline">remove</button>
            </div>
            <input value={l.text} onChange={(e) => update(l.id, { text: e.target.value })}
                   className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Align</div>
                <select value={l.align} onChange={(e) => update(l.id, { align: e.target.value as any })}
                        className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
                  <option value="left">left</option><option value="center">center</option><option value="right">right</option>
                </select>
              </label>
              <label className="space-y-1">
                <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Weight</div>
                <select value={l.weight} onChange={(e) => update(l.id, { weight: e.target.value as any })}
                        className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
                  <option value="normal">normal</option><option value="bold">bold</option>
                </select>
              </label>
            </div>
            <Slider label="x"   value={l.x} min={0} max={1} step={0.01} onChange={(v) => update(l.id, { x: v })} />
            <Slider label="y"   value={l.y} min={0} max={1} step={0.01} onChange={(v) => update(l.id, { y: v })} />
            <Slider label="font" value={l.fontPx} min={14} max={240} step={1} fmt={(v) => `${v.toFixed(0)}px`} onChange={(v) => update(l.id, { fontPx: v })} />
            <Slider label="padding" value={l.paddingPx} min={0} max={60} step={1} fmt={(v) => `${v.toFixed(0)}px`} onChange={(v) => update(l.id, { paddingPx: v })} />
            <Slider label="start" value={l.startSec} min={0} max={Math.max(0.1, outDur)} step={0.05} fmt={(v) => `${v.toFixed(2)}s`} onChange={(v) => update(l.id, { startSec: Math.min(v, l.endSec - 0.1) })} />
            <Slider label="end"   value={l.endSec}   min={0} max={Math.max(0.1, outDur)} step={0.05} fmt={(v) => `${v.toFixed(2)}s`} onChange={(v) => update(l.id, { endSec: Math.max(v, l.startSec + 0.1) })} />
            <Slider label="fade"  value={l.fadeSec}  min={0} max={1.5} step={0.05} fmt={(v) => `${v.toFixed(2)}s`} onChange={(v) => update(l.id, { fadeSec: v })} />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Color</div>
                <input type="color" value={l.color} onChange={(e) => update(l.id, { color: e.target.value })}
                       className="w-full h-6 bg-transparent border border-studio-bronze/20 rounded" />
              </label>
              <label className="space-y-1">
                <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Background CSS</div>
                <input value={l.background} onChange={(e) => update(l.id, { background: e.target.value })}
                       placeholder="rgba(0,0,0,0.55)"
                       className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1" />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransitionControls({ clip, onChange }: { clip: Clip; onChange: (p: Partial<Clip>) => void }) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase text-studio-soft-white/50">Out</span>
        <select value={clip.transitionOutKind}
                onChange={(e) => onChange({ transitionOutKind: e.target.value as TransitionKind })}
                className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1 text-xs">
          <option value="cut">cut</option>
          <option value="fade_out">dip to black</option>
          <option value="crossfade">crossfade to next</option>
        </select>
      </label>
      {clip.transitionOutKind !== "cut" && (
        <Slider label="seconds" value={clip.transitionOutSec} min={0.1} max={2} step={0.05}
                fmt={(v) => `${v.toFixed(2)}s`} onChange={(v) => onChange({ transitionOutSec: v })} />
      )}
      <Slider label="fade in (this clip)" value={clip.fadeIn} min={0} max={2} step={0.05}
              fmt={(v) => `${v.toFixed(2)}s`} onChange={(v) => onChange({ fadeIn: v })} />
    </div>
  );
}
