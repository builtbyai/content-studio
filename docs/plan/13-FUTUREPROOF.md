# Phase 13 — Futureproof backlog (auto-generated, evergreen)

This is the rolling backlog of features the system should accumulate over time. The set is intentionally large so it always has more to chase. Pick from any group when a session has slack.

## Generation
- [ ] Image-to-3D mesh via Hunyuan3D / TripoSR — outputs `.glb` to R2
- [ ] AnimateDiff motion for static images
- [ ] InstantID face-locked image generation
- [ ] SDXL Turbo for sub-second drafts
- [ ] LayerDiffuse transparent-layer image generation
- [ ] LoRA training-from-references workflow (user uploads 5-15 images, finetune, register as private model)
- [ ] Region-specific inpainting (mask draw on image → regen masked area only)
- [ ] Outpainting (extend image canvas in any direction)
- [ ] Reference-image consistency lock across multi-scene compositions
- [ ] Style transfer via Stable Diffusion ControlNet

## Video
- [ ] Multi-shot long-form video (chained Veo + cuts)
- [ ] AI lip-sync from script directly (TTS → Wav2Lip pipeline)
- [ ] B-roll auto-cut to beat of music track
- [ ] Subtitle burn-in via Whisper + canvas text layer
- [ ] Speed ramp curves (ease-in / ease-out per clip)
- [ ] Motion-tracked text overlays
- [ ] Green-screen / chromakey on canvas render
- [ ] Picture-in-picture overlay (clip-on-clip)
- [ ] Slow-mo via interpolate_video (already in registry; needs Editor right-click action)
- [ ] Frame-by-frame stop-motion authoring

## Audio
- [ ] Real audio waveform render in TimelinePanel
- [ ] Multi-source audio mixing in render
- [ ] Stem-separated remix (vocals / drums / bass via Demucs)
- [ ] Auto-ducking (lower music when narration plays)
- [ ] Voice clone library (pinned XTTS voice samples per brand persona)
- [ ] Real-time music match-to-video via cross-modal embedding

## Intel
- [ ] Auto-cluster signals by embedding similarity
- [ ] Daily intel digest email via Resend / Postmark
- [ ] Competitor URL diff alerts (article appears we haven't seen → battlecard candidate)
- [ ] Slack webhook on regulatory / hail-storm signal
- [ ] Sentiment trend chart per competitor over time
- [ ] Lead-temperature scoring on inbound contacts via Node 25

## Studio UX
- [ ] Asset Tray drop targets in every workbench (start-frame slots, timeline)
- [ ] Cmd+K palette resolves to Studio sub-views
- [ ] Mobile sidebar collapse to top-tabs + bottom-sheet inspector
- [ ] Keyboard shortcuts overlay (`?` opens cheatsheet)
- [ ] Per-workbench undo/redo stack
- [ ] Multi-window: pop out the Editor into a separate browser window
- [ ] Right-click context menu on every asset / clip / scene

## Pipelines
- [ ] Saved Workflow Composer chains as named templates
- [ ] Scheduled chain execution (`run this chain weekly`)
- [ ] Branching nodes (conditional next step based on Node 14 quality score)
- [ ] Parallel fan-out node (1 input → N variations)
- [ ] Loopback node (regen with adjusted seed until score > threshold)

## Cost + governance
- [ ] Per-job cost estimate banner before dispatch
- [ ] Monthly spend cap with hard block + soft warn at 80%
- [ ] Per-source-kind spend breakdown
- [ ] Quotas per user (multi-tenant later)
- [ ] Cost-aware model picker (auto-downgrade from Veo 3 → Veo 3 Fast when budget tight)
- [ ] Budget rollover policy

## Publishing
- [ ] One-click "Make me a TikTok" preset (vertical 9:16, 30s, captions, music, post-ready)
- [ ] LinkedIn-tuned crop + caption preset
- [ ] Instagram Reels carousel builder
- [ ] Direct-to-YouTube Shorts upload
- [ ] Cross-poster: same draft → all channels with platform-specific copy variants

## Multi-agent
- [ ] /api/agents/dispatch parallel fan-out
- [ ] Research → contrarian → synthesizer pattern
- [ ] Devil's advocate inline review on every Scene Composer build
- [ ] Auto-critique with score (1-10) per scene; regen below 7

## Storage / archive
- [ ] R2 lifecycle policy (move >90-day media to cold storage)
- [ ] Generation_jobs older than 180d → archive table
- [ ] Public share links with expiration
- [ ] Encryption at rest for sensitive briefs

## Quality
- [ ] Replicate `metrics.predict_time` capture per job → exact cost
- [ ] AI Gateway analytics ingestion → real spend reconciliation
- [ ] Per-model SLO tracking (succeed rate, p95 latency)
- [ ] Error-boundary collector to `/api/errors`

## Realtime
- [ ] Multi-user collaboration on Compositions (Y.js + DO)
- [ ] Cursor presence
- [ ] Comment threads per scene / clip
- [ ] Approval workflow (creator → reviewer → publisher)

## Devtools / observability
- [ ] `/api/debug` route with feature flags toggle
- [ ] Sentry-like crash collector
- [ ] Trace ID stamped on every API response
- [ ] Replay log for Editor render attempts

## Pure ideation (LLM-suggested expansions)
- [ ] Auto-storyboarding from a single sentence pitch
- [ ] Ambient-mode showreel: pulls latest 20 generations, renders a 60s reel at idle
- [ ] On-brand prompt nudges based on Brand profile (already partially done via PromptSuggest)
- [ ] Variant matrix dashboard: pick 3 axes (model × aspect × duration), generate full grid, vote, archive losers
- [ ] Pre-flight check: before queueing, simulate cost + duration + AI Gateway availability
- [ ] Tutorial inline overlay for new tabs

## How this list grows
- Hourly: LLM proposes 1-3 new entries based on recent diffs / signals / failed jobs.
- Manual: developer adds during retrospectives.
- The list is intentionally never closed.
