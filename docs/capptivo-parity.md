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

### Phase 2 — capture reliability & recorder UX
- Source picker with live thumbnails at full size (thumbnails exist; add
  refresh + "screen changed" detection).
- Area picker: crosshair + size HUD + Escape cancel states (Capptivo-level).
- Pause/resume indicator overlay; recorder error toasts carry a
  "Open permissions" action button.
- Smoke test extension: assert the display-media handler resolves a synthetic
  request.

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
