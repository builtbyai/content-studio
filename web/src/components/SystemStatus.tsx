import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

const CHECK_LABEL: Record<string, { label: string; fix?: { href?: string; cmd?: string } }> = {
  gemini:               { label: "Gemini key",       fix: { cmd: "wrangler secret put GEMINI_API_KEY" } },
  openai:               { label: "OpenAI key",       fix: { cmd: "wrangler secret put OPENAI_API_KEY" } },
  runway:               { label: "Runway key",       fix: { cmd: "wrangler secret put RUNWAY_API_KEY" } },
  session_secret:       { label: "Session secret" },
  r2_access:            { label: "R2 API token",     fix: { cmd: "wrangler secret put R2_ACCESS_KEY_ID && wrangler secret put R2_SECRET_ACCESS_KEY" } },
  postiz_secret:        { label: "Postiz API key",   fix: { cmd: "wrangler secret put POSTIZ_API_KEY" } },
  postiz_webhook_secret:{ label: "Postiz webhook secret", fix: { cmd: "wrangler secret put POSTIZ_WEBHOOK_SECRET" } },
  cf_access:            { label: "CF Access service token", fix: { cmd: "wrangler secret put CF_ACCESS_CLIENT_ID && wrangler secret put CF_ACCESS_CLIENT_SECRET" } },
  postiz_reachable:     { label: "Postiz tunnel reachable", fix: { href: "https://dash.cloudflare.com/?to=/:account/zero-trust/networks/tunnels" } },
  ai_gateway:           { label: "AI Gateway",       fix: { href: "https://dash.cloudflare.com/REPLACE_WITH_YOUR_CF_ACCOUNT_ID/ai/ai-gateway" } },
  d1:                   { label: "D1 database" },
  r2:                   { label: "R2 bucket" },
};

interface CheckRow { ok: boolean; detail?: string }

export default function SystemStatus({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Record<string, CheckRow> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.setupStatus();
      setData(r.checks);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const entries = Object.entries(data ?? {});
  const failing = entries.filter(([, v]) => !v.ok);
  const passing = entries.filter(([, v]) => v.ok);

  if (compact) {
    if (loading) return <span className="text-[10px] font-mono text-studio-soft-white/40 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> checking…</span>;
    return (
      <span className={`text-[10px] font-mono flex items-center gap-1 ${failing.length ? "text-yellow-300" : "text-green-400"}`}>
        {failing.length === 0 ? (
          <><CheckCircle2 className="w-3 h-3" /> {passing.length}/{entries.length} systems ok</>
        ) : (
          <><AlertTriangle className="w-3 h-3" /> {failing.length} need attention · {passing.length}/{entries.length} ok</>
        )}
      </span>
    );
  }

  return (
    <div className="studio-glass rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-display font-bold">System Status</h3>
          <p className="text-[11px] text-studio-soft-white/50 mt-0.5">
            Live signal from Worker bindings + live pings to Postiz + AI Gateway.
          </p>
        </div>
        <button onClick={load} className="text-studio-soft-white/50 hover:text-studio-soft-white">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-xs text-studio-soft-white/50"><Loader2 className="w-3 h-3 animate-spin" /> loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
          {entries.map(([id, c]) => {
            const meta = CHECK_LABEL[id] ?? { label: id };
            return (
              <div key={id} className="flex items-start gap-2">
                {c.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={c.ok ? "text-studio-soft-white/90" : "text-studio-soft-white"}>{meta.label}</span>
                    {meta.fix?.href && !c.ok && (
                      <a href={meta.fix.href} target="_blank" rel="noreferrer" className="text-studio-bronze hover:underline text-[10px] flex items-center gap-0.5">
                        fix <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  {!c.ok && (c.detail || meta.fix?.cmd) && (
                    <div className="text-[10px] text-studio-soft-white/50 mt-0.5 font-mono break-all">
                      {c.detail ?? meta.fix?.cmd}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
