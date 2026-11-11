# Changelog

All notable changes to Recast are documented here. Format: Keep a Changelog; versioning: SemVer.

## [Unreleased]

### Fixed
- **Face-cam PiP never appeared in the preview or in exports.** MediaRecorder writes the camera as a streaming WebM with no duration and no cues, so Chromium reports `duration = Infinity`, an empty `seekable` range, and silently refuses to move `currentTime`. Both the editor compositor and the export renderer seek the camera by time, so every frame showed the (transparent) first snapshot — the gold ring with nothing inside. Camera takes are now remuxed losslessly (`ffmpeg -c copy`, no re-encode, ~1 s) into an indexed WebM when the recorder writes them, and existing recordings are healed the first time they are opened. Verified by sampling the preview canvas (camera pixels now composited) and by the camera element reporting a seekable 50.3 s duration.
- **Editor preview stayed black on open.** The decode pipeline already had the frames — `FrameSync` was capturing snapshots and firing its redraw signal, but the canvas draw effect did not depend on that signal, so the first paint (before the videos finished loading) was never replaced. The redraw tick is now part of the effect dependencies; the preview shows real content as soon as the first frame is paintable.
- Every interactive control now has hover, press, focus-visible and disabled states. `Button`/`IconButton` pushed their colours as an inline `background` shorthand, which silently overrode any hover rule; they now expose component custom properties (`--rc-btn-*`, `--rc-icon-*`) that the shared stylesheet can override.
- Select trigger/items, Slider thumb, Switch, Dialog, Card and panel tabs all gained the same state layer, plus reduced-motion guards.
- Dialog has a close button and enter motion; `Tabs` no longer sets an invalid `padding-bottom: -1`.
- Switch thumb animates `transform` instead of `left` (no layout pass per frame).
- The **Recording** badge is reactive, and both it and the recorder view show a real clock (`mm:ss` / `h:mm:ss`) instead of raw seconds.
- Toasts use a tone-correct icon (`warning` / `check` / `sparkle`) and `role="alert"` for errors, so failures and successes no longer look identical.
- Library delete is two-step with a toast and an error path; opening a recording catches IPC failures instead of silently doing nothing.
- Timeline no longer prints a truncated segment id and two trim grips on blocks under 60 px; segment blocks stay selectable and trimmable, they just stop pretending to have room for a label.
- The "Zoom Intelligence" row no longer overflows the 320 px editor rail — the heuristic select is full width and the action sits below it.
- `recorder:requestStop` clears recorder state in `finally`, so a failed stop cannot leave the app in a recording state.
- Fixed a pre-existing lint error in `packages/capture/src/audio-mixer.ts` (unused catch binding).

### Added
- Library: header with count, search, sort (newest / oldest / longest / name), poster thumbnails fetched four at a time with skeleton placeholders, staggered card entrance, hover play affordance, and an empty "no matches" state.
- View transitions between Library, Record, Editor, Export and Settings; toast and dialog motion; shared `.rc-skeleton`, `.rc-card`, `.rc-stagger` and `.rc-tabstrip` primitives.
- `docs/premium-plan.md`: the code-level audit, the feel spec (five states, motion tokens, layout laws) and the Recordly/Capptivo feature roadmap (F1–F8) with an honesty rule for ticking anything off.

### Changed
- Editor panel tabs are a scrollable tab strip with `role="tablist"` / `aria-selected` semantics.

## [0.1.4] - 2026-11-10

### Fixed
- App crash / hang on stop flow: hardened `stopRecordingFlow()` in the renderer and `recorder:stop` in the main process with try/catch/finally, guaranteed resource release, and explicit cleanup of auxiliary floating windows (`toolbarWindow`, `areaWindow`) preventing orphaned processes and UI lockups.
- The hidden mobile menu no longer swallows clicks on small screens.
- The hero version chip no longer advertises a stale version when release data cannot be fetched.
- Small print and footer copy lifted to WCAG AA contrast (3.31:1 to about 5:1); Lighthouse accessibility is now 100.

### Added
- **Suggest zooms** (P0-1): Auto-zoom suggestions based on click clustering and dwell detection (cursor stillness <= 8 px for >= 500 ms) in the Motion panel. Pure function covered by unit tests.
- **Keystroke HUD** (P0-3): Real-time keycap overlays captured via `uiohook-napi` in the main sampler, batched into `cursor.jsonl`, and rendered through the shared compositor identically in preview and export.
- **Live Annotation Toolbar** (P0-2): Floating, draggable annotation toolbar offering Pen, Highlighter, Arrow, Rect tools, and color palette with non-blocking vector logging.
- Market research on the free open-source screen recorders (`docs/market-parity.md`): what Capptivo, OpenScreen, Recordly, Capturia, Focra, Reframed, screenize and OpenScreenStudio actually do, how their zoom, cursor, annotation, audio and export engines work, and where Recast stands against them - recorded as behaviour to copy, never as code.
- `prompts/parity-build-prompt.md` - the build brief for closing that gap in P0-P3 order (suggest zooms, live annotation toolbar, keystroke HUD, fixed zoom regions, cursor loop + click sounds + spotlight, per-track audio, aspect re-aim, platform export presets, native capture, i18n).
- Website download UX rebuild (`apps/website/`): platform-aware download tabs (Windows / macOS / Linux, with iPadOS and Android detected so a phone is never offered a 277 MB installer), an Apple Silicon / Intel switch that picks the matching DMG, a recommended-file tag, per-file sizes, a per-file SHA-256 preview (GitHub publishes a digest per release asset), a download toast carrying the file name and size, a direct `SHA256SUMS` link, a mobile sticky bar that offers to copy the page link, and a `noscript` note that states plainly what needs JavaScript.
- `scripts/check-website.mjs` — markup and asset audit (duplicate ids, in-page anchors, missing local files, `rel=noopener`, third-party scripts, asset-version drift, optional release-asset HEAD checks). Runs in the Website workflow before every Pages deploy.
- `scripts/check-docs.mjs` — documentation audit (relative links, in-page anchors, code-fence balance). Runs in the CI docs job.
- Enterprise documentation set: rewritten README (value props, capability table with honest state markers, mermaid architecture map, install matrix, audience-based doc map), new `docs/deployment.md`, `docs/security.md` and `docs/support.md`, a rebuilt `docs/architecture.md`, an at-a-glance table for platform support, and "Related" footers across the doc set.
- Nightly build labelling now shows the real build version carried by the assets, and the release list marks the latest stable versus nightly explicitly.

### Changed
- Test suite grew to 13 files / 95 tests (added `packages/editor/tests/suggest-zooms.test.ts`).

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
