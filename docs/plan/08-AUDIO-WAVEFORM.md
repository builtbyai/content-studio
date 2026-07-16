# Phase 08 — Audio waveforms + mixing

Status: PARTIAL — pseudo-waveform sparkline on timeline clips. Real decode + mixing pending.

## What ships next
1. Decode video clip audio via WebAudio `AudioContext.decodeAudioData` after element load.
2. Compute peaks (max abs amplitude per N samples).
3. Render peaks as <canvas> in the clip block — replaces the pseudo-wave.
4. Support audio-only clips on track A1 (mime starts with `audio/`):
   - Loaded via separate <audio> element; audio path through AudioContext.createMediaElementSource → audioDest.
   - Drawn on timeline with a flat color (no thumbnail).
5. Render-time audio mix: weight each source by per-track volume slider (per-track gain node).
6. Voiceover button — Whisper transcribe a video clip, regenerate via XTTS in a chosen voice, drop result as audio clip on A1.

## Files
- web/src/components/timeline/Waveform.tsx — new
- web/src/components/VideoEditor.tsx — extend render pipeline to mix multi-source audio

## Risks
- iOS Safari blocks AutoPlay'ed audio without user gesture; gate render behind explicit "Render" click (already true).
- Cross-origin video may have empty MediaStream audio; require `crossOrigin="anonymous"` (already set).
