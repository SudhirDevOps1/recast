# Build

Status: specification. The scripts below are the contract the repo targets; they exist once Phase 1 lands.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 LTS | `.nvmrc` pins it |
| pnpm | 9+ | `corepack enable` |
| Python | 3.11+ | native module builds (`better-sqlite3`, `uiohook-napi`) |
| Git | 2.40+ | |
| FFmpeg | fetched, not installed | `pnpm ffmpeg:fetch` |

Platform extras:

- **Windows** — Visual Studio Build Tools with "Desktop development with C++".
- **macOS** — Xcode Command Line Tools.
- **Linux** — `build-essential`, `libx11-dev`, `libxtst-dev`, `libpng-dev`, `libasound2-dev`.

## Setup

```bash
git clone https://github.com/SudhirDevOps1/recast.git
cd recast
corepack enable
pnpm install
pnpm ffmpeg:fetch     # downloads the pinned binaries for this platform
pnpm dev
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Vite dev server + Electron with HMR |
| `pnpm build` | Compile main, preload, renderer, packages |
| `pnpm verify` | lint + typecheck + unit + Electron smoke |
| `pnpm test` | Unit tests only |
| `pnpm test:e2e` | Playwright Electron smoke |
| `pnpm ffmpeg:fetch` | Download and verify FFmpeg for the current platform |
| `pnpm ffmpeg:verify` | Re-check bundled binaries |
| `pnpm dist:win` | NSIS, MSI, portable, ARM64 |
| `pnpm dist:mac` | DMG (arm64/x64/universal), PKG, ZIP |
| `pnpm dist:linux` | AppImage, deb, rpm, tar.gz |
| `pnpm dist:all` | Full matrix locally |
| `pnpm docs:dev` | Docs preview |

## Environment variables

| Variable | Purpose |
|---|---|
| `RECAST_DEVTOOLS=1` | Open DevTools on launch |
| `RECAST_FFMPEG` | Override the FFmpeg binary path |
| `RECAST_LOG_LEVEL` | `error` / `warn` / `info` / `debug` / `trace` |
| `RECAST_USER_DATA` | Use an isolated data directory (useful for testing onboarding) |
| `RECAST_DISABLE_UPDATER=1` | Skip update checks in development |

## Native modules

`better-sqlite3` and `uiohook-napi` need rebuilding against Electron's ABI:

```bash
pnpm electron-rebuild
```

CI caches the rebuild per Node + Electron version. Adding another native module requires a note in the PR about ARM64 and Linux build impact.

## Debugging

- Main process: `--inspect` attach, logs in `<userData>/logs/main.log`.
- Renderer: DevTools, React DevTools in development builds.
- IPC: `RECAST_LOG_LEVEL=trace` prints every channel with validated payloads.
- Media: the recorder writes `session.json` with encoder path, dropped frames, and timestamps.
- Performance: `chrome://webrtc-internals` for tracks, DevTools performance for the editor.

## Packaging locally

```bash
pnpm dist:win     # produces release/*.exe and *.msi
pnpm dist:mac     # produces release/*.dmg
pnpm dist:linux   # produces release/*.AppImage and *.deb
```

Artifacts land in `release/`. Unsigned local builds warn at install time — that is expected. See `docs/code-signing.md`.

## CI

GitHub Actions, `.github/workflows/ci.yml`:

1. Install, cache pnpm store and FFmpeg archives.
2. Lint, typecheck, unit tests.
3. Electron smoke test (downloads a synthetic media fixture, records 3 seconds, exports, asserts duration).
4. Build artifacts per OS, sign when secrets exist, upload.
5. Release jobs on `v*` tags publish to GitHub Releases.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Module version mismatch` | `pnpm electron-rebuild` |
| FFmpeg download blocked | Set `RECAST_FFMPEG` to a local build, or configure a proxy |
| Electron window is blank | Check the renderer dev server port and CSP errors |
| Native build fails on Windows | Install VS Build Tools and run the terminal as a normal user |
| AppImage will not start | Install `libfuse2` (documented in the README) |
