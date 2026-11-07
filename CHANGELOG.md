# Changelog

All notable changes to Recast are documented here. Format: Keep a Changelog; versioning: SemVer.

## [Unreleased]

### Added
- CI/CD activated end-to-end: `ci.yml` (verify gate — typecheck/lint/tests/build on 5 runners: ubuntu-22.04, windows-latest, windows-11-arm, macos-14, macos-13 — plus an xvfb Playwright smoke job), `build.yml` (nightly installer matrix with FFmpeg/Electron caches, AppImage smoke, SHA256SUMS, nightly prerelease; Flatpak/Snap on manual dispatch), `release.yml` (on `v*` tags with auto-generated notes), `website.yml` (GitHub Pages), `codeql.yml` (weekly security analysis).
- Website (`apps/website/`): landing page with feature showcase, honest beta markers, real release data from the GitHub API (per-OS asset lists, nightly toggle, star count, rate-limit fallback), OG image, JSON-LD, deployed to https://sudhirdevops1.github.io/recast/.
- `SPIKE-RESULTS.md` — what was proven, how, and what still needs hardware.
- Build scripts: `dist:mac:x64`, `dist:linux:extras` (Flatpak/Snap).

### Fixed
- `.github/dependabot.yml` group syntax (`update-types: inor, patch]` → `[minor, patch]`).
- README install table no longer implies macOS builds are signed/notarized today — they are not, and say so.
- Windows arm64 builds target NSIS + portable explicitly (MSI remains x64-only for enterprise/GPO).

## [0.1.0] — initial build

### Added
- Monorepo: `apps/desktop` + `@recast/shared`, `@recast/capture`, `@recast/editor`, `@recast/export`, `@recast/ui`.
- Recording: screen/window/area sources via `desktopCapturer` + `setDisplayMediaRequestHandler`, WebCodecs `VideoEncoder` (hardware-preferred) with `mp4-muxer` segmentation every 2 s, atomic `session.json` manifest, `cursor.jsonl` input log (60 Hz sampling + uiohook-napi clicks/scroll), AudioWorklet mixer with separate mic/system tracks at 48 kHz Opus, pause/resume with clock compensation, global hotkeys, tray with live timer.
- Crash recovery: session scan, segment salvage plan, `ffmpeg -c copy` remux.
- Editor: pure compositor shared by preview and export; auto-zoom (interest detection → clustering → fit-clamped keyframes → critically damped spring track), manual keyframes, follow-cursor mode (18 % dead zone, clamped pan), timeline with split/ripple delete, undo/redo, six built-in style presets, `.recaststyle` import/export, aspect ratios, frame/background system, command palette.
- Export: frame-clock renderer, encoder fallback chain (HW H.264 → SW H.264 → VP9/WebM), incremental positional MP4 writes, cancel-safe `.part` handling, ffprobe verification, GIF/ProRes via FFmpeg frame pipe, −14 LUFS loudnorm post-pass.
- FFmpeg safety net: `fetch-ffmpeg.mjs` + `ffmpeg.lock.json` with pinned SHA-256 hashes (registry-integrity-verified ffprobe tarballs), resolution chain env → bundled → user dir → system PATH, in-app downloader with rollback, GPL licensing documentation.
- Captions (scaffolded, untested end-to-end): whisper.cpp sidecar with model manager, SRT/VTT import/export, burn-in styles.
- Packaging: electron-builder matrix (NSIS per-user, MSI, portable, arm64, DMG, pkg, zip, AppImage, deb, rpm, tar.gz), Flatpak/Snap/AUR/winget/Scoop/Chocolatey manifests, GitHub Actions verify + build matrices with SHA256SUMS release job.
- Design system: dark-first tokens with true light mode, 4 pt spacing, one accent, motion tokens, `prefers-reduced-motion`, custom title bar, accessibility pass (focus rings, ARIA roles, tabular numerals).
- Docs set: architecture, recording, editing, export, ffmpeg, platform support, build, packaging, code signing, keyboard shortcuts, troubleshooting, roadmap + honest STATUS.md.
