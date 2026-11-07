# PERFORMANCE

All numbers below are **targets** until marked measured with a method line.
Measured entries include hardware, OS and date.

## Budgets

| Metric | Target | Status |
|---|---|---|
| Cold start (double-click → interactive Library) | < 2.5 s | target |
| Idle RAM (Library view, no playback) | < 250 MB | target |
| UI interaction response | < 100 ms | target |
| Scrub a 10-minute project | 60 fps | target |
| Dropped frames @ 1080p60 recording | < 2 % | target |
| Export 1 min @ 1080p30 | < 30 s | target |
| Crash data loss window | ≤ 2 s | by design (segment length) |
| FFmpeg bundle size per platform | ≤ 45 MB | ❌ currently ~78 MB (ffmpeg 6.0-static) + ~64 MB (ffprobe 4.0.2-static) — over budget, tracked below |

## Known gaps

- **Bundle size**: the pinned ffmpeg-static b6.0 (78.7 MB) + ffprobe-static 3.1.0 (64.5 MB) exceed the ≤ 45 MB/platform budget. Plan: switch to size-optimized builds (e.g. BtbN GPL essentials variants or custom builds without unused filters) and drop the separate ffprobe in favor of `ffmpeg -i` parsing where possible. Tracked for Phase 4.

## Measurement method (to be used for every measured number)

1. Fresh profile (`RECAST_FRESH_PROFILE=1` deletes userData before launch).
2. Cold start: time from `process launch` to first paint of the Library list (performance.now deltas sent from main + renderer).
3. RAM: `process.memoryUsage()` sum across main+renderer+GPU+utility, sampled 60 s idle.
4. Dropped frames: recorder stats (`droppedFrames / totalFrames`) after a scripted 5-minute capture of a moving window.
5. Export: wall clock for the standard 60 s sample project (bundled test fixture) at 1080p30 MP4, hardware encoder path.
6. Determinism: export the same project twice and hash-decode (SSIM ≥ 0.995 against the golden preview frame).

Every measured number lists: hardware, OS version, app version, date.
