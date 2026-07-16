import React, { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { api } from "../lib/api";

/**
 * Small "✨ AI suggest" button anchored next to a prompt input.
 * - Improves the current text into a richer, more cinematic / specific version
 *   tuned for the given `kind` ("image" | "video" | "caption" | "scene" | "text").
 * - If `mode === "rewrite"` (default) replaces the text. If `mode === "expand"`
 *   keeps the input and appends.
 */
export default function PromptSuggest({
  current, onSuggest, kind = "image", mode = "rewrite", brief, className,
}: {
  current: string;
  onSuggest: (next: string) => void;
  kind?: "image" | "video" | "caption" | "scene" | "text" | "shotlist";
  mode?: "rewrite" | "expand";
  brief?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    try {
      const sys = SYS_PROMPTS[kind] ?? SYS_PROMPTS.text;
      const user = `CURRENT INPUT:\n${current || "(empty)"}\n\n${brief ? `OVERALL BRIEF:\n${brief}\n\n` : ""}TASK: ${mode === "expand" ? "Expand and improve the input — keep its intent, add cinematic specificity, return only the new prompt." : "Rewrite the input to be more vivid, specific, and production-ready for the named generation model. Return only the rewritten prompt."}`;
      const res = await api.chat({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        max_tokens: 800,
      });
      const cleaned = (res.content || "").trim().replace(/^["']|["']$/g, "");
      if (cleaned) onSuggest(mode === "expand" && current ? `${current} ${cleaned}` : cleaned);
    } catch {} finally { setBusy(false); }
  };
  return (
    <button
      type="button" onClick={click} disabled={busy}
      title="AI suggest"
      className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-studio-bronze/30 text-studio-bronze hover:bg-studio-bronze/10 disabled:opacity-50 ${className ?? ""}`}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
      <span>{busy ? "thinking…" : "AI"}</span>
    </button>
  );
}

const SYS_PROMPTS: Record<string, string> = {
  image: "You craft prompts for state-of-the-art T2I models (gpt-image-2, FLUX, Ideogram). Push for: clear subject, lens choice (35mm/85mm/macro/anamorphic), lighting type (golden hour, hard top, rim), composition (rule of thirds, leading lines), color palette (4-6 colors), grain/film stock. 35-60 words, no preamble. No headers. No quotes.",
  video: "You craft prompts for T2V / I2V models (Veo, Kling, Seedance, Wan). Push for: motion direction (push-in, pan-left, orbit), camera intent (handheld, drone, gimbal), action verbs, atmospheric notes, optional duration cues. 30-50 words, no preamble. Avoid copyrighted characters or brands. No headers. No quotes.",
  caption: "You craft cinematic, brand-on-voice social captions. Keep under 280 characters where possible. End with 4-7 tasteful hashtags inline (no emoji unless tone-appropriate). No preamble.",
  scene: "You plan one scene of a multi-scene piece. Return a vivid scene description with subject, action, lens, light, palette, continuity tokens. 40-70 words. No preamble.",
  shotlist: "You plan a multi-scene shotlist. Return 4-6 scenes, each with: title, image prompt (keyframe), video prompt (motion), continuity tokens. Format: '1) TITLE — image: ... — video: ... — continuity: ...' per line. No preamble.",
  text: "You improve creative copy. Make it more specific, vivid, and on-brand. Return only the rewritten text, no preamble.",
};
