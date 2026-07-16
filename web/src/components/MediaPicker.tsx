import React, { useEffect, useState } from "react";
import { Image as ImageIcon, X, Check, Loader2 } from "lucide-react";
import { api, type MediaItem } from "../lib/api";
import MediaThumb from "./MediaThumb";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (selected: MediaItem[]) => void;
  multi?: boolean;
  filter?: "image" | "video" | "all";
  initialSelected?: string[]; // media ids
}

// Modal that lists media + lets you pick. Reuse from any tab that needs to
// attach media to a draft, workflow, or post.
export default function MediaPicker({
  open, onClose, onPick, multi = true, filter = "all", initialSelected = [],
}: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.listMedia().then(({ media }) => {
      setItems(filter === "all" ? media : media.filter((m) => m.mime.startsWith(filter)));
    }).finally(() => setLoading(false));
  }, [open, filter]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!multi) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const confirm = () => {
    onPick(items.filter((m) => selected.has(m.id)));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-studio-warm-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-studio-coffee border border-studio-bronze/30 rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-studio-bronze/15">
          <div>
            <h3 className="font-display font-bold flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Pick media
            </h3>
            <p className="text-[11px] text-studio-soft-white/50 mt-0.5">
              {multi ? `${selected.size} selected · click to toggle` : "Pick one"}
            </p>
          </div>
          <button onClick={onClose} className="text-studio-soft-white/40 hover:text-studio-soft-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-studio-soft-white/60">
              <Loader2 className="w-4 h-4 animate-spin" /> loading…
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-sm text-studio-soft-white/40 py-8">
              No media yet. Upload some in the Media tab first.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {items.map((m) => {
                const isSel = selected.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggle(m.id)}
                    className={`relative aspect-square rounded overflow-hidden border-2 ${
                      isSel ? "border-studio-bronze ring-2 ring-studio-bronze/40" : "border-studio-bronze/15 hover:border-studio-bronze/40"
                    }`}
                  >
                    <MediaThumb url={m.public_url} mime={m.mime} alt={m.source} />
                    {isSel && (
                      <div className="absolute top-1 right-1 bg-studio-bronze rounded-full w-5 h-5 flex items-center justify-center text-studio-warm-black">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-studio-bronze/15">
          <button onClick={onClose} className="text-xs text-studio-soft-white/60 hover:text-studio-soft-white px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={selected.size === 0}
            className="bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-1.5 rounded disabled:opacity-40"
          >
            Attach {selected.size > 0 && `(${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
