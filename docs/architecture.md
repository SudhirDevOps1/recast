# Architecture

Status: specification. Implementation starts in Phase 1.

## Goals

Recast must record reliably for hours, render a 60fps editor UI on a five-year-old laptop, and produce exports that match the preview exactly. Those three goals drive every decision below.

## Process model

```
┌──────────────────────────────────────────────────────────────┐
│ Main process                                                 │
│  · windows & tray        · global shortcuts                  │
│  · permissions / TCC     · file system & project store       │
│  · capture orchestration · FFmpeg sidecar supervision        │
│  · auto-updater          · single-instance & deep links      │
└───────────────┬──────────────────────────────────────────────┘
                │ typed, versioned IPC (zod on both ends)
┌───────────────▼──────────────────────────────────────────────┐
│ Renderer (React)                                             │
│  · library · recorder setup · editor · export · settings     │
│  · preview canvas (GPU)                                      │
└───────────────┬──────────────────────────────────────────────┘
                │ postMessage / MessageChannel
┌───────────────▼──────────────────────────────────────────────┐
│ Workers                                                      │
│  · encoder (WebCodecs)   · muxer (mp4/webm)                  │
│  · thumbnailer          · whisper                            │
└──────────────────────────────────────────────────────────────┘
```

### Windows owned by main

| Window | Purpose | Properties |
|---|---|---|
| `library` | Main app, project list | Standard window, custom title bar |
| `recorder` | Setup: source, audio, cam, countdown | Frameless-ish modal |
| `tray` | Floating recording capsule | Frameless, always-on-top, draggable, click-through outside |
| `picker` | Source / area selection overlay | Full-screen per display, transparent |
| `editor` | Timeline and preview | Standard window, can open a second project |
| `hidden` | Export compositor | Offscreen, no user interaction |

Each window is isolated: its own renderer, its own state slice. Never pass live objects across; pass serializable messages only.

## IPC contract

- One bridge in `preload/index.ts`. No `ipcRenderer` exposure.
- Every channel is declared in `packages/shared/ipc.ts` with a zod request and response schema.
- Channels are versioned by group (`recorder:*`, `media:*`, `project:*`, `export:*`, `system:*`).
- Renderer never receives a raw file path it can write to. Main resolves paths and returns opaque handles.
- Main validates the caller window for privileged channels (e.g. only the recorder window may start capture).

## Capture pipeline

```
desktopCapturer → setDisplayMediaRequestHandler → getDisplayMedia
      → MediaStreamTrack (video, optional audio)
      → MediaStreamTrackProcessor → VideoFrame
      → VideoEncoder (hardware) → EncodedVideoChunk → muxer worker → disk
```

- Video and audio chunks are written as **fragmented segments** every ~2 seconds with a 2-second keyframe interval, so a crash leaves a recoverable file.
- The recorder keeps a small ring buffer in memory; segments are flushed with `fsync` on a background thread.
- Audio is captured as two tracks (mic, system) and mixed at export. A single mixed track would destroy editing options.

## Audio graph

```
mic device ──► MediaStreamAudioSourceNode ──► gain ──┐
                                                      ├──► AudioWorklet (meter + resample + timestamp)
system loop ─► MediaStreamAudioSourceNode ──► gain ──┘
                                                      └──► MediaStreamAudioDestinationNode → encoder
```

The worklet emits 20 Hz meter levels to the recorder UI and a 48 kHz PCM stream to the encoder worker.

## Cursor and input

- `uiohook-napi` runs in main and samples global cursor position at 60 Hz.
- Samples are batched and sent at ~20 Hz to the renderer to avoid IPC flooding.
- Clicks, scrolls, and modifier state are captured with monotonic timestamps.
- The renderer stores a ring buffer per recording and writes it into the project at stop.
- On macOS this requires **Accessibility** permission. If it is missing, recording still works; auto-zoom falls back to manual.

## Rendering

- Preview: `<canvas>` with WebGL2 (or WebGPU where available) compositing layers: screen, face cam, cursor, annotations, captions, frame/background.
- Export: the same compositor, driven by a frame clock instead of `requestAnimationFrame`, in a hidden window or worker with `OffscreenCanvas`.
- Because both paths share the compositor code, preview and export cannot drift.
- Proxy media: 4K sources are transcoded once to a 720p proxy for scrubbing; exports always read the original.

## Storage

```
<userData>/
  recast.db            SQLite (better-sqlite3): projects, presets, assets, settings
  projects/<id>/       project.json + media/ + thumbs/ + proxy/
  recordings/          raw captures, grouped by session
  cache/               thumbnails, waveforms, models
  logs/                rotating logs, 7 days
  bin/                 optionally downloaded FFmpeg binaries
```

- `.recast` files are portable bundles: zipped project JSON plus media, or a references-only variant that points to local paths.
- Autosave every 5 seconds into `project.json.tmp` then atomic rename; a startup scan recovers from a leftover temp file.
- Schema migrations live in `packages/shared/migrations` and run once on launch with a backup taken first.

## Failure domains

| Failure | Containment |
|---|---|
| Encoder init fails | Fallback chain: HW H.264 → HW HEVC → software → MediaRecorder |
| Renderer crashes | Main restarts the window; recording continues in the tray window |
| Main crashes | Segments on disk; recovery offered on relaunch |
| Disk full | Recording stops cleanly, file finalized, user warned |
| FFmpeg missing | Utility features degrade with a clear message; export falls back to WebCodecs |
| Worker hangs | Watchdog with timeout and kill; export marked failed, not silently stuck |

## Performance budgets

| Metric | Budget |
|---|---|
| Cold start | < 2.5 s |
| Idle RAM | < 250 MB |
| Editor interaction | < 100 ms |
| Timeline scrub | 60 fps on a 10-minute 1080p project |
| Dropped frames | < 2 % at 1080p60 (M1 / i5-1135G7) |
| Export | 1 min 1080p30 < 30 s on mid-tier hardware |

Measurements live in `PERFORMANCE.md` once the app exists. Until then these are targets, not claims.
