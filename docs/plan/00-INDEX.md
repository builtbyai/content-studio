# ContentForge Mammoth Build — Execution Plan

This plan delivers everything the devils-advocate prosecution flagged as missing,
plus the user-requested capability ramp (Premiere-Pro timeline, multi-tool
consolidation, Enhance Lab, intel sweep, etc.).

Each phase is its own md so they can be executed independently or in parallel
by sub-agents.

## Phase index

All phases ship. No priority weighting — each one is required for parity.

| # | File | Outcome | Status |
|---|---|---|---|
| 01 | [01-CRITICAL-FIXES.md](01-CRITICAL-FIXES.md) | Post-ready media attach + scene D1 finalize + webhook HMAC + SSE verify | TODO |
| 02 | [02-ENHANCE-LAB.md](02-ENHANCE-LAB.md) | UI for upscale / bg-remove / music / voice clone / lip-sync / interp / Whisper / FLUX / Ideogram | TODO |
| 03 | [03-TIMELINE-PREMIERE.md](03-TIMELINE-PREMIERE.md) | Multi-track timeline, frame-accurate scrubber, draggable clips, zoom, snap, waveforms | TODO |
| 04 | [04-ASSET-TRAY.md](04-ASSET-TRAY.md) | Persistent bottom dock w/ drag-source to picker / timeline / start-frame | TODO |
| 05 | [05-STUDIO-CONSOLIDATION.md](05-STUDIO-CONSOLIDATION.md) | Studio = default Build entry; old tabs folded under Legacy | TODO |
| 06 | [06-COST-TRACKER.md](06-COST-TRACKER.md) | Accurate per-job + per-session + monthly USD spend bar | TODO |
| 07 | [07-INTEL-DEEPEN.md](07-INTEL-DEEPEN.md) | Sentiment, cluster, signal feed, competitor diff alerts | TODO |
| 08 | [08-AUDIO-WAVEFORM.md](08-AUDIO-WAVEFORM.md) | Audio tracks, mixing, VO via Whisper+XTTS, waveform render | TODO |
| 09 | [09-TEXT-OVERLAYS.md](09-TEXT-OVERLAYS.md) | Per-clip text layers, kinetic type, brand-locked fonts | TODO |
| 10 | [10-LUT-PRESETS.md](10-LUT-PRESETS.md) | Color presets + import .cube LUTs | TODO |
| 11 | [11-CLEANUP-DEBUG.md](11-CLEANUP-DEBUG.md) | Remove legacy duplicate components, dead deps | TODO |
| 12 | [12-MULTI-AGENT-FLOWS.md](12-MULTI-AGENT-FLOWS.md) | Parallel agent batch dispatch via /multi-agent-search pattern | TODO |
| 13 | [13-FUTUREPROOF.md](13-FUTUREPROOF.md) | Continuously generated backlog of additions; runs forever | TODO |

## Order rules

- Phase 01 ships first regardless. It's the leak-stopper.
- Phases 02-05 can ship in parallel — no overlapping files.
- Phase 03 owns VideoEditor.tsx exclusively. No other phase touches it.
- Phase 04 owns Studio shell footer. Phase 05 owns Studio rail + App.tsx.
- Phase 11 runs last — only after the new tabs prove themselves.

## Acceptance gates

For each phase to be marked DONE:

1. Typecheck passes worker + web.
2. Vite build emits dist/ without errors.
3. Worker deploys to contentforge-api.
4. Pages deploys to contentforge project.
5. The user-visible feature is reachable from the production sidebar at https://app.example.com.
6. The phase doc gets a `## Verification` section appended with: deploy version id + screenshot path + 1-paragraph manual-test note.
