# Export

## The frame clock

Export steps time deterministically: `tUs = frame × 1_000_000 / fps`, from 0 to the timeline duration. Never `requestAnimationFrame` — rAF belongs to interactive preview only. Each step:

1. `timelineToSource` maps tUs to the active clip's source time.
2. The matching hidden `<video>` element is seeked (sample-exact; a 1.5 s watchdog prevents hangs).
3. `computeComposition` + `drawComposition` render the frame to an offscreen canvas — the same code path as preview.
4. `new VideoFrame(canvas, { timestamp, duration })` → `encoder.encode(frame, { keyFrame })` (keyframe every 2 s).
5. When the encoder queue exceeds 8 frames, the loop waits — backpressure instead of memory growth.

## Encoder chain

Resolved once per export via `VideoEncoder.isConfigSupported`, in order:

1. Hardware H.264 (`avc1.640028`, `prefer-hardware`, avcc bitstream for MP4)
2. Software H.264 (`avc1.42E01F`, no-preference)
3. VP9 → WebM container
4. HEVC (`hvc1…`, hw then sw) — only offered when the platform provides it
5. GIF / ProRes — rendered through the FFmpeg frame pipe (PNG sequence → `palettegen/paletteuse` or `prores_ks`); requires the FFmpeg safety net

The resolved path is displayed in the export UI and in the progress events — the user always sees what encoded their file.

## Muxing & disk safety

- MP4: `mp4-muxer` `StreamTarget` with positional `onData` writes; the main process writes at file offsets into `<destination>.part` (one open file handle per export, fsync + close at finalize).
- WebM: `webm-muxer` buffer target, flushed through the same positional write.
- Finalize = fsync → rename `.part` → final name. **Cancel = never rename** — no partial files, ever.
- Verification: `ffprobe` reads back the duration; a result below 90 % of the timeline duration is reported as unverified.

## Audio

- Decoded once via `AudioContext.decodeAudioData`, then processed in order: noise gate (optional, −48 dB default with 50 ms hold) → gain → fades (in/out).
- Encoded AAC when the platform provides it, Opus otherwise, muxed into the same container.
- `normalizeLufs` runs a two-pass `loudnorm` (measured values from pass 1 applied in pass 2) as a post-step with `-c:v copy`.

## Naming

`recast-{project}-{yyyyMMdd-HHmm}.{ext}` — sanitized (`sanitizeFilename`), lowercased, de-duplicated against existing files in the destination (`-2`, `-3`…). ProRes uses `.mov`, HEVC uses `.mp4`.

## Determinism

Same project + same settings + same decoder → same frames in the same order, encoded with the same resolved config. The golden-frame SSIM harness (preview vs exported frame ≥ 0.995) is planned to lock this; until it runs in CI, determinism is a design property, not a measured claim.

## Related

- [editing.md](editing.md) - the edit being exported
- [ffmpeg.md](ffmpeg.md) - the optional safety net
- [architecture.md](architecture.md) - frame clock and determinism
- [packaging.md](packaging.md) - how the app is shipped
