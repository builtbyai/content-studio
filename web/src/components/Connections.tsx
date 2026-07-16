import React, { useEffect, useState } from "react";
import { Link, Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, type Channel } from "../lib/api";

const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X / Twitter" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "threads", label: "Threads" },
  { id: "facebook", label: "Facebook" },
];

export default function Connections() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [warn, setWarn] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.listChannels();
      setChannels(r.channels);
      setWarn(r.warning ?? null);
    } catch (e: any) {
      setWarn(`failed to load: ${e?.body?.error ?? "unknown"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const connect = async (platform: string) => {
    setConnecting(platform);
    try {
      const { url } = await api.connectChannel(platform);
      // Pop a small window so the user stays on ContentForge mentally.
      // When the window closes (after OAuth or manual dismiss), refresh channels.
      const popup = window.open(
        url,
        "contentforge-connect",
        "width=720,height=820,menubar=no,toolbar=no,location=yes,status=no"
      );
      if (!popup) {
        // Popup blocked — fall back to full redirect
        window.location.assign(url);
        return;
      }
      // Poll the popup until it closes, then resync.
      const t = setInterval(async () => {
        if (popup.closed) {
          clearInterval(t);
          setConnecting(null);
          await refresh();
        }
      }, 600);
    } catch (e: any) {
      setWarn(`connect failed: ${e?.body?.message ?? "unknown"}`);
      setConnecting(null);
    }
  };

  const byPlatform = new Map<string, Channel[]>();
  channels.forEach((c) => {
    const list = byPlatform.get(c.platform) ?? [];
    list.push(c);
    byPlatform.set(c.platform, list);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold">Connections</h2>
          <p className="text-xs text-studio-soft-white/60 mt-1">
            Link social accounts via Postiz OAuth. Tokens stay on Postiz; we only store integration IDs.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 text-xs bg-studio-brown/40 hover:bg-studio-brown/60 border border-studio-bronze/20 px-3 py-1.5 rounded"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Sync from Postiz
        </button>
      </div>

      {warn && (
        <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-700/40 rounded p-3 text-xs">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
          <span>{warn}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-studio-soft-white/60 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> loading channels…
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PLATFORMS.map((p) => {
            const linked = byPlatform.get(p.id) ?? [];
            return (
              <div key={p.id} className="studio-glass rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-display font-bold text-sm">{p.label}</div>
                  {linked.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-mono uppercase text-green-400">
                      <CheckCircle2 className="w-3 h-3" /> {linked.length}
                    </span>
                  )}
                </div>
                {linked.length === 0 ? (
                  <p className="text-xs text-studio-soft-white/50 mb-3">No accounts linked.</p>
                ) : (
                  <ul className="space-y-1 mb-3">
                    {linked.map((c) => (
                      <li key={c.id} className="text-xs flex items-center justify-between">
                        <span className="truncate">{c.display_name}</span>
                        <span
                          className={`font-mono text-[9px] uppercase ml-2 ${
                            c.status === "active" ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {c.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => connect(p.id)}
                  disabled={connecting === p.id}
                  className="w-full flex items-center justify-center gap-1.5 bg-studio-bronze text-studio-warm-black text-xs font-semibold py-1.5 rounded disabled:opacity-50"
                >
                  {connecting === p.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Link className="w-3 h-3" />
                  )}
                  {linked.length > 0 ? "Add another" : "Connect"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
