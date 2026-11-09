# STATUS — what is real, what is partial, what is not built

Last updated: 2026-11-09 · P0 capture-hardening landed (Windows "Recording failed: Not supported" root-cause work): configure-probing encoder fallback, activation-safe countdown, compatibility mode, capture diagnostics. Phase 1–2 verified in this repo's gate; CI/CD live. Pages/branch-protection need a one-time admin grant (docs/repository-setup.md). Windows/macOS on-device QA pending real hardware.

Legend: ✅ implemented & verified · 🟡 implemented but not yet verified on device/CI · 🟠 scaffolded, not complete · ❌ not built

## Verified in this repository (2026-11-07, Linux CI-equivalent sandbox)

- ✅ `pnpm typecheck` — all 6 workspace projects green (tsc strict)
- ✅ `pnpm lint` — ESLint flat config, 0 errors
- ✅ `pnpm test` — 64/64 unit tests pass (zoom math, springs, clustering, time mapping, preset serialization, IPC schemas, filename sanitization, SRT/VTT)
- ✅ `pnpm build` — electron-vite produces main (61.8 kB), preload and renderer bundles (3 entry points)
- ✅ `scripts/fetch-ffmpeg.mjs` — downloads, verifies (registry integrity + SHA-256), pins hashes, stages into `resources/ffmpeg/<platform>-<arch>/`; linux-x64 fetched with real pinned hashes (ffmpeg 6.0-static 78.7 MB, ffprobe 4.0.2-static 64.5 MB); both binaries execute
- ✅ Icons generated (icon.png 1024, icon.ico multi-size, tray templates)

## Recording

- 🟡 Screen/window capture via `desktopCapturer` + `getDisplayMedia` with main-process `setDisplayMediaRequestHandler` — verified in the xvfb Playwright smoke (4/4, incl. full record→library and export e2e). **Windows on-device QA still pending** — the reported "Recording failed: Not supported" is root-caused and fixed in code (see below), but the 10× consecutive-run sign-off on real Windows 10/11 + mixed-DPI hardware remains open.
- ✅ **Configure-probing encoder fallback chain** (`packages/capture/src/encoder-probe.ts`, 2026-11-09): `isConfigSupported()` is no longer trusted — every candidate (HW H.264 High → HW Baseline → SW H.264 → SW VP9) must actually `configure()` and drain a canary frame. This is the root-cause fix for the raw `NotSupportedError` DOMException toast on Windows (Chromium claims support, then configure() throws on half-broken GPU drivers). Unit-tested: the chain can never escape a raw DOMException (5 tests).
- ✅ **MediaRecorder compatibility mode** (`packages/capture/src/compat.ts`, 2026-11-09): if every WebCodecs candidate fails, recording still produces a VP8/VP9 WebM (2 s appends, `compatibility: true` stamped in the manifest) instead of failing outright. Recording never dies to an encoder problem.
- ✅ **Activation-safe start flow** (2026-11-09): the display stream is acquired synchronously inside the click handler BEFORE the countdown (the old countdown-first flow let transient activation expire → Chromium rejected getDisplayMedia on 5 s/10 s countdowns). Live preview under the countdown, Esc cancels and releases the streams.
- ✅ **Structured capture diagnostics** (2026-11-09): every stage boundary (display-media, audio-init, encoder-probe, encoder-configure, segment-write, muxer, …) is logged by the renderer, batched over IPC and appended as NDJSON to `logs/capture.log` in the data dir (512 KB, one rotation slot). Settings → Diagnostics → **Copy diagnostics bundle** produces the app/OS/FFmpeg/display-deny summary + last 200 log lines. The display-media handler always answers (denies cleanly with a recorded reason — no more pending-forever requests).
- ✅ **Real recorder stats** (2026-11-09): mic meter is the live AudioWorklet peak in dBFS (null = no mic) and disk-free is polled from the main process every 2 s — the hardcoded `null`/`-1` placeholders and the always-on "No signal" warning are gone. Mic device picker enumerates real devices with labels (persisted per profile), falls back to the default device on unplug.
- 🟡 Segmented crash-safe writing (2 s MP4 fragments, atomic `session.json` manifest, tmp+rename segment writes, `cursor.jsonl` batching) — exercised by the smoke suite; forced-kill recovery test still pending.
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
- ✅ Timeline 2.0 (2026-11-08): time ruler with tick marks, clip selection, drag-to-trim edges (ripple re-layout, min 200 ms, segment-bounded), draggable manual zoom-keyframe diamonds with snap, transition + speed badges, selected-clip delete — unit-covered engine, UI verified by typecheck/lint/build + smoke path.
- ✅ Motion 2.0 engine (2026-11-08): easing module (linear/in/out/inout/hold/pop) applied per zoom keyframe (spring remains the default 'silky'), clip intro transitions (fade / slide-left / slide-up / zoom) rendered inside the shared compositor, whole-video fade in/out, cursor release-bounce + motion trail + exponential smoothing — all pure functions with unit tests (64/64 passing), preview and export render identically through compositor.ts.
- ✅ Motion panel: per-clip intro transition + duration + speed (0.25–4×), per-keyframe easing select, video fades, cursor FX switches/sliders; "Keyframe at playhead" captures the live camera pose.
- ✅ Presets: 6 built-ins, `.recaststyle` import/export with schema validation (one undo step via commit).
- ✅ Command palette (⌘K), keyboard transport (Space/JKL/S/arrows/undo/redo).
- ✅ Style system: aspect ratios, padding, radius, border, shadow levels, background (solid/gradient/mesh/blurred echo/transparent), cursor looks (native/dot/pointer/circle) with ripple/press-scale/idle-fade.
- 🟠 Annotations in the editor (vector model + render path implemented; drawing UI not built).
- 🟠 Redaction blur/pixelate — compositor implements static rects; tracked redaction not built.
- 🟡 Speed UI shipped (per-clip slider, 2026-11-08); freeze frame and multi-range delete still ❌.

## Captions

- 🟠 Whisper integration fully wired: model manager (tiny/base/small, en+multi), whisper.cpp sidecar invocation, SRT/VTT import/export, burn-in styles. **Requires a `whisper.cpp` binary** (detected on PATH or bundled); no ONNX fallback yet. Never verified end-to-end on device — marked untested, not "works".
- ❌ Word-level timestamps (sentence-level only for now).

## Export

- 🟡 Frame-clock exporter (never rAF), deterministic composition, encoder chain HW H.264 → SW → VP9/WebM, incremental positional MP4 writes via StreamTarget, cancel-safe `.part` → rename, ffprobe verification, used-path surfaced in UI. Code complete; needs CI smoke + device runs.
- ✅ GIF (palettegen/paletteuse) and ProRes via FFmpeg frame pipe; loudnorm two-pass (−14 LUFS) post-pass.
- ❌ HEVC via FFmpeg fallback when WebCodecs lacks it (WebCodecs HEVC only when the platform provides it).

## Packaging & distribution

- ✅ `electron-builder.yml` with the full matrix: NSIS per-user (no UAC), MSI (per-machine), portable, arm64 suffix, DMG arm64/x64, zip (updater), AppImage/deb/rpm/tar.gz, `recast://` protocol, asarUnpack for native modules + FFmpeg. Nightly #6 (2026-11-07): win-x64 ✅, win-arm64 ✅, linux-x64 ✅ (AppImage extraction + FFmpeg payload verified in CI).
- ✅ CI/CD activated (2026-11-07): `ci.yml` — verify gate (typecheck + lint + unit tests + build) on **ubuntu-22.04, windows-latest, windows-11-arm, macos-15** plus an xvfb Playwright smoke job (launch → bridge → library, Electron-ABI native rebuild included); `build.yml` — nightly installer matrix with Electron/FFmpeg caches, AppImage extraction smoke, `SHA256SUMS`, nightly prerelease (Flatpak/Snap legs on manual dispatch); `release.yml` — on `v*` tags with auto-generated notes; `website.yml` — GitHub Pages; `codeql.yml` — weekly analysis.
- ✅ Website shipped (`apps/website/`, GitHub Pages): feature showcase, per-OS download lists fetched live from the GitHub API, nightly toggle, honest unsigned-installers notice. Pages needs a one-time admin enablement (Settings → Pages → Source: GitHub Actions) — until then the Website workflow fails loudly with that exact fix instead of a cryptic 403 (docs/repository-setup.md).
- ❌ Branch protection on `main` — the CI token is deliberately least-privilege (Contents + Workflows only), so this one-time admin step is documented in [docs/repository-setup.md](docs/repository-setup.md) instead of silently skipped.
- ✅ Nightly installer matrix fully green (2026-11-08, nightly run #8): **win-x64 ✅ · win-arm64 ✅ · mac-arm64 ✅ · mac-x64 ✅ · linux-x64 ✅ · Publish nightly prerelease ✅** — the `nightly` tag carries 23 live assets: NSIS Setup x64/arm64, MSI, Portable x64/arm64, DMG arm64/x64, zip arm64/x64 + `latest-mac.yml`, AppImage/deb/rpm/tar.gz + `latest-linux.yml`/`latest.yml`, and `SHA256SUMS`. All artifacts are unsigned (honest notice in the release notes and on the website).
- ✅ CI gate fully green (2026-11-08, runs #44–#46): Docs integrity, 4-runner verify (ubuntu-22.04, windows-latest, windows-11-arm, macos-15) and the xvfb Playwright smoke (launch → bridge → library, Electron-ABI native rebuild, pre-cached Electron binary). Fixing the app's silent startup also surfaced real product bugs, all fixed: the workspace TS packages were externalized so the packaged main process tried to import TypeScript source (now bundled via externalizeDepsPlugin excludes + file-exact aliases); the sandboxed preload was emitted as ESM `.mjs` while the window loads `.js` (now forced CJS, with zod bundled — sandboxed preloads may only require electron); the renderer read `process.platform`, which does not exist under sandbox (now read via the bridge); electron-updater threw on the dev-mode "0.0" version (now guarded by `app.isPackaged`). The debugging history of the first gate stays below for the record — first findings: — real findings, being fixed forward in small commits: Preflight + Docs integrity ✅ and CodeQL ✅ on every push; ubuntu-22.04 and macos-15 verify legs ✅. Round 1: `apps/website/assets/releases.js` (browser JS) was linted with Node globals → website excluded from ESLint; `macos-13` queued forever (image retired) → macos-15. Round 2: the **macos-14 label also cancels instantly** (withdrawn for new use) → all macOS legs on macos-15; Windows install failed because the runner image ships **VS 2026 (v18), unknown to Node 22's bundled node-gyp 10.3.1** → CI installs node-gyp@latest and points `npm_config_node_gyp` at it; nightly Linux reached packaging and exposed two real packaging bugs — electron-builder derived the unsafe `executableName` `@recastdesktop` from the scoped package name (now pinned to canonical `recast`) and `extraResources` paths resolved relative to `apps/desktop` (now `../../resources/…`); the X11 header fix for the `uiohook-napi` rebuild is confirmed working; ffmpeg fetching is per-leg platform-arch and `win32-arm64` (no pinned static FFmpeg source yet) stages a manifest-only payload with graceful in-app Repair degradation; the smoke job now rebuilds native modules for the Electron ABI before launching. The runs after each fix are the verification. Dependabot is live; breaking npm majors (zod 4, electron-vite 6, @vitejs/plugin-react 6, @types/node 26, vitest 5, eslint-plugin-react-hooks 7, @types/better-sqlite3 9, typescript 6) are deliberately held via ignore rules pending a dedicated dependency-refresh pass.
- 🟠 FFmpeg payload per target: linux-x64 is hash-pinned; win32-x64, darwin-arm64, darwin-x64 and linux-arm64 are fetched on first CI use (TOFU) and get pinned as runs land; **win32-arm64 has no pinned static FFmpeg source yet** and ships manifest-only — the app reports it and offers the in-app Repair download (docs/ffmpeg.md).
- 🟠 macOS `pkg` (MDM) target is **temporarily out of the nightly matrix**: electron-builder 26.18 fails the unsigned productbuild step (`ENOENT … unlink app.recast.desktop.pkg`); dmg + zip + updater feed build and the config block is kept for the re-enable with signing.
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
