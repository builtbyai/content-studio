# Phase 03 — Premiere-Pro-grade timeline

## Architecture
Split VideoEditor into two regions:
- Top: preview canvas + playhead + transport
- Bottom: TimelinePanel — zoomable horizontal ruler, multi-track lanes, draggable clip blocks

## Tracks
- Video track (V1)
- Optional: V2 overlay (text/picture-in-picture)
- Audio track (A1) — for voice / music
- Each track shows clip blocks scaled by output duration

## Features
- Zoom slider (10 px/s → 600 px/s)
- Snapping to playhead, clip edges, beats
- Click-drag clip on lane to reorder / move
- Drag clip edges to extend / shorten trim
- Frame-accurate scrubber (1/30s)
- Playhead position synced to preview canvas
- Multi-select clips (Shift+click) → batch effects
- Keyboard: J/K/L (rewind / pause / play), I/O (mark in/out), spacebar
- Audio waveform sparkline for video clips (decode → peaks → drawImage)

## Files
- web/src/components/timeline/TimelinePanel.tsx — new
- web/src/components/timeline/TimelineRuler.tsx — new
- web/src/components/timeline/TimelineClipBlock.tsx — new
- web/src/components/timeline/WaveformSparkline.tsx — new
- web/src/components/VideoEditor.tsx — slot in TimelinePanel below preview
