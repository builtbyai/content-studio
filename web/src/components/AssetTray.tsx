import React, { useEffect, useState } from "react";
import { Layers, X, Pin, ChevronUp, ChevronDown, Image as ImageIcon, Film, Music2 } from "lucide-react";
import { api, type MediaItem } from "../lib/api";
import { useJobs } from "../lib/use-jobs";
import MediaThumb from "./MediaThumb";

// Persistent recent-asset strip. Anchored bottom-left, opt-collapsible.
// Drag any tile onto a target that accepts an `application/x-media-url` text
// drop — the URL is the asset's public URL.

export default function AssetTray() {
  const jobsCtx = useJobs();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [pinned, setPinned] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("cf:assetTray:pinned") ?? "[]"); } catch { return []; }
  });
  const [open, setOpen] = useState(true);

  const refresh = async () => {
    try { const { media } = await api.listMedia(); setItems(media.slice(0, 60)); } catch {}
  };

  useEffect(() => { refresh(); }, []);

  // Re-pull when any job goes terminal so freshly generated assets land instantly.
  useEffect(() => {
    if (jobsCtx.jobs.some((j) => j.status === "succeeded" && j.finished_at && (Date.now() / 1000 - j.finished_at) < 60)) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsCtx.jobs.filter((j) => j.status === "succeeded").length]);

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("cf:assetTray:pinned", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Pinned first, then everything else by created_at desc.
  const sorted = [...items].sort((a, b) => {
    const ap = pinned.includes(a.id) ? 1 : 0;
    const bp = pinned.includes(b.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.created_at - a.created_at;
  });

  return (
    <div className="fixed bottom-3 left-3 z-30">
      <div className="studio-glass rounded-lg border border-studio-bronze/30 shadow-lg overflow-hidden text-xs">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-studio-bronze/15">
          <Layers className="w-3.5 h-3.5 text-studio-bronze" />
          <span className="font-display font-bold text-studio-bronze">Assets</span>
          <span className="text-studio-soft-white/40 font-mono ml-auto">{items.length}</span>
          <button onClick={() => setOpen((v) => !v)} className="text-studio-soft-white/60 hover:text-studio-bronze">
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
        </div>
        {open && (
          <div className="p-2 flex gap-1.5 overflow-x-auto max-w-[680px]">
            {sorted.length === 0 ? (
              <div className="text-studio-soft-white/40 text-[10px] px-2 py-3">(no media yet)</div>
            ) : sorted.slice(0, 30).map((m) => (
              <AssetTile key={m.id} m={m} pinned={pinned.includes(m.id)} onTogglePin={() => togglePin(m.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetTile({ m, pinned, onTogglePin }: { m: MediaItem; pinned: boolean; onTogglePin: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", m.public_url);
        e.dataTransfer.setData("application/x-media-url", m.public_url);
        e.dataTransfer.setData("application/x-media-id", m.id);
        e.dataTransfer.setData("application/x-media-r2-key", m.r2_key);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className="relative w-16 h-16 flex-shrink-0 rounded overflow-hidden border border-studio-bronze/20 hover:border-studio-bronze cursor-grab active:cursor-grabbing"
      title={m.source}
    >
      <MediaThumb url={m.public_url} mime={m.mime} alt={m.source} showKindPill={false} />
      <button onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
        title={pinned ? "Unpin" : "Pin"}
        className={`absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center z-10
          ${pinned ? "bg-studio-bronze text-studio-warm-black" : "bg-black/50 text-studio-bronze/80 hover:bg-studio-bronze/30"}`}>
        <Pin className="w-2.5 h-2.5" />
      </button>
      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/70 text-[8px] font-mono text-white/80 truncate pointer-events-none">
        {m.mime.startsWith("video/") ? "VID" : m.mime.startsWith("image/") ? "IMG" : m.mime.startsWith("audio/") ? "AUD" : "FIL"}
      </div>
    </div>
  );
}
