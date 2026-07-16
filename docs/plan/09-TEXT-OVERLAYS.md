# Phase 09 — Text overlays

Status: SHIPPED (VideoEditor.tsx Clip.textLayers + Text inspector tab)

- Per-clip text layers with: text, position (0..1), font size, weight, family, color, background CSS, padding, start/end seconds, fade, alignment.
- Drawn on render canvas above the clip transform (stable position regardless of motion).

### Future
- Brand font import (Acme Space Grotesk / Inter / etc.) selectable.
- Kinetic typography presets: pop-in, slide-up, type-on, glitch.
- Text shadow + stroke for legibility against bright backgrounds.
- Smart contrast: auto-pick text color based on underlying clip luminance at text bounds.
- Per-letter animation timing (split string into spans, stagger).
