# ContentForge — Deployment Runbook

End-to-end. Assumes you already have wrangler authed against your Cloudflare account and the Postiz stack on postiz-host reachable at `postiz.example.com`.

---

## 0. Pre-flight (one time)

```bash
# Authentication
wrangler login
wrangler whoami     # confirm correct account

# Pin Postiz version (so its public API contract stays stable)
ssh postiz-host "cd /path/to/postiz && grep image: docker-compose.yml"
# If you see `:latest`, change to a specific tag (e.g. ghcr.io/gitroomhq/postiz-app:v1.x.x)
# then `docker compose pull && docker compose up -d`
```

## 1. Postiz API capability audit (do BEFORE wiring secrets)

ContentForge's worker assumes a small set of `/public-api/v1/...` routes. Confirm they exist on your pinned image:

```bash
# From postiz-host, with Postiz API key in $POSTIZ_KEY:
curl -s -H "Authorization: $POSTIZ_KEY" \
  http://localhost:5000/public-api/v1/integrations | jq .

curl -s -H "Authorization: $POSTIZ_KEY" \
  http://localhost:5000/public-api/v1/posts?display=week | jq .
```

If the public API is missing routes you need (e.g., `initiateChannelConnect` returns 404), switch the relevant call in `worker/src/postiz.ts` from `/public-api/v1/...` to `/api/...` and adjust auth headers — Postiz's internal API uses cookie sessions, so you'll need to add a service-account login step.

## 2. Cloudflare resources (one time)

```bash
cd worker

# D1
wrangler d1 create contentforge-prod
# → paste the resulting `database_id` into wrangler.toml

# R2
wrangler r2 bucket create contentforge-media

# KV
wrangler kv namespace create CACHE
# → paste returned id into wrangler.toml [[kv_namespaces]] id

# Vectorize (used by Nodes 02 / 18 / 25)
wrangler vectorize create contentforge-brands       --dimensions=768 --metric=cosine
wrangler vectorize create contentforge-competitors  --dimensions=768 --metric=cosine
wrangler vectorize create contentforge-leads        --dimensions=768 --metric=cosine

# AI Gateway — create in dashboard, NOT via wrangler. Then paste slug into
# wrangler.toml [vars] AI_GATEWAY_SLUG = "contentforge-ai"
# https://dash.cloudflare.com → AI → AI Gateway → Create Gateway
# Enable: Logs, Analytics, Cache, Rate-limit (per provider)
#
# BYOK setup — required for the /api/images/generate route (uses
# openai/gpt-image-2 via env.AI binding). Without BYOK, the binding returns
# 402 "no provider key configured":
#   1. Dashboard → AI → AI Gateway → contentforge-ai → "Providers" tab
#   2. Add OpenAI → paste OPENAI_API_KEY → save
#   3. (Optional) Add Anthropic, Google AI Studio, Groq etc. for fallback chains
# Optional: enable public bucket access for one prefix (published/) so social
# platforms can fetch media directly. Or front via a Workers Sites route at
# media.example.com that maps to MEDIA bucket reads.

# Queue
wrangler queues create contentforge-publish
wrangler queues create contentforge-publish-dlq

# Apply schema
wrangler d1 migrations apply contentforge-prod --remote
```

Get an **R2 S3 API token** from the Cloudflare dashboard → R2 → Manage R2 API Tokens → "Object Read & Write" scoped to `contentforge-media`. Note Access Key ID + Secret.

## 3. Cloudflare Access — lock the Postiz tunnel to Worker only

1. Zero Trust dashboard → Access → Tunnels — confirm a tunnel exists for postiz-host exposing Postiz.
2. Add a second public hostname on the same tunnel: `postiz-api.internal.example.com` → `http://localhost:5000` (Postiz API port).
3. Zero Trust → Access → Applications → Add Application → Self-hosted.
   - Application domain: `postiz-api.internal.example.com`
   - Policy: "Service Auth" only (no human identities).
   - Create a Service Token → name it `contentforge-worker`. Save **Client ID** and **Client Secret** — these are the `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` secrets the Worker uses.
4. Verify denial without token:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://postiz-api.internal.example.com/public-api/v1/integrations
   # → 302/401 (Access redirect or block)
   curl -s -o /dev/null -w "%{http_code}\n" \
     -H "CF-Access-Client-Id: $CFID" -H "CF-Access-Client-Secret: $CFSECRET" \
     https://postiz-api.internal.example.com/public-api/v1/integrations
   # → 200 (now allowed)
   ```

## 4. Worker secrets

```bash
cd worker
wrangler secret put GEMINI_API_KEY              # Google AI Studio key
wrangler secret put POSTIZ_API_KEY              # from Postiz UI → API keys
wrangler secret put POSTIZ_WEBHOOK_SECRET       # any high-entropy string; paste same into Postiz webhook config (see §6)
wrangler secret put R2_ACCESS_KEY_ID            # from step 2
wrangler secret put R2_SECRET_ACCESS_KEY        # from step 2
wrangler secret put CF_ACCESS_CLIENT_ID         # from step 3
wrangler secret put CF_ACCESS_CLIENT_SECRET     # from step 3
wrangler secret put SESSION_COOKIE_SECRET       # `openssl rand -hex 32`
```

Also update `wrangler.toml` vars: replace `R2_ACCOUNT_ID` placeholder with your Cloudflare account ID (`wrangler whoami` shows it), and confirm the `routes` patterns match your zone.

## 5. Deploy

```bash
# Worker
cd worker
npm install
wrangler deploy

# Frontend (Cloudflare Pages, name = contentforge)
cd ../web
npm install
npm run build
wrangler pages deploy dist --project-name=contentforge --branch=main
```

After deploying, hash-verify the live bundle against your local `dist/` — Wrangler can occasionally report success while serving a stale upload.

Map the Pages project to `app.example.com` in the Cloudflare dashboard. The Worker's `routes` config already intercepts `app.example.com/api/*` and forwards to the Worker, so the SPA's existing `fetch("/api/...")` calls land on the Worker without CORS.

## 6. Postiz webhook → Worker

In Postiz admin UI → Settings → Webhooks (or the per-org config), add:

| Field | Value |
|---|---|
| URL | `https://api.example.com/api/webhooks/postiz` |
| Secret | (the `POSTIZ_WEBHOOK_SECRET` you set in §4) |
| Events | `post.published`, `post.failed`, `post.scheduled`, `post.cancelled` |
| Signature header | `X-Postiz-Signature` (`sha256=<hex>`) |
| Timestamp header | `X-Postiz-Timestamp` (unix seconds) |
| Event id header | `X-Postiz-Event-Id` |

If your Postiz version uses different header names, update them in `worker/src/index.ts` (`/api/webhooks/postiz` handler) and `worker/src/webhooks.ts`.

Verify:
```bash
# From postiz-host, after triggering a post:
docker compose logs postiz-backend | grep webhook
# In Worker: wrangler tail
```

## 7. Seed admin user

```bash
# Mirror your the reference auth service admin row so the same credentials work here:
node infra/hash-password.mjs '<your password>'
# Take the SQL fragment, then:
wrangler d1 execute contentforge-prod --remote --file=infra/seed-admin.sql
# (after editing seed-admin.sql with the produced hash + salt)
```

Or, if you want to reuse the reference auth service's exact row, query it from `the reference auth DB` and re-insert here with the same `salt` and `password_hash`.

## 8. Smoke test

1. Open `https://app.example.com` — login screen.
2. Sign in with the admin user.
3. **Connections** → click "Connect LinkedIn" → redirects to Postiz OAuth → back.
4. **Workflow Studio** → fill brief → generates concepts via Gemini (verifies Worker → Gemini path).
5. **Scheduler** → Compose → channel = LinkedIn, content = "test", schedule for now+5min → status badge should walk `pending → scheduled → published`.
6. `wrangler tail` should show webhook delivery on publish.

## 9. Day-2 ops

| Action | Command |
|---|---|
| Live logs | `wrangler tail` |
| Queue depth | `wrangler queues list` |
| Failed jobs | `wrangler d1 execute contentforge-prod --remote --command "SELECT * FROM job_log WHERE status='dead' ORDER BY created_at DESC LIMIT 20"` |
| Postiz upgrade | `ssh postiz-host 'cd postiz && docker compose pull && docker compose up -d'` — then re-run §1 audit |
| Rotate session secret | `wrangler secret put SESSION_COOKIE_SECRET` then `DELETE FROM sessions` to force re-login |
| Reconciliation run on demand | trigger cron manually: `wrangler dev --test-scheduled` then `curl localhost:8787/__scheduled` |

## 10. Known caveats (read these before shipping)

- **Gemini model id** — `wrangler.toml` defaults to `gemini-2.5-flash`. The original `server.ts` had `gemini-3.5-flash` which is not a real id. If you see 404s from Gemini, that's the cause.
- **Veo signed URLs** — generated video URLs from Veo expire fast. The `/api/media/from-url` endpoint queues an `ingest_media` job that pulls the source into R2 within seconds. Don't store Veo URLs directly in drafts.
- **Postiz API churn** — pin a specific image tag (§0). When upgrading, re-run §1 audit. If `createPost` returns 422, the request shape has likely changed — update `worker/src/postiz.ts` `createPost`.
- **Tunnel flap on postiz-host** — the cron in `worker/src/cron.ts` reconciles every minute as a fallback, so a 5-minute tunnel outage at most delays status by a minute, not loses it.
