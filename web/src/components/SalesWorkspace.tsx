import React, { useEffect, useState } from "react";
import { Users, Search, MailCheck, Send, Loader2, ChevronRight } from "lucide-react";
import { api } from "../lib/api";

export default function SalesWorkspace() {
  const [icp, setIcp] = useState("Mid-size US roofing contractors doing $5M-$20M annual revenue, focused on storm restoration");
  const [geo, setGeo] = useState("Texas");
  const [maxResults, setMaxResults] = useState(8);
  const [busy, setBusy] = useState(false);
  const [prospects, setProspects] = useState<any[]>([]);
  const [activeProspect, setActiveProspect] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [draftChannel, setDraftChannel] = useState<"email" | "linkedin">("email");
  const [offer, setOffer] = useState("Acme: a roofing intelligence studio with drone scan + adjuster evidence center, replacing chaotic notebooks with one structured field-to-claim workflow.");
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    const { prospects } = await api.listProspects();
    setProspects(prospects);
  };
  useEffect(() => { refresh(); }, []);

  const discover = async () => {
    setBusy(true); setErr(null);
    try {
      await api.discoverProspects({ idealCustomerProfile: icp, geography: geo, maxResults });
      await refresh();
    } catch (e: any) { setErr(e?.body?.message ?? "discover failed"); }
    finally { setBusy(false); }
  };

  const draftOutreach = async (p: any) => {
    setActiveProspect(p); setBusy(true); setDraft(null);
    try {
      const r = await api.draftOutreach({
        prospect: { id: p.id, companyName: p.company_name, website: p.website, location: p.location, fitScore: p.fit_score, sourceEvidence: [] },
        channel: draftChannel, offerSummary: offer,
      });
      setDraft(r.data);
    } catch (e: any) { setErr(e?.body?.message ?? "draft failed"); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await api.approveOutreach(draft.id);
      setDraft({ ...draft, status: "queued" });
    } catch (e: any) { setErr(e?.body?.message ?? "approve failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2"><Users className="w-5 h-5" /> Sales Workspace</h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Nodes 19-25: discover → enrich → draft → approve → send queue. Compliance-gated by spec defaults.
        </p>
      </div>

      <div className="studio-glass-glow rounded-lg p-4 space-y-3">
        <div className="text-xs font-mono uppercase text-studio-bronze">1. Discover prospects (Node 19)</div>
        <textarea rows={3} value={icp} onChange={(e) => setIcp(e.target.value)} placeholder="Ideal customer profile" className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs" />
        <div className="flex items-center gap-2 text-xs">
          <input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="Geography" className="flex-1 bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
          <input type="number" value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} min={1} max={25} className="w-20 bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
          <button onClick={discover} disabled={busy || !icp.trim()} className="bg-studio-bronze text-studio-warm-black font-semibold px-4 py-1.5 rounded text-xs disabled:opacity-50">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3 inline mr-1" />}
            Discover
          </button>
        </div>
        {err && <div className="text-xs text-red-300 bg-red-900/15 border border-red-700/30 rounded p-2">{err}</div>}
      </div>

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase text-studio-bronze">Prospects ({prospects.length})</div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {prospects.map((p) => (
              <button
                key={p.id}
                onClick={() => draftOutreach(p)}
                className={`w-full text-left studio-glass rounded p-3 text-xs flex items-center gap-2 ${activeProspect?.id === p.id ? "ring-1 ring-studio-bronze" : ""}`}
              >
                <ChevronRight className="w-3 h-3 text-studio-bronze shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{p.company_name}</div>
                  <div className="text-studio-soft-white/50">{p.location ?? "?"} · fit {(p.fit_score * 100).toFixed(0)}%</div>
                  {p.website && <div className="text-studio-bronze text-[10px] truncate">{p.website}</div>}
                </div>
              </button>
            ))}
            {prospects.length === 0 && <div className="text-xs text-studio-soft-white/40 p-3">No prospects yet. Run discover above.</div>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono uppercase text-studio-bronze">Outreach draft (Node 22)</div>
            <select value={draftChannel} onChange={(e) => setDraftChannel(e.target.value as any)} className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1 text-[10px]">
              <option value="email">email</option>
              <option value="linkedin">linkedin</option>
            </select>
          </div>
          <textarea rows={3} value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Offer summary" className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs" />

          {draft && (
            <div className="studio-glass-glow rounded-lg p-4 space-y-2 text-sm">
              {draft.subject && (
                <div><strong className="text-studio-bronze">Subject:</strong> {draft.subject}</div>
              )}
              <div className="whitespace-pre-wrap">{draft.body}</div>
              {(draft.complianceWarnings?.length > 0 || draft.deceptionFlags?.length > 0) && (
                <div className="text-[10px] text-yellow-300 border-t border-yellow-700/30 pt-2">
                  {draft.complianceWarnings?.length > 0 && <div>⚠ compliance: {draft.complianceWarnings.join("; ")}</div>}
                  {draft.deceptionFlags?.length > 0 && <div>⚠ deception flags avoided: {draft.deceptionFlags.join("; ")}</div>}
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                <button onClick={approve} disabled={busy || draft.status === "queued"} className="bg-studio-bronze text-studio-warm-black text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1">
                  <Send className="w-3 h-3" /> {draft.status === "queued" ? "Queued" : "Approve + queue"}
                </button>
                {draft.status === "queued" && <span className="text-green-400 text-xs flex items-center gap-1"><MailCheck className="w-3 h-3" /> queued for send</span>}
              </div>
            </div>
          )}
          {!draft && <div className="text-xs text-studio-soft-white/40 p-3">Click a prospect to draft an outreach.</div>}
        </div>
      </div>
    </div>
  );
}
