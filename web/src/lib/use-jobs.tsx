import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, subscribeJobEvents, type GenerationJob } from "./api";

// Background generation job feed for the whole app. Mounts once at the
// AppProvider level; both the global Jobs widget and per-tab consumers
// (Video Lab, Image Lab, Scene Composer) read off the same merged state.
//
// Strategy: SSE primary (server-pushed deltas), poll fallback every 6s as
// a belt-and-suspenders for flaky connections + cold-start sync.

interface JobsState {
  jobs: GenerationJob[];
  refresh: () => Promise<void>;
  cancel: (id: string) => void;        // marks locally canceled; backend cancel not implemented yet
  byBatch: (batchId: string) => GenerationJob[];
  byScene: (sceneId: string) => GenerationJob | undefined;
  byComposition: (compositionId: string) => GenerationJob[];
  byPrediction: (predictionId: string) => GenerationJob | undefined;
  liveCount: number;
}

const Ctx = createContext<JobsState | null>(null);

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const sinceRef = useRef(0);

  const refresh = useMemo(() => async () => {
    try {
      const { jobs: rows } = await api.listJobs({ limit: 200 });
      setJobs(rows);
      sinceRef.current = Math.max(...rows.map((r) => r.updated_at), Math.floor(Date.now() / 1000));
    } catch { /* swallow — next poll will retry */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh();
    const closeSSE = subscribeJobEvents((evt) => {
      if (cancelled) return;
      // Upsert by id; SSE event omits some fields that listJobs returns —
      // patch into the existing row when present so we don't lose data.
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === evt.id);
        const incoming: GenerationJob = {
          ...(prev[idx] ?? ({} as any)),
          ...(evt as any),
        };
        if (idx === -1) return [incoming, ...prev].slice(0, 300);
        const next = [...prev];
        next[idx] = incoming;
        return next;
      });
      sinceRef.current = Math.max(sinceRef.current, evt.updated_at ?? Math.floor(Date.now() / 1000));
    });

    // Poll fallback. Cheap query — server bounds rows + indexes on user_id.
    const pollMs = 6000;
    const handle = setInterval(async () => {
      if (cancelled) return;
      try {
        const { jobs: rows } = await api.listJobs({ since: sinceRef.current, limit: 100 });
        if (rows.length === 0) return;
        setJobs((prev) => {
          const map = new Map(prev.map((j) => [j.id, j]));
          for (const r of rows) map.set(r.id, { ...(map.get(r.id) ?? r), ...r });
          return Array.from(map.values()).sort((a, b) => b.updated_at - a.updated_at);
        });
        sinceRef.current = Math.max(sinceRef.current, ...rows.map((r) => r.updated_at));
      } catch { /* keep going */ }
    }, pollMs);

    return () => { cancelled = true; clearInterval(handle); closeSSE(); };
  }, [refresh]);

  const state = useMemo<JobsState>(() => ({
    jobs,
    refresh,
    cancel: (id: string) => setJobs((p) => p.map((j) => (j.id === id ? { ...j, status: "canceled" } : j))),
    byBatch: (batchId) => jobs.filter((j) => j.batch_id === batchId),
    byScene: (sceneId) => jobs.find((j) => j.scene_id === sceneId),
    byComposition: (compositionId) => jobs.filter((j) => j.composition_id === compositionId),
    byPrediction: (predictionId) => jobs.find((j) => j.prediction_id === predictionId),
    liveCount: jobs.filter((j) => j.status === "queued" || j.status === "processing").length,
  }), [jobs, refresh]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useJobs(): JobsState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useJobs must be inside <JobsProvider>");
  return v;
}
