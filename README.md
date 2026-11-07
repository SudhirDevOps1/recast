# Recast

**Record it once. Ship it polished.**

Recast is a free, open-source, local-first screen recorder and cinematic editor for macOS, Windows, and Linux. Record your screen, then let Recast add smooth auto-zooms, a styled cursor, a beautiful background frame, and local captions — without opening a traditional video editor.

No account. No cloud. No subscription. No watermark. Everything runs on your machine.

> **Status: specification (pre-alpha).**
> This repository currently holds the product specification, architecture docs, and the master build prompt for coding agents. Installers and application code land in Phase 1 — see [docs/roadmap.md](docs/roadmap.md).

---

## Why Recast

Screen Studio made screen recordings feel expensive. It also costs money, only runs on macOS, and uploads nothing but still asks for an account. The existing open-source options are either capture-only tools or full NLEs that are too heavy for a 90-second demo.

Recast is the missing middle:

- **Record** — screen, window, or area, with mic, system audio, face cam, drawing, and pause/resume.
- **Polish** — one click turns cursor movement into tasteful, spring-smoothed zooms.
- **Publish** — export a clean 1080p MP4 with a frame, background, and captions.

The whole flow should take under five minutes from launch to exported file.

---

## Features

### Capture
- Screen, window, or custom-area capture with a real selection overlay (magnifier, pixel readout, snapping, keyboard nudge).
- Countdown (3s / 5s / 10s), pause and resume, global hotkey, dragging recording tray.
- Microphone + system audio on separate tracks. WASAPI loopback on Windows, ScreenCaptureKit loopback on macOS 14.2+, PipeWire monitor on Linux.
- Face cam overlay — shape, size, position, mirror, blur.
- Live annotation — pen, highlighter, arrows, shapes, text, spotlight — captured into the video *and* kept as editable vector data.
- Keystroke HUD for tutorials.
- Up to 4K60 with a dropped-frame indicator and honest fallback warnings.
- Crash-safe segmented recording: a crash leaves a playable, recoverable file.

### Edit
- Timeline with video, cursor/zoom, annotation, audio, and caption tracks.
- Automatic zoom from click clusters and dwell time, smoothed with critically damped springs.
- Manual zoom keyframes, follow-cursor mode with a dead zone.
- Cursor look: size, tint, outline, shadow, click ripple, press scale, idle fade, path smoothing.
- Frame and background system: padding, radius, border, shadow, gradients, mesh, blurred-screen echo, custom image, transparent export.
- Aspect ratios from 16:9 to 9:16 with safe-area guides.
- Trim, split, speed, freeze frame, ripple delete, undo/redo.
- Region blur and pixelate for redaction.
- Reusable style presets saved as `.recaststyle`.
- Local Whisper captions with word-level timing and burn-in or `.srt` / `.vtt` export.

### Ship
- MP4 H.264 by default, plus HEVC, ProRes, WebM, and GIF.
- Deterministic frame-stepped export so the preview and the file match exactly.
- Export presets with size and time estimates, cancel, and reveal-in-folder.

### Feel
- Dark-first design with a true light mode, one accent color, soft elevation, hairline borders.
- Spring motion with `prefers-reduced-motion` support.
- Command palette, full keyboard map, native window chrome per OS.
- Every state designed: empty, loading, error, offline, permission-denied, exporting.
- Three-step onboarding and a first-run sample project.

---

## Install

Not available yet. When Phase 1 lands, these are the planned artifacts:

| Platform | Artifact |
|---|---|
| Windows | `Recast-Setup-x.y.z.exe` (per-user, no admin) |
| Windows | `Recast-x.y.z.msi` (enterprise) |
| Windows | `Recast-Portable-x.y.z.exe` |
| macOS | `Recast-x.y.z-arm64.dmg`, `Recast-x.y.z-x64.dmg` |
| macOS | `Recast-x.y.z.pkg` |
| Linux | `Recast-x.y.z.AppImage` |
| Linux | `recast_x.y.z_amd64.deb` |
| Linux | `recast-x.y.z.x86_64.rpm` |

See [docs/packaging.md](docs/packaging.md) for the full matrix, signing, and auto-update plan.

---

## Development

Requirements: Node.js 22 LTS, pnpm 9+, and a platform toolchain for native modules.

```bash
git clone https://github.com/SudhirDevOps1/recast.git
cd recast
pnpm install
pnpm dev          # run the app
pnpm verify       # lint + typecheck + unit + smoke
pnpm dist:win     # build Windows artifacts
pnpm dist:mac     # build macOS artifacts
pnpm dist:linux   # build Linux artifacts
```

The monorepo layout (planned):

```
apps/desktop        Electron main, preload, renderer
packages/ui         Design system, tokens, primitives
packages/capture    Capture and audio pipeline
packages/editor     Timeline, compositor, zoom engine
packages/export     Encoders, muxers, FFmpeg bridge
packages/shared     Types, IPC contracts, zod schemas
```

Full setup notes: [docs/build.md](docs/build.md).

---

## Documentation

| Doc | What it covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Process model, IPC, workers, data flow |
| [docs/recording.md](docs/recording.md) | Capture sources, permissions, audio, recovery |
| [docs/editing.md](docs/editing.md) | Timeline, zoom engine, cursor, presets |
| [docs/export.md](docs/export.md) | Encoders, muxing, deterministic rendering |
| [docs/ffmpeg.md](docs/ffmpeg.md) | Bundling, download fallback, licensing, security |
| [docs/platform-support.md](docs/platform-support.md) | Honest per-OS capability matrix |
| [docs/build.md](docs/build.md) | Local setup and scripts |
| [docs/packaging.md](docs/packaging.md) | Every installer target and CI matrix |
| [docs/code-signing.md](docs/code-signing.md) | Windows, macOS, Linux signing |
| [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) | Full shortcut map |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Known platform issues and fixes |
| [docs/roadmap.md](docs/roadmap.md) | Phases and acceptance criteria |
| [prompts/build-prompt.md](prompts/build-prompt.md) | Master prompt for coding agents |

---

## Platform support

| Capability | Windows | macOS | Linux (X11) | Linux (Wayland) |
|---|---|---|---|---|
| Screen capture | Yes | Yes | Yes | Via portal |
| Window capture | Yes | Yes | Yes | Via portal |
| Area capture | Yes | Yes | Yes | Portal-dependent |
| System audio | WASAPI loopback | macOS 14.2+ | PipeWire monitor | PipeWire monitor |
| Global cursor tracking | Yes | Yes (Accessibility) | Yes | Limited |
| Face cam | Yes | Yes | Yes | Yes |

Details and workarounds: [docs/platform-support.md](docs/platform-support.md).

---

## FFmpeg

Recast uses **two** media paths:

1. **Primary** — Chromium's WebCodecs for hardware-accelerated encode and a JS muxer for MP4. No external binary on the happy path.
2. **Utility / fallback** — a pinned FFmpeg and FFprobe build, **bundled with the app** for probing, thumbnails, proxies, audio extraction, salvage remuxing, and software encoding when hardware fails.

FFmpeg binaries are downloaded at build time (never committed), SHA-256 verified, and unpacked from the ASAR archive so they remain executable. If a binary is missing or corrupt at runtime, Recast offers an in-app, checksum-verified download instead of failing.

Because the app bundles a GPL FFmpeg build, **Recast is licensed GPL-3.0**. The MIT alternative (LGPL FFmpeg without libx264) is documented in [docs/ffmpeg.md](docs/ffmpeg.md).

---

## Naming

Everything uses the product name, consistently:

| Thing | Value |
|---|---|
| Product | Recast |
| Repository | [`SudhirDevOps1/recast`](https://github.com/SudhirDevOps1/recast) |
| Binary | `recast` |
| Project file | `.recast` |
| Style preset | `.recaststyle` |
| URL scheme | `recast://` |
| App ID | `app.recast.desktop` |
| Packages | `@recast/*` |
| Windows data | `%APPDATA%\Recast` |
| macOS data | `~/Library/Application Support/Recast` |
| Linux data | `~/.config/recast` |

---

## Roadmap

- **Phase 0** — feasibility spikes: capture, hardware encode, loopback audio, cursor sampling.
- **Phase 1** — record → trim → export, Windows installer.
- **Phase 2** — auto-zoom, cursor styling, backgrounds, presets.
- **Phase 3** — audio polish and local captions.
- **Phase 4** — full installer matrix, signing, auto-update, docs site.

Full acceptance criteria: [docs/roadmap.md](docs/roadmap.md).

---

## Contributing

Issues and PRs are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before starting. Security reports go through [SECURITY.md](SECURITY.md), never a public issue.

---

## License

[GPL-3.0-or-later](LICENSE) © SudhirDevOps1 and Recast contributors.

Recast is an independent project. It is not affiliated with Screen Studio, Cap, Cursorful, or any other product mentioned for comparison.
