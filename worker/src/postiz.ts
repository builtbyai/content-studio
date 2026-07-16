import type { Env } from "./env";

// Postiz HTTP client. Talks to the internal hostname behind Cloudflare Access
// service-token auth + Postiz API key. Never exposed to the browser directly.
//
// The exact paths under /public-api/v1 may need to be verified against your
// pinned Postiz image (see DEPLOY.md → "Postiz API capability audit"). If the
// public API is missing a route, fall back to /api/* (Postiz's internal namespace).

export interface PostizIntegration {
  id: string;
  name: string;
  identifier: string; // platform: 'linkedin' | 'instagram' | 'x' | 'tiktok' | 'youtube' | ...
  picture?: string;
  disabled?: boolean;
}

export interface PostizCreatePostInput {
  type: "draft" | "schedule" | "now";
  date: string; // ISO 8601, UTC
  shortLink?: boolean;
  posts: Array<{
    integration: { id: string };
    value: Array<{
      content: string;
      image?: Array<{ id?: string; path: string }>; // path is a URL Postiz can fetch
    }>;
    settings?: Record<string, unknown>;
  }>;
}

export interface PostizPostResponse {
  id: string;
  publishDate: string;
  state: "DRAFT" | "QUEUE" | "PUBLISHED" | "ERROR";
  releaseURL?: string;
  error?: string | null;
}

function authHeaders(env: Env): HeadersInit {
  const h: Record<string, string> = {
    "Authorization": env.POSTIZ_API_KEY,
    "Content-Type": "application/json",
  };
  // Optional: only attach CF Access service-token if the Postiz API hostname
  // is actually gated by Access. Public Postiz hostnames don't need this.
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    h["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    h["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }
  return h;
}

async function call<T>(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
  expectedStatuses: number[] = [200, 201]
): Promise<T> {
  if (!env.POSTIZ_API_KEY) {
    throw new PostizError(401,
      "POSTIZ_API_KEY is not set on the Worker. Generate one in Postiz admin UI " +
      "(Settings → API keys) then: wrangler secret put POSTIZ_API_KEY",
      "");
  }

  const url = `${env.POSTIZ_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: authHeaders(env),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  const isJson = ct.includes("application/json") || (text.trim().startsWith("{") || text.trim().startsWith("["));

  if (!expectedStatuses.includes(res.status)) {
    // Be explicit about HTML responses (login page, 404 page, etc.) so the SPA
    // can surface a useful message instead of a JSON-parse error.
    const summary = !isJson && text.includes("<!DOCTYPE")
      ? "Postiz returned HTML — likely the API key is wrong, the route doesn't exist on this Postiz version, or the host needs an auth flow"
      : text.slice(0, 300);
    throw new PostizError(res.status, `Postiz ${method} ${path} → ${res.status}: ${summary}`, text);
  }

  if (res.status === 204 || !text) return undefined as T;
  if (!isJson) {
    throw new PostizError(res.status, `Postiz ${method} ${path} returned non-JSON: ${text.slice(0, 200)}`, text);
  }
  return JSON.parse(text) as T;
}

export class PostizError extends Error {
  constructor(public status: number, message: string, public raw: string) {
    super(message);
    this.name = "PostizError";
  }
  get retriable(): boolean {
    return this.status >= 500 || this.status === 429 || this.status === 408;
  }
}

export const postiz = {
  // ---- Integrations (connected channels) ----
  async listIntegrations(env: Env): Promise<PostizIntegration[]> {
    return call<PostizIntegration[]>(env, "GET", "/public/v1/integrations");
  },

  // The Postiz public-api does NOT expose an OAuth-init endpoint. Channels are
  // connected through the Postiz UI directly. We return a deep-link to the
  // Postiz launches page (UI) — the user OAuths there, then comes back to us
  // and refreshes /api/channels.
  initiateChannelConnect(
    env: Env,
    platform: string,
    _returnUrl: string
  ): { url: string } {
    const base = env.POSTIZ_PUBLIC_BASE || env.POSTIZ_API_BASE.replace(/\/api$/, "");
    // Postiz's launches page is where channels are added. Some versions accept
    // ?provider=<id> hash params; UI shows an Add-Channel modal on load.
    const url = `${base}/launches?provider=${encodeURIComponent(platform)}`;
    return { url };
  },

  // ---- Posts ----
  async createPost(env: Env, input: PostizCreatePostInput): Promise<PostizPostResponse[]> {
    return call<PostizPostResponse[]>(env, "POST", "/public/v1/posts", input);
  },
  async getPost(env: Env, id: string): Promise<PostizPostResponse> {
    return call<PostizPostResponse>(env, "GET", `/public/v1/posts/${id}`);
  },
  async listPosts(env: Env, query?: { display?: "day" | "week" | "month"; date?: string }) {
    const qs = query ? "?" + new URLSearchParams(query as Record<string, string>).toString() : "";
    return call<PostizPostResponse[]>(env, "GET", `/public/v1/posts${qs}`);
  },
  async deletePost(env: Env, id: string): Promise<void> {
    await call(env, "DELETE", `/public/v1/posts/${id}`, undefined, [200, 204]);
  },

  // ---- Analytics ----
  async analytics(env: Env, integrationId: string, days = 30) {
    return call(env, "GET", `/public/v1/analytics/${integrationId}?date=${days}`);
  },

  // ---- Uploads (we prefer to pass external URL pointing at R2) ----
  async registerExternalMedia(env: Env, url: string, alt?: string) {
    // Postiz also accepts media as plain URLs inside the post payload, so this
    // method is only needed if your version requires explicit registration.
    return call<{ id: string; path: string }>(env, "POST", "/public/v1/uploads/url", {
      url,
      alt,
    });
  },
};
