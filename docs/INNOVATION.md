# ContentForge — Innovation Roadmap

Bold directions to push ContentForge from "26-node pipeline that ships campaigns" to "the leverage layer for a one-person media + sales company." Each section calls out what's already in the codebase that we'd build on, what's new, and what the unlock is.

---

## 1. Close the loop: make the pipeline learn from outcomes

**Today:** The 26-node pipeline runs forward — brief → assets → schedule → send. Postiz analytics come back in, but they don't reshape the next run.

**Innovation:** Wire `Analytics.tsx` (Postiz metrics) and `workflow_audit_events` into a feedback ledger. Per post, capture: engagement, CTR, sales-reply rate (Node 25 already does intent scoring on inbound), and join it back to the brief, concept, prompt schema (Node 07), and provider (Node 09) that produced it.

**Mechanism:**
- New D1 table `outcome_signals(asset_id, post_id, metric, value, captured_at)` — populated by cron from Postiz + outreach replies.
- Brand profile in KV gains a `learned_axes` block — which hooks/CTAs/visual styles outperform for *this* brand.
- Node 02 (Brand Profile Resolver) reads `learned_axes` and biases Node 07 (Prompt Schema Builder) toward winning patterns.
- Surface in UI as a "Brand IQ" panel — "your audience converts 3.1× better on warm-toned product hero shots vs. lifestyle."

**Unlock:** The system stops being a generator and becomes a *compounding* asset. Month 1 it's average. Month 6 it's tuned to *your* audience in a way no general LLM can replicate.

---

## 2. Agentic regeneration with a critic loop

**Today:** Node 14 (Creative Quality Review) runs llamaguard + LLaVA caption; Node 15 (Regeneration + Delta Prompt) fires *once* when review score <0.72.

**Innovation:** Promote Node 14/15 to a proper agent loop with a separate **critic** model (cheap, fast — Workers AI llama-3.3-70b or Haiku via AI Gateway) that doesn't just score but proposes structured edits: "background is on-brand but the product is rotated 12° off-axis; subject line buries the value prop in clause 2; the CTA verb conflicts with brand voice rule #4 (forbidden claim)."

**Mechanism:**
- Critic emits `{score, dimensions:{brand, composition, copy, compliance}, delta_prompt, stop_recommendation}`.
- Loop until score ≥ threshold OR delta is too small (<0.05 improvement) OR `max_iterations` hit.
- Bound by Node 10 (Cost Governor) — critic has its own budget envelope.
- Every iteration goes to `workflow_audit_events` so you can scrub the loop frame-by-frame.

**Unlock:** Quality floor jumps without changing the generator. Also produces training data: pairs of (rejected, accepted) per brand become a fine-tuning corpus down the line.

---

## 3. Real-time collaborative workflows via Durable Objects

**Today:** `ScheduleRoom` DO does per-user SSE fan-out for live generation status — one user, many tabs.

**Innovation:** Promote DOs to per-workflow collaboration rooms. Multiple humans (or a human + an AI agent) can co-edit a brief, watch generations stream in, vote on concepts, and approve sends, all with CRDT-style merge.

**Mechanism:**
- New `WorkflowRoom` DO keyed by `workflow_id`.
- Storage-side: brief draft, concept ratings, comment threads, approval gates.
- Broadcast: every state change → all attached SSE/WebSocket clients.
- Hook to existing UI: `Generations.tsx`, `WorkflowStudio.tsx`, `SalesWorkspace.tsx` subscribe by `workflow_id` instead of `user_id`.

**Unlock:** ContentForge becomes usable by a small agency (creative + account manager + client reviewer) without a full multi-tenant rebuild. Schema already carries `tenant_id` everywhere — DOs are the missing collaboration primitive.

---

## 4. Semantic memory across everything

**Today:** Three Vectorize indexes (`VEC_BRANDS`, `VEC_COMPETITORS`, `VEC_LEADS`), all 768-dim cosine. Used by Node 02 (brand resolution) and Node 18 (competitor intel).

**Innovation:** Add `VEC_ASSETS`, `VEC_ARTICLES`, `VEC_OUTREACH`, `VEC_CONVERSATIONS` and expose a unified `/api/recall` route. Anything the system has ever generated, ingested, or sent is semantically retrievable.

**Mechanism:**
- Cron-triggered embedding pass over `generated_assets`, `articles`, `outreach_messages`, chat history.
- `/api/recall?q=…&scope=assets,articles&limit=20` returns ranked hits across types.
- Wire into:
  - **Node 07 (Prompt Schema Builder)** — "have we ever shipped something like this? show me top 3 with engagement scores."
  - **Node 22 (Outreach Copy Agent)** — "what messaging has this prospect's industry responded to before?"
  - **Global Chat** — RAG over everything the studio has produced. The Copilot stops hallucinating because it can actually cite your own corpus.

**Unlock:** The system has institutional memory. Onboarding a new client = the new brand profile starts from neighbors, not from scratch.

---

## 5. Browser-native brand ingestion

**Today:** Brand profile in KV is hand-edited in `BrandEditor.tsx` (voice, palette, forbidden claims, products).

**Innovation:** Paste a URL → automatic brand profile draft. Worker fetches the homepage, runs a headless extraction (CSS variables, dominant palette, font stack, hero copy tone, product titles), drafts a brand profile, embeds it, and offers a one-click diff against existing.

**Mechanism:**
- New worker route `POST /api/brand/ingest {url}`.
- Use Cloudflare Browser Rendering binding (or fetch + a parser worker) → DOM snapshot.
- Tone classifier (gpt-4o-mini chat via env.AI) on visible copy.
- Color extraction from inline styles + computed CSS.
- Vectorize lookup against `VEC_COMPETITORS` to auto-flag visual collisions.

**Unlock:** Time-to-first-campaign for a new brand drops from ~30 min of form filling to ~30 sec of "looks right, ship it."

---

## 6. Treat Postiz as one of many — Publisher Abstraction Layer

**Today:** `postiz.ts` is the only publisher. Queue consumer hands jobs directly to its public-api.

**Innovation:** Define a `Publisher` interface and ship two more implementations: **Buffer** and **direct-to-platform** (Meta Graph API, LinkedIn Marketing, X v2). Pick per-channel at schedule time. Postiz becomes the default but isn't load-bearing.

**Mechanism:**
- `interface Publisher { schedule(asset, target, when), getStatus(jobId), reconcile() }`.
- `worker/src/publishers/{postiz,buffer,native}.ts`.
- `channels` D1 table grows a `publisher` column; UI shows which is active per connected account.
- Reconciliation cron iterates all publishers.

**Unlock:** Postiz outage doesn't take you down. Also opens the door to platforms Postiz lags on (Bluesky, Threads, Mastodon) and to selling ContentForge to users who already have Buffer.

---

## 7. Expose ContentForge as an MCP server

**Today:** Everything is reachable via REST/SSE from the React app.

**Innovation:** Ship `contentforge-mcp` — an MCP server (Cloudflare Workers MCP is GA) that exposes the studio as tools for any MCP client (Claude Desktop, Claude Code, ChatGPT desktop, agentic IDE plugins). Tools: `submit_brief`, `dispatch_workflow`, `list_generations`, `approve_outreach`, `recall(query)`, `schedule_post`.

**Mechanism:**
- New `worker/src/mcp.ts` exposing the existing routes through MCP's tool schema.
- Auth via the existing D1 session cookie OR a personal access token.
- Resources: `workflow://{id}`, `brand://{id}`, `asset://{id}` for direct context attachment.

**Unlock:** You can drive a content shop from Claude Code while editing code. Customers can chain ContentForge into their own AI workflows. Distribution channel: every MCP marketplace.

---

## 8. Predictive cost governance

**Today:** Node 10 (Cost Governor) does greedy fit by confidence/cost. Static.

**Innovation:** Train a tiny per-tenant cost model on `workflow_audit_events` history: given (brief complexity, brand, target platforms, variation count), predict total cost + p50/p95 wallclock. Show the user **before** they hit Execute. Offer "cheap mode," "balanced," "best."

**Mechanism:**
- Batch job: nightly, export audit events to a feature table, fit a gradient-boosted regressor (or just a calibrated quantile lookup) in a Worker.
- `POST /api/workflows/{id}/estimate` already exists — extend it to return `{predicted_cost, p50_seconds, p95_seconds, alt_modes:[…]}`.
- UI: cost dial in `WorkflowStudio.tsx` with live re-estimation as the user tweaks the brief.

**Unlock:** No more surprise spend. Also exposes which providers are mispriced for your workload — actionable input to Node 08 (Provider Capability Resolver).

---

## 9. Brand voice consistency via embedding-locked generation

**Today:** Brand voice is a few paragraphs of natural-language guidance the LLM tries to follow.

**Innovation:** Compute a **voice fingerprint** — the mean embedding of your last N approved pieces — and at generation time, re-rank LLM candidates by cosine similarity to that fingerprint. Reject below-threshold outputs and re-roll.

**Mechanism:**
- Cron updates `VEC_BRANDS:{brand_id}:voice_centroid` every time an asset is approved.
- `llm.ts` gains a `voiceLockedGenerate(brand_id, prompt, candidates=4)` helper that does n-sample + re-rank.
- Threshold per-brand, learned from variance of approved corpus.

**Unlock:** "Sounds like us" gets enforced mechanically. The longer you use ContentForge for a brand, the tighter the voice gets — without any manual prompt-engineering grind.

---

## 10. Live competitor radar

**Today:** Node 18 (Competitor Intelligence) runs on-demand against Vectorize.

**Innovation:** Push it. Hourly cron crawls each competitor's RSS, social (via Postiz read-paths or scrape), blog, and pricing page. New content embeds → diff against rolling baseline → if Δ > threshold, fire an SSE notification through `ScheduleRoom` and write a `competitor_event` row.

**Mechanism:**
- `content_sources` table already exists — add `kind='competitor_pulse'` rows.
- Existing hourly cron does the fetch.
- New `CompetitorRadar.tsx` panel under Research shows a timeline; clicking an event pre-fills a brief ("respond to X's launch with a counter-angle").

**Unlock:** Reactive content stops being a 24-hour lag. The studio nudges you the moment a competitor moves.

---

## Cross-cutting bets

- **Voice-cloning for video** — once Runway credits return, train a per-brand video voiceover via ElevenLabs (or Workers AI when text-to-speech ships there). Wire into Node 09's video branch.
- **A/B as a first-class concept** — variations matrix (Node 12) already exists. Add an `experiment_id` column to schedules, and a daily cron that pulls Postiz metrics per arm, declares a winner via Bayesian bandits, and auto-promotes.
- **Edge personalization** — server-side render per-recipient outreach copy at send time, keyed off enriched prospect signals, via a Worker route hit by the publisher.
- **Federated syndication** — Node 16 (Export Package Builder) already emits HTML catalogs. Auto-publish to a Cloudflare Pages microsite per campaign and ping IndexNow for instant SEO.

---

## Suggested sequencing

| Wave | Pick | Why first |
|---|---|---|
| Wave 1 (4–6 weeks) | §1 outcome loop · §4 semantic memory · §7 MCP server | All three are low-risk, leverage existing tables/indexes, and compound the value of every other feature you ship later. |
| Wave 2 (6–8 weeks) | §2 critic loop · §9 voice fingerprint · §8 predictive cost | These need Wave 1's outcome data and embedding coverage to be sharp. |
| Wave 3 (8+ weeks) | §3 collaborative DO rooms · §6 publisher abstraction · §10 competitor radar | Bigger surface changes; defer until the learning loop is paying for itself. |
| Wave 4 | §5 browser brand ingestion + cross-cutting bets | Polish, distribution, and the parts that depend on outside vendors (Runway credits, TTS GA). |

---

## What to *not* do

- **Don't multi-tenant prematurely.** Schema already supports it; UI/middleware work is real but the user count doesn't justify it yet. Revisit after Wave 1.
- **Don't fork Postiz.** The whole reason it's an external dependency is to keep the OAuth tail off your plate. Abstracting (§6) is right; replacing is not.
- **Don't add a fifth LLM provider.** The Gemini→OpenAI fallback chain is fine. Spend the energy on the critic loop (§2) instead — that's where quality lives.
- **Don't build an analytics warehouse.** Postiz + D1 audit events are enough for everything in this doc. Resist the urge to copy data into BigQuery/ClickHouse until a feature genuinely needs it.
