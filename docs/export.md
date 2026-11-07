# Export

Status: specification. Implementation starts in Phase 1 (MP4 only), Phase 2 (presets).

## Pipeline

```
project.json
   ↓  frame clock (t = i / fps, integer)
compositor (WebGL2 / OffscreenCanvas)
   ↓  VideoFrame
WebCodecs VideoEncoder (hardware if available)
   ↓  EncodedVideoChunk
muxer worker (mp4-muxer / webm-muxer)
   ↓
<output>.mp4  →  verify (ffprobe)  →  reveal in folder
```

Audio is rendered separately with an `OfflineAudioContext` at 48 kHz, encoded as AAC (MP4) or Opus (WebM), then interleaved by the muxer.

## Formats

| Container | Video | Audio | Use |
|---|---|---|---|
| MP4 | H.264 (default), HEVC | AAC 192 kbps | Universal sharing |
| MP4 | H.264 High | AAC | High quality |
| MOV | ProRes 422 | PCM | Handoff to a full NLE |
| WebM | VP9 / AV1 | Opus | Open formats, small files |
| GIF | — | — | Short clips, palette-optimized |

## Determinism

- Frame index drives time. No `performance.now()`, no `requestAnimationFrame`, no CSS animation in the raster path.
- Springs are evaluated analytically, not integrated per frame, so results don't depend on the encoder's pacing.
- Random-free: any procedural element uses a seeded PRNG stored in the project.
- Acceptance: SSIM ≥ 0.995 between a preview frame and the exported frame at the same timestamp.

## Fallback chain

1. WebCodecs hardware H.264 (VideoToolbox / Media Foundation / VAAPI).
2. WebCodecs hardware HEVC.
3. WebCodecs software H.264 (OpenH264 where available).
4. FFmpeg with libx264 (GPL build).
5. `MediaRecorder` (last resort, variable frame rate, clearly labeled "compatibility mode").

The user sees which path was used, and a warning only when quality or speed is affected.

## Quality presets

| Preset | Resolution | Bitrate (1080p) | Notes |
|---|---|---|---|
| Draft | 720p30 | 3 Mbps | Fast iteration |
| Standard | 1080p30 | 8 Mbps | Default for tutorials |
| High | 1080p60 | 14 Mbps | Product demos |
| Max | Source (up to 4K) | CRF 18 equivalent | Archival |

Bitrate adapts to content complexity; a static screen should not burn 14 Mbps.

## UX

- Pre-flight estimate: file size ±15 %, time estimate based on a 2-second benchmark.
- Progress with ETA, frame counter, and current stage (render / encode / mux / verify).
- Cancel leaves no partial file in the destination; temp files are cleaned on startup.
- On success: reveal in folder, copy path, and a "Share" hint (no upload, ever).
- Presets remembered per project; a global default lives in settings.

## Naming

Default filename pattern: `recast-{project}-{yyyyMMdd-HHmm}.mp4`, sanitized per OS and de-duplicated rather than overwritten.

## Verification

After muxing:

1. `ffprobe` confirms container, duration (±1 frame), stream count, and codecs.
2. Duration is compared against the project timeline.
3. A failure here marks the export as failed rather than reporting success.

## What "done" means

- Export of a 5-minute 1080p60 project completes without dropping a frame or desyncing audio.
- Cancelling at 90 % leaves the destination clean.
- Exporting the same project twice produces identical durations and matching golden frames.
- The reported "used path" is accurate.
