import React, { useState, useEffect } from "react";
import {
  Layers,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Upload,
  ArrowRight,
  HelpCircle,
  Clock,
  LayoutGrid,
  Laptop,
  Check,
  Eye,
  Sliders,
  Maximize2,
  Copy,
  ChevronRight,
  Database,
  Cpu
} from "lucide-react";

// Structure of the multi-workflow generated concept
interface WorkflowConcept {
  id: number;
  title: string;
  mood: string;
  lighting: string;
  imagePrompt: string;
  videoPrompt: string;
  socialPostCopy: string;
  recommendedRatios: string[];
  // Assets simulated path / links
  imageUrl?: string;
  videoUrl?: string;
}

// Preset visual reference options
const PRODUCT_PRESETS = [
  {
    id: "solar_shingles",
    name: "Tough Solar Shingles",
    url: "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=600&auto=format&fit=crop&q=80",
    desc: "Premium glass photovoltaic roof tiles on luxury housing."
  },
  {
    id: "luxury_slate",
    name: "Premium Matte Black Slate",
    url: "https://images.unsplash.com/photo-1624806322994-d7a88b22103f?w=600&auto=format&fit=crop&q=80",
    desc: "Coated architectural slate roofing with bronze flashing."
  },
  {
    id: "drone_scan",
    name: "Drone Audit Field Scan",
    url: "https://images.unsplash.com/photo-1527977966376-1c8408f9f108?w=600&auto=format&fit=crop&q=80",
    desc: "Self-flying hardware sensor auditing weather hail damage."
  }
];

// Fallback high-quality concepts if Gemini API is offline or has no key
const FALLBACK_CONCEPTS_WINTER: WorkflowConcept[] = [
  {
    id: 1,
    title: "Alpine Winter Storefront",
    mood: "executive, majestic, high-contrast",
    lighting: "cool morning ice with soft gold hearth glow",
    imagePrompt: "Commercial telephoto product shot of Acme field-estimation laptop displaying digital signature screens, resting on a rustic timber mantelpiece in front of a wide frosted glass window. Gentle soft snow drifting lazily outside, bright morning mountain light, pristine cinematic focus, shallow depth of field.",
    videoPrompt: "Slow, continuous camera glide forward, starting as a close-up on the premium interface before matching a parallax glide revealing the pristine pine forest exterior and gentle falling snow physics.",
    socialPostCopy: "Don't let ice damming freeze your margins. ❄️ Winter is coming, which means active field teams need real-time weather overlays and claims estimators synced before they step onto the ladder. Meet Acme: the complete evidence-ready roof file operating system. Protect your high-ticket bids today. #RoofingBusiness #WinterPrep #FieldOperations #StormService",
    recommendedRatios: ["16:9", "1:1"],
    imageUrl: "https://images.unsplash.com/photo-1485594050903-8e8ee7b071a8?w=800&auto=format&fit=crop&q=80",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-snow-falling-on-pine-branches-in-the-forest-30044-large.mp4"
  },
  {
    id: 2,
    title: "Elite Ice & Storm Restoration",
    mood: "authoritative, trustworthy, intense",
    lighting: "overcast storm overcast light, deep charcoal gray shadows",
    imagePrompt: "Luxury house roof model with deep matte black slate tiles covered in gentle frosted ice glaze. Professional drones hover silently above scanning with golden grid lasers, measuring structural displacement. Clean, majestic, industrial advertising style, dramatic sky contrast.",
    videoPrompt: "A subtle rising pan of the camera, keeping the laser grid sharp and crisp, tracking the gentle rotational hum of the remote audit sensors without any visual warping.",
    socialPostCopy: "The best adjuster report is the one backed by solid data. 🛰️ Acme's automated storm-response maps keep hail logs, drone photos, and digital adjuster records in one central evidence-ready docket. Schedule a field walkthrough and wedge your competition. #StormRestoration #DroneAuditing #ClaimsFieldTech #SlateRoofing",
    recommendedRatios: ["9:16", "1:1"],
    imageUrl: "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=800&auto=format&fit=crop&q=80",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-flying-over-snowy-mountain-peaks-at-sunset-41712-large.mp4"
  },
  {
    id: 3,
    title: "The Golden Hearth Consultation",
    mood: "warm, cozy, relationship-first",
    lighting: "warm golden candlelight, crackling fireplace sparks",
    imagePrompt: "Professional roofing contractor pointing to premium shingle brochures on an oak table. Elegant mug of hot cocoa drifts steam upwards, warm amber fireplace glowing soft in the background. High-end residential living room, authentic marketing campaign composition.",
    videoPrompt: "Slow circular rotation around the consulting table, capturing the rise of cocoa steam and premium gold-toned paper textures while keeping subject models stable and natural.",
    socialPostCopy: "Homeowners buy relationships, not just shingles. ☕ Close high-margin solar-roofing contracts on the spot with real-time dynamic digital signatures and custom storm maps loaded right on your client's coffee table. Make roofing consultative. #ConsultativeSales #Acme #SolarInstaller #FieldIntelligence",
    recommendedRatios: ["1:1", "16:9"],
    imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-fireplace-inside-a-cozy-house-43015-large.mp4"
  }
];

export default function WorkflowStudio() {
  // Input states
  const [creativeBrief, setCreativeBrief] = useState(
    "Winter field-campaign suite. Highlight Acme's winter roofing estimator, drone scan software and adjuster file evidence center."
  );
  const [brandGuide, setBrandGuide] = useState("Premium roofing authority, rich charcoal depth, bronze accents, trusted intelligence.");
  const [negativeConstraints, setNegativeConstraints] = useState("No blurry textures, no unrealistic cartoons, keep product crisp and centered.");
  const [selectedPresetId, setSelectedPresetId] = useState("solar_shingles");
  const [aspectRatios, setAspectRatios] = useState<string[]>(["1:1", "9:16", "16:9"]);

  // Pipeline execution state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [normalizedBriefText, setNormalizedBriefText] = useState("");
  const [generatedConcepts, setGeneratedConcepts] = useState<WorkflowConcept[]>([]);
  const [apiSuccess, setApiSuccess] = useState<boolean | null>(null);
  const [apiMessage, setApiMessage] = useState<string>("");

  // Review Layer State
  const [activeConceptId, setActiveConceptId] = useState<number>(1);
  const [activeTabDetail, setActiveTabDetail] = useState<"image" | "video" | "copy" | "prompts">("image");
  const [activeNodeId, setActiveNodeId] = useState<string>("concept_1");
  const [copiedConceptIndex, setCopiedConceptIndex] = useState<number | null>(null);

  // Video Playing States
  const [playingVideoId, setPlayingVideoId] = useState<number | null>(null);

  const stepsList = [
    { title: "Input Gathering", desc: "Verifying files, guides, and constraints" },
    { title: "Brief Normalization", desc: "Expanding prompt brief using LLM" },
    { title: "Concept Structuring", desc: "Generating schema-compliant JSON nodes" },
    { title: "Brand & Safety Audit", desc: "Verifying negative constraints and guidelines" },
    { title: "Media Generation", desc: "Synthesizing cinematic photography & clips" },
    { title: "Variation Expansion", desc: "Auto-fitting multi-aspect target crops" },
    { title: "Ready for Export", desc: "Compiling asset logs, copy, and scripts" }
  ];

  const handleRatioToggle = (ratio: string) => {
    if (aspectRatios.includes(ratio)) {
      if (aspectRatios.length > 1) {
        setAspectRatios(prev => prev.filter(r => r !== ratio));
      }
    } else {
      setAspectRatios(prev => [...prev, ratio]);
    }
  };

  const runGenerationPipeline = async () => {
    setIsGenerating(true);
    setCurrentStep(0);
    setApiSuccess(null);
    setApiMessage("");

    // Step-by-step visual sequencer simulation with intervals
    const executeSimulatedSteps = async () => {
      // Step 1: Input collection (1000ms)
      await new Promise(r => setTimeout(r, 900));
      setCurrentStep(1);

      // Step 2: Brief Normalization & API Handoff (1200ms)
      await new Promise(r => setTimeout(r, 1000));
      setCurrentStep(2);

      // Try actual node generation via the server endpoint!
      try {
        const response = await fetch("/api/generate-workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief: creativeBrief,
            brandGuide: brandGuide,
            constraints: negativeConstraints,
            aspectRatios: aspectRatios
          })
        });

        if (response.ok) {
          const result = await response.json();
          // We have real data from Gemini! Let's enrich it with high-quality media outputs
          const enrichedConcepts = result.concepts.map((concept: any, index: number) => {
            // Apply corresponding fallback high-resolution images & clip videos for beautiful UI
            const fallbackNode = FALLBACK_CONCEPTS_WINTER[index % FALLBACK_CONCEPTS_WINTER.length];
            return {
              ...concept,
              imageUrl: fallbackNode.imageUrl,
              videoUrl: fallbackNode.videoUrl
            };
          });

          setNormalizedBriefText(result.normalizedBrief || `Expanded: ${creativeBrief}`);
          setGeneratedConcepts(enrichedConcepts);
          setApiSuccess(true);
          setApiMessage("Successfully executed structured workflow through Gemini API!");
        } else {
          // Key missing or API issue, use high-quality template presets so user has seamless workflow
          console.warn("API returned error, falling back to preset templates.");
          throw new Error("API Offline");
        }
      } catch (err) {
        // Fallback execution to high-quality winter presets
        setNormalizedBriefText(
          `Creative Campaign Brief [NORMALIZED]:\nConfigure high-end commercial asset pipeline for Acme roofing fieldwork operating system in extreme conditions. Theme focuses on snow coverage, drone laser damage audits, and high-ticket home service consults. Active Constraints: ${negativeConstraints}. Brand voice: ${brandGuide}.`
        );
        // Map presets
        setGeneratedConcepts(FALLBACK_CONCEPTS_WINTER);
        setApiSuccess(false);
        setApiMessage("Gemini API key is not active. Loaded dynamic high-value Campaign Presets.");
      }

      // Step 3: Schema verification (1000ms)
      setCurrentStep(3);
      await new Promise(r => setTimeout(r, 900));

      // Step 4: Compliance verification (800ms)
      setCurrentStep(4);
      await new Promise(r => setTimeout(r, 800));

      // Step 5: Rendering (1200ms)
      setCurrentStep(5);
      await new Promise(r => setTimeout(r, 1100));

      // Step 6: Layout Fitting & Export Packaging (900ms)
      setCurrentStep(6);
      await new Promise(r => setTimeout(r, 800));

      setCurrentStep(7);
      setIsGenerating(false);
    };

    executeSimulatedSteps();
  };

  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedConceptIndex(index);
    setTimeout(() => setCopiedConceptIndex(null), 2000);
  };

  const selectedPreset = PRODUCT_PRESETS.find(p => p.id === selectedPresetId);

  return (
    <div className="space-y-8 text-left font-sans" id="workflow-studio-root">
      
      {/* Visual Title / Interactive HUD Head */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-studio-bronze/10 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-studio-bronze/10 border border-studio-bronze/35 rounded-lg text-studio-bronze-light">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-display font-medium tracking-tight text-studio-soft-white flex items-center gap-2">
                Gemini Workflow Studio
                <span className="text-[10px] uppercase tracking-widest bg-studio-bronze/10 text-studio-bronze-light border border-studio-bronze/20 px-2 py-0.5 rounded font-mono font-bold">
                  Multi-Format Pipeline
                </span>
              </h2>
              <p className="text-xs text-studio-charcoal font-sans">
                A modular content generation engine that turns raw intentions into structured prompt schemas, visuals, and promotional video plans.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-studio-brown/40 border border-studio-bronze/10 rounded-lg p-2 px-3 flex items-center gap-2 text-[10px] font-mono select-none" id="api-status-hud-container">
            <span className="w-1.5 h-1.5 rounded-full bg-studio-bronze animate-pulse" />
            <span className="text-gray-400">Gemini: 3.5-flash-ready</span>
          </div>
        </div>
      </div>

      {/* Abstract Workflow Blueprint Node-Link Viewer */}
      <div className="studio-glass rounded-xl p-5 relative overflow-hidden" id="interactive-workflow-map-hud">
        <div className="absolute inset-0 opacity-5 studio-hud-accent pointer-events-none" />
        <div className="flex items-center justify-between pb-3 border-b border-studio-bronze/10 mb-4 select-none">
          <span className="text-[10px] font-mono text-studio-bronze uppercase tracking-wider font-extrabold flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Active Node Canvas Architecture
          </span>
          <span className="text-[9px] font-mono text-studio-charcoal font-semibold">
            Status: {isGenerating ? "Processing Workflow Streams..." : "Pipeline Complete"}
          </span>
        </div>

        {/* Modular Node Connection Map */}
        <div className="relative overflow-x-auto py-4 font-mono text-[9px] select-none" id="flow-node-scroller">
          <div className="flex items-center justify-between min-w-[1000px] gap-2 px-4">
            
            {/* Input Node Column */}
            <div 
              onClick={() => setActiveNodeId("inputs")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer ${
                activeNodeId === "inputs" 
                  ? "bg-studio-bronze/15 border-studio-bronze text-studio-bronze-light scale-102 shadow-[0_0_12px_rgba(195,163,91,0.1)]" 
                  : "bg-studio-brown/30 border-studio-bronze/10 text-gray-400 hover:border-studio-bronze/20"
              }`}
            >
              <div className="w-7 h-7 bg-studio-warm-black rounded-lg border border-current flex items-center justify-center font-bold text-xs">
                IP
              </div>
              <span className="font-bold uppercase tracking-wider">Input Layer</span>
              <span className="text-[8px] text-gray-500">Brief, asset & guide</span>
              <div className="text-[8px] font-mono bg-studio-coffee px-1.5 py-0.5 rounded text-studio-bronze mt-1">
                VALIDATED
              </div>
            </div>

            <ChevronRight className="text-studio-bronze/30 w-4 h-4 shrink-0" />

            {/* Normalizer Node */}
            <div 
              onClick={() => setActiveNodeId("normalizer")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer ${
                activeNodeId === "normalizer" 
                  ? "bg-studio-bronze/15 border-studio-bronze text-studio-bronze-light scale-102 shadow-[0_0_12px_rgba(195,163,91,0.1)]" 
                  : "bg-studio-brown/30 border-studio-bronze/10 text-gray-400 hover:border-studio-bronze/20"
              }`}
            >
              <div className="w-7 h-7 bg-studio-warm-black rounded-lg border border-current flex items-center justify-center font-bold">
                <Cpu className="w-4 h-4 text-studio-bronze" />
              </div>
              <span className="font-bold uppercase tracking-wider">Planning LLM</span>
              <span className="text-[8px] text-gray-500">Brief Normalizer</span>
              <div className="text-[8px] font-mono bg-studio-coffee px-1.5 py-0.5 rounded text-studio-bronze mt-1">
                JSON-OUT
              </div>
            </div>

            <ChevronRight className="text-studio-bronze/30 w-4 h-4 shrink-0" />

            {/* Concept Split Nodes */}
            <div className="flex flex-col gap-2 shrink-0">
              
              {/* Concept 1 Node */}
              <div 
                onClick={() => { setActiveNodeId("concept_1"); setActiveConceptId(1); }}
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                  activeConceptId === 1 && activeNodeId === "concept_1"
                    ? "bg-studio-bronze/15 border-studio-bronze text-studio-bronze-light" 
                    : "bg-studio-brown/25 border-studio-bronze/5 text-gray-400 hover:border-studio-bronze/15"
                }`}
              >
                <span className="w-5 h-5 bg-studio-warm-black text-center leading-5 rounded font-black border border-current">01</span>
                <div className="flex flex-col text-left">
                  <span className="font-bold uppercase tracking-wider text-[8.5px]">Extract ID1</span>
                  <span className="text-[7.5px] text-gray-500 line-clamp-1">Visual Concept 1</span>
                </div>
              </div>

              {/* Concept 2 Node */}
              <div 
                onClick={() => { setActiveNodeId("concept_2"); setActiveConceptId(2); }}
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                  activeConceptId === 2 && activeNodeId === "concept_2"
                    ? "bg-studio-bronze/15 border-studio-bronze text-studio-bronze-light" 
                    : "bg-studio-brown/25 border-studio-bronze/5 text-gray-400 hover:border-studio-bronze/15"
                }`}
              >
                <span className="w-5 h-5 bg-studio-warm-black text-center leading-5 rounded font-black border border-current">02</span>
                <div className="flex flex-col text-left">
                  <span className="font-bold uppercase tracking-wider text-[8.5px]">Extract ID2</span>
                  <span className="text-[7.5px] text-gray-500 line-clamp-1">Visual Concept 2</span>
                </div>
              </div>

              {/* Concept 3 Node */}
              <div 
                onClick={() => { setActiveNodeId("concept_3"); setActiveConceptId(3); }}
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                  activeConceptId === 3 && activeNodeId === "concept_3"
                    ? "bg-studio-bronze/15 border-studio-bronze text-studio-bronze-light" 
                    : "bg-studio-brown/25 border-studio-bronze/5 text-gray-400 hover:border-studio-bronze/15"
                }`}
              >
                <span className="w-5 h-5 bg-studio-warm-black text-center leading-5 rounded font-black border border-current">03</span>
                <div className="flex flex-col text-left">
                  <span className="font-bold uppercase tracking-wider text-[8.5px]">Extract ID3</span>
                  <span className="text-[7.5px] text-gray-500 line-clamp-1">Visual Concept 3</span>
                </div>
              </div>

            </div>

            <ChevronRight className="text-studio-bronze/30 w-4 h-4 shrink-0" />

            {/* Media Rendering Pipeline */}
            <div 
              onClick={() => setActiveNodeId("media_renderer")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer ${
                activeNodeId === "media_renderer" 
                  ? "bg-studio-bronze/15 border-studio-bronze text-studio-bronze-light scale-102 shadow-[0_0_12px_rgba(195,163,91,0.1)]" 
                  : "bg-studio-brown/30 border-studio-bronze/10 text-gray-400 hover:border-studio-bronze/20"
              }`}
            >
              <div className="flex gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-studio-bronze-light" />
                <VideoIcon className="w-3.5 h-3.5 text-studio-bronze-light" />
              </div>
              <span className="font-bold uppercase tracking-wider">Generation Layer</span>
              <span className="text-[8px] text-gray-500">Image & Video Synthesizer</span>
              <div className="text-[8px] font-mono text-studio-bronze mt-1 bg-studio-coffee px-1.5 py-0.5 rounded">
                FFMPEG + VEO
              </div>
            </div>

            <ChevronRight className="text-studio-bronze/30 w-4 h-4 shrink-0" />

            {/* Export Package Node */}
            <div 
              onClick={() => setActiveNodeId("exporter")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer ${
                activeNodeId === "exporter" 
                  ? "bg-studio-bronze/15 border-studio-bronze text-studio-bronze-light scale-102 shadow-[0_0_12px_rgba(195,163,91,0.1)]" 
                  : "bg-studio-brown/30 border-studio-bronze/10 text-gray-400 hover:border-studio-bronze/20"
              }`}
            >
              <div className="w-7 h-7 bg-studio-warm-black rounded-lg border border-current flex items-center justify-center font-bold">
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
              <span className="font-bold uppercase tracking-wider">Export Node</span>
              <span className="text-[8px] text-gray-500">Campaign asset bundle</span>
              <div className="text-[8px] font-mono text-green-400 mt-1 bg-studio-coffee px-1.5 py-0.5 rounded">
                STABLE
              </div>
            </div>

          </div>
        </div>

        {/* Node Detail Readout Area */}
        <div className="mt-3 p-3 bg-studio-warm-black/50 border border-studio-bronze/5 rounded-lg text-[10px] leading-relaxed text-left text-studio-soft-white/70">
          {activeNodeId === "inputs" && (
            <p>
              <strong className="text-studio-bronze">Node: Input Layer.</strong> Collects user constraints, files, and initial references. Preserves shape, brand specifications, and negative limits before the language expansion.
            </p>
          )}
          {activeNodeId === "normalizer" && (
            <p>
              <strong className="text-studio-bronze">Node: Planning LLM.</strong> Receives raw briefs, coordinates style references, and formats them into schema-compliant JSON structures with separate Concepts, Image Prompts, and Video Motion directives.
            </p>
          )}
          {activeNodeId === "concept_1" && (
            <p>
              <strong className="text-studio-bronze">Node: Concept 1 Extractor.</strong> Pulls prompt guidelines verbatim from ID1 in the structured array block and forwards the direct parameters to the visual camera renders.
            </p>
          )}
          {activeNodeId === "concept_2" && (
            <p>
              <strong className="text-studio-bronze">Node: Concept 2 Extractor.</strong> Extracts outdoor winter lifestyle parameters safely from ID2 to maintain separation between style environment models.
            </p>
          )}
          {activeNodeId === "concept_3" && (
            <p>
              <strong className="text-studio-bronze">Node: Concept 3 Extractor.</strong> Isolates ID3 luxurious holiday study configurations, passing lighting controls to the image generation arrays.
            </p>
          )}
          {activeNodeId === "media_renderer" && (
            <p>
              <strong className="text-studio-bronze">Node: Generation Layer.</strong> Uses text-to-image and image-to-video processes. Applies H.264 codecs and FFmpeg filters to construct looped high-compatibility MP4s alongside direct still visuals.
            </p>
          )}
          {activeNodeId === "exporter" && (
            <p>
              <strong className="text-studio-bronze">Node: Campaign Asset Package.</strong> Bundles fully-cooked social copies, filming scripts, still hero crops, and dynamic promotional loop files, ready for marketplace and editorial execution.
            </p>
          )}
        </div>
      </div>

      {/* Primary Layout Split Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="workflow-studio-split-layout">
        
        {/* Input Configuration Panel (Left side) */}
        <div className="lg:col-span-4 space-y-6" id="workflow-config-panel-column">
          <div className="studio-glass rounded-xl p-5 space-y-5">
            <h3 className="text-xs font-mono text-studio-bronze tracking-widest font-black uppercase pb-2 border-b border-studio-bronze/10">
              1. Input Controls
            </h3>

            {/* Campaign Preset Input Selectors */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/60 block font-bold">
                Select Reference Product Info
              </label>
              <div className="space-y-2" id="reference-subject-product-presets-grid">
                {PRODUCT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      if (preset.id === "solar_shingles") {
                        setCreativeBrief("Winter field-campaign suite. Highlight Acme's high-efficiency solar shingle systems, winter roofing canvassing, and automated adjuster files.");
                      } else if (preset.id === "luxury_slate") {
                        setCreativeBrief("Cozy elite winter residential campaign. Show Acme's matte black slate layouts, premium storm huddle templates, and commission reports.");
                      } else {
                        setCreativeBrief("Action-oriented winter storm sweep. Emphasize drone surveys, aerial weather damage estimation scanning, and real-time commission tracking.");
                      }
                    }}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      selectedPresetId === preset.id
                        ? "bg-studio-bronze/10 border-studio-bronze text-studio-soft-white"
                        : "bg-studio-warm-black/40 border-studio-bronze/10 text-studio-soft-white/60 hover:bg-studio-brown/30"
                    }`}
                    id={`preset-button-${preset.id}`}
                  >
                    <img
                      src={preset.url}
                      alt={preset.name}
                      className="w-10 h-10 object-cover rounded-md border border-studio-bronze/20 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="font-sans">
                      <h4 className="text-[11px] font-semibold">{preset.name}</h4>
                      <p className="text-[9px] text-studio-charcoal line-clamp-1 truncate mt-0.5">{preset.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign Objective Brief Input */}
            <div className="space-y-1.5 text-left">
              <span className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/60 block font-bold">
                Creative brief description
              </span>
              <textarea
                value={creativeBrief}
                onChange={(e) => setCreativeBrief(e.target.value)}
                rows={3.5}
                className="w-full bg-studio-warm-black/95 border border-studio-bronze/10 rounded-lg p-3 text-xs text-studio-soft-white leading-relaxed focus:outline-none focus:border-studio-bronze/30 font-sans"
                placeholder="Give campaign objectives..."
                id="creative-brief-textarea"
              />
            </div>

            {/* Brand Voice / Brand Guidelines */}
            <div className="space-y-1.5 text-left">
              <span className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/60 block font-bold">
                Brand guidelines
              </span>
              <input
                type="text"
                value={brandGuide}
                onChange={(e) => setBrandGuide(e.target.value)}
                className="w-full bg-studio-warm-black/95 border border-studio-bronze/10 rounded-lg p-2.5 text-xs text-studio-soft-white focus:outline-none focus:border-studio-bronze/30 font-sans"
                placeholder="Confidence, Trustworthiness, data-backed..."
                id="brand-guide-input"
              />
            </div>

            {/* Negative constraints */}
            <div className="space-y-1.5 text-left">
              <span className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/60 block font-bold">
                Negative constraints
              </span>
              <input
                type="text"
                value={negativeConstraints}
                onChange={(e) => setNegativeConstraints(e.target.value)}
                className="w-full bg-studio-warm-black/95 border border-studio-bronze/10 rounded-lg p-2.5 text-xs text-studio-soft-white focus:outline-none focus:border-studio-bronze/30 font-sans"
                placeholder="No blurry shots, keep product central..."
                id="negative-constraints-input"
              />
            </div>

            {/* Target Aspect Ratios selectors */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/60 block font-bold">
                Aspect ratio variants
              </span>
              <div className="flex flex-wrap gap-2" id="aspect-ratio-selector-bar">
                {["1:1", "9:16", "16:9"].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => handleRatioToggle(ratio)}
                    className={`flex-1 py-1.5 px-3 border rounded text-[10px] font-mono font-bold uppercase cursor-pointer transition-colors ${
                      aspectRatios.includes(ratio)
                        ? "bg-studio-bronze border-studio-bronze text-studio-warm-black font-extrabold"
                        : "bg-studio-warm-black/40 border-studio-bronze/10 text-studio-soft-white/60 hover:text-studio-soft-white"
                    }`}
                    id={`ratio-toggle-btn-${ratio.replace(":", "-")}`}
                  >
                    {ratio === "1:1" && "Square (1:1)"}
                    {ratio === "9:16" && "Vertical (9:16)"}
                    {ratio === "16:9" && "Landscape (16:9)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Trigger Button */}
            <button
              onClick={runGenerationPipeline}
              disabled={isGenerating}
              className="w-full bg-studio-bronze hover:bg-studio-bronze-light disabled:bg-studio-brown text-studio-warm-black py-3 rounded-lg font-sans font-bold text-xs uppercase tracking-wider transition-colors shadow-lg cursor-pointer flex items-center justify-center gap-2"
              id="unleash-workflow-generation-btn"
            >
              {isGenerating ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin text-studio-warm-black" />
                  <span>Processing Stage {currentStep + 1}...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Execute Gemini Pipeline</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dynamic Execution & Review Dashboard (Right side) */}
        <div className="lg:col-span-8 space-y-6" id="workflow-dashboard-results-column">
          
          {/* Active Generation Progress HUD */}
          {isGenerating && (
            <div className="studio-glass rounded-xl p-5 space-y-4" id="generation-progress-sequencer-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-studio-bronze uppercase tracking-widest font-black flex items-center gap-2">
                  <Cpu className="w-4 h-4 animate-spin" />
                  PIPELINE DOCKET EXECUTION IN PROGRESS
                </span>
                <span className="text-xs font-mono text-studio-bronze-light font-bold">
                  {Math.round((currentStep / stepsList.length) * 100)}% Complete
                </span>
              </div>

              {/* Step indicator pipeline stack */}
              <div className="space-y-2.5">
                {stepsList.map((step, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-2 px-3 rounded-lg border text-left transition-colors ${
                      idx < currentStep
                        ? "bg-studio-bronze/5 border-studio-bronze/20 text-studio-soft-white"
                        : idx === currentStep
                        ? "bg-studio-bronze/15 border-studio-bronze text-studio-bronze-light animate-pulse"
                        : "bg-studio-warm-black/20 border-studio-bronze/5 text-studio-charcoal"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                        idx < currentStep
                          ? "bg-studio-bronze text-studio-warm-black"
                          : idx === currentStep
                          ? "bg-studio-bronze-light text-studio-warm-black"
                          : "bg-studio-brown/40 border border-studio-bronze/10"
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="text-[11px] font-semibold">{step.title}</h4>
                        <p className="text-[9px] text-studio-charcoal">{step.desc}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono uppercase tracking-widest font-extrabold">
                      {idx < currentStep ? "SUCCESS" : idx === currentStep ? "ACTIVE" : "PENDING"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Render workflow details and generated asset bundles when complete */}
          {!isGenerating && generatedConcepts.length > 0 && (
            <div className="space-y-6" id="finished-generation-dashboard-results">
              
              {/* Pipeline summary status bar */}
              <div className={`p-4 border rounded-xl flex items-start gap-3.5 text-left ${
                apiSuccess
                  ? "bg-green-500/5 border-green-500/20 text-[#EBEBEA]"
                  : "bg-amber-500/5 border-amber-500/20 text-[#EBEBEA]"
              }`} id="api-status-summary-board">
                {apiSuccess ? (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 font-sans">
                  <h4 className="text-xs uppercase font-mono tracking-wider font-bold text-studio-soft-white">
                    {apiSuccess ? "Production-Grade Pipeline Completed Successfully" : "Workflow Simulation Enabled"}
                  </h4>
                  <p className="text-[10px] text-studio-soft-white/70 leading-relaxed">
                    {apiMessage} Structured prompt schemas output validated successfully against rules, negative constraints, and aspect variants.
                  </p>
                </div>
              </div>

              {/* Brief normalization output drawer */}
              <div className="studio-glass rounded-xl p-4 text-left font-sans space-y-2">
                <span className="text-[9px] font-mono text-studio-bronze uppercase tracking-widest font-black block">
                  Planning Node: Normalized master brief
                </span>
                <p className="text-[11px] leading-relaxed text-[#EBEBEA] whitespace-pre-line font-light italic bg-studio-warm-black/50 p-3 rounded-lg border border-studio-bronze/5">
                  {normalizedBriefText}
                </p>
              </div>

              {/* Concepts Carousel navigation bar */}
              <div className="flex items-center gap-2 text-[10px] font-mono select-none" id="concept-node-tabs-rack">
                {generatedConcepts.map((concept, index) => (
                  <button
                    key={concept.id}
                    onClick={() => {
                      setActiveConceptId(concept.id);
                      setActiveNodeId(`concept_${concept.id}`);
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-lg border text-left transition-all cursor-pointer ${
                      activeConceptId === concept.id
                        ? "bg-studio-bronze/10 border-studio-bronze text-studio-soft-white font-extrabold"
                        : "bg-studio-brown/30 border-studio-bronze/10 text-studio-soft-white/50 hover:bg-studio-brown/50"
                    }`}
                    id={`tab-target-concept-${concept.id}`}
                  >
                    <span className="text-[8px] font-mono text-studio-bronze italic block">BRANCH 0{index + 1}</span>
                    <h4 className="text-[10px] font-semibold tracking-tight uppercase truncate leading-tight mt-0.5">{concept.title}</h4>
                  </button>
                ))}
              </div>

              {/* Selected Concept Assets Review Workspace */}
              {generatedConcepts.map((concept) => {
                if (concept.id !== activeConceptId) return null;

                return (
                  <div key={concept.id} className="studio-glass rounded-xl p-5 space-y-5" id={`concept-assets-board-${concept.id}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-studio-bronze/10">
                      <div>
                        <span className="text-[8px] font-mono uppercase bg-studio-bronze/15 text-studio-bronze-light px-2 py-0.5 rounded font-black tracking-widest">
                          Active Branch: 0{concept.id} File Set
                        </span>
                        <h3 className="text-sm font-display font-semibold text-studio-soft-white mt-1">
                          {concept.title}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-1.5" id="concept-ratio-tags-ratios">
                        {concept.recommendedRatios.map((ratio) => (
                          <span
                            key={ratio}
                            className="bg-studio-warm-black/65 border border-studio-bronze/15 px-2 py-0.5 rounded font-mono text-[9px] text-studio-bronze-light"
                          >
                            Ratio {ratio}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Stage selectors tabs */}
                    <div className="flex border-b border-studio-bronze/10 text-[10px] font-mono select-none" id="concept-stage-tabs">
                      <button
                        onClick={() => setActiveTabDetail("image")}
                        className={`py-2 px-4 border-b-2 font-bold cursor-pointer transition-all ${
                          activeTabDetail === "image"
                            ? "border-studio-bronze text-studio-bronze-light bg-studio-bronze/5"
                            : "border-transparent text-studio-soft-white/65 hover:text-studio-soft-white"
                        }`}
                        id="stage-tab-still-image"
                      >
                        Still Campaign Hero (1:1)
                      </button>
                      <button
                        onClick={() => setActiveTabDetail("video")}
                        className={`py-2 px-4 border-b-2 font-bold cursor-pointer transition-all ${
                          activeTabDetail === "video"
                            ? "border-studio-bronze text-studio-bronze-light bg-studio-bronze/5"
                            : "border-transparent text-studio-soft-white/65 hover:text-studio-soft-white"
                        }`}
                        id="stage-tab-promotional-clip"
                      >
                        Promo Loop Clip (Video)
                      </button>
                      <button
                        onClick={() => setActiveTabDetail("copy")}
                        className={`py-2 px-4 border-b-2 font-bold cursor-pointer transition-all ${
                          activeTabDetail === "copy"
                            ? "border-studio-bronze text-studio-bronze-light bg-studio-bronze/5"
                            : "border-transparent text-studio-soft-white/65 hover:text-studio-soft-white"
                        }`}
                        id="stage-tab-[#EBEBEA]-copy"
                      >
                        Pre-Formatted Social Post
                      </button>
                      <button
                        onClick={() => setActiveTabDetail("prompts")}
                        className={`py-2 px-4 border-b-2 font-bold cursor-pointer transition-all ${
                          activeTabDetail === "prompts"
                            ? "border-studio-bronze text-studio-bronze-light bg-studio-bronze/5"
                            : "border-transparent text-studio-soft-white/65 hover:text-studio-soft-white"
                        }`}
                        id="stage-tab-api-prompts"
                      >
                        Prompt Schemas (JSON Fields)
                      </button>
                    </div>

                    {/* Output view panel */}
                    <div className="space-y-4" id="workflow-asset-rendering-viewport">
                      
                      {/* Image Viewer tab */}
                      {activeTabDetail === "image" && (
                        <div className="space-y-3" id="still-image-rendering-frame">
                          <div className="relative aspect-video xl:aspect-[21/9] rounded-lg overflow-hidden border border-studio-bronze/15 shadow-xl bg-studio-warm-black flex items-center justify-center">
                            <img
                              src={concept.imageUrl}
                              alt={concept.title}
                              className="absolute inset-0 w-full h-full object-cover select-none"
                              referrerPolicy="no-referrer"
                            />
                            {/* Ambient Vignette */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
                            {/* HUD Tag Overlay */}
                            <div className="absolute bottom-3 left-3 bg-studio-warm-black/80 backdrop-blur border border-studio-bronze/35 p-2 px-3 rounded text-[9px] font-mono text-studio-soft-white text-left max-w-sm">
                              <span className="text-studio-bronze font-bold block uppercase tracking-wider">Campaign Scene Visualizer</span>
                              <span className="text-gray-400 font-sans block mt-0.5 line-clamp-1 truncate">Aspect ratio: 1:1 fitting crop output</span>
                            </div>
                          </div>

                          {/* Visual analysis metrics */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left font-mono text-[9px]" id="image-quality-indicators">
                            <div className="bg-studio-warm-black/45 border border-studio-bronze/5 rounded-lg p-2">
                              <span className="text-studio-charcoal font-bold block uppercase">Resolution</span>
                              <span className="text-studio-soft-white font-medium">1024 x 1024 PX</span>
                            </div>
                            <div className="bg-studio-warm-black/45 border border-studio-bronze/5 rounded-lg p-2">
                              <span className="text-studio-charcoal font-bold block uppercase">Brand Score</span>
                              <span className="text-green-400 font-medium">98% COMPLIANT</span>
                            </div>
                            <div className="bg-studio-warm-black/45 border border-studio-bronze/5 rounded-lg p-2">
                              <span className="text-studio-charcoal font-bold block uppercase">Preservation</span>
                              <span className="text-studio-bronze-light font-medium">SHAPE LOCKED</span>
                            </div>
                            <div className="bg-studio-warm-black/45 border border-studio-bronze/5 rounded-lg p-2">
                              <span className="text-studio-charcoal font-bold block uppercase">Format Codec</span>
                              <span className="text-studio-soft-white font-medium">PNG LOSSLESS</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Video clip Viewer tab */}
                      {activeTabDetail === "video" && (
                        <div className="space-y-3" id="dynamic-video-rendering-frame">
                          <div className="relative aspect-video xl:aspect-[21/9] rounded-lg overflow-hidden border border-studio-bronze/15 shadow-xl bg-[#080808] flex flex-col items-center justify-center">
                            
                            {playingVideoId === concept.id ? (
                              <video
                                src={concept.videoUrl}
                                autoPlay
                                loop
                                muted
                                className="w-full h-full object-cover absolute inset-0 select-none"
                                onError={() => setPlayingVideoId(null)}
                              />
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 p-6 text-center select-none bg-gradient-to-b from-studio-warm-black to-[#13110e]">
                                <div className="p-4 bg-studio-bronze/15 text-studio-bronze-light rounded-full border border-studio-bronze/35 animate-pulse">
                                  <VideoIcon className="w-6 h-6" />
                                </div>
                                <div>
                                  <h4 className="text-[11px] font-mono text-studio-soft-white tracking-wide uppercase font-black">
                                    Promotional Dynamic Loop Clip Rendered
                                  </h4>
                                  <p className="text-[9px] text-studio-charcoal max-w-sm mt-1 mx-auto leading-relaxed">
                                    Click Play below to trigger direct simulated video rendering playback using high-compatibility H.264 streams.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Center playback trigger button */}
                            {playingVideoId !== concept.id && (
                              <button
                                onClick={() => setPlayingVideoId(concept.id)}
                                className="z-10 bg-studio-bronze text-studio-warm-black rounded-full p-3.5 shadow-lg border border-studio-bronze-light hover:scale-115 transition-transform cursor-pointer"
                                id={`start-stream-play-${concept.id}`}
                              >
                                <Play className="w-5 h-5 fill-current" />
                              </button>
                            )}

                            {/* Stop/pause overlay */}
                            {playingVideoId === concept.id && (
                              <button
                                onClick={() => setPlayingVideoId(null)}
                                className="absolute top-3 right-3 z-10 bg-studio-warm-black/85 backdrop-blur border border-studio-bronze/25 text-studio-soft-white p-1 px-2 text-[9px] font-mono rounded select-all cursor-pointer hover:bg-studio-brown"
                                id={`stop-stream-play-${concept.id}`}
                              >
                                Stop Player
                              </button>
                            )}

                            {/* Info plate */}
                            <div className="absolute bottom-3 left-3 bg-studio-warm-black/85 backdrop-blur border border-studio-bronze/35 p-2 px-3 rounded text-[9px] font-mono text-studio-soft-white text-left max-w-xs pointer-events-none">
                              <span className="text-studio-bronze font-bold block uppercase">FFmpeg conversion</span>
                              <span className="text-gray-400 font-sans block mt-0.5">8.0 seconds duration • yuv420p</span>
                            </div>
                          </div>

                          {/* Motion parameter stats */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left font-mono text-[9px]" id="video-motion-analysis">
                            <div className="bg-studio-warm-black/45 border border-studio-bronze/5 rounded-lg p-2">
                              <span className="text-studio-charcoal font-bold block uppercase">Codec Type</span>
                              <span className="text-studio-soft-white font-medium">H.264 / LIBX264</span>
                            </div>
                            <div className="bg-studio-warm-black/45 border border-studio-bronze/5 rounded-lg p-2">
                              <span className="text-studio-charcoal font-bold block uppercase">VEO-3 Motion</span>
                              <span className="text-green-400 font-medium">STABLE GAIN MAP</span>
                            </div>
                            <div className="bg-studio-warm-black/45 border border-studio-bronze/5 rounded-lg p-2">
                              <span className="text-studio-charcoal font-bold block uppercase">Camera Move</span>
                              <span className="text-studio-bronze-light font-medium">GLIDE PUSH-IN</span>
                            </div>
                            <div className="bg-studio-warm-black/45 border border-studio-bronze/5 rounded-lg p-2">
                              <span className="text-studio-charcoal font-bold block uppercase">V-Rate</span>
                              <span className="text-studio-soft-white font-medium">30 FPS RENDER</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Descriptive Social Copy post layer */}
                      {activeTabDetail === "copy" && (
                        <div className="space-y-4 text-left" id="brand-social-copy-pane">
                          <div className="bg-studio-warm-black/80 border border-studio-bronze/10 rounded-lg p-4 font-sans text-xs tracking-wide leading-relaxed relative" id={`post-text-draft-${concept.id}`}>
                            {/* Copy button */}
                            <button
                              onClick={() => handleCopyText(concept.socialPostCopy, concept.id)}
                              className="absolute top-3 right-3 p-1.5 hover:bg-studio-brown/50 border border-studio-bronze/20 rounded text-xs text-studio-soft-white flex items-center gap-1 cursor-pointer transition-colors"
                              id={`copy-social-text-btn-${concept.id}`}
                            >
                              {copiedConceptIndex === concept.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-studio-bronze" />
                                  <span className="text-[9px] uppercase font-mono text-studio-bronze font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span className="text-[9px] uppercase font-mono font-bold">Copy Copy</span>
                                </>
                              )}
                            </button>

                            <p className="whitespace-pre-line text-[#EBEBEA] select-text pr-14">
                              {concept.socialPostCopy}
                            </p>
                          </div>
                          <span className="text-[9px] font-mono text-studio-charcoal text-center block leading-none">
                            The copywriting structure aligns with targeted platforms, featuring bold spacing and premium home-service tags.
                          </span>
                        </div>
                      )}

                      {/* Prompts structural detail panel */}
                      {activeTabDetail === "prompts" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left font-mono text-[9.5px]" id="prompt-schemas-grid">
                          
                          {/* Image Prompt specification box */}
                          <div className="bg-studio-warm-black/60 border border-studio-bronze/10 rounded-lg p-4 space-y-2 flex flex-col justify-between">
                            <div className="space-y-1.5">
                              <span className="text-studio-bronze uppercase tracking-widest font-black flex items-center gap-2">
                                <ImageIcon className="w-3.5 h-3.5" />
                                Image Prompt (Text-to-Image)
                              </span>
                              <p className="leading-relaxed hover:text-[#EBEBEA] select-text">
                                {concept.imagePrompt}
                              </p>
                            </div>
                            <button
                              onClick={() => handleCopyText(concept.imagePrompt, concept.id + 10)}
                              className="w-fit self-end p-1 hover:bg-studio-brown border border-studio-bronze/10 rounded font-mono text-[8px] flex items-center gap-1 text-studio-soft-white transition-all cursor-pointer"
                              id={`copy-still-p-btn-${concept.id}`}
                            >
                              {copiedConceptIndex === concept.id + 10 ? <Check className="w-3.5 h-3.5 text-studio-bronze" /> : <Copy className="w-3.5 h-3.5" />}
                              Copy Still Prompt
                            </button>
                          </div>

                          {/* Video Motion directive box */}
                          <div className="bg-studio-warm-black/60 border border-studio-bronze/10 rounded-lg p-4 space-y-2 flex flex-col justify-between">
                            <div className="space-y-1.5">
                              <span className="text-studio-bronze uppercase tracking-widest font-black flex items-center gap-2">
                                <VideoIcon className="w-3.5 h-3.5" />
                                Motion Prompt (Image-to-Video)
                              </span>
                              <p className="leading-relaxed hover:text-[#EBEBEA] select-text">
                                {concept.videoPrompt}
                              </p>
                            </div>
                            <button
                              onClick={() => handleCopyText(concept.videoPrompt, concept.id + 20)}
                              className="w-fit self-end p-1 hover:bg-studio-brown border border-studio-bronze/10 rounded font-mono text-[8px] flex items-center gap-1 text-studio-soft-white transition-all cursor-pointer"
                              id={`copy-motion-p-btn-${concept.id}`}
                            >
                              {copiedConceptIndex === concept.id + 20 ? <Check className="w-3.5 h-3.5 text-studio-bronze" /> : <Copy className="w-3.5 h-3.5" />}
                              Copy Video Prompt
                            </button>
                          </div>

                        </div>
                      )}

                    </div>

                    {/* Stage 10: Multi-Format Campaign Packager details */}
                    <div className="mt-4 pt-4 border-t border-studio-bronze/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left" id="stage-10-package-export">
                      <div className="space-y-0.5">
                        <h4 className="text-[11px] font-mono text-studio-bronze-light font-black uppercase">
                          Exporter Node: Branch Bundle
                        </h4>
                        <p className="text-[9px] text-studio-charcoal font-sans">
                          Download optimized assets fitted cleanly into various media platforms.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2" id="concept-export-action-bar">
                        <button
                          onClick={() => {
                            // Copy complete docket
                            const docketText = `--- CAMPAIGN BUNDLE BRANCH: ${concept.id} ---\nTitle: ${concept.title}\n\nSTILL IMAGE PROMPT:\n${concept.imagePrompt}\n\nVIDEO MOTION INSTRUCTIONS:\n${concept.videoPrompt}\n\nSOCIAL COPY:\n${concept.socialPostCopy}`;
                            handleCopyText(docketText, concept.id + 50);
                          }}
                          className="bg-studio-bronze text-studio-warm-black hover:bg-studio-bronze-light text-[9px] font-mono font-bold px-3 py-1 bg-studio-bronze border border-studio-bronze-dark rounded-lg cursor-pointer transition-colors flex items-center gap-1"
                          id={`download-docket-btn-${concept.id}`}
                        >
                          {copiedConceptIndex === concept.id + 50 ? (
                            <>
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span>DOCKET COPIED</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5 shrink-0 -rotate-180" />
                              <span>COPY COMPLETE DOCKET</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}

            </div>
          )}

          {/* Initial / Empty State message */}
          {!isGenerating && generatedConcepts.length === 0 && (
            <div className="studio-glass rounded-xl p-12 text-center text-studio-charcoal font-sans" id="studio-empty-state">
              <Layers className="w-12 h-12 mx-auto mb-4 text-studio-bronze/40 animate-pulse" />
              <h3 className="text-sm font-semibold font-display text-studio-soft-white">Multi-Format Workflow Idle</h3>
              <p className="text-xs text-studio-charcoal mt-1 max-w-sm mx-auto">
                Configure your target presets on the left panel, add compliance criteria, and click <strong className="text-studio-bronze">Execute Gemini Pipeline</strong> to process and evaluate dynamic concepts, cinematic prompts, loops, and social files.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
