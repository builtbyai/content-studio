import React, { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2, Loader2, FileVideo, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { api, type MediaItem } from "../lib/api";
import MediaThumb from "./MediaThumb";

interface UploadJob {
  id: string;        // local-only
  file: File;
  status: "queued" | "uploading" | "done" | "failed";
  progressPct?: number;
  error?: string;
  publicUrl?: string;
}

const MAX_CONCURRENCY = 3;

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(0);
  const queueRef = useRef<UploadJob[]>([]);

  const refresh = async () => {
    try {
      const { media } = await api.listMedia();
      setItems(media);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const drain = useCallback(async () => {
    while (runningRef.current < MAX_CONCURRENCY && queueRef.current.length > 0) {
      const job = queueRef.current.shift()!;
      runningRef.current++;
      setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: "uploading" } : j));
      (async () => {
        try {
          const r = await api.uploadMedia(job.file);
          setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: "done", publicUrl: r.publicUrl } : j));
          setItems((prev) => [
            {
              id: r.id, user_id: "", r2_key: r.r2Key,
              mime: job.file.type || "application/octet-stream", bytes: r.bytes,
              source: "upload", original_url: null, public_url: r.publicUrl,
              created_at: Math.floor(Date.now() / 1000),
            },
            ...prev,
          ]);
        } catch (e: any) {
          setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: "failed", error: e?.body?.message ?? "failed" } : j));
        } finally {
          runningRef.current--;
          drain();
        }
      })();
    }
  }, []);

  const enqueueFiles = useCallback((files: File[] | FileList) => {
    setErr(null);
    const list = Array.from(files);
    if (list.length === 0) return;
    const newJobs: UploadJob[] = list.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "queued",
    }));
    setJobs((prev) => [...prev, ...newJobs]);
    queueRef.current.push(...newJobs);
    drain();
  }, [drain]);

  const remove = async (id: string) => {
    if (!confirm("Delete this asset? Any post referencing it will lose its media.")) return;
    await api.deleteMedia(id);
    setItems((prev) => prev.filter((m) => m.id !== id));
  };

  const clearFinished = () => setJobs((prev) => prev.filter((j) => j.status === "queued" || j.status === "uploading"));

  // Drag-drop handlers
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) enqueueFiles(e.dataTransfer.files);
  };

  const activeCount = jobs.filter((j) => j.status === "uploading" || j.status === "queued").length;
  const doneCount = jobs.filter((j) => j.status === "done").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <div
      className="space-y-4"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold">Media Library</h2>
          <p className="text-xs text-studio-soft-white/60 mt-1">
            Drag-and-drop unlimited images/videos. Server-proxied to R2. Picker available in Studio, Image Lab, and Scheduler.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef} type="file" accept="image/*,video/*" hidden multiple
            onChange={(e) => { if (e.target.files) enqueueFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 text-xs bg-studio-bronze text-studio-warm-black font-semibold px-3 py-1.5 rounded"
          >
            <Upload className="w-3.5 h-3.5" /> Upload many
          </button>
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center text-xs transition-colors ${
          dragOver ? "border-studio-bronze bg-studio-bronze/10" : "border-studio-bronze/20 bg-studio-brown/20"
        }`}
        onClick={() => fileRef.current?.click()}
        style={{ cursor: "pointer" }}
      >
        <div className="text-studio-soft-white/70">
          <Upload className="w-5 h-5 mx-auto mb-2 text-studio-bronze" />
          <strong>Drop files here</strong> or click to pick. Supports bulk uploads of any size.
        </div>
      </div>

      {err && (
        <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-xs text-red-300">{err}</div>
      )}

      {jobs.length > 0 && (
        <div className="studio-glass rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono">
              {activeCount > 0 && <span className="text-studio-bronze">{activeCount} active · </span>}
              <span className="text-green-400">{doneCount} done</span>
              {failedCount > 0 && <span className="text-red-400"> · {failedCount} failed</span>}
            </span>
            <button onClick={clearFinished} className="text-studio-soft-white/40 hover:text-studio-soft-white">clear finished</button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-2 text-xs">
                {j.status === "queued" && <Loader2 className="w-3 h-3 text-studio-soft-white/40" />}
                {j.status === "uploading" && <Loader2 className="w-3 h-3 animate-spin text-studio-bronze" />}
                {j.status === "done" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                {j.status === "failed" && <XCircle className="w-3 h-3 text-red-400" />}
                <span className="flex-1 truncate" title={j.file.name}>{j.file.name}</span>
                <span className="text-studio-soft-white/40 font-mono text-[10px]">
                  {(j.file.size / 1024).toFixed(0)} KB
                </span>
                {j.error && <span className="text-red-400 text-[10px]">{j.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-studio-soft-white/60 text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> loading…
        </div>
      ) : items.length === 0 && jobs.length === 0 ? (
        <div className="studio-glass rounded-lg p-8 text-center text-sm text-studio-soft-white/60">
          No assets yet. Drop files above or generate one in Image Lab.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((m) => {
            return (
              <div key={m.id} className="studio-glass rounded-lg overflow-hidden flex flex-col">
                <div className="aspect-square bg-studio-warm-black/60 relative">
                  <MediaThumb url={m.public_url} mime={m.mime} alt={m.source} />
                </div>
                <div className="p-2 text-[10px] font-mono">
                  <div className="truncate text-studio-soft-white/70" title={m.r2_key}>{m.source}</div>
                  <div className="text-studio-soft-white/40">
                    {m.bytes ? (m.bytes / 1024).toFixed(0) + " KB" : "—"}
                  </div>
                  <div className="flex justify-between mt-1">
                    <a href={m.public_url} target="_blank" rel="noreferrer" className="text-studio-bronze hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> open
                    </a>
                    <button onClick={() => remove(m.id)} className="text-studio-soft-white/40 hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
