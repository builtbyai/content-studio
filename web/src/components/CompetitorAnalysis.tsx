import React, { useEffect, useState } from "react";
import { Swords, Loader2, Save, FileText, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { api } from "../lib/api";

type Depth = "brief" | "standard" | "deep" | "max";

interface CompetitorReportSchema {
  competitors: Array<{
    domain: string;
    positioning: string;
    pricingTier?: string;
    detectedFeatures?: string[];
    contentAngles?: string[];
    weaknessSignals?: string[];
    objectionMap?: Array<{ objection: string; ourCounter: string }>;
    brandVoice?: string;
    narrativeGapsToExploit?: string[];
  }>;
  wedgeOpportunities?: Array<{
    title: string;
    hook: string;
    rationale?: string;
    evidence?: string[];
    samplePost?: string;
  }>;
  executiveSummary?: string;
  ourGapsToClose?: string[];
  similarityMatrix?: Array<{ competitor: string; vectorScore: number; sharedFeatures?: string[] }>;
}

export default function CompetitorAnalysis() {
  const [domains, setDomains] = useState("roofflowai.com, jobnimbus.com, acculynx.com");
  const [valueProps, setValueProps] = useState("Drone-first inspection, structured adjuster file, AI-quality control, end-to-end roofing intelligence");
  const [depth, setDepth] = useState<Depth>("deep");
  const [fetchContent, setFetchContent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CompetitorReportSchema | null>(null);
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));

  const loadSaved = async () => {
    try { const { reports } = await api.listCompetitorReports(); setSavedReports(reports); } catch {}
  };
  useEffect(() => { loadSaved(); }, []);

  const run = async () => {
    setBusy(true); setReport(null);
    try {
      const r = await api.competitorIntel({
        competitorDomains: domains.split(",").map(s => s.trim()).filter(Boolean),
        ourValueProps: valueProps.split(",").map(s => s.trim()).filter(Boolean),
        depth, fetchContent,
      });
      setReport(r.data);
      await loadSaved();
    } catch (e: any) {
      console.error(e);
    } finally { setBusy(false); }
  };

  const loadSavedReport = async (id: string) => {
    try {
      const { report: row } = await api.getCompetitorReport(id);
      setReport(JSON.parse(row.report_json));
      setDomains(JSON.parse(row.competitor_domains_json).join(", "));
      setValueProps(JSON.parse(row.our_value_props_json).join(", "));
      setDepth(row.depth);
    } catch {}
  };

  const toggleExpanded = (i: number) => {
    const next = new Set(expanded);
    if (next.has(i)) next.delete(i); else next.add(i);
    setExpanded(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-display font-bold flex items-center gap-2"><Swords className="w-5 h-5" /> Competitor Intelligence</h3>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Drop in competitor URLs. We fetch their public pages, run Node 18, and emit a strategic dossier you can use to outshine them. Pick "deep" or "max" for long-form output.
        </p>
      </div>

      <div className="studio-glass-glow rounded-lg p-4 space-y-3">
        <label className="block text-xs">
          <div className="font-mono uppercase text-studio-soft-white/50 mb-1">Competitor URLs (comma-sep)</div>
          <textarea rows={2} value={domains} onChange={(e) => setDomains(e.target.value)} className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
        </label>
        <label className="block text-xs">
          <div className="font-mono uppercase text-studio-soft-white/50 mb-1">Our value props (comma-sep)</div>
          <textarea rows={2} value={valueProps} onChange={(e) => setValueProps(e.target.value)} className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
        </label>
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <label className="flex items-center gap-2">
            <span className="text-studio-soft-white/60">Output length:</span>
            <select value={depth} onChange={(e) => setDepth(e.target.value as Depth)} className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1">
              <option value="brief">Brief (1.5k tokens)</option>
              <option value="standard">Standard (3k tokens)</option>
              <option value="deep">Deep (6k tokens)</option>
              <option value="max">Max — multi-page dossier (12k tokens)</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={fetchContent} onChange={(e) => setFetchContent(e.target.checked)} />
            <span className="text-studio-soft-white/60">Fetch competitor pages first</span>
          </label>
          <button onClick={run} disabled={busy} className="ml-auto bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-1.5 rounded disabled:opacity-50 flex items-center gap-1">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {busy ? "analysing…" : "Analyse"}
          </button>
        </div>
      </div>

      {savedReports.length > 0 && !report && (
        <div className="studio-glass rounded-lg p-3">
          <div className="text-[10px] font-mono uppercase text-studio-bronze mb-2">Saved reports ({savedReports.length})</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {savedReports.map((r) => (
              <button key={r.id} onClick={() => loadSavedReport(r.id)} className="w-full text-left text-xs flex items-center gap-2 py-1 hover:bg-studio-brown/20 rounded px-2">
                <FileText className="w-3 h-3 text-studio-bronze shrink-0" />
                <span className="flex-1 truncate">{JSON.parse(r.competitor_domains_json).join(", ")}</span>
                <span className="font-mono text-[10px] text-studio-soft-white/50">{r.depth}</span>
                <span className="font-mono text-[10px] text-studio-soft-white/40">{new Date(r.created_at).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {report && (
        <div className="space-y-4">
          {report.executiveSummary && (
            <div className="studio-glass-glow rounded-lg p-4">
              <div className="text-[10px] font-mono uppercase text-studio-bronze mb-2">Executive summary</div>
              <div className="text-sm whitespace-pre-wrap">{report.executiveSummary}</div>
            </div>
          )}

          {Array.isArray(report.wedgeOpportunities) && report.wedgeOpportunities.length > 0 && (
            <div className="studio-glass rounded-lg p-4">
              <div className="text-[10px] font-mono uppercase text-studio-bronze mb-3">⚔ Wedge opportunities ({report.wedgeOpportunities.length})</div>
              <div className="space-y-3">
                {report.wedgeOpportunities.map((w, i) => (
                  <div key={i} className="bg-studio-brown/30 border border-studio-bronze/15 rounded p-3">
                    <div className="font-semibold text-studio-bronze">{w.title}</div>
                    <div className="text-sm mt-1">{w.hook}</div>
                    {w.rationale && <div className="text-xs text-studio-soft-white/70 mt-2 whitespace-pre-wrap">{w.rationale}</div>}
                    {Array.isArray(w.evidence) && w.evidence.length > 0 && (
                      <ul className="list-disc list-inside text-xs text-studio-soft-white/60 mt-2 space-y-0.5">
                        {w.evidence.map((e, j) => <li key={j}>{e}</li>)}
                      </ul>
                    )}
                    {w.samplePost && (
                      <div className="mt-2 bg-studio-warm-black/60 border border-studio-bronze/20 rounded p-2 text-xs whitespace-pre-wrap font-mono">{w.samplePost}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.competitors.map((c, i) => {
            const open = expanded.has(i);
            return (
              <div key={c.domain} className="studio-glass rounded-lg overflow-hidden">
                <button onClick={() => toggleExpanded(i)} className="w-full p-3 flex items-center gap-3 text-left">
                  <Swords className="w-4 h-4 text-studio-bronze shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-sm">{c.domain}</div>
                    {c.pricingTier && <div className="text-[10px] font-mono text-studio-soft-white/50">{c.pricingTier} pricing tier</div>}
                  </div>
                  {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-3 text-sm border-t border-studio-bronze/10 pt-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase text-studio-bronze">Positioning</div>
                      <div className="whitespace-pre-wrap mt-1">{c.positioning}</div>
                    </div>

                    {c.brandVoice && (
                      <div>
                        <div className="text-[10px] font-mono uppercase text-studio-bronze">Brand voice</div>
                        <div className="text-xs text-studio-soft-white/70 mt-1 whitespace-pre-wrap">{c.brandVoice}</div>
                      </div>
                    )}

                    {Array.isArray(c.detectedFeatures) && c.detectedFeatures.length > 0 && (
                      <div>
                        <div className="text-[10px] font-mono uppercase text-studio-bronze">Features ({c.detectedFeatures.length})</div>
                        <ul className="list-disc list-inside text-xs text-studio-soft-white/80 mt-1 space-y-0.5">
                          {c.detectedFeatures.map((f, j) => <li key={j}>{f}</li>)}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(c.weaknessSignals) && c.weaknessSignals.length > 0 && (
                      <div>
                        <div className="text-[10px] font-mono uppercase text-yellow-300">⚠ Weaknesses to exploit ({c.weaknessSignals.length})</div>
                        <ul className="list-disc list-inside text-xs text-studio-soft-white/80 mt-1 space-y-0.5">
                          {c.weaknessSignals.map((w, j) => <li key={j}>{w}</li>)}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(c.objectionMap) && c.objectionMap.length > 0 && (
                      <div>
                        <div className="text-[10px] font-mono uppercase text-studio-bronze">Objection map</div>
                        <div className="space-y-1 mt-1">
                          {c.objectionMap.map((o, j) => (
                            <div key={j} className="text-xs">
                              <strong className="text-studio-soft-white/70">{o.objection}</strong>
                              <div className="text-studio-bronze">→ {o.ourCounter}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {Array.isArray(c.contentAngles) && c.contentAngles.length > 0 && (
                      <div>
                        <div className="text-[10px] font-mono uppercase text-studio-bronze">Their dominant content angles</div>
                        <ul className="list-disc list-inside text-xs text-studio-soft-white/70 mt-1 space-y-0.5">
                          {c.contentAngles.map((a, j) => <li key={j}>{a}</li>)}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(c.narrativeGapsToExploit) && c.narrativeGapsToExploit.length > 0 && (
                      <div>
                        <div className="text-[10px] font-mono uppercase text-green-400">↗ Narrative gaps for us</div>
                        <ul className="list-disc list-inside text-xs text-studio-soft-white/80 mt-1 space-y-0.5">
                          {c.narrativeGapsToExploit.map((g, j) => <li key={j}>{g}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {Array.isArray(report.ourGapsToClose) && report.ourGapsToClose.length > 0 && (
            <div className="studio-glass rounded-lg p-4">
              <div className="text-[10px] font-mono uppercase text-studio-bronze">Gaps WE should close</div>
              <ul className="list-disc list-inside text-sm text-studio-soft-white/80 mt-2 space-y-1">
                {report.ourGapsToClose.map((g, j) => <li key={j}>{g}</li>)}
              </ul>
            </div>
          )}

          {Array.isArray(report.similarityMatrix) && report.similarityMatrix.length > 0 && (
            <div className="studio-glass rounded-lg p-3">
              <div className="text-[10px] font-mono uppercase text-studio-bronze mb-2">Vectorize similarity (us vs them)</div>
              <div className="space-y-1 text-xs">
                {report.similarityMatrix.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{s.competitor}</span>
                    <span className="font-mono">{s.vectorScore}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
