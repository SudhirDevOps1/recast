# SPIKE-RESULTS — what was proven, how, and what still needs hardware

Recast's working rules require risky APIs to be proven before UI is built on
them, with measured numbers. This file records what was actually validated,
where, and what remains unmeasured. Nothing here claims a device number that
was not measured on a device.

Last updated: 2026-11-07.

## Validated in this repository's build environment (Linux sandbox, 2026-11-07)

| Claim | Method | Result |
|---|---|---|
| Type-safe core across 6 workspace projects | `pnpm typecheck` (tsc strict, `--noEmit`) | ✅ green |
| Lint rules (flat ESLint, react-hooks) | `pnpm lint` | ✅ 0 errors |
| Zoom / spring / timeline / schema / filename math | `pnpm test` (Vitest) | ✅ 41/41 pass — clustering windows, spring settle without overshoot, fit clamping, follow dead-zone 18 %, pan clamp, time mapping with speed, `.recaststyle` round-trip, IPC schemas, `recast-{project}-{ts}` naming |
| Bundling (main + preload + renderer) | `pnpm build` (electron-vite) | ✅ 3 entry points, renderer bundle ≈ 613 kB CSS-included / 427 kB index |
| FFmpeg acquisition + integrity | `pnpm ffmpeg:fetch` (TOFU pinning per `ffmpeg.lock.json`) | ✅ linux-x64 fetched: ffmpeg (ffmpeg-static b6.0, 78.7 MB) + ffprobe (ffprobe-static 3.1.0), SHA-256 pinned and verified before use; both binaries execute (`-version`) |
| Icons and packaging metadata | `pnpm icons` + electron-builder config load | ✅ icon.png 1024, multi-size .ico, tray templates |

## API availability — verified against documentation, not yet against devices

| API | Source checked | Status |
|---|---|---|
| `desktopCapturer` + `setDisplayMediaRequestHandler` (modern capture path) | Electron docs (main process, session API) | available in the pinned Electron 45 line; integration code uses this path only — no deprecated `desktopCapturer` IPC of user media |
| WebCodecs `VideoEncoder` (hardware-preferred) + `mp4-muxer` StreamTarget | Chromium/WebCodecs implementation status; mp4-muxer v5 docs | available in Electron ≥ 23; used as the primary export path with a MediaRecorder fallback |
| `getDisplayMedia` audio capture (system audio) | Chromium platform notes | Windows: loopback via getDisplayMedia; macOS: requires 14.2+ ScreenCaptureKit loopback; Linux: PipeWire portal. The UI reports availability per platform instead of failing silently |
| `uiohook-napi` global input sampling | package prebuilds (N-API) | prebuilt binaries for the six shipping targets; main-process sampler degrades to a polling fallback if the native module fails to load |
| electron-builder target matrix (NSIS/MSI/portable/dmg/pkg/zip/AppImage/deb/rpm/tar.gz) | electron-builder 26 docs | configured in `apps/desktop/electron-builder.yml`; first real artifact builds land via the nightly workflow |

## Not measured yet — needs real hardware or the CI smoke runner

These are **targets, not results**. They land in [PERFORMANCE.md](PERFORMANCE.md)
after the first device QA pass, and the Playwright smoke job proves the
launch → bridge → library path on CI.

- 1080p60 hardware-encode throughput and dropped-frame rate (WebCodecs HW path)
- Windows WASAPI loopback end-to-end; macOS 14.2+ loopback end-to-end
- Wayland PipeWire portal capture (no cursor tracking — must be surfaced in UI)
- Cold start, idle RAM, 60 fps scrub on a 10-minute project, export throughput
- Crash-recovery drill (kill -9 mid-recording, relaunch, salvage via `ffmpeg -c copy`)

## Honesty rules

Nothing in this file or in STATUS.md says "works" unless it was tested on that
OS. Untested means 🟡/🟠 with the exact reason. Numbers are targets until
measured and written down with their method.
