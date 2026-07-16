import React, { useEffect, useState } from "react";
import { Article } from "../types";
import { api, adaptArticle } from "../lib/api";
import { Search, BookOpen, Clock, AlertCircle, Sparkles, Filter, FileText, CheckCircle, ArrowRight, X, Plus, Loader2, RefreshCw, Link as LinkIcon, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ContentHubProps {
  onSelectArticleForCampaign: (article: Article) => void;
  onGenerateVisuals?: (article: Article) => void;
}

export default function ContentHub({ onSelectArticleForCampaign, onGenerateVisuals }: ContentHubProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [draftTopic, setDraftTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { articles: rows } = await api.listArticles(200);
      setArticles(rows.map(adaptArticle));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const ingestUrl = async () => {
    if (!pasteUrl.trim()) return;
    setBusy(true); setErr(null);
    try {
      const { article } = await api.ingestArticleFromUrl(pasteUrl.trim());
      setArticles((prev) => [adaptArticle(article), ...prev.filter((a) => a.id !== article.id)]);
      setPasteUrl(""); setAddOpen(false);
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? "ingest failed");
    } finally { setBusy(false); }
  };
  const draftFromTopic = async () => {
    if (!draftTopic.trim()) return;
    setBusy(true); setErr(null);
    try {
      const { article } = await api.draftArticle(draftTopic.trim());
      setArticles((prev) => [adaptArticle(article), ...prev]);
      setDraftTopic(""); setAddOpen(false);
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? "draft failed");
    } finally { setBusy(false); }
  };
  const runIngest = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.runIngestNow();
      await load();
      setErr(`Ingest run: ${r.new} new from ${r.processed} sources · ${r.errors} errors`);
    } catch (e: any) {
      setErr(e?.body?.message ?? "ingest failed");
    } finally { setBusy(false); }
  };

  const categories = ["All", ...Array.from(new Set(articles.map((a) => a.category))).sort()];

  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.heroAngle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "All" || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 relative" id="content-hub-section">
      {/* Search & Filter Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 studio-glass rounded-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-studio-bronze w-5 h-5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search roofing plays, field strategies, or storm guides..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-studio-warm-black/60 border border-studio-bronze/10 rounded-lg py-2.5 pl-10 pr-4 text-sm text-studio-soft-white placeholder-studio-charcoal focus:outline-none focus:border-studio-bronze/40 transition-colors font-sans"
            id="search-articles-input"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0" id="category-filter-bar">
          <Filter className="text-studio-bronze w-4 h-4 mr-1 shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-sans border transition-colors cursor-pointer shrink-0 ${
                selectedCategory === cat
                  ? "bg-studio-bronze text-studio-warm-black border-studio-bronze font-semibold"
                  : "bg-studio-brown/40 text-studio-soft-white/70 border-studio-bronze/10 hover:text-studio-soft-white hover:border-studio-bronze/25"
              }`}
              id={`filter-cat-${cat.toLowerCase()}`}
            >
              {cat}
            </button>
          ))}
          <div className="w-px h-5 bg-studio-bronze/20 mx-1" />
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-studio-bronze text-studio-warm-black"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
          <button
            onClick={runIngest} disabled={busy}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-mono uppercase bg-studio-brown/40 border border-studio-bronze/15 text-studio-soft-white/70 hover:text-studio-soft-white disabled:opacity-50"
            title="Run RSS/Reddit/feed ingest now"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            ingest
          </button>
        </div>
      </div>

      {addOpen && (
        <div className="studio-glass-glow rounded-lg p-4 space-y-3">
          <div className="text-xs font-mono uppercase text-studio-bronze">Add new article</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-studio-soft-white/60 flex items-center gap-1">
                <LinkIcon className="w-3 h-3" /> Paste URL
              </label>
              <div className="flex gap-2">
                <input
                  value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="https://…"
                  className="flex-1 bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
                />
                <button
                  onClick={ingestUrl} disabled={busy || !pasteUrl.trim()}
                  className="bg-studio-bronze text-studio-warm-black text-xs px-3 rounded disabled:opacity-50"
                >Ingest</button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-studio-soft-white/60 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Draft from topic
              </label>
              <div className="flex gap-2">
                <input
                  value={draftTopic} onChange={(e) => setDraftTopic(e.target.value)}
                  placeholder="e.g. drone roof inspection tactics"
                  className="flex-1 bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5 text-xs"
                />
                <button
                  onClick={draftFromTopic} disabled={busy || !draftTopic.trim()}
                  className="bg-studio-bronze text-studio-warm-black text-xs px-3 rounded disabled:opacity-50"
                >Draft</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {err && <div className="text-xs text-yellow-300/80 bg-yellow-900/15 border border-yellow-700/30 rounded p-2">{err}</div>}
      {loading && (
        <div className="text-xs text-studio-soft-white/60 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> loading articles…
        </div>
      )}

      {/* Grid of playbooks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="articles-grid">
        <AnimatePresence mode="popLayout">
          {filteredArticles.map((article: Article) => (
            <motion.div
              key={article.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="studio-glass rounded-xl p-5 hover:border-studio-bronze/30 transition-all duration-300 group flex flex-col justify-between"
              id={`article-card-${article.id}`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase font-mono tracking-widest bg-studio-bronze/10 text-studio-bronze px-2.5 py-1 rounded-full border border-studio-bronze/20 font-semibold">
                    {article.category}
                  </span>
                  <div className="flex items-center text-[10px] text-studio-charcoal font-mono group-hover:text-studio-bronze-light transition-colors">
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    {article.readTime}
                  </div>
                </div>

                <h3 className="text-base font-display font-semibold tracking-tight text-studio-soft-white mb-2 leading-snug group-hover:text-studio-bronze-light transition-colors">
                  {article.title}
                </h3>
                <p className="text-xs text-studio-soft-white/60 mb-4 line-clamp-3 font-sans font-light">
                  {article.description}
                </p>
                
                {/* Visual Hook indicator */}
                <div className="bg-studio-coffee/30 border-l border-studio-bronze/20 px-3 py-2 rounded-r-lg mb-4 text-[10px] text-studio-bronze-light italic font-sans flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-studio-bronze" />
                  <span>&ldquo;{article.heroAngle}&rdquo;</span>
                </div>
              </div>

              {/* Action row at bottom */}
              <div className="pt-3 border-t border-studio-bronze/5 flex items-center justify-between gap-2 mt-auto">
                <button
                  onClick={() => setActiveArticle(article)}
                  className="text-xs text-studio-soft-white/70 hover:text-studio-soft-white font-mono flex items-center transition-colors cursor-pointer"
                  id={`view-article-trigger-${article.id}`}
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5 text-studio-bronze" />
                  View Playbook
                </button>

                {onGenerateVisuals && (
                  <button
                    onClick={() => onGenerateVisuals(article)}
                    className="bg-studio-brown/60 hover:bg-studio-brown text-studio-soft-white border border-studio-bronze/30 text-[11px] font-sans font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Open Studio › Generations with this article as the brief"
                  >
                    <Wand2 className="w-3 h-3" />
                    Visuals
                  </button>
                )}
                <button
                  onClick={() => onSelectArticleForCampaign(article)}
                  className="bg-studio-bronze hover:bg-studio-bronze-light text-studio-warm-black text-[11px] font-sans font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-studio-bronze/5"
                  id={`craft-campaign-shortcut-${article.id}`}
                >
                  Draft Social
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredArticles.length === 0 && (
          <div className="col-span-full py-12 text-center" id="empty-content-state">
            <AlertCircle className="w-10 h-10 text-studio-bronze mx-auto mb-3" />
            <h4 className="text-sm font-semibold font-display text-studio-soft-white">No articles matched your criteria</h4>
            <p className="text-xs text-studio-charcoal mt-1">Try resetting filters or adjusting search strings.</p>
          </div>
        )}
      </div>

      {/* Slide-over Alabaster article reader panel */}
      <AnimatePresence>
        {activeArticle && (
          <div className="fixed inset-0 z-50 flex justify-end bg-studio-warm-black/70 backdrop-blur-sm" id="article-reader-backdrop">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="w-full max-w-2xl bg-studio-alabaster text-studio-warm-black h-full flex flex-col shadow-2xl overflow-hidden relative"
              id="article-reader-sidebar"
            >
              {/* Sticky Alabaster Header */}
              <div className="sticky top-0 bg-studio-soft-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <img
                    src="/logo.svg"
                    alt="Acme Logo"
                    className="h-7 w-auto"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-xs font-mono font-semibold text-studio-charcoal tracking-wide bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                    Field Intelligence
                  </span>
                </div>
                <button
                  onClick={() => setActiveArticle(null)}
                  className="p-1 px-1.5 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  id="close-reader-header-btn"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Article Canvas */}
              <div className="flex-1 overflow-y-auto" id="article-reader-scrollable-body">
                {/* Dark Coffee Article Hero */}
                <div className="bg-studio-coffee text-studio-soft-white px-8 py-10 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10 studio-hud-accent pointer-events-none" />
                  
                  {/* Category badging */}
                  <span className="inline-block text-[10px] uppercase font-mono tracking-widest bg-studio-bronze text-studio-warm-black px-2.5 py-1 rounded-md font-bold mb-4">
                    {activeArticle.category}
                  </span>

                  <h1 className="text-2xl md:text-3xl font-display font-bold text-studio-soft-white leading-tight mb-4 tracking-tight">
                    {activeArticle.title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-studio-bronze-light">
                    <div className="flex items-center gap-1.5 bg-studio-brown/30 px-3 py-1 rounded-md border border-studio-bronze/10">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{activeArticle.readTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-studio-brown/30 px-3 py-1 rounded-md border border-studio-bronze/10">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Editorial Playbook</span>
                    </div>
                  </div>
                </div>

                {/* Main Alabaster body */}
                <div className="p-8 space-y-8 font-sans">
                  {/* Brief Abstract */}
                  <div className="bg-studio-soft-white p-5 rounded-xl border border-gray-200 shadow-sm relative">
                    <div className="absolute top-0 left-6 -translate-y-1/2 bg-studio-bronze text-studio-warm-black text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded font-black">
                      Focus Thesis
                    </div>
                    <p className="text-sm font-medium italic text-studio-brown leading-relaxed pt-2">
                       &ldquo;{activeArticle.heroAngle}&rdquo;
                    </p>
                    <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                      {activeArticle.description}
                    </p>
                  </div>

                  {/* Operational Highlights */}
                  <div className="space-y-4">
                    <h2 className="text-xs uppercase font-mono tracking-widest text-studio-bronze font-black border-l-2 border-studio-bronze pl-2.5">
                      Key Playbook Highlights
                    </h2>
                    <ul className="grid grid-cols-1 gap-3">
                      {activeArticle.highlights.map((highlight, index) => (
                        <li key={index} className="flex items-start gap-3 bg-[#E4E4E2] p-3 rounded-lg border border-gray-300">
                          <CheckCircle className="w-5 h-5 text-studio-bronze shrink-0 mt-0.5" />
                          <span className="text-xs leading-relaxed text-gray-700 font-normal">
                            {highlight}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Core Content */}
                  <div className="space-y-4 pt-4 border-t border-gray-300">
                    <h2 className="text-xs uppercase font-mono tracking-widest text-gray-400 font-black">
                      Editorial Excerpt
                    </h2>
                    <div className="text-xs text-gray-600 leading-relaxed space-y-4 whitespace-pre-wrap font-sans font-light">
                      {activeArticle.content}
                    </div>
                  </div>

                  {/* Standard Bottom Conversion Section */}
                  <div className="bg-studio-coffee text-studio-soft-white p-6 rounded-xl border border-studio-bronze/10 relative overflow-hidden mt-8">
                    <div className="absolute inset-0 opacity-5 studio-hud-accent pointer-events-none" />
                    <span className="text-[10px] uppercase font-mono tracking-widest text-studio-bronze block mb-1 font-bold">
                      Built for roofing contractors & storm teams
                    </span>
                    <h3 className="text-sm font-display font-semibold mb-2">
                      Turn every knock, inspection, photo, and follow-up into one roof file.
                    </h3>
                    <p className="text-[11px] text-studio-soft-white/75 leading-relaxed mb-4 font-light">
                      Acme connects canvassing, storm intelligence, documentation, claims backup, generated reports, e-signatures, and team performance in one modern field platform.
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          onSelectArticleForCampaign(activeArticle);
                          setActiveArticle(null);
                        }}
                        className="bg-studio-bronze hover:bg-studio-bronze-light text-studio-warm-black px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        id="reader-cta-draft-campaign"
                      >
                        Draft Campaign Now
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
