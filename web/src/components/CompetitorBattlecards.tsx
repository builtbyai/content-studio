import React, { useEffect, useState } from "react";
import { api, adaptBattlecard } from "../lib/api";
import { BattlecardItem } from "../types";
import { Shield, Sparkles, Copy, Check, MessageSquare, HelpCircle, Activity, ChevronRight, Swords, Compass, Loader2, Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function CompetitorBattlecards() {
  const [battlecards, setBattlecards] = useState<BattlecardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [genInput, setGenInput] = useState({ competitorDomain: "roofflowai.com", objection: "", category: "lead_generation" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { battlecards: rows } = await api.listBattlecards();
      const adapted = rows.map(adaptBattlecard);
      setBattlecards(adapted);
      if (adapted.length > 0 && !activeTab) setActiveTab(adapted[0].id);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    if (!genInput.competitorDomain || !genInput.objection) return;
    setBusy(true);
    try {
      const { battlecard } = await api.generateBattlecard(genInput);
      const ad = adaptBattlecard(battlecard);
      setBattlecards((prev) => [ad, ...prev]);
      setActiveTab(ad.id);
      setGenInput((g) => ({ ...g, objection: "" }));
      setAddOpen(false);
    } finally { setBusy(false); }
  };

  const activeCard: BattlecardItem = battlecards.find((card) => card.id === activeTab) || battlecards[0] || {
    id: "_empty", category: "lead_generation",
    objection: "Generate your first battlecard to see the wedge framework.",
    counterWedge: "—", discoveryQuestions: [],
    oneLiner: "—", metrics: [],
  };

  const handleCopyValue = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 1800);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="battlecards-root-grid">
      
      {/* Competitor Sidebar Indices */}
      <div className="lg:col-span-4 space-y-4" id="battlecards-sidebar-column">
        <div className="bg-studio-coffee/80 rounded-xl p-4 border border-studio-bronze/20 flex items-center gap-3 relative overflow-hidden select-none">
          <div className="absolute inset-0 opacity-5 studio-hud-accent pointer-events-none" />
          <Swords className="w-5 h-5 text-studio-bronze shrink-0" />
          <div className="text-left font-sans">
            <h4 className="text-xs font-bold text-studio-soft-white uppercase tracking-wider">
              Competitor: Roof Flow AI
            </h4>
            <p className="text-[10px] text-studio-bronze-light font-light italic">
              Wedge operational positioning framework
            </p>
          </div>
        </div>

        <button
          onClick={() => setAddOpen((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 text-xs bg-studio-bronze text-studio-warm-black font-semibold py-2 rounded-lg"
        >
          <Plus className="w-3 h-3" /> Generate new battlecard
        </button>
        {addOpen && (
          <div className="studio-glass-glow rounded-lg p-3 space-y-2">
            <input
              value={genInput.competitorDomain} onChange={(e) => setGenInput((g) => ({ ...g, competitorDomain: e.target.value }))}
              placeholder="competitor.com"
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
            />
            <select
              value={genInput.category} onChange={(e) => setGenInput((g) => ({ ...g, category: e.target.value }))}
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
            >
              <option value="lead_generation">lead_generation</option>
              <option value="storm_response">storm_response</option>
              <option value="report_claim">report_claim</option>
              <option value="performance_commissions">performance_commissions</option>
              <option value="onboarding">onboarding</option>
            </select>
            <textarea
              rows={2} value={genInput.objection} onChange={(e) => setGenInput((g) => ({ ...g, objection: e.target.value }))}
              placeholder="The objection or competitive angle to counter"
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
            />
            <button
              onClick={generate} disabled={busy || !genInput.objection.trim()}
              className="w-full bg-studio-bronze text-studio-warm-black text-xs font-semibold py-1.5 rounded disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Generate via Gemini"}
            </button>
          </div>
        )}

        {loading && (
          <div className="text-xs text-studio-soft-white/60 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> loading…
          </div>
        )}
        {!loading && battlecards.length === 0 && (
          <div className="text-xs text-studio-soft-white/40 p-3">No battlecards yet. Generate one above.</div>
        )}

        {/* Index of standard objections */}
        <div className="space-y-2" id="objections-indices-selectors">
          {battlecards.map((card) => (
            <button
              key={card.id}
              onClick={() => setActiveTab(card.id)}
              className={`w-full p-4 rounded-xl border text-left cursor-pointer transition-all flex items-start justify-between gap-3 ${
                activeTab === card.id
                  ? "bg-studio-bronze/10 border-studio-bronze shadow-md shadow-studio-bronze/5"
                  : "bg-studio-brown/10 border-studio-bronze/5 hover:border-studio-bronze/20"
              }`}
              id={`objection-btn-${card.id}`}
            >
              <div className="space-y-1 pr-2">
                <span className="text-[9px] font-mono tracking-wider uppercase text-studio-bronze/70">
                  {card.category.replace("_", " ")}
                </span>
                <p className="text-xs font-display font-medium text-studio-soft-white leading-snug line-clamp-2">
                  &ldquo;{card.objection}&rdquo;
                </p>
              </div>
              <ChevronRight className={`w-4 h-4 shrink-0 transition-transform mt-3 ${activeTab === card.id ? "text-studio-bronze rotate-90" : "text-studio-charcoal"}`} />
            </button>
          ))}
        </div>
      </div>

      {/* Battlecard Details Panel on Right */}
      <div className="lg:col-span-8" id="battlecards-details-column">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCard.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="studio-glass rounded-xl p-6 space-y-6"
            id={`battlecard-focus-${activeCard.id}`}
          >
            {/* Header Box */}
            <div className="space-y-2 border-b border-studio-bronze/10 pb-4">
              <span className="inline-block text-[9px] font-mono tracking-widest bg-studio-bronze/10 text-studio-bronze px-2.5 py-1 rounded border border-studio-bronze/20 font-bold uppercase">
                {activeCard.category.replace("_", " ")} WEDGE OBJECTION
              </span>
              <h2 className="text-base font-display font-semibold text-studio-soft-white leading-relaxed italic">
                &ldquo;{activeCard.objection}&rdquo;
              </h2>
            </div>

            {/* Tactical Counter Wedge Section */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-studio-bronze font-bold flex items-center gap-1.5 matches-brand-eyebrow">
                <Shield className="w-4 h-4 text-studio-bronze" />
                The Counter-Wedge Strategy
              </h3>
              <p className="text-xs text-studio-soft-white font-sans font-light leading-relaxed bg-studio-brown/20 p-4 rounded-xl border border-studio-bronze/5">
                {activeCard.counterWedge}
              </p>
            </div>

            {/* Discovery Questions check list */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-studio-bronze font-bold flex items-center gap-1.5 matches-brand-eyebrow">
                <HelpCircle className="w-4 h-4 text-studio-bronze" />
                Target discovery questions
              </h3>
              <div className="space-y-2" id="discovery-questions-stack">
                {activeCard.discoveryQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-studio-warm-black rounded-lg border border-studio-bronze/5 flex items-start justify-between gap-3 text-left group"
                    id={`dq-element-${idx}`}
                  >
                    <p className="text-xs text-studio-soft-white/80 leading-relaxed font-sans">
                      <span className="text-studio-bronze font-mono mr-1.5">Q{idx + 1}.</span>
                      {q}
                    </p>
                    <button
                      onClick={() => handleCopyValue(q, `q-${idx}`)}
                      className="p-1 hover:bg-studio-brown/30 border border-studio-bronze/10 text-studio-charcoal hover:text-studio-bronze rounded transition-all cursor-pointer mt-0.5"
                      id={`copy-dq-btn-${idx}`}
                    >
                      {copiedText === `q-${idx}` ? <Check className="w-3.5 h-3.5 text-studio-bronze" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tactical Closing One-Liner statement */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-studio-bronze font-bold flex items-center gap-1.5 matches-brand-eyebrow">
                <MessageSquare className="w-4 h-4 text-studio-bronze" />
                Close One-Liner
              </h3>
              <div className="p-3.5 bg-studio-coffee/40 border border-studio-bronze/30 rounded-lg flex items-center justify-between gap-3 text-left">
                <p className="text-xs text-studio-bronze-light font-display font-medium block leading-relaxed italic">
                  &ldquo;{activeCard.oneLiner}&rdquo;
                </p>
                <button
                  onClick={() => handleCopyValue(activeCard.oneLiner, "one_liner")}
                  className="p-1.5 hover:bg-studio-brown/30 border border-studio-bronze/20 text-studio-bronze rounded transition-all cursor-pointer shrink-0"
                  id="copy-oneliner-btn"
                >
                  {copiedText === "one_liner" ? <Check className="w-4 h-4 text-studio-bronze" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Proof Metrics scoreboard */}
            <div className="space-y-3 pt-2">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-studio-soft-white/60 font-medium flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-studio-charcoal" />
                Comparative Proof indicators
              </h3>
              <div className="grid grid-cols-2 gap-4" id="proof-metrics-cards">
                {activeCard.metrics.map((met, mIdx) => (
                  <div
                    key={mIdx}
                    className="p-4 bg-studio-warm-black/60 rounded-xl border border-studio-bronze/10 flex flex-col justify-center items-center text-center relative overflow-hidden"
                    id={`metric-element-card-${mIdx}`}
                  >
                    <div className="absolute inset-0 opacity-5 studio-hud-accent pointer-events-none" />
                    <span className="text-xs font-sans text-studio-soft-white/50 block mb-1">
                      {met.label}
                    </span>
                    <span className="text-2xl font-display font-extrabold text-studio-bronze drop-shadow">
                      {met.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  );
}
