# Build

## Prerequisites

- Node ≥ 20.11 (22 recommended)
- pnpm 9 (`corepack enable` or `npm i -g pnpm`) — the repo does not pin `packageManager` because CI uses `pnpm/action-setup` with its own version input
- Platform deps: Windows — nothing extra; macOS — Xcode CLT for native rebuilds; Linux — `build-essential`, `python3` for native modules, `libfuse2` for AppImage runs

## Setup

```bash
pnpm install
pnpm fetch:ffmpeg            # optional: bundle FFmpeg (see docs/ffmpeg.md)
pnpm verify                  # typecheck + lint + unit tests + build
pnpm dev                     # electron-vite dev (hot reload main/preload/renderer)
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev app with HMR |
| `pnpm build` | Build main + preload + renderer bundles (electron-vite) |
| `pnpm typecheck` | `tsc --noEmit` in every workspace project |
| `pnpm lint` | ESLint flat config |
| `pnpm test` | Vitest unit suite |
| `pnpm verify` | all of the above — must be green before merging |
| `pnpm smoke` | Playwright Electron smoke (needs a built app; `RECAST_SMOKE=1`) |
| `pnpm fetch:ffmpeg` | stage FFmpeg per `ffmpeg.lock.json` (`--pin`, `--force`, `--skip`, target names) |
| `pnpm icons` | regenerate app icons (Python + Pillow) |
| `pnpm dist:win` / `dist:mac` / `dist:linux` | electron-builder for the current platform |

## Native modules

`better-sqlite3` and `uiohook-napi` are rebuilt for Electron automatically by electron-builder at package time (`npmRebuild`). For a dev run against the Electron ABI:

```bash
pnpm --filter @recast/desktop exec electron-rebuild -f -w better-sqlite3
```

## Workspace layout

```
apps/desktop            Electron app (main, preload, renderer×3 entries)
packages/shared         schemas, IPC contract, constants, FFmpeg runner (node-only subpath)
packages/capture        recorder, segment writer, audio mixer, recovery planner
packages/editor         compositor, zoom math, timeline, presets (pure)
packages/export         exporter, encoder chain, audio processing
packages/ui             design tokens + primitives
```

Internal packages ship TypeScript source directly (bundler resolution); there is no separate build step for them.
