# STATUS — what is real, what is partial, what is not built

Last updated: 2026-11-08 · Phase 1–2 implemented and verified in this repo's gate; CI/CD live and iterating on the first real gate findings. Pages/branch-protection need a one-time admin grant (docs/repository-setup.md). Device-level QA pending CI hardware.

Legend: ✅ implemented & verified · 🟡 implemented but not yet verified on device/CI · 🟠 scaffolded, not complete · ❌ not built

## Verified in this repository (2026-11-07, Linux CI-equivalent sandbox)

- ✅ `pnpm typecheck` — all 6 workspace projects green (tsc strict)
- ✅ `pnpm lint` — ESLint flat config, 0 errors
- ✅ `pnpm test` — 41/41 unit tests pass (zoom math, springs, clustering, time mapping, preset serialization, IPC schemas, filename sanitization, SRT/VTT)
- ✅ `pnpm build` — electron-vite produces main (61.8 kB), preload and renderer bundles (3 entry points)
- ✅ `scripts/fetch-ffmpeg.mjs` — downloads, verifies (registry integrity + SHA-256), pins hashes, stages into `resources/ffmpeg/<platform>-<arch>/`; linux-x64 fetched with real pinned hashes (ffmpeg 6.0-static 78.7 MB, ffprobe 4.0.2-static 64.5 MB); both binaries execute
- ✅ Icons generated (icon.png 1024, icon.ico multi-size, tray templates)

## Recording

- 🟡 Screen/window capture via `desktopCapturer` + `getDisplayMedia` with main-process `setDisplayMediaRequestHandler` — code complete, **not yet verified against real hardware** (sandbox has no display). First verification happens in the `smoke` CI job and on the three OS QA passes.
- 🟡 Segmented crash-safe writing (2 s MP4 fragments, atomic `session.json` manifest, tmp+rename segment writes, `cursor.jsonl` batching) — logic unit-reviewed, no on-device crash test yet.
- ✅ Crash-recovery planning (`planRecovery`) — pure and unit-covered; the remux path uses `ffmpeg -c copy`.
- ✅ 60 Hz cursor sampler + uiohook-napi click/scroll capture (main process), epoch-anchored clocks shared with the renderer — code complete, device verification pending.
- ✅ AudioWorklet mixer (mic + system on separate tracks, 48 kHz, Opus encode) — code complete; system audio availability honestly reported per platform (WASAPI loopback on Windows, macOS 14.2+ loopback).
- 🟠 Area selection overlay (magnifier, arrow-key nudge) — overlay window + IPC implemented; needs on-screen QA.
- 🟠 Face cam — device enumeration wired in UI; separate-track recording **not built yet**.
- ❌ Live annotation while recording (pen/highlighter/arrow/…).
- ❌ Keystroke HUD.

## Editor

- ✅ Compositor as a pure function `(project, time) → draw plan`, shared by preview and export — deterministic zoom track (fixed 60 Hz grid, closed-form critically damped spring), golden-frame SSIM harness still TODO (see below).
- ✅ Auto-zoom: interest detection → clustering (1.2 s window, 80 px @1080p) → fit-clamped keyframes → spring-smoothed track. Unit tests cover settle-without-overshoot, determinism, viewport clamping, follow dead-zone (18 %) and pan-speed clamp.
- ✅ Timeline: build/split/ripple-delete/time-mapping with speed — unit covered.
- ✅ Presets: 6 built-ins, `.recaststyle` import/export with schema validation (one undo step via commit).
- ✅ Command palette (⌘K), keyboard transport (Space/JKL/S/arrows/undo/redo).
- ✅ Style system: aspect ratios, padding, radius, border, shadow levels, background (solid/gradient/mesh/blurred echo/transparent), cursor looks (native/dot/pointer/circle) with ripple/press-scale/idle-fade.
- 🟠 Annotations in the editor (vector model + render path implemented; drawing UI not built).
- 🟠 Redaction blur/pixelate — compositor implements static rects; tracked redaction not built.
- ❌ Freeze frame, multi-range delete, speed UI (engine supports `speed`; UI panel pending).

## Captions

- 🟠 Whisper integration fully wired: model manager (tiny/base/small, en+multi), whisper.cpp sidecar invocation, SRT/VTT import/export, burn-in styles. **Requires a `whisper.cpp` binary** (detected on PATH or bundled); no ONNX fallback yet. Never verified end-to-end on device — marked untested, not "works".
- ❌ Word-level timestamps (sentence-level only for now).

## Export

- 🟡 Frame-clock exporter (never rAF), deterministic composition, encoder chain HW H.264 → SW → VP9/WebM, incremental positional MP4 writes via StreamTarget, cancel-safe `.part` → rename, ffprobe verification, used-path surfaced in UI. Code complete; needs CI smoke + device runs.
- ✅ GIF (palettegen/paletteuse) and ProRes via FFmpeg frame pipe; loudnorm two-pass (−14 LUFS) post-pass.
- ❌ HEVC via FFmpeg fallback when WebCodecs lacks it (WebCodecs HEVC only when the platform provides it).

## Packaging & distribution

- ✅ `electron-builder.yml` with the full matrix: NSIS per-user (no UAC), MSI (per-machine), portable, arm64 suffix, DMG arm64/x64, pkg, zip (updater), AppImage/deb/rpm/tar.gz, `recast://` protocol, asarUnpack for native modules + FFmpeg.
- ✅ CI/CD activated (2026-11-07): `ci.yml` — verify gate (typecheck + lint + unit tests + build) on **ubuntu-22.04, windows-latest, windows-11-arm, macos-14, macos-15** plus an xvfb Playwright smoke job (launch → bridge → library); `build.yml` — nightly installer matrix with Electron/FFmpeg caches, AppImage extraction smoke, `SHA256SUMS`, nightly prerelease (Flatpak/Snap legs on manual dispatch); `release.yml` — on `v*` tags with auto-generated notes; `website.yml` — GitHub Pages; `codeql.yml` — weekly analysis.
- ✅ Website shipped (`apps/website/`, GitHub Pages): feature showcase, per-OS download lists fetched live from the GitHub API, nightly toggle, honest unsigned-installers notice. Pages needs a one-time admin enablement (Settings → Pages → Source: GitHub Actions) — until then the Website workflow fails loudly with that exact fix instead of a cryptic 403 (docs/repository-setup.md).
- ❌ Branch protection on `main` — the CI token is deliberately least-privilege (Contents + Workflows only), so this one-time admin step is documented in [docs/repository-setup.md](docs/repository-setup.md) instead of silently skipped.
- 🟡 First full CI gate (run #36, 2026-11-07) — real findings, all fixed in one commit: Preflight + Docs integrity ✅ and CodeQL ✅ on every push; the verify legs failed because **`apps/website/assets/releases.js` (plain browser JS) was linted with Node globals** — the website is now excluded from ESLint (it has no Node build); the **macos-13 leg queued forever because that runner image is retired** — the matrix moved to macos-15. The first nightly installer build failed on Linux with **`uiohook-napi`'s native rebuild missing X11 headers** (`X11/extensions/record.h`) — CI now installs libx11/xtst/randr/xinerama dev packages before dist; ffmpeg fetching was also narrowed to each leg's own platform-arch target, and `win32-arm64` (no pinned static FFmpeg source yet) now stages a manifest-only payload so packaging succeeds and the app degrades to the in-app Repair download. The runs after this commit are the verification. Dependabot is live; breaking npm majors (zod 4, electron-vite 6, @vitejs/plugin-react 6, @types/node 26, vitest 5, eslint-plugin-react-hooks 7, @types/better-sqlite3 9, typescript 6) are deliberately held via ignore rules pending a dedicated dependency-refresh pass.
- 🟠 FFmpeg payload per target: linux-x64 is hash-pinned; win32-x64, darwin-arm64, darwin-x64 and linux-arm64 are fetched on first CI use (TOFU) and get pinned as runs land; **win32-arm64 has no pinned static FFmpeg source yet** and ships manifest-only — the app reports it and offers the in-app Repair download (docs/ffmpeg.md).
- 🟠 Intel macOS (darwin-x64): macos-13 runner images are retired, so the x64 DMG/PKG/zip are **cross-compiled on arm64 runners** (electron prebuilds + `clang -arch x86_64`); a real Intel QA pass is still required before claiming Intel support in docs/platform-support.md.
- ❌ Signing (Azure Trusted Signing / Developer ID + notarytool) — env-var plumbing done, real certificates not available yet. Until then, artifacts are unsigned and **stated as such**.
- 🟠 Winget/Scoop/Chocolatey/Flatpak/Snap/AUR manifests authored, not yet submitted.
- ❌ Auto-update feed live (`electron-updater` wired; generic GitHub provider; opt-in).

## Testing

- ✅ Unit suite (41 tests) green.
- 🟡 Playwright Electron smoke (launch → bridge → library) — written; runs in CI (`smoke` job), not yet green in a real run.
- ❌ Golden-frame SSIM preview/export parity harness — planned next.
- ❌ Cross-platform install QA (Windows 125/150/200 % scaling, mixed-DPI, portable, clean uninstall, macOS fresh-account TCC flow, Wayland portal run).

## Performance

Budgets are **targets**, not measurements: cold start < 2.5 s, idle RAM < 250 MB, UI response < 100 ms, dropped frames < 2 % @1080p60, 1-min 1080p30 export < 30 s. Measured numbers land in PERFORMANCE.md after the first device QA pass.

## Honesty rules

Nothing in this file says "works" unless it was tested on that OS. Anything not tested says "planned", "untested", or "not built". Feature work without docs does not count as done.
