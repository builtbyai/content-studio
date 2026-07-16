# Phase 01 — Critical Fixes

## Items
1. PostReady: attach the actual media to the scheduled post, not just text.
2. Scenes table: persist `image_media_id` / `video_media_id` / `status` to D1 so compositions are resumable across sessions.
3. Webhook HMAC: set `REPLICATE_WEBHOOK_SECRET` so `/api/webhooks/replicate` rejects unsigned bodies.
4. Verify `/api/events/stream` exists (DONE — see prosecution: line 1429 in worker/src/index.ts).
5. Tighten `acmeapp` channel matcher to prefer exact account-name match.

## Files
- worker/src/index.ts — `/api/scenes/:id/result` PATCH (new), schedulePost mediaR2Keys (fix consumer expectations).
- web/src/lib/api.ts — `setSceneResult` typed method.
- web/src/components/SceneComposer.tsx — call `setSceneResult` after image/video gen success.
- web/src/components/PostReady.tsx — pass `mediaR2Keys: [m.r2_key]` to `schedulePost`; tighten regex.

## Tests
- Plan a 4-scene composition; refresh page; scenes still show their image previews. (manual)
- Schedule a post from a generated image; verify the Postiz UI shows the image attached. (manual)
- Hit /api/webhooks/replicate without a signature header; should 401 once secret is set.
