# Phase 02 — Enhance Lab UI

## Items
1. New `EnhanceLab.tsx` workbench: surface all non-primary Replicate models.
2. Routed via `/api/replicate/generate` (already live).
3. Each model card has its own input form (image picker, audio picker, params).
4. All dispatches run in background → job widget tracks status.
5. Registered as a Studio view + standalone tab.

## Files
- web/src/components/EnhanceLab.tsx — new
- web/src/App.tsx — tab entry
- web/src/components/Studio.tsx — view entry
