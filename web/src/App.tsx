import React, { useEffect, useState } from "react";
import { Article, CalendarSlot, SocialTemplate } from "./types";
import { api, adaptArticle } from "./lib/api";

// Existing workspace components (kept as-is)
import WorkflowStudio from "./components/WorkflowStudio";
import ContentHub from "./components/ContentHub";
import CampaignCopilot from "./components/CampaignCopilot";
import VisualPreviewer from "./components/VisualPreviewer";
import CompetitorBattlecards from "./components/CompetitorBattlecards";
import BrandPlayroom from "./components/BrandPlayroom";
import ImageLab from "./components/ImageLab";
import Generations from "./components/Generations";
import WorkflowRunner from "./components/WorkflowRunner";
import Scheduler from "./components/Scheduler";
import Connections from "./components/Connections";
import Analytics from "./components/Analytics";
import MediaLibrary from "./components/MediaLibrary";
import WorkflowSpec from "./components/WorkflowSpec";
import LoginGate from "./components/LoginGate";
import GlobalChat from "./components/GlobalChat";
import Settings from "./components/Settings";
import BrandEditor from "./components/BrandEditor";
import CostPanel from "./components/CostPanel";
import CompetitorAnalysis from "./components/CompetitorAnalysis";
import EmailPrefs from "./components/EmailPrefs";
import AuditLedger from "./components/AuditLedger";
import SalesWorkspace from "./components/SalesWorkspace";
import ResearchWorkspace from "./components/ResearchWorkspace";
import PlanWeekly from "./components/PlanWeekly";
import WelcomeBanner from "./components/WelcomeBanner";
import BRollWorkspace from "./components/BRollWorkspace";
import VideoLab from "./components/VideoLab";
import VideoEditor from "./components/VideoEditor";
import SceneComposer from "./components/SceneComposer";
import WorkflowComposer from "./components/WorkflowComposer";
import PostReady from "./components/PostReady";
import Studio from "./components/Studio";
import EnhanceLab from "./components/EnhanceLab";
import CostBar from "./components/CostBar";
import AssetTray from "./components/AssetTray";
import IntelSignals from "./components/IntelSignals";
import WebMCPRegistrar from "./webmcp/WebMCPRegistrar";

// New shell primitives
import Sidebar, { NavSection } from "./components/shell/Sidebar";
import AppBar from "./components/shell/AppBar";
import CommandPalette from "./components/shell/CommandPalette";

import { useAuth } from "./lib/auth-context";
import {
  Calendar, Swords, Palette, Sparkles, BookOpen, Eye, Layers,
  Send, Link as LinkIcon, BarChart3, Image as ImageIcon, Loader2,
  Network, Wand2, Settings as SettingsIcon,
  History, TrendingUp, Users, FileText, Mail, DollarSign, Database, Server, Film,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const defaultSlots: CalendarSlot[] = [
  { id: "mon_am", dayOfWeek: "Monday", timeOfDay: "10:00 AM", platform: "linkedin", angle: "category_reframe", postText: "", status: "draft" },
  { id: "tue_pm", dayOfWeek: "Tuesday", timeOfDay: "02:00 PM", platform: "instagram", angle: "storytelling", postText: "", status: "draft" },
  { id: "wed_pm", dayOfWeek: "Wednesday", timeOfDay: "04:30 PM", platform: "short_video", angle: "objection_crusher", postText: "", status: "draft" },
  { id: "thu_am", dayOfWeek: "Thursday", timeOfDay: "11:15 AM", platform: "linkedin", angle: "local_market", postText: "", status: "draft" },
  { id: "fri_pm", dayOfWeek: "Friday", timeOfDay: "03:00 PM", platform: "short_video", angle: "team_motivation", postText: "", status: "draft" },
  { id: "sat_pm", dayOfWeek: "Saturday", timeOfDay: "01:30 PM", platform: "instagram", angle: "category_reframe", postText: "", status: "draft" },
  { id: "sun_pm", dayOfWeek: "Sunday", timeOfDay: "06:00 PM", platform: "linkedin", angle: "storytelling", postText: "", status: "draft" },
];

type Tab =
  | "content_hub" | "campaign_copilot" | "workflow_studio" | "visual_preview"
  | "competitor_battlecards" | "campaign_planner" | "brand_playroom"
  | "image_lab" | "generations"
  | "scheduler" | "connections" | "analytics" | "media_library" | "workflow_spec"
  | "settings" | "audit_ledger" | "sales_workspace" | "research_workspace"
  | "competitor_analysis"
  | "settings_brand" | "settings_email" | "settings_cost" | "settings_sources"
  | "workflow_runner" | "broll_workspace" | "video_lab" | "video_editor" | "scene_composer" | "workflow_composer" | "post_ready" | "studio" | "enhance_lab" | "intel_signals";

export default function App() {
  const { user, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("workflow_runner");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [draftedCampaign, setDraftedCampaign] = useState<(SocialTemplate & { tags: string[] }) | null>(null);
  const [plannerSlots, setPlannerSlots] = useState<CalendarSlot[]>(defaultSlots);
  const [articles, setArticles] = useState<Article[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Real nav definition — uses live counts where useful
  const NAV: NavSection[] = [
    {
      id: "studio", label: "Studio", icon: Wand2,
      items: [
        { id: "studio",            label: "★ Studio (unified)", icon: Wand2 },
        { id: "scene_composer",    label: "Scene Composer", icon: Wand2 },
        { id: "workflow_composer", label: "Workflow Composer", icon: Network },
        { id: "video_lab",         label: "Video Lab",    icon: Film },
        { id: "enhance_lab",       label: "Enhance Lab",  icon: Wand2 },
        { id: "image_lab",         label: "Image Lab",    icon: ImageIcon },
        { id: "video_editor",      label: "Video Editor", icon: Film },
        { id: "post_ready",        label: "Post Ready",   icon: Send },
      ],
    },
    {
      id: "legacy", label: "Legacy", icon: Layers,
      items: [
        { id: "workflow_runner",   label: "Run pipeline (26-node)", icon: Wand2 },
        { id: "broll_workspace",   label: "B-Roll shots", icon: Film },
        { id: "generations",       label: "Generations grid",  icon: Sparkles },
        { id: "campaign_copilot",  label: "Article Copilot",      icon: Sparkles },
        { id: "visual_preview",    label: "Visual Preview",      icon: Eye },
        { id: "workflow_studio",   label: "Legacy canvas", icon: Layers },
      ],
    },
    {
      id: "intel", label: "Intel", icon: TrendingUp,
      items: [
        { id: "content_hub",            label: "Articles",     icon: BookOpen, badge: articles.length || undefined },
        { id: "media_library",          label: "Media",        icon: ImageIcon },
        { id: "competitor_analysis",    label: "Competitors",  icon: Swords },
        { id: "competitor_battlecards", label: "Battlecards",  icon: FileText },
        { id: "research_workspace",     label: "SEO",          icon: TrendingUp },
        { id: "intel_signals",          label: "Intel signals", icon: TrendingUp },
      ],
    },
    {
      id: "brand_playroom", label: "Brand", icon: Palette,
    },
    {
      id: "plan", label: "Plan", icon: Calendar,
      items: [
        { id: "campaign_planner", label: "Weekly", icon: Calendar },
        { id: "scheduler",        label: "Queue",  icon: Send },
      ],
    },
    {
      id: "ship", label: "Ship", icon: Send,
      items: [
        { id: "connections",     label: "Channels",   icon: LinkIcon },
        { id: "analytics",       label: "Analytics",  icon: BarChart3 },
        { id: "sales_workspace", label: "Sales",      icon: Users },
      ],
    },
    {
      id: "system", label: "System", icon: Server,
      items: [
        { id: "workflow_spec", label: "Spec · 26 Nodes", icon: Network },
        { id: "audit_ledger",  label: "Audit ledger",     icon: History },
      ],
    },
    {
      id: "settings", label: "Settings", icon: SettingsIcon,
      items: [
        { id: "settings_brand",   label: "Brand profile", icon: Palette },
        { id: "settings_email",   label: "Notifications", icon: Mail },
        { id: "settings_cost",    label: "Spend",         icon: DollarSign },
        { id: "settings_sources", label: "Sources + sys", icon: Database },
      ],
    },
  ];

  useEffect(() => {
    if (!user) return;
    api.listArticles(200).then(({ articles: rows }) => setArticles(rows.map(adaptArticle))).catch(() => {});
  }, [user]);

  // Cmd+K opens command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-studio-bronze" />
      </div>
    );
  }
  if (!user) return <LoginGate />;

  const handleSelectArticleAndDraft = (art: Article) => { setSelectedArticle(art); setActiveTab("campaign_copilot"); };
  const handleCampaignGenerated = (campaign: SocialTemplate & { tags: string[] }) => setDraftedCampaign(campaign);
  const handleUpdateCampaign = (updated: SocialTemplate & { tags: string[] }) => setDraftedCampaign(updated);
  const handlePinToPlanner = (campaignText: string, slides?: string[]) => {
    if (!draftedCampaign) return;
    const matchingIdx = plannerSlots.findIndex((s) => s.platform === draftedCampaign.platform && !s.postText.trim());
    const finalIdx = matchingIdx !== -1 ? matchingIdx : plannerSlots.findIndex((s) => s.dayOfWeek === "Monday");
    if (finalIdx !== -1) {
      const copy = [...plannerSlots];
      copy[finalIdx] = {
        ...copy[finalIdx],
        articleId: selectedArticle?.id, postText: campaignText, slides,
        notes: `Tuned with ${draftedCampaign.angle.replace("_", " ")} angle`,
        status: "scheduled",
      };
      setPlannerSlots(copy);
      setActiveTab("campaign_planner");
    }
  };
  const handleUpdatePlannerSlot = (updated: CalendarSlot) =>
    setPlannerSlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  const handleClearPlannerSlot = (slotId: string) =>
    setPlannerSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, articleId: undefined, postText: "", slides: undefined, videoDirectives: undefined, status: "draft", notes: undefined }
          : s
      )
    );

  // Title shown in the app bar for the current tab
  const titleFor = (id: string): React.ReactNode => {
    const flat: Record<string, string> = {
      studio: "Studio",
      enhance_lab: "Enhance Lab",
      intel_signals: "Intel signals",
      workflow_runner: "Run pipeline",
      broll_workspace: "B-Roll workspace",
      generations: "Generations", campaign_copilot: "Copilot", image_lab: "Image Lab", video_lab: "Video Lab", video_editor: "Video Editor", scene_composer: "Scene Composer", workflow_composer: "Workflow Composer", post_ready: "Post Ready", visual_preview: "Preview",
      workflow_studio: "Legacy workflow canvas",
      content_hub: "Articles", media_library: "Media", competitor_analysis: "Competitor intel",
      competitor_battlecards: "Battlecards", research_workspace: "SEO research",
      brand_playroom: "Brand system",
      campaign_planner: "Weekly plan", scheduler: "Schedule queue",
      connections: "Channels", analytics: "Analytics", sales_workspace: "Sales outreach",
      workflow_spec: "26-node spec", audit_ledger: "Audit ledger",
      settings_brand: "Settings · Brand profile", settings_email: "Settings · Notifications",
      settings_cost: "Settings · Spend", settings_sources: "Settings · Sources + system",
      settings: "Settings",
    };
    return <h1 className="font-display font-bold text-sm text-studio-text">{flat[id] ?? id}</h1>;
  };

  return (
    <div className="min-h-screen flex">
      <WebMCPRegistrar />
      <Sidebar
        sections={NAV}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as Tab)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        footer={
          <div className="space-y-1">
            <button onClick={() => setPaletteOpen(true)} className="studio-nav-item">
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-studio-surface-2 border border-studio-border text-studio-text-muted">⌘K</kbd>
              <span className="flex-1 text-xs">Search anything</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 flex flex-col min-w-0">
        <AppBar
          userEmail={user.email}
          onMenuClick={() => setMobileNavOpen(true)}
          onSearchClick={() => setPaletteOpen(true)}
          onLogout={() => logout()}
          title={titleFor(activeTab)}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-7xl mx-auto">
            <WelcomeBanner onGoToGenerations={() => setActiveTab("generations")} />
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === "content_hub" && (
                  <ContentHub
                    onSelectArticleForCampaign={handleSelectArticleAndDraft}
                    onGenerateVisuals={(art) => {
                      const brief = `${art.title}. ${art.heroAngle ?? ""} ${art.description}`.trim();
                      try { sessionStorage.setItem("contentforge:prefilled-brief", brief); } catch {}
                      setActiveTab("generations");
                    }}
                  />
                )}
                {activeTab === "campaign_copilot" && (
                  <CampaignCopilot
                    articles={articles}
                    selectedArticle={selectedArticle}
                    onCampaignGenerated={handleCampaignGenerated}
                    onNavigateToPreview={() => setActiveTab("visual_preview")}
                  />
                )}
                {activeTab === "workflow_studio" && (
                  <div className="space-y-4">
                    <div className="studio-card p-4 border-yellow-700/40 bg-yellow-900/10">
                      <div className="text-xs text-yellow-300/90">
                        <strong>Legacy canvas.</strong> Cosmetic — does not use the new audit-ledger pipeline.
                        Use <button onClick={() => setActiveTab("generations")} className="underline text-studio-bronze">Studio › Generate</button> for the real flow.
                      </div>
                    </div>
                    <WorkflowStudio />
                  </div>
                )}
                {activeTab === "visual_preview" && (
                  <VisualPreviewer
                    campaign={draftedCampaign}
                    onUpdateCampaign={handleUpdateCampaign}
                    onPinToPlanner={handlePinToPlanner}
                  />
                )}
                {activeTab === "competitor_battlecards" && <CompetitorBattlecards />}
                {activeTab === "campaign_planner" && <PlanWeekly />}
                {activeTab === "brand_playroom" && <BrandPlayroom />}
                {activeTab === "image_lab" && <ImageLab />}
                {activeTab === "video_lab" && <VideoLab />}
                {activeTab === "video_editor" && <VideoEditor />}
                {activeTab === "scene_composer" && <SceneComposer />}
                {activeTab === "workflow_composer" && <WorkflowComposer />}
                {activeTab === "post_ready" && <PostReady />}
                {activeTab === "studio" && <Studio />}
                {activeTab === "enhance_lab" && <EnhanceLab />}
                {activeTab === "intel_signals" && <IntelSignals />}
                {activeTab === "generations" && <Generations />}
                {activeTab === "workflow_runner" && <WorkflowRunner />}
                {activeTab === "broll_workspace" && <BRollWorkspace />}
                {activeTab === "scheduler" && <Scheduler />}
                {activeTab === "connections" && <Connections />}
                {activeTab === "media_library" && <MediaLibrary />}
                {activeTab === "analytics" && <Analytics />}
                {activeTab === "workflow_spec" && <WorkflowSpec />}
                {activeTab === "audit_ledger" && <AuditLedger />}
                {activeTab === "sales_workspace" && <SalesWorkspace />}
                {activeTab === "research_workspace" && <ResearchWorkspace />}
                {activeTab === "competitor_analysis" && <CompetitorAnalysis />}

                {/* Settings — in-tab sub-pages */}
                {activeTab === "settings" && <Settings />}
                {activeTab === "settings_brand" && <BrandEditor />}
                {activeTab === "settings_email" && <EmailPrefs />}
                {activeTab === "settings_cost" && <CostPanel />}
                {activeTab === "settings_sources" && <Settings />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <footer className="border-t border-studio-border bg-studio-surface-0/60 px-4 sm:px-6 lg:px-8 py-2 text-[10px] font-mono text-studio-text-subtle flex items-center justify-between">
          <span>© 2026 ACME STUDIO · CONTENTFORGE v0.2</span>
          <span className="hidden sm:flex items-center gap-3">
            <span>CHANNELS · POSTIZ</span>
            <span className="opacity-40">•</span>
            <span>CDN · R2</span>
            <span className="opacity-40">•</span>
            <span>EDGE · CLOUDFLARE</span>
          </span>
        </footer>
      </div>

      <GlobalChat activeTab={activeTab} />
      <CostBar />
      <AssetTray />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(id) => setActiveTab(id as Tab)}
      />
    </div>
  );
}
