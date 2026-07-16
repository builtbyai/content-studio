import React, { useState } from "react";
import { TrendingUp, Swords, Loader2 } from "lucide-react";
import { api } from "../lib/api";

export default function ResearchWorkspace() {
  // SEO
  const [seeds, setSeeds] = useState("roof inspection software, drone roof scan, hail damage adjuster");
  const [market, setMarket] = useState("us-en");
  const [seoBusy, setSeoBusy] = useState(false);
  const [seoOut, setSeoOut] = useState<any>(null);

  // Competitor
  const [competitors, setCompetitors] = useState("roofflowai.com, jobnimbus.com, acculynx.com");
  const [valueProps, setValueProps] = useState("drone-first inspections, structured adjuster file, AI-quality control");
  const [compBusy, setCompBusy] = useState(false);
  const [compOut, setCompOut] = useState<any>(null);

  const runSeo = async () => {
    setSeoBusy(true);
    try {
      const r = await api.seoResearch({ seedKeywords: seeds.split(",").map(s => s.trim()).filter(Boolean), market });
      setSeoOut(r.data ?? r);
    } finally { setSeoBusy(false); }
  };
  const runComp = async () => {
    setCompBusy(true);
    try {
      const r = await api.competitorIntel({
        competitorDomains: competitors.split(",").map(s => s.trim()).filter(Boolean),
        ourValueProps: valueProps.split(",").map(s => s.trim()).filter(Boolean),
      });
      setCompOut(r.data ?? r);
    } finally { setCompBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Research</h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Node 17 SEO keyword research · Node 18 competitor intelligence (Vectorize-backed similarity).
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="studio-glass-glow rounded-lg p-4 space-y-3">
          <div className="text-xs font-mono uppercase text-studio-bronze">SEO research (Node 17)</div>
          <textarea rows={2} value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder="Seed keywords (comma-separated)" className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs" />
          <div className="flex items-center gap-2">
            <input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Market" className="flex-1 bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs" />
            <button onClick={runSeo} disabled={seoBusy || !seeds.trim()} className="bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-1.5 rounded disabled:opacity-50">
              {seoBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Research"}
            </button>
          </div>
          {seoOut && (
            <div className="space-y-2 text-xs">
              {Array.isArray(seoOut.primary) && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-studio-bronze/70 mb-1">Primary ({seoOut.primary.length})</div>
                  {seoOut.primary.slice(0, 8).map((k: any, i: number) => (
                    <div key={i} className="flex justify-between py-0.5 border-b border-studio-bronze/10">
                      <span>{k.keyword}</span>
                      <span className="font-mono text-studio-soft-white/50">vol {k.volume} · diff {k.difficulty} · {k.intent}</span>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(seoOut.longTail) && seoOut.longTail.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-studio-bronze/70 mb-1 mt-2">Long-tail ({seoOut.longTail.length})</div>
                  {seoOut.longTail.slice(0, 6).map((k: any, i: number) => (
                    <div key={i} className="text-studio-soft-white/70 py-0.5">{k.keyword}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="studio-glass-glow rounded-lg p-4 space-y-3">
          <div className="text-xs font-mono uppercase text-studio-bronze flex items-center gap-1"><Swords className="w-3 h-3" /> Competitor intel (Node 18)</div>
          <textarea rows={2} value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="competitor.com, competitor2.com" className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs" />
          <textarea rows={2} value={valueProps} onChange={(e) => setValueProps(e.target.value)} placeholder="Our value props" className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs" />
          <button onClick={runComp} disabled={compBusy || !competitors.trim()} className="w-full bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-1.5 rounded disabled:opacity-50">
            {compBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Analyse"}
          </button>
          {compOut && (
            <div className="space-y-3 text-xs">
              {Array.isArray(compOut.competitors) && compOut.competitors.map((c: any, i: number) => {
                const sim = compOut.similarityMatrix?.find((s: any) => s.competitor === c.domain);
                return (
                  <div key={i} className="bg-studio-brown/30 border border-studio-bronze/15 rounded p-2">
                    <div className="flex items-baseline justify-between">
                      <strong>{c.domain}</strong>
                      <span className="font-mono text-[10px] text-studio-bronze">{c.pricingTier} · sim {sim?.vectorScore ?? "?"}</span>
                    </div>
                    <div className="text-studio-soft-white/70 mt-1">{c.positioning}</div>
                    {c.weaknessSignals?.length > 0 && (
                      <div className="text-[10px] text-yellow-300 mt-1">⚠ weak: {c.weaknessSignals.join("; ")}</div>
                    )}
                  </div>
                );
              })}
              {Array.isArray(compOut.wedgeOpportunities) && compOut.wedgeOpportunities.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-studio-bronze/70">Wedges for us</div>
                  <ul className="list-disc list-inside text-studio-soft-white/70 space-y-0.5">
                    {compOut.wedgeOpportunities.map((w: string, i: number) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
