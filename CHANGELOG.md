# Changelog

All notable changes to Recast are documented here. Format: Keep a Changelog; versioning: SemVer.

## [Unreleased]

### Added
- Market research on the free open-source screen recorders (`docs/market-parity.md`): what Capptivo, OpenScreen, Recordly, Capturia, Focra, Reframed, screenize and OpenScreenStudio actually do, how their zoom, cursor, annotation, audio and export engines work, and where Recast stands against them - recorded as behaviour to copy, never as code.
- `prompts/parity-build-prompt.md` - the build brief for closing that gap in P0-P3 order (suggest zooms, live annotation toolbar, keystroke HUD, fixed zoom regions, cursor loop + click sounds + spotlight, per-track audio, aspect re-aim, platform export presets, native capture, i18n).
- Website download UX rebuild (`apps/website/`): platform-aware download tabs (Windows / macOS / Linux, with iPadOS and Android detected so a phone is never offered a 277 MB installer), an Apple Silicon / Intel switch that picks the matching DMG, a recommended-file tag, per-file sizes, a per-file SHA-256 preview (GitHub publishes a digest per release asset), a download toast carrying the file name and size, a direct `SHA256SUMS` link, a mobile sticky bar that offers to copy the page link, and a `noscript` note that states plainly what needs JavaScript.
- `scripts/check-website.mjs` — markup and asset audit (duplicate ids, in-page anchors, missing local files, `rel=noopener`, third-party scripts, asset-version drift, optional release-asset HEAD checks). Runs in the Website workflow before every Pages deploy.
- `scripts/check-docs.mjs` — documentation audit (relative links, in-page anchors, code-fence balance). Runs in the CI docs job.
- Enterprise documentation set: rewritten README (value props, capability table with honest state markers, mermaid architecture map, install matrix, audience-based doc map), new `docs/deployment.md`, `docs/security.md` and `docs/support.md`, a rebuilt `docs/architecture.md`, an at-a-glance table for platform support, and "Related" footers across the doc set.
- Nightly build labelling now shows the real build version carried by the assets, and the release list marks the latest stable versus nightly explicitly.

### Fixed
- The hidden mobile menu no longer swallows clicks on small screens.
- The hero version chip no longer advertises a stale version when release data cannot be fetched.
- Small print and footer copy lifted to WCAG AA contrast (3.31:1 to about 5:1); Lighthouse accessibility is now 100.

## [0.1.3] - 2026-11-10

### Fixed
- Editor preview showed random black frames - two stacked root causes, both now closed:
  - the hidden per-segment `<video>` decode elements behind the canvas preview were **never seeked or played**, so the preview sat frozen on frame 0 and the compositor filled the screen rect solid black whenever no frame was paintable. `packages/editor/src/frame-sync.ts` (FrameSync) drives them now: precise seeks while scrubbing (40 ms tolerance), playback at the clip's speed with a 120 ms hard resync, and a last-good-frame snapshot so the canvas never collapses to black mid-decode.
  - segment files are written with `firstTimestampBehavior: 'offset'` (file time starts at 0) while seeks used raw capture-clock times - every segment after the first (~2 s) seeked past its end ("black every few seconds"). All preview and export seeks now map through `segmentLocalTimeUs()`.

### Added
- Opt-in face-cam picture-in-picture, full slice: **Face camera** toggle + device picker (default-device fallback on unplug) -> renderer-side MediaRecorder track (`cam-0.webm`, VP8/VP9, timeslice) written additively beside the screen pipeline, so a camera failure can never block or corrupt the screen take -> manifest `project.media.camera` -> compositor PiP (corner position, width %, round crop, mirror, shadow, border, margin, opacity) -> editor Cam panel -> exporter seek + draw. Honest caveat: cam timing follows the capture clock, so takes that use pause may drift slightly in the overlay.
- Background image support: pick an image (copied into the session directory) and render it behind the screen card in preview and export.
- Cursor FX controls now exposed in the panel: smoothing, motion trail, click bounce.
- Library poster thumbnails: the ffmpeg poster frame is persisted as `thumbnail.png` instead of being re-spawned per visit, with a no-ffmpeg fallback that streams the first segment.
- Export presets in the export view.
- Premium UI polish pass.

### Changed
- Test suite grew to 12 files / 92 tests (was 9 / 76).

## [0.1.2] - 2026-11-10

### Fixed
- Windows editor preview: the `recast-media://` handler rebuilt absolute paths with `path.resolve('/' + decoded)`, which re-rooted `C:\...` into `\C:\...` and 404-ed every media request - the preview stayed black, export could not decode segments and thumbnails were dead. Fixed with `mediaPathFromUrl` and cross-platform regression tests (Node's win32/posix path modules run on any host). On-device Windows re-verification is still open.

### Changed
- Website redesign with motion, use cases, an internals pipeline, a verify panel and a live release list.
- Asset URLs are versioned so a fix is not hidden behind the 10-minute Pages cache.
- Meta description trimmed to search-result length.

## [0.1.1] - 2026-11-09

### Added
- Settings - Diagnostics with **Copy diagnostics bundle**: app/OS/FFmpeg/display-permission summary plus the last 200 lines of `capture.log`.
- Encoder-probe tests: the fallback chain can never escape a raw `DOMException`.
- Recorder phase 2: live source thumbnails, refresh, pause/resume fix and actionable toasts.
- A real end-to-end demo GIF in the README.

### Fixed
- Windows "Recording failed: Not supported" root-caused: `isConfigSupported()` is no longer trusted - every encoder candidate must actually `configure()` and drain a canary frame (`packages/capture/src/encoder-probe.ts`). A MediaRecorder compatibility mode still records VP8/VP9 when WebCodecs fails.
- `getDisplayMedia` was always denied on Electron >= 22 - the display-media handler is now registered in the main process, and the display stream is acquired synchronously inside the click handler before the countdown.
- Recording froze after the first 2 s segment.
- The full record - edit - export chain had six blockers, found by live debugging and repaired.
- `recast-media` served absolute paths relative to the process working directory - black preview and exports.
- Range requests are served from the `recast-media` protocol; Chromium media buffers are kept off a tiny `/dev/shm`; `firstRunDone` persists so the welcome dialog stops reopening on every launch; the interface is English-only.
- CI mirrors Electron and electron-builder downloads through npmmirror, and the smoke job installs FFmpeg for the synthetic-segment export test.

## [0.1.0] - initial build

### Added
- Monorepo: `apps/desktop` + `@recast/shared`, `@recast/capture`, `@recast/editor`, `@recast/export`, `@recast/ui`.
- Recording: screen/window/area sources via `desktopCapturer` + `setDisplayMediaRequestHandler`, WebCodecs `VideoEncoder` (hardware-preferred) with `mp4-muxer` segmentation every 2 s, atomic `session.json` manifest, `cursor.jsonl` input log (60 Hz sampling + uiohook-napi clicks/scroll), AudioWorklet mixer with separate mic/system tracks at 48 kHz Opus, pause/resume with clock compensation, global hotkeys, tray with live timer.
- Crash recovery: session scan, segment salvage plan, `ffmpeg -c copy` remux.
- Editor: pure compositor shared by preview and export; auto-zoom (interest detection -> clustering -> fit-clamped keyframes -> critically damped spring track), manual keyframes, follow-cursor mode (18 % dead zone, clamped pan), timeline with split/ripple delete, undo/redo, six built-in style presets, `.recaststyle` import/export, aspect ratios, frame/background system, command palette.
- Export: frame-clock renderer, encoder fallback chain (HW H.264 -> SW H.264 -> VP9/WebM), incremental positional MP4 writes, cancel-safe `.part` handling, ffprobe verification, GIF/ProRes via FFmpeg frame pipe, -14 LUFS loudnorm post-pass.
- FFmpeg safety net: `fetch-ffmpeg.mjs` + `ffmpeg.lock.json` with pinned SHA-256 hashes (registry-integrity-verified ffprobe tarballs), resolution chain env -> bundled -> user dir -> system PATH, in-app downloader with rollback, GPL licensing documentation.
- Captions (scaffolded, untested end-to-end): whisper.cpp sidecar with model manager, SRT/VTT import/export, burn-in styles.
- Packaging: electron-builder matrix (NSIS per-user, MSI, portable, arm64, DMG, pkg, zip, AppImage, deb, rpm, tar.gz), Flatpak/Snap/AUR/winget/Scoop/Chocolatey manifests, GitHub Actions verify + build matrices with SHA256SUMS release job.
- Design system: dark-first tokens with true light mode, 4 pt spacing, one accent, motion tokens, `prefers-reduced-motion`, custom title bar, accessibility pass (focus rings, ARIA roles, tabular numerals).
- Docs set: architecture, recording, editing, export, ffmpeg, platform support, build, packaging, code signing, keyboard shortcuts, troubleshooting, roadmap + honest STATUS.md.
