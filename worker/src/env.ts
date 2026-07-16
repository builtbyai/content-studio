// All bindings + secrets visible to the Worker.
// Keep this as the single source of truth; every module imports `Env` from here.

export interface Env {
  // D1
  DB: D1Database;

  // R2
  MEDIA: R2Bucket;

  // Queue
  PUBLISH_QUEUE: Queue<PublishJob>;

  // Durable Objects
  SCHEDULE_ROOM: DurableObjectNamespace;

  // Workers AI — used by Node 14 (review + safety) via llamaguard + image classification.
  AI?: Ai;

  // Vectorize — separate indexes per concept (brand fingerprints, competitor positioning, lead trends).
  VEC_BRANDS?: VectorizeIndex;
  VEC_COMPETITORS?: VectorizeIndex;
  VEC_LEADS?: VectorizeIndex;

  // KV — lightweight side-store for provider capability cache, brief preset cache, image meta.
  CACHE?: KVNamespace;

  // AI Gateway slug — created in dashboard, e.g. "contentforge-ai".
  AI_GATEWAY_SLUG: string;

  // Vars (wrangler.toml [vars])
  POSTIZ_API_BASE: string;
  POSTIZ_PUBLIC_BASE: string;
  APP_ORIGIN: string;
  R2_PUBLIC_BASE: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  GEMINI_MODEL: string;
  SESSION_TTL_HOURS: string;

  // Secrets
  GEMINI_API_KEY: string;
  OPENAI_API_KEY?: string;            // Node 09 Provider Adapter (image)
  RUNWAY_API_KEY?: string;            // Node 09 Provider Adapter (video)
  REPLICATE_API_TOKEN?: string;       // Node 09 Provider Adapter (video) + Video Lab
  REPLICATE_WEBHOOK_SECRET?: string;  // optional — verifies async finalize callbacks
  POSTIZ_API_KEY: string;
  POSTIZ_WEBHOOK_SECRET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  CF_ACCESS_CLIENT_ID?: string;     // optional — only if Postiz API is behind CF Access
  CF_ACCESS_CLIENT_SECRET?: string;
  SESSION_COOKIE_SECRET: string;
}

// Queue job payloads.
export type PublishJob =
  | {
      kind: "publish";
      scheduleId: string;
      userId: string;
      attempt: number;
    }
  | {
      kind: "ingest_media";
      mediaId: string;
      userId: string;
      sourceUrl: string;
    }
  | {
      kind: "generate";
      workflowId: string;
      userId: string;
      promptId: string;
      providerId: string;       // chosen from PromptSpec.providerCandidates
      modelId: string;          // chosen from PromptSpec.modelCandidates
      prompt: string;
      negativePrompt?: string;
      parameters: Record<string, unknown>;
      preservationTokens: string[];
    };

// Hono context typing helper.
export type HonoEnv = {
  Bindings: Env;
  Variables: {
    user?: { id: string; email: string; role: string };
    sessionId?: string;
  };
};
