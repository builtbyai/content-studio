import React, { useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Move, Trash2 } from "lucide-react";

// Premiere-Pro-flavored timeline panel.
// - Horizontal lanes (tracks), each clip is an absolutely-positioned block.
// - Pixel-per-second zoom slider (10..600).
// - Click ruler → scrub. Drag clip → reorder / move. Drag edges → trim.
// - Snap to playhead + neighbor edges when within `snapPx` pixels.
// - Keyboard: ←/→ frame, Shift+←/→ second, Home/End, Delete.
//
// Caller owns the source of truth. Timeline reports edits via callbacks.

export interface TimelineClip {
  id: string;
  trackId: number;          // 0 = V1 video, 1 = V2 overlay, 2 = A1 audio
  startSec: number;         // position on timeline (independent of trim)
  durationSec: number;      // output duration (post-trim, post-speed)
  label: string;
  color?: string;           // accent color (default bronze tint)
  thumbnailUrl?: string;    // optional, drawn at left edge of block
  pseudoWaveSeed?: number;  // for the placeholder waveform sparkline
}

export interface TimelineProps {
  clips: TimelineClip[];
  totalDurationSec: number;
  currentTimeSec: number;
  selectedClipId: string | null;
  tracks?: Array<{ id: number; label: string; color: string; height?: number }>;
  fps?: number;
  onScrub: (t: number) => void;
  onClipSelect: (id: string | null) => void;
  onClipMove: (id: string, newStartSec: number, newTrackId?: number) => void;
  onClipResize: (id: string, edge: "start" | "end", newSec: number) => void;
  onClipDelete: (id: string) => void;
}

const DEFAULT_TRACKS = [
  { id: 0, label: "V1", color: "#C3A35B", height: 56 },
  { id: 1, label: "V2", color: "#8B7355", height: 44 },
  { id: 2, label: "A1", color: "#5B7E9C", height: 36 },
];

export default function TimelinePanel({
  clips, totalDurationSec, currentTimeSec, selectedClipId,
  tracks = DEFAULT_TRACKS, fps = 30,
  onScrub, onClipSelect, onClipMove, onClipResize, onClipDelete,
}: TimelineProps) {
  const [pxPerSec, setPxPerSec] = useState<number>(60);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    type: "move" | "resize_start" | "resize_end" | "scrub" | null;
    clipId?: string;
    startX: number;
    startSec: number;
    startTrackId?: number;
    startDurationSec?: number;
  }>({ type: null, startX: 0, startSec: 0 });

  const totalWidthPx = Math.max(400, Math.ceil(totalDurationSec * pxPerSec) + 200);
  const trackById = useMemo(() => Object.fromEntries(tracks.map((t) => [t.id, t])), [tracks]);

  const xToSec = (xPx: number): number => Math.max(0, xPx / pxPerSec);
  const secToX = (s: number): number => s * pxPerSec;

  const snap = (sec: number, exclude?: string): number => {
    const snapPx = 6;
    const candidates: number[] = [0, totalDurationSec, currentTimeSec];
    for (const c of clips) {
      if (c.id === exclude) continue;
      candidates.push(c.startSec);
      candidates.push(c.startSec + c.durationSec);
    }
    let best = sec;
    let bestDist = Infinity;
    for (const t of candidates) {
      const distPx = Math.abs((sec - t) * pxPerSec);
      if (distPx < snapPx && distPx < bestDist) { bestDist = distPx; best = t; }
    }
    return best;
  };

  // Mouse handlers — installed once.
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      if (!drag.current.type) return;
      const dxSec = (ev.clientX - drag.current.startX) / pxPerSec;
      const type = drag.current.type;
      if (type === "scrub") {
        const next = snap(Math.max(0, drag.current.startSec + dxSec));
        onScrub(next);
      } else if (type === "move" && drag.current.clipId) {
        const next = snap(Math.max(0, drag.current.startSec + dxSec), drag.current.clipId);
        // Detect track switch via vertical hit (y relative to container).
        let newTrackId = drag.current.startTrackId ?? 0;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          let yAccum = RULER_HEIGHT;
          for (const t of tracks) {
            const h = t.height ?? 48;
            if (ev.clientY - rect.top >= yAccum && ev.clientY - rect.top < yAccum + h) {
              newTrackId = t.id;
            }
            yAccum += h;
          }
        }
        onClipMove(drag.current.clipId, next, newTrackId);
      } else if (type === "resize_start" && drag.current.clipId && drag.current.startDurationSec != null) {
        const newStart = snap(Math.max(0, drag.current.startSec + dxSec), drag.current.clipId);
        const cap = drag.current.startSec + drag.current.startDurationSec - 0.1;
        onClipResize(drag.current.clipId, "start", Math.min(newStart, cap));
      } else if (type === "resize_end" && drag.current.clipId && drag.current.startDurationSec != null) {
        const newEnd = snap(Math.max(0.1, drag.current.startSec + drag.current.startDurationSec + dxSec), drag.current.clipId);
        onClipResize(drag.current.clipId, "end", newEnd);
      }
    };
    const onUp = () => { drag.current.type = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [pxPerSec, clips, totalDurationSec, currentTimeSec, tracks, onScrub, onClipMove, onClipResize]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedClipId && e.key !== "Home" && e.key !== "End" && !e.key.startsWith("Arrow")) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" && selectedClipId) { e.preventDefault(); onClipDelete(selectedClipId); return; }
      if (e.key === "Home") { e.preventDefault(); onScrub(0); return; }
      if (e.key === "End") { e.preventDefault(); onScrub(totalDurationSec); return; }
      const step = e.shiftKey ? 1.0 : 1 / fps;
      if (e.key === "ArrowLeft") { e.preventDefault(); onScrub(Math.max(0, currentTimeSec - step)); }
      if (e.key === "ArrowRight") { e.preventDefault(); onScrub(Math.min(totalDurationSec, currentTimeSec + step)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedClipId, currentTimeSec, totalDurationSec, fps, onScrub, onClipDelete]);

  const startScrub = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - LANE_LABEL_WIDTH;
    const sec = xToSec(x);
    onScrub(snap(Math.max(0, sec)));
    drag.current = { type: "scrub", startX: e.clientX, startSec: sec };
  };

  const startClipDrag = (e: React.MouseEvent, c: TimelineClip, type: "move" | "resize_start" | "resize_end") => {
    e.stopPropagation();
    onClipSelect(c.id);
    drag.current = {
      type, clipId: c.id, startX: e.clientX, startSec: c.startSec,
      startTrackId: c.trackId, startDurationSec: c.durationSec,
    };
  };

  return (
    <div className="studio-glass rounded-lg overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-studio-bronze/15 text-xs">
        <span className="font-mono uppercase text-[10px] text-studio-soft-white/50">Timeline</span>
        <span className="text-studio-soft-white/40 font-mono ml-2">{fmt(currentTimeSec)} / {fmt(totalDurationSec)}</span>
        <div className="ml-auto flex items-center gap-2">
          <ZoomOut className="w-3 h-3 text-studio-soft-white/40" />
          <input type="range" min={10} max={600} step={5} value={pxPerSec}
                 onChange={(e) => setPxPerSec(Number(e.target.value))}
                 className="w-32 accent-studio-bronze" />
          <ZoomIn className="w-3 h-3 text-studio-soft-white/40" />
          <span className="font-mono text-[10px] text-studio-soft-white/50 w-12 text-right">{pxPerSec}px/s</span>
        </div>
      </div>

      <div ref={containerRef} className="relative overflow-x-auto overflow-y-hidden bg-studio-warm-black/40">
        <div className="relative" style={{ width: totalWidthPx + LANE_LABEL_WIDTH }}>
          {/* Ruler */}
          <div
            className="relative border-b border-studio-bronze/20 cursor-pointer select-none"
            style={{ height: RULER_HEIGHT, marginLeft: LANE_LABEL_WIDTH }}
            onMouseDown={startScrub}
          >
            <RulerTicks totalDurationSec={totalDurationSec} pxPerSec={pxPerSec} />
          </div>

          {/* Lanes */}
          {tracks.map((t) => (
            <div key={t.id} className="relative border-b border-studio-bronze/10"
                 style={{ height: t.height ?? 48 }}>
              <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center text-[10px] font-mono text-studio-bronze border-r border-studio-bronze/20 bg-studio-warm-black/60"
                   style={{ width: LANE_LABEL_WIDTH }}>
                {t.label}
              </div>
              <div className="absolute right-0 top-0 bottom-0" style={{ left: LANE_LABEL_WIDTH }}>
                {/* Lane grid stripes every second */}
                <LaneGrid totalDurationSec={totalDurationSec} pxPerSec={pxPerSec} laneHeight={t.height ?? 48} />
                {clips.filter((c) => c.trackId === t.id).map((c) => {
                  const left = secToX(c.startSec);
                  const width = Math.max(8, secToX(c.durationSec));
                  const selected = c.id === selectedClipId;
                  return (
                    <div key={c.id}
                      onMouseDown={(e) => startClipDrag(e, c, "move")}
                      onClick={(e) => { e.stopPropagation(); onClipSelect(c.id); }}
                      style={{ left, width, top: 4, bottom: 4, background: c.color ?? t.color, position: "absolute" }}
                      className={`rounded border ${selected ? "border-studio-bronze ring-1 ring-studio-bronze shadow" : "border-studio-bronze/40"} cursor-grab hover:brightness-110`}
                    >
                      <div className="px-1.5 py-0.5 text-[10px] font-mono text-studio-warm-black truncate flex items-center justify-between">
                        <span className="truncate">{c.label}</span>
                        <span className="opacity-70 ml-1">{c.durationSec.toFixed(2)}s</span>
                      </div>
                      <PseudoWave seed={c.pseudoWaveSeed ?? hash(c.id)} width={width} height={(t.height ?? 48) - 24} />
                      {/* Resize handles */}
                      <div onMouseDown={(e) => startClipDrag(e, c, "resize_start")}
                           className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-studio-warm-black/30" />
                      <div onMouseDown={(e) => startClipDrag(e, c, "resize_end")}
                           className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-studio-warm-black/30" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: LANE_LABEL_WIDTH + secToX(currentTimeSec), width: 1, background: "#f4cf6a", boxShadow: "0 0 6px rgba(244,207,106,0.55)" }}
          >
            <div className="absolute -top-0.5 -left-1.5 w-3 h-3 rounded-full bg-studio-bronze" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-studio-bronze/15 text-[10px] font-mono text-studio-soft-white/50">
        <span>{clips.length} clip{clips.length === 1 ? "" : "s"}</span>
        <span className="ml-auto">←/→ frame · Shift+←/→ second · Home/End · Delete</span>
      </div>
    </div>
  );
}

const RULER_HEIGHT = 22;
const LANE_LABEL_WIDTH = 36;

function fmt(t: number): string {
  if (!isFinite(t)) return "00:00.00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t * 100) % 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function RulerTicks({ totalDurationSec, pxPerSec }: { totalDurationSec: number; pxPerSec: number }) {
  // Choose step that produces 40-100px gaps between major ticks.
  let stepSec = 1;
  const stops = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of stops) {
    if (s * pxPerSec >= 40 && s * pxPerSec <= 120) { stepSec = s; break; }
    if (s * pxPerSec > 120) { stepSec = s; break; }
  }
  const ticks: number[] = [];
  for (let t = 0; t <= totalDurationSec + stepSec; t += stepSec) ticks.push(t);
  return (
    <>
      {ticks.map((t) => (
        <div key={t} className="absolute top-0 bottom-0 border-l border-studio-bronze/30" style={{ left: t * pxPerSec }}>
          <div className="absolute top-1 left-1 text-[9px] font-mono text-studio-soft-white/70 pointer-events-none">{fmt(t)}</div>
        </div>
      ))}
    </>
  );
}

function LaneGrid({ totalDurationSec, pxPerSec, laneHeight }: { totalDurationSec: number; pxPerSec: number; laneHeight: number }) {
  const stepSec = pxPerSec < 30 ? 5 : pxPerSec < 80 ? 1 : 0.5;
  const lines: number[] = [];
  for (let t = stepSec; t < totalDurationSec; t += stepSec) lines.push(t);
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ height: laneHeight }} width="100%">
      {lines.map((t) => (
        <line key={t} x1={t * pxPerSec} x2={t * pxPerSec} y1={0} y2={laneHeight}
              stroke="rgba(195,163,91,0.08)" strokeWidth={1} />
      ))}
    </svg>
  );
}

function PseudoWave({ seed, width, height }: { seed: number; width: number; height: number }) {
  // Deterministic placeholder waveform — real audio decode lands in Phase 08.
  // Generated via a tiny LCG so the same clip always renders the same shape.
  const cols = Math.max(8, Math.floor(width / 3));
  let s = seed || 1;
  const peaks: number[] = [];
  for (let i = 0; i < cols; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    peaks.push((s % 1000) / 1000);
  }
  const mid = height / 2;
  const dur = width;
  return (
    <svg className="absolute inset-0 top-5 pointer-events-none" width="100%" height={height} preserveAspectRatio="none" viewBox={`0 0 ${dur} ${height}`}>
      {peaks.map((p, i) => {
        const x = (i / peaks.length) * dur;
        const y = mid - p * mid * 0.7;
        const y2 = mid + p * mid * 0.7;
        return <line key={i} x1={x} x2={x} y1={y} y2={y2} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />;
      })}
    </svg>
  );
}
