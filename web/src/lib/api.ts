// Single thin Worker client. All new endpoints flow through here so we don't
// litter components with fetch boilerplate. The existing components in /api/generate-*
// continue to use raw fetch — same origin, no headers required.

export interface ApiError {
  status: number;
  body: unknown;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err: ApiError = { status: res.status, body };
    throw err;
  }
  return body as T;
}

export interface AuthUser { id: string; email: string; role: string }
export interface Channel {
  id: string;
  user_id: string;
  platform: string;
  postiz_integration_id: string;
  display_name: string;
  status: string;
  last_synced_at: number;
}
export interface Schedule {
  id: string;
  user_id: string;
  draft_id: string | null;
  channel_id: string;
  postiz_post_id: string | null;
  scheduled_for: number;
  status: string;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}
// Adapters: D1 snake_case → existing Article/BattlecardItem shapes used by
// ContentHub, Copilot, Battlecards components. Lets the UI keep its current
// data contracts while the backing store moves to D1.
export function adaptArticle(a: ApiArticle): import("../types").Article {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    category: a.category,
    badge: (a.badge as any) ?? "Article",
    readTime: a.read_time ?? "5 min read",
    seoTitle: a.seo_title,
    description: a.description,
    heroAngle: a.hero_angle ?? a.title,
    highlights: (() => { try { return JSON.parse(a.highlights_json) as string[]; } catch { return []; } })(),
    content: a.content,
    sourceUrl: a.source_url ?? undefined,
    ctaText: a.cta_text ?? undefined,
  };
}

export function adaptBattlecard(b: ApiBattlecard): import("../types").BattlecardItem {
  return {
    id: b.id,
    category: (b.category as any) ?? "lead_generation",
    objection: b.objection,
    counterWedge: b.counter_wedge,
    discoveryQuestions: (() => { try { return JSON.parse(b.discovery_questions_json) as string[]; } catch { return []; } })(),
    oneLiner: b.one_liner,
    metrics: (() => { try { return JSON.parse(b.metrics_json) as { label: string; value: string }[]; } catch { return []; } })(),
  };
}

// D1-backed article (snake_case from worker)
export interface ApiArticle {
  id: string;
  tenant_id: string;
  url_sha256: string;
  source_id: string | null;
  source_url: string | null;
  title: string;
  slug: string;
  category: string;
  badge: string;
  read_time: string | null;
  seo_title: string;
  description: string;
  hero_angle: string | null;
  highlights_json: string;
  content: string;
  cta_text: string | null;
  hero_media_id: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface ApiBattlecard {
  id: string;
  tenant_id: string;
  source_id: string | null;
  category: string;
  objection: string;
  counter_wedge: string;
  discovery_questions_json: string;
  one_liner: string;
  metrics_json: string;
  competitor_domain: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface ApiSource {
  id: string;
  tenant_id: string;
  kind: string;
  url: string;
  label: string;
  category: string;
  badge: string;
  is_active: number;
  fail_count: number;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationJob {
  id: string;
  user_id: string;
  kind: "video" | "image" | "text";
  provider: string;
  model: string;
  status: "queued" | "processing" | "succeeded" | "failed" | "canceled";
  prompt: string | null;
  params_json: string;
  prediction_id: string | null;
  output_url: string | null;
  media_id: string | null;
  error: string | null;
  batch_id: string | null;
  scene_id: string | null;
  composition_id: string | null;
  workflow_run_id: string | null;
  source_kind: string | null;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

export interface ScenePlanRow {
  id: string;
  composition_id: string;
  user_id: string;
  idx: number;
  title: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  continuity: string | null;
  duration_sec: number;
  aspect_ratio: string;
  image_media_id: string | null;
  video_media_id: string | null;
  image_provider: string;
  image_model: string;
  video_provider: string;
  video_model: string;
  status: "pending" | "image_building" | "image_ready" | "video_building" | "completed" | "failed";
  meta_json: string;
  created_at: number;
  updated_at: number;
}

export interface MediaItem {
  id: string;
  user_id: string;
  r2_key: string;
  mime: string;
  bytes: number;
  source: string;
  original_url: string | null;
  public_url: string;
  created_at: number;
}

export const api = {
  // Auth
  me: () => jsonFetch<{ user: AuthUser | null }>("/api/auth/me"),
  login: (email: string, password: string) =>
    jsonFetch<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => jsonFetch<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  // Channels
  listChannels: () => jsonFetch<{ channels: Channel[]; warning?: string }>("/api/channels"),
  connectChannel: (platform: string) =>
    jsonFetch<{ url: string }>("/api/channels/connect", {
      method: "POST",
      body: JSON.stringify({ platform }),
    }),

  // Posts / Schedules
  listSchedules: (fromTs: number, toTs: number) =>
    jsonFetch<{ schedules: Schedule[] }>(`/api/posts?from=${fromTs}&to=${toTs}`),
  schedulePost: (input: {
    channelId: string;
    scheduledFor: string; // ISO
    content: string;
    slides?: string[];
    mediaR2Keys?: string[];
    videoDirectives?: string;
    draftKind?: string;
  }) =>
    jsonFetch<{ schedule: Schedule; draft: { id: string } }>("/api/posts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelSchedule: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/posts/${id}`, { method: "DELETE" }),

  // Media
  listMedia: () => jsonFetch<{ media: MediaItem[] }>("/api/media"),
  // Worker-proxied upload — preferred for typical files; no R2 API token required.
  uploadMedia: async (file: File): Promise<{ id: string; publicUrl: string; r2Key: string; bytes: number }> => {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch("/api/media/upload", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const body = await res.json();
    if (!res.ok) throw { status: res.status, body };
    return body;
  },

  presignUpload: (filename: string, contentType: string) =>
    jsonFetch<{ id: string; uploadUrl: string; publicUrl: string; r2Key: string }>(
      "/api/media/upload-url",
      { method: "POST", body: JSON.stringify({ filename, contentType }) }
    ),
  ingestFromUrl: (sourceUrl: string, filename: string, source = "external") =>
    jsonFetch<{ id: string; publicUrl: string; status: "ingesting" }>(
      "/api/media/from-url",
      { method: "POST", body: JSON.stringify({ sourceUrl, filename, source }) }
    ),
  deleteMedia: (id: string) => jsonFetch<{ ok: true }>(`/api/media/${id}`, { method: "DELETE" }),

  // Setup / health
  setupStatus: () => jsonFetch<{
    checks: Record<string, { ok: boolean; detail?: string }>;
    user: AuthUser;
    app: { origin: string; r2PublicBase: string; geminiModel: string };
  }>("/api/setup/status"),

  // Chat completions (via Workers AI binding → AI Gateway → provider)
  chat: (input: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    model?: string;          // default "openai/gpt-4o-mini"
    temperature?: number;
    max_tokens?: number;
  }) =>
    jsonFetch<{ model: string; content: string }>(
      "/api/chat", { method: "POST", body: JSON.stringify(input) }
    ),

  // Image generation
  generateImage: (input: {
    prompt: string;
    quality?: "low" | "medium" | "high" | "auto";
    size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
    output_format?: "png" | "webp" | "jpeg";
    background?: "transparent" | "opaque" | "auto";
    images?: string[];   // up to 16 base64 strings or data: URIs
    model?: "openai/gpt-image-2" | "openai/gpt-image-1.5";
  }) =>
    jsonFetch<{
      id: string; model: string; publicUrl: string; r2Key: string; bytes: number;
    }>("/api/images/generate", { method: "POST", body: JSON.stringify(input) }),

  // Video generation — Replicate-backed, mirrors output to R2 + Media library.
  listVideoModels: () =>
    jsonFetch<{
      hasToken: boolean;
      models: Array<{
        key: string; owner: string; name: string; label: string;
        mediaType: "video" | "image";
        needsImage: boolean; unitPriceUsd: number;
        ui: { aspectRatios?: string[]; durations?: number[]; needsImage?: boolean };
        defaults: Record<string, unknown>;
      }>;
    }>("/api/video/models"),
  generateVideo: (input: {
    modelKey?: string;
    customOwner?: string;
    customName?: string;
    prompt: string;
    promptImage?: string;            // start / intro frame
    promptImageOut?: string;         // end / outro frame
    aspectRatio?: string;
    duration?: number;
    seed?: number;
    resolution?: string;
    negativePrompt?: string;
    extra?: Record<string, unknown>;
    async?: boolean;
  }) =>
    jsonFetch<
      | { id: string; predictionId: string; model: string; mediaType: "video" | "image"; publicUrl: string; r2Key: string; bytes: number; mime: string }
      | { async: true; predictionId: string; status: string; model: string }
    >("/api/video/generate", { method: "POST", body: JSON.stringify(input) }),
  getVideoPrediction: (predictionId: string) =>
    jsonFetch<{
      id: string;
      status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
      output: string | string[] | null;
      error: string | null;
      media: { id: string; publicUrl: string } | null;
    }>(`/api/video/predictions/${encodeURIComponent(predictionId)}`),

  // Background generation jobs (Video Lab, Image Lab, Scene Composer, Workflow Composer all land here)
  listJobs: (opts?: { status?: string; since?: number; limit?: number; batchId?: string; sceneId?: string; compositionId?: string }) => {
    const q = new URLSearchParams();
    if (opts?.status) q.set("status", opts.status);
    if (opts?.since) q.set("since", String(opts.since));
    if (opts?.limit) q.set("limit", String(opts.limit));
    if (opts?.batchId) q.set("batchId", opts.batchId);
    if (opts?.sceneId) q.set("sceneId", opts.sceneId);
    if (opts?.compositionId) q.set("compositionId", opts.compositionId);
    const s = q.toString();
    return jsonFetch<{ jobs: GenerationJob[] }>(`/api/jobs${s ? "?" + s : ""}`);
  },
  getJob: (id: string) => jsonFetch<{ job: GenerationJob }>(`/api/jobs/${encodeURIComponent(id)}`),
  cancelJob: (id: string) =>
    jsonFetch<{ ok: boolean; job?: GenerationJob }>(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  intelSignals: (limit = 60) =>
    jsonFetch<{
      items: Array<{
        id: string; title: string; description: string; source_url: string;
        category: string; badge: string; updated_at: string;
        intel: null | { sentiment: string; angle: string; topic: string; signal: string };
      }>;
    }>(`/api/intel/signals?limit=${limit}`),
  triggerIntelTag: () => jsonFetch<{ ok: true; scanned: number; tagged: number }>("/api/articles/intel-tag", { method: "POST" }),
  seedRoofingSources: () => jsonFetch<{ added: number; skipped: number; total: number }>("/api/sources/seed-roofing", { method: "POST" }),
  spend: () =>
    jsonFetch<{
      asOf: number;
      notice: string;
      inflight: number;
      today: { total: number; byModel: Record<string, { count: number; cost: number; rate: number }> };
      month: { total: number; byModel: Record<string, { count: number; cost: number; rate: number }> };
      allTime: { total: number; byModel: Record<string, { count: number; cost: number; rate: number }> };
    }>("/api/spend"),

  // Generic Replicate generate (upscale, bg-remove, music, etc.).
  listReplicateModels: () =>
    jsonFetch<{
      hasToken: boolean;
      models: Array<{
        key: string; owner: string; name: string; label: string;
        mediaType: "video" | "image"; needsImage: boolean; unitPriceUsd: number;
        ui: { aspectRatios?: string[]; durations?: number[]; needsImage?: boolean };
        defaults: Record<string, unknown>;
      }>;
    }>("/api/replicate/models"),
  replicateGenerate: (input: {
    modelKey?: string; customOwner?: string; customName?: string;
    input: Record<string, unknown>;
    prompt?: string; sourceKind?: string; batchId?: string; compositionId?: string;
  }) =>
    jsonFetch<{
      jobId: string; predictionId: string;
      async?: boolean; status?: string;
      media?: { id: string; publicUrl: string };
    }>("/api/replicate/generate", { method: "POST", body: JSON.stringify(input) }),

  // Scene Composer
  listPlannerModels: () =>
    jsonFetch<{ models: Array<{ id: string; label: string; provider: string }> }>("/api/planner/models"),
  createComposition: (input: {
    brief: string; title?: string; plannerModel?: string;
    count?: number; aspectRatio?: string; durationPreference?: number; styleHints?: string;
  }) => jsonFetch<{
    compositionId: string; title: string; styleSummary: string;
    scenes: ScenePlanRow[]; warnings: string[];
  }>("/api/compositions", { method: "POST", body: JSON.stringify(input) }),
  listCompositions: () => jsonFetch<{ compositions: any[] }>("/api/compositions"),
  getComposition: (id: string) =>
    jsonFetch<{ composition: any; scenes: ScenePlanRow[] }>(`/api/compositions/${encodeURIComponent(id)}`),
  updateScene: (id: string, patch: Partial<{
    title: string; imagePrompt: string; videoPrompt: string; continuity: string;
    durationSec: number; aspectRatio: string;
    imageProvider: string; imageModel: string; videoProvider: string; videoModel: string;
  }>) => jsonFetch<{ scene: ScenePlanRow }>(`/api/scenes/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(patch),
  }),
  setSceneResult: (id: string, patch: {
    imageMediaId?: string;
    videoMediaId?: string;
    status?: "pending" | "image_building" | "image_ready" | "video_building" | "completed" | "failed";
  }) => jsonFetch<{ scene: ScenePlanRow }>(`/api/scenes/${encodeURIComponent(id)}/result`, {
    method: "POST", body: JSON.stringify(patch),
  }),

  // Articles (D1-backed; replaces static seed)
  listArticles: (limit = 100, offset = 0) =>
    jsonFetch<{ articles: ApiArticle[] }>(`/api/articles?limit=${limit}&offset=${offset}`),
  ingestArticleFromUrl: (url: string, category?: string, badge?: string) =>
    jsonFetch<{ article: ApiArticle }>("/api/articles/from-url", {
      method: "POST", body: JSON.stringify({ url, category, badge }),
    }),
  draftArticle: (topic: string, category?: string, badge?: string) =>
    jsonFetch<{ article: ApiArticle }>("/api/articles/draft", {
      method: "POST", body: JSON.stringify({ topic, category, badge }),
    }),
  archiveArticle: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/articles/${id}`, { method: "DELETE" }),

  // Battlecards
  listBattlecards: () =>
    jsonFetch<{ battlecards: ApiBattlecard[] }>("/api/battlecards"),
  generateBattlecard: (input: { competitorDomain: string; objection: string; category: string }) =>
    jsonFetch<{ battlecard: ApiBattlecard }>("/api/battlecards/generate", {
      method: "POST", body: JSON.stringify(input),
    }),
  archiveBattlecard: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/battlecards/${id}`, { method: "DELETE" }),

  // Workflows (26-node spec)
  createWorkflow: (input?: { mode?: string }) =>
    jsonFetch<{ workflowId: string; status: string }>("/api/workflows", {
      method: "POST", body: JSON.stringify(input ?? {}),
    }),
  executeWorkflow: (id: string, input: {
    brief: {
      rawBrief: string;
      uploadedAssetIds?: string[];
      targetPlatforms?: Array<{ platform: string; aspectRatio: string }>;
      negativeConstraints?: string[];
      desiredOutputs?: string[];
    };
    conceptCount?: number;
  }) =>
    jsonFetch<{
      workflowId: string;
      brief: { status: string; data: { normalizedText: string; extractedGoals: string[]; ambiguityFlags: string[]; readinessScore: number } };
      concepts: { status: string; data: { concepts: Array<{ id: string; title: string; mood: string; lighting: string; imagePrompt: string; videoPrompt: string; socialPostCopy: string; recommendedRatios: string[] }> } } | null;
    }>(`/api/workflows/${id}/execute`, { method: "POST", body: JSON.stringify(input) }),
  runFullWorkflow: (input: {
    brief: { rawBrief: string; uploadedAssetIds?: string[]; targetPlatforms?: Array<{ platform: string; aspectRatio: string }>; desiredOutputs?: string[]; negativeConstraints?: string[] };
    conceptCount?: number;
    budgetUsd?: number;
  }) =>
    jsonFetch<{
      workflowId: string;
      brief: any; brand: any; conceptCount: number; promptCount: number; dispatchedJobIds: string[]; note: string;
    }>("/api/workflows/run-full", { method: "POST", body: JSON.stringify(input) }),
  estimateWorkflow: (id: string, estimates: Array<{ providerId: string; modelId: string; mediaType: string; quantity: number; estimatedCostUsd: number; confidence: number }>, budgetUsd?: number) =>
    jsonFetch(`/api/workflows/${id}/estimate`, {
      method: "POST",
      body: JSON.stringify({ estimates, budgetUsd }),
    }),
  getWorkflow: (id: string) =>
    jsonFetch<{ workflowId: string; audit: any[]; nodes: any[] }>(`/api/workflows/${id}`),
  workflowAssets: (id: string) =>
    jsonFetch<{ assets: any[] }>(`/api/workflows/${id}/assets`),
  dispatchWorkflow: (id: string, concepts: any[]) =>
    jsonFetch<{ workflowId: string; promptCount: number; dispatchedJobIds: string[]; note: string }>(
      `/api/workflows/${id}/dispatch`,
      { method: "POST", body: JSON.stringify({ concepts }) }
    ),
  recentAssets: (limit = 60) =>
    jsonFetch<{ assets: any[] }>(`/api/assets/recent?limit=${limit}`),

  // Cost rollup
  costSummary: (days = 30) =>
    jsonFetch<{ days: number; grandTotalUsd: number; byProvider: Array<{ provider: string; totalUsd: number; count: number; models: string[] }> }>(`/api/cost/summary?days=${days}`),

  // Brand profile
  getBrand: () => jsonFetch<{ brand: any }>("/api/brand"),
  putBrand: (brand: any) => jsonFetch<{ ok: true }>("/api/brand", { method: "PUT", body: JSON.stringify(brand) }),

  // Workflow list (audit viewer)
  listWorkflows: () => jsonFetch<{ workflows: any[] }>("/api/workflows-list"),

  // Research
  seoResearch: (input: { seedKeywords: string[]; market?: string; intent?: string }) =>
    jsonFetch<{ data: any; status: string }>("/api/research/seo", { method: "POST", body: JSON.stringify(input) }),
  competitorIntel: (input: { competitorDomains: string[]; ourValueProps: string[]; depth?: "brief"|"standard"|"deep"|"max"; fetchContent?: boolean }) =>
    jsonFetch<{ data: any; status: string }>("/api/research/competitor", { method: "POST", body: JSON.stringify(input) }),
  listCompetitorReports: () =>
    jsonFetch<{ reports: any[] }>("/api/research/competitor/reports"),
  getCompetitorReport: (id: string) =>
    jsonFetch<{ report: any }>(`/api/research/competitor/reports/${id}`),

  // Notifications + prefs
  getPrefs: () => jsonFetch<{ prefs: any | null }>("/api/prefs"),
  putPrefs: (prefs: any) => jsonFetch<{ ok: true }>("/api/prefs", { method: "PUT", body: JSON.stringify(prefs) }),
  testNotification: () => jsonFetch<{ ok: true; to: string }>("/api/notifications/test", { method: "POST" }),

  // Sales
  discoverProspects: (input: { idealCustomerProfile: string; geography?: string; industry?: string; maxResults?: number }) =>
    jsonFetch<{ data: any; status: string }>("/api/prospects/discover", { method: "POST", body: JSON.stringify(input) }),
  listProspects: () => jsonFetch<{ prospects: any[] }>("/api/prospects"),
  enrichProspect: (id: string) =>
    jsonFetch<{ data: any; status: string }>(`/api/prospects/${id}/enrich`, { method: "POST" }),
  draftOutreach: (input: { prospect: any; channel: "email" | "linkedin" | "form"; offerSummary: string; brandVoice?: string }) =>
    jsonFetch<{ data: any; status: string }>("/api/outreach/draft", { method: "POST", body: JSON.stringify(input) }),
  approveOutreach: (draftId: string, scheduledFor?: string) =>
    jsonFetch<{ data: any; status: string }>(`/api/outreach/${draftId}/approve`, { method: "POST", body: JSON.stringify({ scheduledFor }) }),

  // Content sources
  listSources: () =>
    jsonFetch<{ sources: ApiSource[] }>("/api/sources"),
  createSource: (input: { url: string; label: string; kind?: string; category?: string; badge?: string }) =>
    jsonFetch<{ source: ApiSource }>("/api/sources", { method: "POST", body: JSON.stringify(input) }),
  updateSource: (id: string, patch: Partial<ApiSource>) =>
    jsonFetch<{ ok: true }>(`/api/sources/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteSource: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/sources/${id}`, { method: "DELETE" }),
  runIngestNow: () =>
    jsonFetch<{ ok: true; processed: number; new: number; errors: number }>(
      "/api/sources/run-now", { method: "POST" }
    ),

  // Analytics
  analytics: (channelId: string, days = 30) =>
    jsonFetch<{ channel: { id: string; platform: string }; analytics: unknown }>(
      `/api/analytics/${channelId}?days=${days}`
    ),

  // B-Roll workspace (Runway-style multi-shot generation)
  createBrollProject: (input: {
    sceneText: string;
    referenceDescription: string;
    referenceUri?: string;
    referenceKind?: "text" | "upload" | "generated" | "url";
    style?: "cinematic" | "product" | "documentary" | "editorial" | "drone";
    aspectRatio?: "16:9" | "9:16" | "1:1" | "4:5";
    shotCount?: number;
    title?: string;
    quality?: "fast" | "high";
    renderVideo?: boolean;
  }) =>
    jsonFetch<{ projectId: string; workflowId: string; continuityToken: string; continuityAnchor: string; plannedBy?: string; shots: any[]; warnings?: string[] }>(
      "/api/broll/projects", { method: "POST", body: JSON.stringify(input) }
    ),
  listBrollProjects: () =>
    jsonFetch<{ projects: any[] }>("/api/broll/projects"),
  getBrollProject: (id: string) =>
    jsonFetch<{ project: any; shots: any[] }>(`/api/broll/projects/${id}`),
  renderBrollProject: (id: string) =>
    jsonFetch<{ dispatched: number; shotIds?: string[] }>(`/api/broll/projects/${id}/render`, { method: "POST" }),
  regenerateBrollShot: (projectId: string, shotId: string, body?: { prompt?: string; negativePrompt?: string }) =>
    jsonFetch<{ ok: true; shotId: string; promptId: string }>(
      `/api/broll/projects/${projectId}/shots/${shotId}/regenerate`,
      { method: "POST", body: JSON.stringify(body ?? {}) }
    ),
  animateBrollShot: (projectId: string, shotId: string) =>
    jsonFetch<{ ok: true; shotId: string; promptId: string }>(
      `/api/broll/projects/${projectId}/shots/${shotId}/animate`,
      { method: "POST" }
    ),
  deleteBrollProject: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/broll/projects/${id}`, { method: "DELETE" }),

  // Helpers
  putToR2: async (uploadUrl: string, file: File): Promise<void> => {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });
    if (!res.ok) throw { status: res.status, body: await res.text() } as ApiError;
  },
};

// SSE subscription helper. Returns a cleanup function.
export function subscribeScheduleEvents(
  onEvent: (e: { scheduleId: string; status: string; [k: string]: unknown }) => void,
  onError?: (e: Event) => void
): () => void {
  const es = new EventSource("/api/events/stream", { withCredentials: true } as EventSourceInit);
  es.addEventListener("schedule", (ev) => {
    try { onEvent(JSON.parse((ev as MessageEvent).data)); } catch {}
  });
  if (onError) es.onerror = onError;
  return () => es.close();
}

/** Subscribe to generation job events. Each event is `{ type: "job", job }`. */
export function subscribeJobEvents(
  onEvent: (j: GenerationJob & { type: "job" }) => void,
  onError?: (e: Event) => void
): () => void {
  const es = new EventSource("/api/events/stream", { withCredentials: true } as EventSourceInit);
  es.addEventListener("job", (ev) => {
    try {
      const data = JSON.parse((ev as MessageEvent).data);
      if (data && data.job) onEvent({ type: "job", ...data.job });
    } catch {}
  });
  if (onError) es.onerror = onError;
  return () => es.close();
}
