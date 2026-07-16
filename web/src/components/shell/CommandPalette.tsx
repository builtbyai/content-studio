import React, { useEffect, useRef, useState } from "react";
import { Search, X, ArrowRight, Wand2, BookOpen, Image as ImageIcon, Network, Send, Palette, Users, TrendingUp, Calendar, BarChart3, Settings as SettingsIcon, Link as LinkIcon, History, FileText } from "lucide-react";
import { api } from "../../lib/api";

interface NavTarget { id: string; label: string; hint: string; icon: React.ComponentType<{className?: string}>; }

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (id: string) => void;
}

// Static workspace targets — match the tab IDs used by App.tsx
const NAV_TARGETS: NavTarget[] = [
  { id: "generations",            label: "Generations",            hint: "Studio · Create images from a brief", icon: Wand2 },
  { id: "content_hub",            label: "Articles",                hint: "Intel · Read or generate", icon: BookOpen },
  { id: "media_library",          label: "Media Library",           hint: "Intel · Browse your R2 assets", icon: ImageIcon },
  { id: "competitor_analysis",    label: "Competitor Intelligence", hint: "Intel · Long-form dossier", icon: TrendingUp },
  { id: "competitor_battlecards", label: "Battlecards",             hint: "Intel · Sales counter-wedges", icon: FileText },
  { id: "research_workspace",     label: "SEO Research",            hint: "Intel · Keyword + content brief", icon: TrendingUp },
  { id: "brand_playroom",         label: "Brand",                   hint: "Voice / palette / products", icon: Palette },
  { id: "campaign_planner",       label: "Plan · Weekly",           hint: "7-day grid of scheduled posts", icon: Calendar },
  { id: "scheduler",              label: "Plan · Queue",            hint: "Compose + queue + live status", icon: Send },
  { id: "connections",            label: "Channels",                hint: "Connect Postiz OAuth accounts", icon: LinkIcon },
  { id: "analytics",              label: "Analytics",               hint: "Postiz metrics passthrough", icon: BarChart3 },
  { id: "sales_workspace",        label: "Sales · Outreach",        hint: "Discover → draft → approve", icon: Users },
  { id: "workflow_spec",          label: "Spec · 26 Nodes",         hint: "Live node implementation status", icon: Network },
  { id: "audit_ledger",           label: "Spec · Audit Ledger",     hint: "Cross-workflow run history", icon: History },
  { id: "settings",               label: "Settings",                hint: "Brand · Email · Cost · Sources", icon: SettingsIcon },
];

interface DynamicResult { kind: "article" | "asset" | "workflow"; id: string; title: string; subtitle?: string; icon: React.ComponentType<{className?: string}>; href?: string; navigate?: string; }

export default function CommandPalette({ open, onClose, onNavigate }: Props) {
  const [q, setQ] = useState("");
  const [dyn, setDyn] = useState<DynamicResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQ(""); setDyn([]); setActiveIdx(0); return; }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  // Fetch dynamic search results (articles + recent assets + workflows) when q has 2+ chars.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const term = q.trim().toLowerCase();
    if (term.length < 2) { setDyn([]); return; }
    (async () => {
      const out: DynamicResult[] = [];
      try {
        const [{ articles }, { assets }, { workflows }] = await Promise.all([
          api.listArticles(50, 0).catch(() => ({ articles: [] })),
          api.recentAssets(50).catch(() => ({ assets: [] })),
          api.listWorkflows().catch(() => ({ workflows: [] })),
        ]);
        for (const a of (articles ?? []).filter((x: any) => x.title.toLowerCase().includes(term)).slice(0, 6)) {
          out.push({ kind: "article", id: a.id, title: a.title, subtitle: `Article · ${a.category}`, icon: BookOpen, navigate: "content_hub" });
        }
        for (const m of (assets ?? []).filter((x: any) => (x.uri ?? "").toLowerCase().includes(term) || (x.model_id ?? "").toLowerCase().includes(term)).slice(0, 4)) {
          out.push({ kind: "asset", id: m.id, title: m.uri?.split("/").slice(-1)[0] ?? m.id, subtitle: `Asset · ${m.model_id}`, icon: ImageIcon, href: m.uri });
        }
        for (const w of (workflows ?? []).slice(0, 4)) {
          out.push({ kind: "workflow", id: w.id, title: `Workflow ${w.id.slice(0, 8)}`, subtitle: `${w.event_count} events · ${w.asset_count} assets`, icon: Network, navigate: "audit_ledger" });
        }
      } catch {}
      if (!cancelled) { setDyn(out); setActiveIdx(0); }
    })();
    return () => { cancelled = true; };
  }, [open, q]);

  const filteredNav = q.trim().length === 0
    ? NAV_TARGETS
    : NAV_TARGETS.filter((n) => n.label.toLowerCase().includes(q.trim().toLowerCase()) || n.hint.toLowerCase().includes(q.trim().toLowerCase()));

  // Flat list for arrow-key navigation
  const flat: Array<{ kind: "nav"; nav: NavTarget } | { kind: "dyn"; dyn: DynamicResult }> = [
    ...filteredNav.map((nav) => ({ kind: "nav" as const, nav })),
    ...dyn.map((dyn) => ({ kind: "dyn" as const, dyn })),
  ];

  const activate = (idx: number) => {
    const item = flat[idx];
    if (!item) return;
    if (item.kind === "nav") { onNavigate(item.nav.id); onClose(); return; }
    if (item.dyn.navigate) { onNavigate(item.dyn.navigate); onClose(); return; }
    if (item.dyn.href) { window.open(item.dyn.href, "_blank", "noreferrer"); onClose(); }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); activate(activeIdx); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-studio-bg/70 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="studio-glass-glow w-full max-w-xl overflow-hidden studio-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-3 border-b border-studio-border">
          <Search className="w-4 h-4 text-studio-text-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search tabs, articles, assets, workflows…"
            className="flex-1 bg-transparent px-3 py-3.5 text-sm focus:outline-none placeholder:text-studio-text-subtle"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-studio-surface-2 border border-studio-border text-studio-text-muted">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {filteredNav.length > 0 && (
            <>
              <div className="text-[10px] font-mono uppercase text-studio-text-subtle px-3 py-1.5 tracking-widest">Jump to</div>
              {filteredNav.map((n, i) => {
                const idx = i;
                const Icon = n.icon;
                return (
                  <button
                    key={n.id}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => activate(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm ${
                      activeIdx === idx ? "bg-studio-surface-2 text-studio-text" : "text-studio-text-muted hover:bg-studio-surface-1"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${activeIdx === idx ? "text-studio-bronze" : ""}`} />
                    <span className="flex-1">{n.label}</span>
                    <span className="text-[11px] text-studio-text-subtle hidden sm:inline">{n.hint}</span>
                    <ArrowRight className="w-3 h-3 text-studio-text-subtle" />
                  </button>
                );
              })}
            </>
          )}
          {dyn.length > 0 && (
            <>
              <div className="text-[10px] font-mono uppercase text-studio-text-subtle px-3 py-1.5 tracking-widest mt-2">Results</div>
              {dyn.map((d, j) => {
                const idx = filteredNav.length + j;
                const Icon = d.icon;
                return (
                  <button
                    key={d.kind + d.id}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => activate(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm ${
                      activeIdx === idx ? "bg-studio-surface-2 text-studio-text" : "text-studio-text-muted hover:bg-studio-surface-1"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${activeIdx === idx ? "text-studio-bronze" : ""}`} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{d.title}</div>
                      {d.subtitle && <div className="text-[11px] text-studio-text-subtle truncate">{d.subtitle}</div>}
                    </div>
                  </button>
                );
              })}
            </>
          )}
          {flat.length === 0 && (
            <div className="text-xs text-studio-text-subtle py-12 text-center">No matches</div>
          )}
        </div>
      </div>
    </div>
  );
}
