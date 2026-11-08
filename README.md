<div align="center">

<img src="apps/website/assets/icon.png" width="96" alt="Recast logo" />

# Recast

**Free, open-source, local-first screen recorder and cinematic editor.**

Record, auto-zoom, caption, export — no account, no cloud, no telemetry, no watermark, no feature gates.
Everything runs 100% offline on your machine. macOS · Windows · Linux.

[![CI](https://github.com/SudhirDevOps1/recast/actions/workflows/ci.yml/badge.svg)](https://github.com/SudhirDevOps1/recast/actions/workflows/ci.yml)
[![Nightly installers](https://github.com/SudhirDevOps1/recast/actions/workflows/build.yml/badge.svg)](https://github.com/SudhirDevOps1/recast/actions/workflows/build.yml)
[![CodeQL](https://github.com/SudhirDevOps1/recast/actions/workflows/codeql.yml/badge.svg)](https://github.com/SudhirDevOps1/recast/actions/workflows/codeql.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-sudhirdevops1.github.io%2Frecast-7C5CFF)](https://sudhirdevops1.github.io/recast/)
[![Release](https://img.shields.io/badge/download-latest_release-2EA043)](https://github.com/SudhirDevOps1/recast/releases/latest)

<img src="apps/website/assets/og.png" width="720" alt="Recast — record, auto-zoom, caption, export" />

**[Download](#install) · [Website](https://sudhirdevops1.github.io/recast/) · [Docs](#docs) · [Roadmap](docs/roadmap.md)**

</div>

---

## Screenshots

Real UI, captured from the running app (nothing mocked). Regenerate anytime with
`xvfb-run -a node scripts/capture-screenshots.mjs`.

| Editor — auto-zoom, styles, captions | Library |
|---|---|
| ![Editor](docs/screenshots/editor.png) | ![Library](docs/screenshots/library.png) |

| New recording | Settings |
|---|---|
| ![Record](docs/screenshots/record.png) | ![Settings](docs/screenshots/settings.png) |

*Screen Studio's polish, Cap's simplicity, Cursorful's shareability — zero subscription.*

## How it works

1. **Record** — pick a screen, a window, or an area. Mic and system audio on separate tracks. 60 Hz cursor sampling in the background. Pause/resume, global hotkeys, tray control. Segments land on disk every 2 seconds — a crash never costs you more than the current fragment.
2. **Edit without a timeline NLE** — auto-zoom generates camera keyframes from your cursor (interest points → clustering → critically damped springs), cursor styling, frame/background system, aspect ratios, presets. Preview and export render through the same compositor, so what you see is exactly what you get.
3. **Export** — MP4 (H.264) by default, plus WebM, HEVC, ProRes and GIF. The used encoder path is always shown. Every export is verified with `ffprobe`; cancel never leaves a partial file.

## Install

| Platform | Artifact | Notes |
|---|---|---|
| Windows | `Recast-Setup-x.y.z.exe` | Per-user NSIS installer, no UAC |
| Windows | `Recast-x.y.z.msi` | Enterprise / GPO, per-machine |
| Windows | `Recast-Portable-x.y.z.exe` | Settings live next to the exe when writable |
| Windows | `Recast-Setup-x.y.z-arm64.exe` | ARM64 |
| macOS | `Recast-x.y.z-arm64.dmg` | Apple Silicon — **unsigned until certificates land** (docs/code-signing.md) |
| macOS | `Recast-x.y.z-x64.dmg` | Intel — **unsigned until certificates land** |
| macOS | `Recast-x.y.z.pkg` | MDM deployment |
| Linux | `Recast-x.y.z-x64.AppImage` | X11 full support; Wayland via portal |
| Linux | `.deb`, `.rpm`, `.tar.gz` | Also Flatpak, Snap, AUR |

Download from [Releases](https://github.com/SudhirDevOps1/recast/releases) or the [website](https://sudhirdevops1.github.io/recast/). `SHA256SUMS` is published per release; installers are **unsigned** for now — Windows may show SmartScreen and macOS needs right-click → Open on first launch. See [docs/code-signing.md](docs/code-signing.md) for the signing plan and the SmartScreen-reputation note.

## Build from source

```bash
pnpm install
pnpm fetch:ffmpeg   # optional: bundle the FFmpeg safety net (see docs/ffmpeg.md)
pnpm verify         # typecheck + lint + unit tests + build
pnpm dev            # run the app in dev mode
pnpm dist:win       # or dist:mac / dist:linux
```

Requirements: Node ≥ 20.11, pnpm 9. See [docs/build.md](docs/build.md).

## Feature status

Honest, tested-only claims live in [STATUS.md](STATUS.md). Highlights (Phase 1–2 implemented, Phase 3–4 partially):

- ✅ Screen / window / area capture, mic + system audio, countdown, pause/resume
- ✅ Crash-safe segmented recording with recovery
- ✅ Cursor track → auto-zoom (1.25× / 1.6× / 2.0× intensities), manual keyframes, follow-cursor mode
- ✅ Editor: compositor-driven preview, trim/split/ripple delete, undo/redo, presets (`.recaststyle`), command palette
- ✅ Export MP4/WebM/HEVC/ProRes/GIF with encoder fallback chain + verification
- 🟡 Local Whisper captions (wired, needs a `whisper.cpp` binary on PATH)
- 🟡 Live annotation, face-cam PiP (planned — see STATUS)
- 🟢 FFmpeg as an optional safety net — the default path never shells out

## Docs

| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Process model, IPC, storage, failure domains |
| [docs/recording.md](docs/recording.md) | Sources, permissions, audio, crash recovery |
| [docs/editing.md](docs/editing.md) | Timeline, zoom math, cursor, presets |
| [docs/export.md](docs/export.md) | Encoders, muxing, determinism |
| [docs/ffmpeg.md](docs/ffmpeg.md) | Bundling, lockfile, in-app download, licensing |
| [docs/platform-support.md](docs/platform-support.md) | Honest capability matrix with test dates |
| [docs/build.md](docs/build.md) | Setup and scripts |
| [docs/packaging.md](docs/packaging.md) | Every installer target |
| [docs/code-signing.md](docs/code-signing.md) | Windows, macOS, Linux signing |
| [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) | Full map |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Real, confirmed issues only |
| [docs/roadmap.md](docs/roadmap.md) | Phases + acceptance criteria |
| [PERFORMANCE.md](PERFORMANCE.md) | Measured numbers + method |
| [AGENTS.md](AGENTS.md) | Rules for coding agents working in this repo |

## Privacy

Recast makes **no network requests** except when you explicitly opt in: checking for updates (off by default) and downloading Whisper models or the FFmpeg binary when they're missing. There is no account, no analytics, no crash reporting by default.

## License

GPL-3.0-or-later. Recast ships FFmpeg builds that include libx264 (GPL); see [docs/ffmpeg.md](docs/ffmpeg.md) for the licensing story and the MIT/LGPL alternative for redistributions that strip the binaries.
