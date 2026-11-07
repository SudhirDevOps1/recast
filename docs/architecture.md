# Architecture

## Process model

Three Electron processes, one direction of trust:

```
┌────────────────────────── main (Node) ──────────────────────────┐
│ windows, tray, menu, globalShortcut, permissions, deep links     │
│ better-sqlite3 library, .recast project files (atomic writes)    │
│ session service (segments, manifest, cursor.jsonl)               │
│ input sampler (60 Hz poll + uiohook-napi hooks)                  │
│ FFmpeg runner (spawn, shell:false, arg arrays, tree-kill)        │
│ whisper sidecar, updater, export disk IO (positional .part)      │
└───────────────▲─────────────────────────────▲───────────────────┘
        typed, zod-validated IPC       media + export file protocol
                ▼                             ▼
┌──────────────────────── renderer (sandboxed) ───────────────────┐
│ React 19 app: Library / Record / Editor / Export / Settings      │
│ capture engine (WebCodecs, mp4-muxer, AudioWorklet)              │
│ export engine (frame clock, compositor, WebCodecs muxing)        │
│ preview (same compositor, rAF only for interactive playback)     │
└──────────────────────────────────────────────────────────────────┘
```

- **Main owns the OS.** Windows, tray, shortcuts, permissions, file IO, FFmpeg/whisper supervision, updater, deep links (`recast://`), single instance. The renderer never touches Node.
- **Renderer owns pixels.** Capture, preview and export all run in the renderer where the GPU and WebCodecs live.
- **Preload is one typed bridge.** `window.recast` with `invoke(channel, payload)`, `on(event, handler)`, `send(channel, payload)`. Contract version asserted at startup.

## IPC

- Every channel is declared once in `packages/shared/src/ipc.ts` as `{ req: zodSchema, res: zodSchema }`.
- Main validates requests (`ipc.ts` registry), preload validates responses and event payloads before they reach React.
- A malformed payload fails loudly with the channel name — no silent `undefined` propagation.
- Errors cross as `{ __error: string }` and throw on the caller side.

## Storage

| Data | Location | Format |
|---|---|---|
| Settings | `<data>/settings.json` | JSON, atomic writes |
| Library index | `<data>/library.db` | better-sqlite3, WAL |
| Projects | `<data>/projects/<id>.recast` | JSON (schemaVersion 1), atomic, autosaved every 5 s |
| Recording sessions | `<data>/recordings/<sessionId>/` | `session.json` manifest + `seg-NNNN.mp4` fragments + `cursor.jsonl` |
| FFmpeg (in-app install) | `<data>/bin/ffmpeg/` | binaries + manifest.json |
| Whisper models | `<data>/models/` | ggml files |

`<data>` = `%APPDATA%\Recast` / `~/Library/Application Support/Recast` / `~/.config/recast`, or the executable directory in portable mode.

## Failure domains

| Failure | Blast radius | Recovery |
|---|---|---|
| App crash mid-recording | current ≤ 2 s fragment (unclosed) | closed segments are complete MP4s; `session.json` lists them; Library offers recovery → `ffmpeg -c copy` remux |
| Renderer crash | recording dies; segments survive | same recovery path; main marks session `crashed` |
| Disk full | recording degrades | disk-space guard reported in tray state; recorder error surfaced, never silently truncated |
| FFmpeg missing | utility features degrade | launch-time `-version` probe (2 s timeout); affected features show a Repair button; core record→edit→export unaffected |
| whisper.cpp missing | captions degrade | precise message with the install command; never a fake transcript |
| Export cancel | nothing | bytes live in `.part`; renamed only after mux + verify |
| Power loss during settings/project write | nothing | tmp + rename atomic writes everywhere |

## Clock discipline

Renderer capture clock and main input sampler both use `(Date.now() − sessionStartEpochMs) × 1000` minus paused time. One shared epoch (`recorder:start` returns `startEpochMs`) keeps cursor events aligned with video frames across the process boundary. Pauses subtract on both sides (`inputSampler.pause/resume` ↔ recorder pause bookkeeping).

## Determinism

The compositor is a pure function of `(project, timeUs) → draw plan`, and the zoom camera is a fixed-step (60 Hz) integrated track evaluated by binary search + lerp. Preview and export call the same `computeComposition` + `drawComposition`; export steps the frame clock at `1/fps` while preview steps at rAF for interactivity. The golden-frame SSIM harness (planned, see STATUS) will lock preview/export parity at ≥ 0.995.
