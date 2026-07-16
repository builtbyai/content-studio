# Phase 04 — Asset Tray bottom dock

Status: SHIPPED (web/src/components/AssetTray.tsx)

- Bottom-left strip, collapsible.
- Pull last 60 from /api/media.
- Re-fetch on every terminal job.
- Pinned tiles persist in localStorage `cf:assetTray:pinned`.
- HTML5 drag: data transfer carries `application/x-media-url`, `application/x-media-id`, `application/x-media-r2-key`.

### Future
- Accept drops on Video Editor timeline empty zone → auto-add clip.
- Accept drops on Video Lab start-frame slots → auto-fill promptImage.
- Filter chips (image / video / audio).
