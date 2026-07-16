import React, { useEffect, useState } from "react";
import { Send, X, Loader2, CheckCircle2 } from "lucide-react";
import { api, type Channel } from "../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  /** R2 public URL for the media to attach. */
  mediaUrl: string;
  /** Initial post copy — usually concept.socialPostCopy. */
  initialCopy?: string;
}

// Modal: pick a connected channel, set scheduled-for, post copy. POSTs to
// /api/posts which queues into Postiz via existing pipeline.
export default function SendToScheduler({ open, onClose, mediaUrl, initialCopy = "" }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [copy, setCopy] = useState(initialCopy);
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api.listChannels().then((r) => {
      setChannels(r.channels);
      if (r.channels[0]) setChannelId(r.channels[0].id);
    });
    setCopy(initialCopy);
    setDone(false); setErr(null);
  }, [open, initialCopy]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelId || !copy.trim()) return;
    setBusy(true); setErr(null);
    try {
      // Extract R2 key from the public URL so we can pass it as mediaR2Keys.
      const r2Key = mediaUrl.replace(/^[^/]+\/\/[^/]+\/api\/r2\//, "");
      await api.schedulePost({
        channelId,
        scheduledFor: new Date(when).toISOString(),
        content: copy.trim(),
        mediaR2Keys: r2Key ? [r2Key] : undefined,
        draftKind: "from-studio",
      });
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? "schedule failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-studio-warm-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-studio-coffee border border-studio-bronze/30 rounded-lg w-full max-w-2xl flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-studio-bronze/15">
          <div>
            <h3 className="font-display font-bold flex items-center gap-2"><Send className="w-4 h-4" /> Send to scheduler</h3>
            <p className="text-[11px] text-studio-soft-white/50 mt-0.5">
              Creates a draft + schedule row. Postiz publishes at the scheduled time.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-studio-soft-white/40 hover:text-studio-soft-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 grid md:grid-cols-[1fr_2fr] gap-4">
          <div className="aspect-square rounded overflow-hidden border border-studio-bronze/20">
            <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
                {channels.length === 0 && <option value="">No channels connected</option>}
                {channels.map((c) => <option key={c.id} value={c.id}>{c.platform} · {c.display_name}</option>)}
              </select>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
            </div>
            <textarea rows={6} value={copy} onChange={(e) => setCopy(e.target.value)} placeholder="Post copy" className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
            {err && <div className="text-red-300 bg-red-900/15 border border-red-700/30 rounded p-2">{err}</div>}
            {done ? (
              <div className="text-green-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Scheduled</div>
            ) : (
              <button type="submit" disabled={busy || !channelId || !copy.trim()} className="bg-studio-bronze text-studio-warm-black font-semibold px-4 py-2 rounded disabled:opacity-50 flex items-center gap-2">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Schedule
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
