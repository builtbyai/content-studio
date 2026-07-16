import React, { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Film, Image as ImageIcon, X, Clock, Activity, Ban } from "lucide-react";
import { useJobs } from "../lib/use-jobs";
import { api } from "../lib/api";
import { motion, AnimatePresence } from "motion/react";

// Global background-jobs widget. Mounted in the AppBar — appears whenever the
// user has in-flight or recently-finished generations across any tab.

export default function JobsWidget() {
  const { jobs, liveCount } = useJobs();
  const [open, setOpen] = useState(false);

  const recent = jobs.slice(0, 25);
  const hasError = recent.some((j) => j.status === "failed");
  const hasLive = liveCount > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Background jobs"
        className="relative flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-studio-border bg-studio-surface-1/60 hover:bg-studio-surface-2"
      >
        {hasLive ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-studio-bronze" />
        ) : hasError ? (
          <AlertCircle className="w-3.5 h-3.5 text-red-300" />
        ) : (
          <Activity className="w-3.5 h-3.5 text-studio-soft-white/60" />
        )}
        <span className="hidden md:inline">Jobs</span>
        {liveCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-studio-bronze text-studio-warm-black font-bold text-[10px]">
            {liveCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 w-[380px] max-h-[480px] overflow-y-auto rounded-lg border border-studio-border bg-studio-surface-0 shadow-2xl z-50"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-studio-border">
              <div className="text-xs font-display font-bold">Background jobs</div>
              <button onClick={() => setOpen(false)} className="text-studio-soft-white/60 hover:text-studio-bronze">
                <X className="w-3 h-3" />
              </button>
            </div>
            {recent.length === 0 ? (
              <div className="px-3 py-6 text-xs text-studio-soft-white/50 text-center">
                No jobs yet. Generations from Video Lab, Image Lab, Scene Composer, and Workflow Composer show up here.
              </div>
            ) : (
              <ul className="divide-y divide-studio-border">
                {recent.map((j) => (
                  <li key={j.id} className="px-3 py-2 text-xs flex items-center gap-2">
                    <JobIcon kind={j.kind} status={j.status} />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-studio-bronze truncate">{j.model}</div>
                      <div className="text-studio-soft-white/70 truncate">{j.prompt ?? <em>(no prompt)</em>}</div>
                      {j.error && <div className="text-red-300/80 text-[10px] truncate" title={j.error}>{j.error}</div>}
                    </div>
                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-0.5">
                      <StatusBadge status={j.status} />
                      {j.output_url && j.status === "succeeded" && (
                        <a
                          href={j.output_url} target="_blank" rel="noreferrer"
                          className="text-studio-bronze hover:underline text-[10px]"
                        >
                          open
                        </a>
                      )}
                      {(j.status === "queued" || j.status === "processing") && (
                        <button
                          onClick={() => api.cancelJob(j.id).catch(() => {})}
                          title="Cancel"
                          className="text-red-300/80 hover:text-red-200 text-[10px] flex items-center gap-0.5"
                        >
                          <Ban className="w-2.5 h-2.5" /> cancel
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function JobIcon({ kind, status }: { kind: string; status: string }) {
  if (status === "queued" || status === "processing") {
    return <Loader2 className="w-3.5 h-3.5 animate-spin text-studio-bronze flex-shrink-0" />;
  }
  if (status === "failed") return <AlertCircle className="w-3.5 h-3.5 text-red-300 flex-shrink-0" />;
  if (status === "canceled") return <X className="w-3.5 h-3.5 text-studio-soft-white/50 flex-shrink-0" />;
  if (kind === "video") return <Film className="w-3.5 h-3.5 text-studio-bronze flex-shrink-0" />;
  if (kind === "image") return <ImageIcon className="w-3.5 h-3.5 text-studio-bronze flex-shrink-0" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    queued:     { label: "queued",     cls: "text-studio-soft-white/50" },
    processing: { label: "running",    cls: "text-studio-bronze" },
    succeeded:  { label: "done",       cls: "text-emerald-400" },
    failed:     { label: "failed",     cls: "text-red-300" },
    canceled:   { label: "canceled",   cls: "text-studio-soft-white/40" },
  };
  const e = map[status] ?? { label: status, cls: "text-studio-soft-white/60" };
  return <span className={`text-[10px] font-mono ${e.cls}`}>{e.label}</span>;
}
