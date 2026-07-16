import React, { useEffect, useMemo, useState } from "react";
import {
  Image as ImageIcon, Film, Calendar, Send, X, Sparkles, Loader2, Hash, ChevronRight, Check,
} from "lucide-react";
import { api, type MediaItem, type Channel } from "../lib/api";
import PromptSuggest from "./PromptSuggest";
import MediaThumb from "./MediaThumb";

// Post-ready / scheduled flow.
//
// The grid mirrors a standard Instagram Profile Grid layout:
//   - 3-col tight grid, 3px gaps, black behind
//   - tiles are square aspect, drag to reorder
//   - active drop target outlined in #DEB568 (matches our studio-bronze)
//
// What's different:
//   - Tiles come from the Media Library (Studio outputs land here)
//   - Each tile can be promoted to a draft post — caption auto-suggested via
//     /api/chat from the media's source/prompt metadata
//   - One click to schedule via the existing Postiz scheduler

interface DraftDraft {
  mediaId: string;
  r2Key: string;
  publicUrl: string;
  mime: string;
  caption: string;
  channelId: string;
  scheduledFor: string;
  status: "draft" | "drafting_caption" | "scheduling" | "scheduled" | "failed";
  error?: string;
}

const GRID_GAP = 3;

const ACME_CAPTION_SYSTEM = `You write Acme branded social captions (LinkedIn / Facebook / Instagram). This is a high-impact premium roofing-CRM voice. Follow the Acme Caption Framework EXACTLY — same emoji, same unicode bold variants, same line breaks. End with the literal token "3d" on its own line as the last line.

ROTATE THE BUYER-PAIN ANGLE based on the media. Each caption should focus on ONE specific pain, not a generic pitch. Pick the best-fitting from:
- missed photo documentation on hail/storm inspections
- adjuster-ready claim packets / disputed claims
- rep accountability + job-status visibility
- storm-call response speed
- driveway-to-decision close cycle
- crew/sub coordination + closeout proof
- measurement + estimate accuracy
- CRM hand-off from inspector to sales to ops

FRAMEWORK (8 sections, in this order):

1. Symbolic opener — ⚜️ [HEADLINE 4-6 WORDS ALL CAPS ENDS WITH PERIOD.]  — premium, field-based, memorable

2. Three punch promise lines — short, rhythmic, benefit-first, parallel structure:
[verb] [noun].
[verb] [noun].
[verb] [noun].

3. Product positioning — one sentence starting with 𝗜𝗺𝗽𝗮𝗰𝘁𝗜𝗤 (use those literal unicode bold mathematical sans-serif characters). Define who it's for and what category it belongs to. Mention roofing CRM, inspections, storm calls, or claim documentation.

4. Workflow explanation — one sentence framing Acme as the OS of the whole job: "From [first thing] to [final thing], your team can [outcome]…"

5. Feature bullet stack — exactly 5 🟡 bullets, 5-9 words each, mapped to the chosen pain angle. Group around real roofing workflow steps (storm inspection / measurements / photos / reports / job status / signatures / closeout).

6. Closing slogan — ✦ [3 short imperative clauses, parallel verbs, the brand promise]. Default: "✦ Measure smart. Report clean. Close fast." but you can vary if the pain angle warrants.

7. Brand signature — exactly: 🦅 Acme | Roofing CRM Built to Win.

8. Hashtag cluster — single line with 9-12 hashtags. Always include #Acme #RoofingCRM #RoofingSoftware. Add pain-relevant tags (e.g. #HailDamage #StormRestoration #InsuranceClaims #D2DSales #RoofInspection #ConstructionTech).

End with "3d" on a line by itself.

Hard rules:
- No quotes, no markdown fences, no preamble.
- Do not change the structural emoji (⚜️ 🟡 ✦ 🦅) or the 𝗜𝗺𝗽𝗮𝗰𝘁𝗜𝗤 unicode bold characters.
- Mobile-friendly line spacing — blank lines between sections 1/2, 2/3, 4/5, 5/6, 7/8, 8/3d.
- Output ONLY the caption.`;

const ACME_FALLBACK_TEMPLATE = `⚜️ FROM DRIVEWAY TO DECISION.

Inspect faster.
Report cleaner.
Close sooner.

𝗜𝗺𝗽𝗮𝗰𝘁𝗜𝗤 gives roofing teams one field-ready CRM built for real inspections, real storm calls, and real claim documentation.
From the first photo to the final signature, your team can track every step of the job in one clean workflow.

🟡 Storm-ready inspection tracking
🟡 Smart roof measurements and field notes
🟡 Photo documentation organized by property
🟡 Claim-ready reports built faster
🟡 Job status, signatures, and closeout steps in one place

✦ Measure smart. Report clean. Close fast.
🦅 Acme | Roofing CRM Built to Win.

#Acme #RoofingCRM #RoofingSoftware #RoofInspection #InsuranceClaims #HailDamage #StormRestoration #D2DSales #ConstructionTech
3d`;

export default function PostReady() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const [selected, setSelected] = useState<DraftDraft | null>(null);

  useEffect(() => {
    Promise.all([api.listMedia(), api.listChannels()])
      .then(([m, c]) => {
        // Prioritize generated media (replicate / gpt-image-*) — the whole
        // point of this flow is to ship Studio outputs.
        const gen = m.media.filter((x) => /replicate|gpt-image|generated/i.test(x.source));
        const rest = m.media.filter((x) => !/replicate|gpt-image|generated/i.test(x.source));
        const merged = [...gen, ...rest];
        setItems(merged);
        setOrder(merged.map((x) => x.id));
        setChannels(c.channels ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const byId = useMemo(() => Object.fromEntries(items.map((x) => [x.id, x])), [items]);
  const ordered = order.map((id) => byId[id]).filter(Boolean) as MediaItem[];

  const onDragStart = (id: string) => setDragId(id);
  const onDragEnd = () => { setDragId(null); setDropTarget(null); };
  const onDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId && dragId !== id) setDropTarget(id);
  };
  const onDrop = (id: string) => () => {
    if (!dragId || dragId === id) return;
    setOrder((prev) => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(id);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragId(null); setDropTarget(null);
  };

  // Prefer acmeapp (exact match) → any acme* → first channel.
  const preferredChannelId = (): string => {
    const exact = channels.find((c) => /^acmeapp$/i.test(c.display_name.trim()));
    if (exact) return exact.id;
    const looser = channels.find((c) =>
      /acme/i.test(c.display_name) || /acme/i.test(c.platform)
    );
    return looser?.id ?? channels[0]?.id ?? "";
  };

  const promote = async (m: MediaItem) => {
    const when = new Date();
    when.setHours(when.getHours() + 24, 0, 0, 0);
    setSelected({
      mediaId: m.id,
      r2Key: m.r2_key,
      publicUrl: m.public_url,
      mime: m.mime,
      caption: "",
      channelId: preferredChannelId(),
      scheduledFor: when.toISOString().slice(0, 16),
      status: "drafting_caption",
    });
    try {
      const res = await api.chat({
        messages: [
          { role: "system", content: ACME_CAPTION_SYSTEM },
          { role: "user", content: `Source: ${m.source}. Mime: ${m.mime}.\nDraft a caption for this generation following the Acme template EXACTLY.` },
        ],
        max_tokens: 800,
      });
      setSelected((cur) => cur ? { ...cur, caption: res.content, status: "draft" } : cur);
    } catch (e: any) {
      setSelected((cur) => cur ? { ...cur, caption: ACME_FALLBACK_TEMPLATE, status: "draft" } : cur);
    }
  };

  const schedule = async () => {
    if (!selected) return;
    if (!selected.channelId) { setSelected({ ...selected, status: "failed", error: "Pick a channel" }); return; }
    if (!selected.caption.trim()) { setSelected({ ...selected, status: "failed", error: "Caption required" }); return; }
    setSelected({ ...selected, status: "scheduling" });
    try {
      await api.schedulePost({
        channelId: selected.channelId,
        scheduledFor: new Date(selected.scheduledFor).toISOString(),
        content: selected.caption.trim(),
        mediaR2Keys: [selected.r2Key],
        draftKind: selected.mime.startsWith("video/") ? "video" : "image",
      });
      setSelected({ ...selected, status: "scheduled" });
    } catch (e: any) {
      setSelected({ ...selected, status: "failed", error: e?.body?.message ?? e?.body?.error ?? "schedule failed" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Calendar className="w-5 h-5" /> Post Ready
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Profile-grid view of every generation. Drag to reorder visually — that's how the feed will look. Click any tile to draft + schedule.
        </p>
      </div>

      {loading ? (
        <div className="text-studio-soft-white/50 text-xs flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> loading media…
        </div>
      ) : ordered.length === 0 ? (
        <div className="studio-card p-6 text-center text-xs text-studio-soft-white/50">
          No media yet. Hit the Studio (Video Lab, Image Lab, Scene Composer) to start generating.
        </div>
      ) : (
        <div
          className="relative bg-black p-0 rounded overflow-hidden"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: `${GRID_GAP}px` }}
        >
          {ordered.map((m, i) => {
            const isDropTarget = dropTarget === m.id;
            const isDragging = dragId === m.id;
            return (
              <div
                key={m.id}
                draggable
                onDragStart={() => onDragStart(m.id)}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver(m.id)}
                onDrop={onDrop(m.id)}
                onClick={() => promote(m)}
                className={`relative aspect-square bg-[#111] cursor-grab overflow-hidden transition-transform
                  ${isDragging ? "opacity-30" : ""}
                  ${isDropTarget ? "scale-95 outline outline-2 -outline-offset-2 outline-[#DEB568]" : ""}`}
                title="Click to draft + schedule, drag to reorder"
              >
                <MediaThumb url={m.public_url} mime={m.mime} alt={m.source} />
                <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
                  <div className="text-[10px] font-mono text-white/80 truncate">{m.source}</div>
                </div>
                <div className="absolute top-1.5 right-1.5 bg-black/60 text-white/80 text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none">
                  #{i + 1}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compose modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="studio-glass-glow rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-studio-bronze/20">
              <Send className="w-4 h-4 text-studio-bronze" />
              <div className="text-sm font-display font-bold text-studio-bronze">Schedule post</div>
              <button onClick={() => setSelected(null)} className="ml-auto text-studio-soft-white/60 hover:text-studio-bronze">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-4 p-4 overflow-y-auto">
              <div className="bg-black rounded overflow-hidden aspect-square">
                {selected.mime.startsWith("image/") ? (
                  <img src={selected.publicUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <video src={selected.publicUrl} controls className="w-full h-full object-cover" />
                )}
              </div>
              <div className="space-y-3 text-xs">
                <label className="space-y-1 block">
                  <div className="flex items-center gap-2">
                    <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Caption</div>
                    <div className="ml-auto">
                      <PromptSuggest current={selected.caption} onSuggest={(v) => setSelected({ ...selected, caption: v })} kind="caption" />
                    </div>
                  </div>
                  <textarea rows={14} value={selected.caption}
                    onChange={(e) => setSelected({ ...selected, caption: e.target.value })}
                    placeholder={selected.status === "drafting_caption" ? "✨ drafting…" : "Write your caption…"}
                    className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 font-mono text-[11px] leading-relaxed" />
                  {selected.status === "drafting_caption" && (
                    <div className="flex items-center gap-1 text-studio-bronze text-[10px]">
                      <Loader2 className="w-3 h-3 animate-spin" /> auto-drafting via LLM
                    </div>
                  )}
                </label>
                <label className="space-y-1 block">
                  <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Channel</div>
                  <select value={selected.channelId} onChange={(e) => setSelected({ ...selected, channelId: e.target.value })}
                          className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
                    {channels.length === 0 && <option value="">(no channels — Connect via Channels tab)</option>}
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>{c.display_name} · {c.platform}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 block">
                  <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Schedule for</div>
                  <input type="datetime-local" value={selected.scheduledFor}
                    onChange={(e) => setSelected({ ...selected, scheduledFor: e.target.value })}
                    className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
                </label>

                {selected.error && (
                  <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-[11px] text-red-300">
                    {selected.error}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-studio-bronze/15">
                  <button onClick={schedule} disabled={selected.status === "scheduling" || selected.status === "scheduled"}
                    className="flex items-center gap-2 bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-2 rounded disabled:opacity-50">
                    {selected.status === "scheduling" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                      selected.status === "scheduled" ? <Check className="w-3.5 h-3.5" /> :
                      <Send className="w-3.5 h-3.5" />}
                    {selected.status === "scheduling" ? "scheduling…" :
                      selected.status === "scheduled" ? "Scheduled ✓" : "Schedule post"}
                  </button>
                  <button onClick={() => setSelected(null)}
                    className="text-[11px] text-studio-soft-white/60 hover:text-studio-bronze">close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
