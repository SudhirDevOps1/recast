# Recording

## Sources

- **Screen** — enumerated via `desktopCapturer` (main) with display bounds and scale factors; selection feeds `setDisplayMediaRequestHandler`, and the renderer gets the stream through `getDisplayMedia` (the non-deprecated path; never `desktopCapturer.getUserMedia`).
- **Window** — same pipeline; window list includes live thumbnails.
- **Area** — a frameless transparent fullscreen overlay per display: drag to select, live pixel dimensions, 4× magnifier, Enter/Esc, arrow-key nudge (1 px, Shift = 10 px). The chosen rect is applied as a `VideoFrame` crop at ingest, so the encoder only sees the selected region.
- Multi-monitor and mixed-DPI: source metadata carries `scaleFactor`; coordinates in the cursor log are physical pixels from `screen.getCursorScreenPoint()`.

## Permissions

- macOS: live TCC status for screen/microphone/camera, deep links into System Settings panes, relaunch offer after a post-launch grant.
- Windows/Linux: no gating prompts; capability flags are honest (`app:getPlatformInfo.capabilities`) and the UI explains gaps instead of failing silently.

## Audio

- Mic and system audio run through **separate** AudioWorklet taps (`recast-tap`, 48 kHz) and separate Opus encoders — separate files on disk (`mic.webm`, `system.webm`), mixed at edit time.
- System audio availability: Windows → WASAPI loopback (no virtual cable); macOS 14.2+ → CoreAudio loopback through Electron; Linux → not available yet (mic-only fallback, stated in the UI).
- Live mic meter in the recorder view with a "no signal" warning; the meter stream is never recorded.
- Pause/resume mutes the worklet taps and compensates both clocks.

## Cursor input

- Main process polls `screen.getCursorScreenPoint()` at 60 Hz; uiohook-napi adds click/scroll events.
- Events are batched every 100 ms and appended to `cursor.jsonl` (one JSON object per line, epoch-anchored `tUs`).
- Global hotkeys: `CmdOrCtrl+Alt+R` (start/stop) and `CmdOrCtrl+Alt+P` (pause/resume) by default; configurable in Settings.

## Crash recovery

1. Every ~2 s a closed segment MP4 is on disk (tmp + rename) and `session.json` (atomic write) lists it.
2. On launch, sessions not marked `completed` are scanned; segments present on disk (and not `.part`) are recoverable.
3. The Library surfaces "Recovered a crashed recording" and remuxes with `ffmpeg -c copy` — no re-encode, no timestamp rewrites.

## Limits

- Up to 4K60 (source resolution); quality caps 1080p/1440p/2160p at ingest.
- Disk-space check before start and during the session; below 1 GB the UI warns.
- Wayland: capture via the PipeWire portal only — cursor tracking and global hotkeys are limited and the UI says so. See platform-support.md.

## Related

- [editing.md](editing.md) - the editing model
- [platform-support.md](platform-support.md) - what each OS supports
- [troubleshooting.md](troubleshooting.md) - confirmed issues and fixes
- [architecture.md](architecture.md) - process model and session service
