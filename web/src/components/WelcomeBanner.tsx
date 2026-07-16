import React, { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

const KEY = "contentforge:welcome-dismissed-v2";

export default function WelcomeBanner({ onGoToGenerations }: { onGoToGenerations: () => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { setShow(!localStorage.getItem(KEY)); } catch { setShow(true); }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setShow(false);
  };

  return (
    <div className="mb-4 studio-card-raised p-3 flex items-center gap-3 studio-fade-in">
      <div className="w-8 h-8 rounded-lg bg-studio-bronze-soft border border-studio-border-accent flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-studio-bronze" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">All 26 nodes live · OpenAI gpt-image-2 wired</div>
        <div className="text-xs text-studio-text-muted mt-0.5">
          Fastest end-to-end demo: <strong className="text-studio-text">Studio › Generate</strong> — type a brief, hit Generate, watch real images stream in via SSE.
        </div>
      </div>
      <button
        onClick={() => { dismiss(); onGoToGenerations(); }}
        className="studio-btn-primary text-xs px-3 py-1.5 rounded-lg hidden sm:inline-flex items-center gap-1.5"
      >
        Try it
      </button>
      <button onClick={dismiss} className="text-studio-text-subtle hover:text-studio-text p-1.5" title="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
