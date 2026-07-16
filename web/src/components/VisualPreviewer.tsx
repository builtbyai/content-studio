import React, { useState, useEffect, useRef } from "react";
import { SocialTemplate, SocialPlatform } from "../types";
import { Eye, Copy, Check, FileText, ArrowRight, Play, Pause, RefreshCw, Layers, Sliders } from "lucide-react";

interface VisualPreviewerProps {
  campaign: (SocialTemplate & { tags: string[] }) | null;
  onUpdateCampaign: (updated: SocialTemplate & { tags: string[] }) => void;
  onPinToPlanner: (campaignText: string, slides?: string[]) => void;
}

export default function VisualPreviewer({
  campaign,
  onUpdateCampaign,
  onPinToPlanner
}: VisualPreviewerProps) {
  const [copied, setCopied] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isScrollingPrompt, setIsScrollingPrompt] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(25); // Speed multiplier
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // Parse text content for direct edit sync
  const [localText, setLocalText] = useState("");
  const [localSlides, setLocalSlides] = useState<string[]>([]);
  const [localDirectives, setLocalDirectives] = useState("");

  useEffect(() => {
    if (campaign) {
      setLocalText(campaign.content);
      setLocalSlides(campaign.slides || []);
      setLocalDirectives(campaign.videoDirectives || "");
    }
  }, [campaign]);

  // Synchronize dynamic updates back to parent state
  const handleLocalChange = (text: string) => {
    setLocalText(text);
    if (campaign) {
      onUpdateCampaign({
        ...campaign,
        content: text
      });
    }
  };

  const handleSlideChange = (idx: number, val: string) => {
    const updated = [...localSlides];
    updated[idx] = val;
    setLocalSlides(updated);
    if (campaign) {
      onUpdateCampaign({
        ...campaign,
        slides: updated
      });
    }
  };

  const handleCopy = () => {
    if (!campaign) return;
    let fullText = localText;
    if (campaign.platform === "instagram" && localSlides.length > 0) {
      fullText = localSlides.join("\n\n---\n\n");
    }
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Self-scrolling teleprompter loop
  useEffect(() => {
    if (isScrollingPrompt) {
      let lastTime = performance.now();
      const scrollStep = (time: number) => {
        if (!scrollRef.current) return;
        const elapsed = time - lastTime;
        lastTime = time;
        
        // Scroll speed proportional to speed parameter (pixels per second)
        const distance = (scrollSpeed * elapsed) / 1000;
        scrollRef.current.scrollTop += distance;

        // Reset if reached bottom
        if (
          scrollRef.current.scrollTop + scrollRef.current.clientHeight >=
          scrollRef.current.scrollHeight - 2
        ) {
          scrollRef.current.scrollTop = 0;
        }

        animationRef.current = requestAnimationFrame(scrollStep);
      };
      animationRef.current = requestAnimationFrame(scrollStep);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isScrollingPrompt, scrollSpeed]);

  if (!campaign) {
    return (
      <div className="studio-glass rounded-xl p-12 text-center text-studio-charcoal font-sans" id="preview-no-content">
        <FileText className="w-12 h-12 mx-auto mb-4 text-studio-bronze/40" />
        <h3 className="text-sm font-semibold font-display text-studio-soft-white">No active campaign draft</h3>
        <p className="text-xs text-studio-charcoal mt-1 max-w-sm mx-auto">
          Head over to the Campaign Copilot page, configure your storm metrics source, and hit Generate to view live simulation cards.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8" id="previewer-root-grid">
      
      {/* Editorial Content Workspace on Left */}
      <div className="xl:col-span-6 space-y-6" id="previewer-workspace-column">
        <div className="studio-glass rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-studio-bronze/10">
            <h3 className="text-xs font-mono text-studio-bronze tracking-widest font-black uppercase">
              Brand Copy Editor
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="p-1.5 hover:bg-studio-brown/40 border border-studio-bronze/10 rounded-lg text-xs leading-none text-studio-soft-white flex items-center gap-1.5 transition-all cursor-pointer"
                id="copy-edited-text-btn"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-studio-bronze" />
                    <span className="text-[10px] uppercase font-mono font-semibold text-studio-bronze">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[10px] uppercase font-mono font-semibold">Copy Draft</span>
                  </>
                )}
              </button>

              <button
                onClick={() => onPinToPlanner(localText, localSlides)}
                className="bg-studio-bronze/10 hover:bg-studio-bronze/20 border border-studio-bronze/30 text-studio-bronze-light text-[10px] uppercase font-mono font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                id="pin-edited-campaign-btn"
              >
                Pin Scheduled
              </button>
            </div>
          </div>

          {/* Platform Specific Inputs */}
          {campaign.platform === "linkedin" && (
            <div className="space-y-1.5" id="editor-field-linkedin">
              <label className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/60">
                Primary Post Copy
              </label>
              <textarea
                value={localText}
                onChange={(e) => handleLocalChange(e.target.value)}
                rows={11}
                className="w-full bg-studio-warm-black/95 border border-studio-bronze/10 rounded-lg p-3 text-xs text-studio-soft-white leading-relaxed focus:outline-none focus:border-studio-bronze/30 font-sans"
                placeholder="Compose post details..."
                id="linkedin-textarea-editor"
              />
            </div>
          )}

          {campaign.platform === "instagram" && (
            <div className="space-y-4" id="editor-field-instagram">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/60">
                  Carousel Slide Captions (Dynamic Stack)
                </label>
                {localSlides.map((slide, sIdx) => (
                  <div key={sIdx} className="space-y-1 bg-studio-warm-black/40 p-3 rounded-lg border border-studio-bronze/5">
                    <span className="text-[9px] font-mono text-studio-bronze uppercase">Slide {sIdx + 1} Text</span>
                    <textarea
                      value={slide}
                      onChange={(e) => handleSlideChange(sIdx, e.target.value)}
                      rows={3}
                      className="w-full bg-studio-warm-black/90 border border-studio-bronze/10 rounded-md p-2 text-xs text-studio-soft-white font-sans focus:outline-none focus:border-studio-bronze/25"
                      id={`slide-input-field-${sIdx}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {campaign.platform === "short_video" && (
            <div className="space-y-4" id="editor-field-video">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/50">
                  Script Transcription
                </label>
                <textarea
                  value={localText}
                  onChange={(e) => handleLocalChange(e.target.value)}
                  rows={8}
                  className="w-full bg-studio-warm-black/95 border border-studio-bronze/10 rounded-lg p-3 text-xs text-studio-soft-white leading-relaxed focus:outline-none focus:border-studio-bronze/30 font-sans"
                  id="video-script-textarea-editor"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/50">
                  Live Action / Video Directives
                </label>
                <textarea
                  value={localDirectives}
                  onChange={(e) => {
                    setLocalDirectives(e.target.value);
                    if (campaign) {
                      onUpdateCampaign({
                        ...campaign,
                        videoDirectives: e.target.value
                      });
                    }
                  }}
                  rows={4}
                  className="w-full bg-studio-warm-black/95 border border-studio-bronze/10 rounded-lg p-3 text-xs text-studio-soft-white/70 leading-relaxed focus:outline-none focus:border-studio-bronze/30 font-sans"
                  id="video-directives-textarea-editor"
                />
              </div>
            </div>
          )}

          {/* Social Tags */}
          <div className="space-y-2 pt-3 border-t border-studio-bronze/5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-studio-soft-white/40 block">
              Configured tags
            </span>
            <div className="flex flex-wrap gap-1.5" id="tags-badge-rack">
              {campaign.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] bg-studio-bronze/5 text-studio-bronze-light border border-studio-bronze/15 px-2.5 py-0.5 rounded font-mono font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Social Phone/LinkedIn Simulated Cards on Right */}
      <div className="xl:col-span-6 flex flex-col items-center justify-start" id="simulation-rendering-column">
        
        {campaign.platform === "linkedin" && (
          <div className="w-full max-w-lg bg-[#F3F4F6] text-[#000000] rounded-xl border border-gray-200 overflow-hidden shadow-md p-4 font-sans text-left" id="linkedin-mock-card">
            {/* Poster heading */}
            <div className="flex items-start justify-between mb-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-studio-warm-black border border-studio-bronze flex items-center justify-center font-bold text-studio-soft-white text-xs shrink-0 select-none">
                  IQ
                </div>
                <div>
                  <h4 className="font-semibold text-black hover:text-blue-700 cursor-pointer flex items-center gap-1">
                    Acme Admin
                    <span className="text-[10px] font-normal text-gray-500">• 1st</span>
                  </h4>
                  <p className="text-[10px] text-gray-500">Field Intelligence Campaign Solutions</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Now • 🌐</p>
                </div>
              </div>
              <button className="text-gray-400 hover:text-gray-600 font-bold">•••</button>
            </div>

            {/* Post text */}
            <div className="text-xs text-gray-800 leading-relaxed whitespace-pre-line mb-4 font-normal" id="linkedin-rendered-text-body">
              {localText}
              <div className="text-studio-bronze font-semibold mt-3">
                {campaign.tags.map(t => `#${t}`).join(" ")}
              </div>
            </div>

            {/* Simulated attachment image card */}
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white mb-4">
              <div className="bg-studio-coffee p-4 py-8 text-center text-studio-soft-white relative">
                <div className="absolute top-2 left-2 bg-studio-bronze text-studio-warm-black text-[8px] font-mono uppercase tracking-widest font-black px-2 py-0.5 rounded">
                  Playbook Target
                </div>
                <h3 className="text-sm font-display font-medium text-studio-bronze mb-1">
                  PREVENTING BLIND SPOTS
                </h3>
                <p className="text-[9px] text-[#EBEBEA]/80 font-mono tracking-wide">
                  acme.com/field-os
                </p>
              </div>
              <div className="p-3 border-t border-gray-100 bg-[#FAFAFA]">
                <h4 className="text-xs font-semibold text-gray-800 line-clamp-1">
                  Smarter roofing canvassing, active routing, and reports.
                </h4>
                <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">
                  Explore how top teams replace flat Excel tables with evidence-ready files.
                </p>
              </div>
            </div>

            {/* Action panel footer */}
            <div className="border-t border-gray-200 pt-3 flex items-center justify-around text-[11px] text-gray-500 font-semibold select-none">
              <button className="hover:bg-gray-100 px-3 py-1.5 rounded transition-colors cursor-pointer">👍 Like</button>
              <button className="hover:bg-gray-100 px-3 py-1.5 rounded transition-colors cursor-pointer">💬 Comment</button>
              <button className="hover:bg-gray-100 px-3 py-1.5 rounded transition-colors cursor-pointer">🔁 Repost</button>
              <button className="hover:bg-gray-100 px-3 py-1.5 rounded transition-colors cursor-pointer">🚀 Send</button>
            </div>
          </div>
        )}

        {campaign.platform === "instagram" && localSlides.length > 0 && (
          <div className="w-full max-w-sm" id="instagram-mock-carousel-container">
            {/* Simulated telephone card */}
            <div className="bg-studio-warm-black rounded-3xl border-4 border-studio-brown overflow-hidden shadow-2xl relative w-full aspect-square flex flex-col justify-between p-6 studio-glass-glow" id="instagram-rendered-slide-container">
              <div className="absolute top-0 right-0 p-8 text-xs font-mono text-studio-bronze/40 font-black tracking-widest pointer-events-none">
                IQ_WORK
              </div>

              {/* Slide Counter badging */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest bg-studio-bronze/10 text-studio-bronze-light border border-studio-bronze/20 px-2.5 py-1 rounded font-semibold">
                  SLIDE {activeSlide + 1} OF {localSlides.length}
                </span>
                <span className="text-[10px] font-mono text-studio-charcoal font-bold uppercase">
                  Instagram Series
                </span>
              </div>

              {/* Carousel Content Panel */}
              <div className="my-auto py-4">
                <p className="text-sm font-sans font-medium text-studio-soft-white leading-relaxed text-left whitespace-pre-wrap select-text">
                  {localSlides[activeSlide]}
                </p>
              </div>

              {/* Progress dots at bottom */}
              <div className="flex items-center justify-between pt-4 border-t border-studio-bronze/15 select-none">
                <div className="flex items-center gap-1">
                  {localSlides.map((_, dotIdx) => (
                    <span
                      key={dotIdx}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                        activeSlide === dotIdx ? "bg-studio-bronze w-3" : "bg-studio-charcoal"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveSlide(prev => Math.max(0, prev - 1))}
                    disabled={activeSlide === 0}
                    className="disabled:opacity-30 bg-studio-brown/30 hover:bg-studio-brown/60 p-1 px-2 text-xs rounded border border-studio-bronze/10 text-studio-soft-white transition-colors cursor-pointer"
                    id="prev-slide-btn"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => setActiveSlide(prev => Math.min(localSlides.length - 1, prev + 1))}
                    disabled={activeSlide === localSlides.length - 1}
                    className="disabled:opacity-30 bg-studio-brown/30 hover:bg-studio-brown/60 p-1 px-2 text-xs rounded border border-studio-bronze/10 text-studio-soft-white transition-colors cursor-pointer"
                    id="next-slide-btn"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-studio-charcoal text-center mt-3 font-mono">
              Use arrow triggers to review slide sequential flow.
            </p>
          </div>
        )}

        {campaign.platform === "short_video" && (
          <div className="w-full max-w-xs" id="mobile-teleprompter-simulator-panel">
            <div className="bg-studio-warm-black rounded-3xl border-4 border-studio-brown overflow-hidden shadow-2xl flex flex-col h-[400px] relative studio-glass-glow">
              {/* Teleprompter header controls */}
              <div className="p-3.5 border-b border-studio-bronze/10 bg-studio-warm-black/80 flex items-center justify-between z-10 select-none">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-studio-bronze" />
                  <span className="text-[10px] font-mono text-studio-bronze font-bold uppercase tracking-wider">
                    Scrolling Teleprompter
                  </span>
                </div>

                <button
                  onClick={() => setIsScrollingPrompt(!isScrollingPrompt)}
                  className="bg-studio-bronze text-studio-warm-black font-semibold text-[10px] font-sans px-2.5 py-1 rounded hover:bg-studio-bronze-light transition-all flex items-center gap-1 cursor-pointer"
                  id="teleprompter-scroll-toggle"
                >
                  {isScrollingPrompt ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {isScrollingPrompt ? "Pause" : "Scroll"}
                </button>
              </div>

              {/* Scrolling Container */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-5 py-24 scroll-smooth relative"
                style={{ scrollbarWidth: "none" }}
                id="teleprompter-screen-viewport"
              >
                {/* Visual guideline overlay center */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 border-y border-studio-bronze/20 bg-studio-bronze/5 pointer-events-none" />

                <div className="text-center font-display font-medium text-xs leading-relaxed text-studio-soft-white/90 whitespace-pre-wrap select-text">
                  {localText}
                </div>
              </div>

              {/* Bottom Speed controller HUD tab */}
              <div className="p-3 border-t border-studio-bronze/10 bg-studio-warm-black/80 flex items-center justify-between text-[10px] text-studio-soft-white/60 font-mono select-none">
                <div className="flex items-center gap-2 w-full">
                  <span>Speed:</span>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    value={scrollSpeed}
                    onChange={(e) => setScrollSpeed(Number(e.target.value))}
                    className="flex-1 accent-studio-bronze cursor-pointer h-1 bg-studio-brown/80 rounded"
                    id="teleprompter-speed-range-slider"
                  />
                  <span className="w-6 text-right font-mono text-studio-bronze-light font-bold">{scrollSpeed}px</span>
                </div>
              </div>
            </div>
            
            {/* Video directives display below simulator */}
            {localDirectives && (
              <div className="w-full bg-studio-brown/20 border border-studio-bronze/10 rounded-xl p-3.5 mt-4 text-left font-sans" id="directives-display-card">
                <h4 className="text-[10px] font-mono uppercase tracking-wider text-studio-bronze-light mb-1.5 font-bold flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-studio-bronze" />
                  Visual Filming Directions
                </h4>
                <p className="text-[10px] leading-relaxed text-[#EBEBEA] font-light italic">
                  {localDirectives}
                </p>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
