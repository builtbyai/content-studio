import React, { useState } from "react";
import {
  Wand2, Film, Image as ImageIcon, Sparkles, Send, Eye, Layers, Calendar,
  Network, ChevronRight, ChevronLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import WorkflowRunner from "./WorkflowRunner";
import BRollWorkspace from "./BRollWorkspace";
import Generations from "./Generations";
import CampaignCopilot from "./CampaignCopilot";
import ImageLab from "./ImageLab";
import VideoLab from "./VideoLab";
import VideoEditor from "./VideoEditor";
import VisualPreviewer from "./VisualPreviewer";
import SceneComposer from "./SceneComposer";
import WorkflowComposer from "./WorkflowComposer";
import PostReady from "./PostReady";
import EnhanceLab from "./EnhanceLab";

// One unified Studio surface.
//
// Layout regions (per Plan agent design):
//   LEFT  RAIL    — icon column, switches center workbench
//   CENTER       — the active workbench
//   RIGHT INSPECTOR (collapsible) — context-aware notes/recents
//
// Existing standalone tabs remain in the sidebar — Studio is opt-in. Users who
// prefer the old single-purpose tabs can keep using them; users who want the
// unified workspace pick "Studio" from the sidebar.

type ViewId =
  | "pipeline" | "scene_composer" | "workflow_composer"
  | "broll" | "generations" | "copilot"
  | "image" | "video" | "enhance" | "editor" | "preview"
  | "post_ready";

interface View {
  id: ViewId;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
  Component: React.ComponentType;
  group: "Build" | "Refine" | "Ship";
}

const VIEWS: View[] = [
  { id: "pipeline",          label: "Pipeline",        hint: "26-node workflow runner",       Icon: Wand2,    Component: WorkflowRunner,   group: "Build" },
  { id: "scene_composer",    label: "Scene Composer",  hint: "Brief → multi-scene build",     Icon: Wand2,    Component: SceneComposer,    group: "Build" },
  { id: "workflow_composer", label: "Workflow Chain",  hint: "Text→image→video chain",        Icon: Network,  Component: WorkflowComposer, group: "Build" },
  { id: "broll",             label: "B-Roll",          hint: "Multi-shot B-Roll project",     Icon: Film,     Component: BRollWorkspace,   group: "Build" },
  { id: "image",             label: "Image Lab",       hint: "Direct image generation",       Icon: ImageIcon,Component: ImageLab,         group: "Build" },
  { id: "video",             label: "Video Lab",       hint: "Direct video generation",       Icon: Film,     Component: VideoLab,         group: "Build" },
  { id: "enhance",           label: "Enhance Lab",     hint: "Upscale, bg-remove, music, voice clone, lip-sync",  Icon: Wand2, Component: EnhanceLab, group: "Refine" },

  { id: "editor",            label: "Editor",          hint: "Timeline edit, color, transitions", Icon: Layers, Component: VideoEditor, group: "Refine" },
  { id: "preview",           label: "Preview",         hint: "Visual previewer",              Icon: Eye,      Component: VisualPreviewer,  group: "Refine" },
  { id: "generations",       label: "Generations",     hint: "Live SSE generation grid",      Icon: Sparkles, Component: Generations,      group: "Refine" },
  { id: "copilot",           label: "Copilot",         hint: "Article → social",              Icon: Sparkles, Component: CampaignCopilot,  group: "Refine" },

  { id: "post_ready",        label: "Post Ready",      hint: "Profile-grid + schedule",       Icon: Send,     Component: PostReady,        group: "Ship" },
];

export default function Studio() {
  const [view, setView] = useState<ViewId>("scene_composer");
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  const ActiveComponent = active.Component;

  return (
    <div className="space-y-3">
      {/* Top breadcrumb chip strip */}
      <div className="studio-glass rounded-lg px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <Wand2 className="w-4 h-4 text-studio-bronze flex-shrink-0" />
        <span className="text-[11px] font-mono uppercase text-studio-soft-white/60">Studio</span>
        <span className="text-studio-soft-white/40">/</span>
        {(["Build", "Refine", "Ship"] as const).map((g) => (
          <React.Fragment key={g}>
            <span className={`text-[10px] font-mono uppercase ${active.group === g ? "text-studio-bronze" : "text-studio-soft-white/40"}`}>{g}</span>
            <span className="text-studio-soft-white/30">·</span>
          </React.Fragment>
        ))}
        <span className="text-sm font-display font-bold text-studio-bronze">{active.label}</span>
        <span className="text-[11px] text-studio-soft-white/50 hidden md:inline">— {active.hint}</span>
        <button
          onClick={() => setInspectorOpen((v) => !v)}
          className="ml-auto text-[11px] text-studio-soft-white/60 hover:text-studio-bronze flex items-center gap-1"
        >
          {inspectorOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          {inspectorOpen ? "collapse inspector" : "show inspector"}
        </button>
      </div>

      <div className={`grid gap-3 ${inspectorOpen ? "grid-cols-1 lg:grid-cols-[56px_1fr_280px]" : "grid-cols-1 lg:grid-cols-[56px_1fr]"}`}>
        {/* LEFT RAIL */}
        <nav className="studio-glass rounded-lg p-1 flex lg:flex-col gap-1 overflow-x-auto">
          {VIEWS.map((v) => {
            const Icon = v.Icon;
            const isActive = v.id === view;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                title={`${v.label} — ${v.hint}`}
                className={`flex-shrink-0 flex items-center justify-center w-12 h-12 rounded ${isActive ? "bg-studio-bronze text-studio-warm-black" : "text-studio-soft-white/60 hover:bg-studio-bronze/10 hover:text-studio-bronze"}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </nav>

        {/* CENTER WORKBENCH */}
        <main className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.12 }}
            >
              <ActiveComponent />
            </motion.div>
          </AnimatePresence>
        </main>

        {/* RIGHT INSPECTOR */}
        {inspectorOpen && (
          <aside className="hidden lg:block studio-glass rounded-lg p-3 text-xs space-y-3 self-start sticky top-20">
            <div>
              <div className="font-mono uppercase text-[10px] text-studio-soft-white/50 mb-1">Tips for this workbench</div>
              <div className="text-studio-soft-white/80 leading-relaxed">{INSPECTOR_TIPS[view]}</div>
            </div>
            <div className="border-t border-studio-bronze/15 pt-3">
              <div className="font-mono uppercase text-[10px] text-studio-soft-white/50 mb-1">Jump to</div>
              <div className="grid grid-cols-2 gap-1">
                {(["Build", "Refine", "Ship"] as const).map((g) => (
                  <div key={g} className="col-span-2">
                    <div className="text-[10px] font-mono uppercase text-studio-bronze/70 mt-2">{g}</div>
                    <div className="grid grid-cols-1 gap-0.5">
                      {VIEWS.filter((v) => v.group === g).map((v) => (
                        <button key={v.id} onClick={() => setView(v.id)}
                          className={`text-left text-[11px] px-2 py-1 rounded ${v.id === view ? "bg-studio-bronze/20 text-studio-bronze" : "text-studio-soft-white/70 hover:bg-studio-bronze/10"}`}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

const INSPECTOR_TIPS: Record<ViewId, string> = {
  pipeline: "Runs the canonical 26-node creative+sales pipeline. Brief → concepts → dispatch → R2 normalize → review → export.",
  scene_composer: "Plan a multi-scene shot list with a high-quality LLM, then chain image+video generation per scene. Each scene's keyframe feeds the next.",
  workflow_composer: "Drop text/image/video nodes in a line. Reference upstream outputs via {{prev_text}} / {{prev_image}}. Video nodes inherit upstream image as start frame.",
  broll: "Bulk B-Roll shotlists. Generate stills, optionally animate to short videos. Same Replicate provider stack.",
  image: "Workers AI gpt-image-2 / gpt-image-1.5. Use Batch mode for many prompts at once.",
  video: "Replicate-backed video. Background queue is on by default — find generated clips in the Editor and Post Ready.",
  enhance: "Upscale, background-remove, music generation, voice clone, lip-sync, frame interpolation, transcription. All Replicate-backed.",
  editor: "Trim, color-grade, mask, motion keyframes, crossfade between clips. Renders WebM via browser canvas + MediaRecorder.",
  preview: "Visual preview of drafts before scheduling. Pin to planner from here.",
  generations: "Live grid showing dispatch results from the 26-node pipeline. Tied to SSE.",
  copilot: "Take an Article, draft a social campaign in your brand voice.",
  post_ready: "All your generations as a 3-col profile grid. Drag to reorder, click to caption + schedule.",
};
