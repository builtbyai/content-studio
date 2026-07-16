import React, { useEffect, useState } from "react";
import { Mail, Save, Send, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";

export default function EmailPrefs() {
  const [prefs, setPrefs] = useState({
    notify_email: "",
    notify_on_generated: false,
    notify_on_published: true,
    notify_on_failed: true,
    notify_cost_threshold_usd: null as number | null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getPrefs().then(({ prefs }) => {
      if (prefs) setPrefs({
        notify_email: prefs.notify_email ?? "",
        notify_on_generated: !!prefs.notify_on_generated,
        notify_on_published: !!prefs.notify_on_published,
        notify_on_failed: !!prefs.notify_on_failed,
        notify_cost_threshold_usd: prefs.notify_cost_threshold_usd ?? null,
      });
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.putPrefs(prefs);
      setSaved(true); setTimeout(() => setSaved(false), 1800);
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTestStatus("sending…");
    try {
      const r = await api.testNotification();
      setTestStatus(`✓ sent to ${r.to}`);
    } catch (e: any) {
      setTestStatus(`✗ ${e?.body?.error ?? "failed"} — ${e?.body?.body?.slice(0, 100) ?? ""}`);
    }
  };

  if (loading) return <div className="text-xs text-studio-soft-white/60 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> loading prefs…</div>;

  return (
    <div className="studio-glass rounded-lg p-4 space-y-4">
      <div>
        <h3 className="font-display font-bold text-sm flex items-center gap-2"><Mail className="w-4 h-4" /> Email notifications</h3>
        <p className="text-[11px] text-studio-soft-white/50 mt-0.5">
          Get pinged when pipeline events fire. Uses MailChannels via the Worker — no SMTP setup.
        </p>
      </div>

      <label className="block text-xs">
        <div className="font-mono uppercase text-studio-soft-white/50 mb-1">Notification email</div>
        <input
          type="email" value={prefs.notify_email}
          onChange={(e) => setPrefs({ ...prefs, notify_email: e.target.value })}
          placeholder="you@example.com"
          className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5"
        />
      </label>

      <div className="space-y-2 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={prefs.notify_on_generated} onChange={(e) => setPrefs({ ...prefs, notify_on_generated: e.target.checked })} />
          <span>Every generated asset (verbose — only useful for low-volume testing)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={prefs.notify_on_published} onChange={(e) => setPrefs({ ...prefs, notify_on_published: e.target.checked })} />
          <span>When a scheduled post goes live</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={prefs.notify_on_failed} onChange={(e) => setPrefs({ ...prefs, notify_on_failed: e.target.checked })} />
          <span>When a post or generation fails</span>
        </label>
        <label className="flex items-center gap-2">
          <span>Alert when 30-day spend exceeds</span>
          <span className="text-studio-bronze">$</span>
          <input
            type="number" min={0} step={0.5}
            value={prefs.notify_cost_threshold_usd ?? ""}
            onChange={(e) => setPrefs({ ...prefs, notify_cost_threshold_usd: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="0 = off"
            className="w-20 bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="bg-studio-bronze text-studio-warm-black text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
        <button onClick={test} disabled={!prefs.notify_email.trim()} className="bg-studio-brown/40 border border-studio-bronze/20 text-xs px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1 hover:bg-studio-brown/60">
          <Send className="w-3 h-3" /> Send test
        </button>
        {saved && <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> saved</span>}
        {testStatus && <span className="text-xs text-studio-soft-white/70">{testStatus}</span>}
      </div>
    </div>
  );
}
