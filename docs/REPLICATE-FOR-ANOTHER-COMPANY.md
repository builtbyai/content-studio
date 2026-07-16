# Replicating ContentForge for Another Company

> **About the "fix" that preceded this doc:** Nothing in the codebase changed. The earlier 401s on `/api/jobs` and `/api/events/stream` were the worker correctly rejecting an unauthenticated session. Logging in via the `LoginGate` form set the `cf_session` cookie (scoped to `.example.com`) and every subsequent request started succeeding. The `Main.666beeeb.js` / `[cm-auth]` / `login:1 500` lines in the console are from a Chrome extension, not ContentForge — they will appear on the new deployment too and can be ignored.

This guide is the minimum path to stand the same stack up under a new brand + domain (e.g. `app.acmeco.com`). It is not a re-architecture — assume the existing `worker/`, `web/`, and `infra/` are forked verbatim and only names, IDs, and a small handful of brand tokens change.

---

## 1. Folders & files that MUST come along

Three sibling directories under one parent:

```
<new-company>/
├── web/        ← Vite + React SPA (this directory)
├── worker/     ← Cloudflare Worker (Hono router + queue consumer + DO)
└── infra/
    ├── migrations/        ← 0001…0007 SQL, applied via `wrangler d1 migrations apply`
    ├── seed-admin.sql     ← first admin row (edit before running)
    └── hash-password.mjs  ← generates the salt/hash for seed-admin.sql
```

### web/ — required files (no Pages-side config lives here)

| File / dir | Why it matters |
|---|---|
| `package.json` | Build script (`vite build`) and React/Tailwind/Motion deps. Cloudflare Pages reads this. |
| `vite.config.ts` | `manualChunks` (react/motion/icons) and the `/api → :8787` dev proxy. Path alias `@/*`. |
| `tsconfig.json` | Path alias `@/*` mirror. |
| `index.html` | SPA shell. |
| `src/` | All UI code. The contract surface is `src/lib/api.ts` (every backend call) and `src/lib/auth-context.tsx` (session). |
| `src/index.css` | Tailwind v4 `@theme` block with `studio-*` design tokens — **the rebrand surface**. |

Not required: `dist/`, `node_modules/`. There is no `_redirects`, no `_routes.json`, no `functions/`, no `wrangler.toml` in `web/` — Pages is configured entirely from the dashboard.

### worker/ — required files

| File | Why |
|---|---|
| `wrangler.toml` | All bindings (D1, R2, Queues, DO, AI, Vectorize, KV), the cron, the route, and non-secret vars. **Rename everything per new company.** |
| `package.json` | Hono + aws4fetch + @google/genai + wrangler. |
| `src/` | All Worker code. `src/index.ts` mounts every `/api/*` route; `src/auth.ts` is the session model. |

### infra/ — required files

All three of `migrations/`, `seed-admin.sql`, `hash-password.mjs`. The migrations are referenced from `worker/wrangler.toml` via `migrations_dir = "../infra/migrations"`.

---

## 2. Cloudflare wiring (the current production setup)

Current ContentForge production maps to:

| Concern | Value |
|---|---|
| Frontend host | `app.example.com` (Cloudflare **Pages**) |
| API host | Same origin — `app.example.com/api/*` is routed to the Worker via `wrangler.toml` `routes = [...]`. No separate `api.*` subdomain needed. |
| Worker name | `contentforge-api` (Cloudflare Workers) |
| D1 database | `contentforge-prod` (create with `wrangler d1 create`) |
| R2 bucket | `contentforge-media` |
| KV namespace | `CACHE` (create with `wrangler kv namespace create`) |
| Queues | `contentforge-publish` + `contentforge-publish-dlq` |
| Durable Object | `ScheduleRoom` class, binding `SCHEDULE_ROOM` |
| Vectorize indexes | `contentforge-brands`, `contentforge-competitors`, `contentforge-leads` (768 dim, cosine) |
| Workers AI | binding `AI`, gateway slug `contentforge-ai` |
| Cron | `* * * * *` (per-minute reconcile of near-term scheduled posts) |
| Cookie domain | `.example.com` so the cookie works on both `app.*` and any future `api.*` |

The Cloudflare **Pages project name itself is not stored in the repo** — confirm it with:

```bash
wrangler pages project list
```

Pages build config (Build command: `npm run build`, Output dir: `dist`, Root: `web`, Node 22) lives in the Cloudflare dashboard for the Pages project. There is no `_redirects` file, so non-asset paths fall through to `index.html` only because Pages does that by default for SPAs — keep it that way.

---

## 3. Replicate for a new company — step by step

Assume you've forked the three folders to `C:\Code\acme\{web,worker,infra}\`.

### 3.1 Rename everything in `worker/wrangler.toml`

Search-and-replace these tokens (they are all distinct strings):

| Old | New (example) |
|---|---|
| `contentforge-api` | `acme-api` |
| `contentforge-prod` | `acme-prod` |
| `contentforge-media` | `acme-media` |
| `contentforge-publish` | `acme-publish` |
| `contentforge-publish-dlq` | `acme-publish-dlq` |
| `contentforge-brands` / `-competitors` / `-leads` | `acme-brands` / `-competitors` / `-leads` |
| `contentforge-ai` (AI gateway slug) | `acme-ai` |
| `app.example.com` | `app.acmeco.com` |
| `example.com` (zone_name) | `acmeco.com` |
| `postiz.example.com` | your Postiz host (or remove the two POSTIZ_* vars if not using Postiz) |
| `database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"` | the new D1 id from step 3.2 |
| `kv_namespaces id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"` | the new KV id from step 3.2 |
| `R2_ACCOUNT_ID = "REPLACE_WITH_YOUR_CF_ACCOUNT_ID"` | your CF account id |

Cookie domain also needs updating — open `worker/src/auth.ts`, find the two `"Domain=.example.com"` lines, and replace with `.acmeco.com`.

### 3.2 Create Cloudflare resources

From `worker/`:

```bash
wrangler login
wrangler d1 create acme-prod                              # paste id into wrangler.toml
wrangler r2 bucket create acme-media
wrangler kv namespace create CACHE                        # paste id into wrangler.toml
wrangler queues create acme-publish
wrangler queues create acme-publish-dlq
wrangler vectorize create acme-brands       --dimensions=768 --metric=cosine
wrangler vectorize create acme-competitors  --dimensions=768 --metric=cosine
wrangler vectorize create acme-leads        --dimensions=768 --metric=cosine

wrangler d1 migrations apply acme-prod --remote
```

AI Gateway is dashboard-only: Cloudflare dashboard → AI → AI Gateway → Create Gateway → slug `acme-ai`. Then mirror that slug back into `wrangler.toml` `AI_GATEWAY_SLUG`.

### 3.3 Seed the first admin user

```bash
node infra/hash-password.mjs 'a-strong-password'
# Copy the {salt, hash} into infra/seed-admin.sql, edit the email to acme's admin,
# then:
wrangler d1 execute acme-prod --remote --file ../infra/seed-admin.sql
```

### 3.4 Worker secrets

```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put SESSION_COOKIE_SECRET           # any 32-byte random hex
# Optional, depending on which features you keep:
wrangler secret put POSTIZ_API_KEY
wrangler secret put POSTIZ_WEBHOOK_SECRET
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put REPLICATE_API_TOKEN
wrangler secret put REPLICATE_WEBHOOK_SECRET
wrangler secret put CF_ACCESS_CLIENT_ID
wrangler secret put CF_ACCESS_CLIENT_SECRET
```

### 3.5 Deploy the Worker

```bash
cd worker
wrangler deploy
```

This binds it to `app.acmeco.com/api/*` from the `routes` block. The DNS for `app.acmeco.com` must already be in your Cloudflare zone — usually it lands there automatically after step 3.6 creates the Pages project.

### 3.6 Cloudflare Pages project for the SPA

In the Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git (or **Direct Upload** if you don't want a GitHub remote yet):

| Setting | Value |
|---|---|
| Project name | `acme-app` (becomes `<project>.pages.dev` until you add the custom domain) |
| Production branch | `main` |
| Root directory | `web` |
| Build command | `npm run build` |
| Build output | `dist` |
| Node version env var | `NODE_VERSION = 22` |

Then **Custom domains → Add `app.acmeco.com`**. That writes the CNAME and provisions TLS automatically.

Once both are live, the same-origin contract works: the SPA at `app.acmeco.com` calls `/api/...`, the Worker route catches it, and the session cookie is set on `.acmeco.com`.

### 3.7 Rebrand the UI

Three files do the visible-brand lifting; everything else is layout:

- `web/src/index.css` — the `@theme` block defines every `studio-*` color, font, radius, and shadow used across the app. Swap the hex values and you've rebranded.
- `web/src/components/LoginGate.tsx` — hardcoded `ACME.` wordmark and `Intelligence Studio` tagline.
- `web/src/App.tsx` — the `NAV` array (~30 tabs) — keep or prune per the new company's scope.

`studio-` is the design-system prefix for the theme tokens; the simpler path is to keep the prefix and just retint the colors. Renaming the prefix is a global find-replace across `web/src/` and `web/src/index.css`.

### 3.8 Sanity-check

After Pages publishes and the Worker is deployed:

```bash
# Should return {"user": null}  (200, no cookie yet)
curl -s https://app.acmeco.com/api/auth/me

# Should set a Set-Cookie: cf_session=...; Domain=.acmeco.com
curl -i -X POST https://app.acmeco.com/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@acmeco.com","password":"a-strong-password"}'
```

If the second call returns 200 and the cookie domain is right, opening `https://app.acmeco.com` in a browser, signing in via the form, and watching the network tab stop 401-ing on `/api/jobs` confirms the same fix flow that resolved the original 401 noise.

---

## 4. What you can drop if the new company doesn't need everything

- **Postiz** (social publishing) — remove the `POSTIZ_*` vars, the queue consumer in `worker/src/queue.ts`, and the `worker/src/postiz.ts` file. The DLQ + queue resources can be skipped.
- **Vectorize** indexes — only used by research/competitor/lead nodes. If the new company doesn't run those workflows, you can skip the three `vectorize create` calls and remove the bindings from `wrangler.toml`.
- **Replicate** (video generation) — drop `REPLICATE_*` secrets and `worker/src/replicate.ts` if no video lab.
- **Cron** — the `* * * * *` trigger only matters for scheduled-publishing reconcile. Remove `[triggers]` if not using Postiz.

The minimum-viable subset is: D1 + R2 + the Worker + Pages + Gemini secret. Everything else is feature-gated.

---

## 5. Files in this repo worth reading before you fork

- `docs/DEPLOY.md` — the original end-to-end runbook (more detail on Postiz + AI Gateway setup).
- `web/src/lib/api.ts` — frontend conventions (single-page tab shell, `api.ts` as the contract, Tailwind v4 tokens).
- `worker/wrangler.toml` — the binding manifest. Treat it as the canonical resource inventory.
- `worker/src/auth.ts` — session model and cookie domain. Update for the new zone.
- `worker/src/index.ts` — every mounted `/api/*` route. Skim to confirm what the SPA expects.
