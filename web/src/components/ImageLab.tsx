import React, { useState } from "react";
import { Image as ImageIcon, Sparkles, Loader2, Plus, X, Download, FolderOpen, Layers } from "lucide-react";
import { api } from "../lib/api";
import MediaPicker from "./MediaPicker";
import { useJobs } from "../lib/use-jobs";
import PromptSuggest from "./PromptSuggest";

// Workers-AI-powered image generation tab. Talks to /api/images/generate which
// runs openai/gpt-image-2 (or gpt-image-1.5 for transparent PNGs) via the
// env.AI binding and mirrors results into R2.

type Quality = "low" | "medium" | "high" | "auto";
type Size = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
type Format = "png" | "webp" | "jpeg";
type Background = "transparent" | "opaque" | "auto";

interface Result {
  id: string;
  model: string;
  publicUrl: string;
  bytes: number;
  promptUsed: string;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

export default function ImageLab() {
  const jobsCtx = useJobs();
  const [prompt, setPrompt] = useState("A golden retriever puppy playing in autumn leaves, soft golden hour light, shallow depth of field");
  const [quality, setQuality] = useState<Quality>("high");
  const [size, setSize] = useState<Size>("1024x1024");
  const [format, setFormat] = useState<Format>("png");
  const [background, setBackground] = useState<Background>("auto");
  const [refs, setRefs] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchPrompts, setBatchPrompts] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);

  const submitBatch = async () => {
    const lines = batchPrompts.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setBusy(true); setErr(null);
    const bid = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setBatchId(bid);
    try {
      const settled = await Promise.allSettled(
        lines.map((p) => api.generateImage({
          prompt: p,
          quality, size, output_format: format, background,
          images: refs.length > 0 ? refs.map((r) => r.dataUrl) : undefined,
        }))
      );
      const successes = settled
        .map((s, i) => s.status === "fulfilled" ? { ...(s.value as any), promptUsed: lines[i] } : null)
        .filter(Boolean) as Result[];
      if (successes.length > 0) setResults((prev) => [...successes, ...prev]);
      const failed = settled.filter((s) => s.status === "rejected").length;
      if (failed > 0) setErr(`${failed}/${lines.length} prompts failed`);
    } finally {
      setBusy(false);
    }
  };

  const addRefs = async (files: FileList | null) => {
    if (!files) return;
    const next = [...refs];
    for (const f of Array.from(files)) {
      if (next.length >= 16) break;
      const dataUrl = await fileToDataUrl(f);
      next.push({ name: f.name, dataUrl });
    }
    setRefs(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await api.generateImage({
        prompt: prompt.trim(),
        quality, size, output_format: format,
        background,
        images: refs.length > 0 ? refs.map((r) => r.dataUrl) : undefined,
      });
      setResults((prev) => [{ ...res, promptUsed: prompt.trim() }, ...prev]);
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? "generation failed");
    } finally {
      setBusy(false);
    }
  };

  const transparent = background === "transparent";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> Image Lab
        </h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Direct to <code className="text-studio-bronze">openai/gpt-image-2</code> via Cloudflare Workers AI.
          Transparent backgrounds auto-route to <code className="text-studio-bronze">openai/gpt-image-1.5</code>.
          Outputs are saved straight to R2 + visible in Media Library.
        </p>
      </div>

      <form onSubmit={submit} className="studio-glass-glow rounded-lg p-4 space-y-4">
        <div className="relative">
          <textarea
            rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image…"
            className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm pr-16"
          />
          <div className="absolute top-2 right-2"><PromptSuggest current={prompt} onSuggest={setPrompt} kind="image" /></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <label className="space-y-1">
            <div className="font-mono uppercase text-studio-soft-white/50">Quality</div>
            <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}
                    className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="auto">auto</option>
            </select>
          </label>
          <label className="space-y-1">
            <div className="font-mono uppercase text-studio-soft-white/50">Size</div>
            <select value={size} onChange={(e) => setSize(e.target.value as Size)}
                    className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
              <option value="1024x1024">1024×1024 (square)</option>
              <option value="1024x1536">1024×1536 (portrait)</option>
              <option value="1536x1024">1536×1024 (landscape)</option>
              <option value="auto">auto</option>
            </select>
          </label>
          <label className="space-y-1">
            <div className="font-mono uppercase text-studio-soft-white/50">Format</div>
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)}
                    className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
              <option value="jpeg">JPEG</option>
            </select>
          </label>
          <label className="space-y-1">
            <div className="font-mono uppercase text-studio-soft-white/50">Background</div>
            <select value={background} onChange={(e) => setBackground(e.target.value as Background)}
                    className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5">
              <option value="auto">auto</option>
              <option value="opaque">opaque</option>
              <option value="transparent">transparent (gpt-image-1.5)</option>
            </select>
          </label>
        </div>

        {transparent && format !== "png" && (
          <div className="text-[11px] text-yellow-300/80">
            ⚠ Transparent background requires PNG. Switch format above or the API will reject.
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-mono uppercase text-[11px] text-studio-soft-white/50">
              Reference Images <span className="text-studio-soft-white/30">({refs.length}/16, optional — enables edit mode)</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <button
                type="button" onClick={() => setPickerOpen(true)}
                className="text-studio-bronze hover:underline flex items-center gap-1"
              >
                <FolderOpen className="w-3 h-3" /> Pick from library
              </button>
              <label className="cursor-pointer text-studio-bronze hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Upload
                <input
                  type="file" hidden accept="image/png,image/jpeg,image/webp" multiple
                  onChange={(e) => { addRefs(e.target.files); e.target.value = ""; }}
                />
              </label>
            </div>
          </div>
          {refs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {refs.map((r, i) => (
                <div key={i} className="relative w-16 h-16 rounded overflow-hidden border border-studio-bronze/20">
                  <img src={r.dataUrl} alt={r.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setRefs(refs.filter((_, j) => j !== i))}
                    className="absolute top-0 right-0 bg-studio-warm-black/80 text-red-300 p-0.5"
                    title="remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {err && (
          <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-xs text-red-300">{err}</div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit" disabled={busy || !prompt.trim()}
            className="flex items-center gap-2 bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 py-2 rounded disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? "generating…" : refs.length > 0 ? `Edit (${refs.length} ref)` : "Generate"}
          </button>
          <button type="button" onClick={() => setBatchOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-studio-bronze hover:underline">
            <Layers className="w-3 h-3" /> {batchOpen ? "hide batch" : "batch mode"}
          </button>
        </div>
        {batchOpen && (
          <div className="pt-3 border-t border-studio-bronze/15 space-y-2">
            <div className="font-mono uppercase text-[10px] text-studio-soft-white/50">Batch prompts — one per line, all run with current settings</div>
            <textarea rows={5} value={batchPrompts}
              onChange={(e) => setBatchPrompts(e.target.value)}
              placeholder={"A neon Tokyo alley at midnight, rain on asphalt, anamorphic\nClose-up macro of a coffee bloom, slow steam curl\nIsometric tiny island chain over teal ocean"}
              className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm font-mono" />
            <button type="button" onClick={submitBatch} disabled={busy || !batchPrompts.trim()}
              className="flex items-center gap-2 bg-studio-bronze/15 hover:bg-studio-bronze/25 border border-studio-bronze/40 rounded px-3 py-1.5 text-studio-bronze text-xs disabled:opacity-50">
              <Sparkles className="w-3 h-3" /> Generate batch ({batchPrompts.split("\n").filter((s) => s.trim()).length})
            </button>
            {batchId && (
              <div className="text-[11px] text-studio-soft-white/60">
                Batch <span className="font-mono text-studio-bronze">{batchId}</span> · {jobsCtx.byBatch(batchId).filter((j) => j.status === "succeeded").length}/{jobsCtx.byBatch(batchId).length} jobs done
              </div>
            )}
          </div>
        )}
      </form>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        filter="image"
        multi
        onPick={async (selected) => {
          // Fetch each via the worker proxy and convert to data URLs.
          const next = [...refs];
          for (const m of selected) {
            try {
              const blob = await (await fetch(m.public_url)).blob();
              const dataUrl: string = await new Promise((res, rej) => {
                const fr = new FileReader();
                fr.onload = () => res(String(fr.result));
                fr.onerror = rej;
                fr.readAsDataURL(blob);
              });
              if (next.length >= 16) break;
              next.push({ name: m.r2_key.split("/").pop() ?? "media", dataUrl });
            } catch {}
          }
          setRefs(next);
        }}
      />

      {results.length > 0 && (
        <div>
          <div className="text-xs font-mono uppercase text-studio-bronze mb-2">Recent generations</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.map((r) => (
              <div key={r.id} className="studio-glass rounded-lg overflow-hidden">
                <img src={r.publicUrl} alt="" className="w-full bg-studio-warm-black" loading="lazy" />
                <div className="p-3 text-[11px] space-y-1">
                  <div className="font-mono text-studio-bronze">{r.model}</div>
                  <div className="text-studio-soft-white/70 line-clamp-2" title={r.promptUsed}>
                    {r.promptUsed}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-studio-soft-white/40">{(r.bytes / 1024).toFixed(0)} KB</span>
                    <a href={r.publicUrl} target="_blank" rel="noreferrer"
                       className="flex items-center gap-1 text-studio-bronze hover:underline">
                      <Download className="w-3 h-3" /> open
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
