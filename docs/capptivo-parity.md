# Capptivo-parity plan

Goal: bring Recast to the level of SECHAK-AG/capptivo (MIT, v1.0.4) — a free,
open-source Screen Studio alternative — while keeping Recast's stack
(Electron + TypeScript) and its zero-subscription, 100 % local promise.

## What Capptivo does (analyzed from source)

| Concern | Capptivo approach |
| --- | --- |
| Shell | Tauri 2, Rust backend, React 19 + Tailwind 4 + Radix UI |
| Recording | Native Rust capture (`src-tauri/src/recorder`), area picker window, permissions module |
| Cursor | Native cursor tracking (`src-tauri/src/cursor`) with hotspot self-checks |
| Effects | `src/engine`: cameraTransform (zoom/pan), cursorMotion, blurRegions, backgroundBlur — pixi.js on the frontend |
| Export | Native Rust engine crate (`capptivo-engine`): decode → composite → encode H.264; gifenc for GIF |
| Captions | whisper.cpp sidecar, silence detection, cue editing |
| Windows | Multi-window pages: recorder / editor / area / camera / annotation / frame |

## Gap analysis → phases

### Phase 1 — recording works (shipped in this commit)
- **Root cause of "recording never starts":** Electron ≥ 22 denies every
  `getDisplayMedia()` unless the main process registers
  `session.setDisplayMediaRequestHandler`. Recast never did — fixed in
  `apps/desktop/src/main/display-media.ts`, wired at bootstrap, resolving the
  source picked in Recast's picker (`context.recorderRequest`).
- Windows system audio via `audio: 'loopback'`; graceful video-only retry when
  a platform rejects the audio constraint.
- Human-readable errors for `NotAllowedError` / `NotFoundError` / unsupported.

### Phase 2 — capture reliability & recorder UX (shipped)
- **Live thumbnails**: `sources:list` now returns `thumbnailDataUrl` for
  screens and windows (previously desktopCapturer thumbnails were fetched and
  discarded); the picker renders them full-card with an icon fallback.
- **Refresh + screen-changed detection**: manual "Refresh" button on the
  Source section, plus automatic re-enumeration whenever the app window
  regains focus (the open picker no longer shows stale windows/displays).
- **Pause/resume fixed**: the Pause button never toggled to Resume — a paused
  recording could only be stopped. It now flips to Resume (with play icon),
  calls `recorder:resume` + `handle.resume()`, and the badge carries a
  pulsing red dot while recording / steady amber while paused.
- **Actionable error toasts**: `showToast` accepts an action button; display
  capture denials (`NotAllowedError`) surface an "Open permissions" button
  that calls `permissions:openSystemSettings` directly from the toast.
- Area picker already has crosshair, live size HUD, 4× magnifier, Enter
  confirm, Escape cancel and arrow-key nudge (Capptivo-level).
- Smoke coverage for the display-media handler + a full pick→record→stop→
  library→export flow landed alongside the segment-freeze fix (`568baa2`).

### Phase 3 — creative parity (the "advanced" layer)
- **Annotations engine**: text / image / shape overlays on the timeline
  (Capptivo `src/annotation`), rendered in compositor + export.
- **Webcam overlay**: camera capture → draggable/resizable rounded frame,
  mirror, zoom-reactive scaling (Capptivo `camera.html` + `cameraTransform`).
- **Blur**: background blur pad + region blur (`blurRegions`) behind the
  existing design panel.
- **Cursor motion**: bezier smoothing + motion-blur trail toggle on top of the
  existing Motion 2.0 cursor FX.

### Phase 4 — captions & sharing polish
- Silence-based caption segmentation + cue text editing UI (both exist in
  Capptivo; Recast has whisper transcription + SRT/VTT export already).
- GIF export quality presets (ffmpeg GIF path exists).

### Explicitly out of scope
- Rewriting capture/render in Rust — Recast's WebCodecs + ffmpeg pipeline is
  cross-platform and shippable; we fix and harden it instead.
