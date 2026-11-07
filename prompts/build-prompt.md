# Recast — master build prompt

Paste this into Claude Code, Cursor, Codex, or any agentic coding tool. It is the complete brief.

---

# ROLE

You are a senior product engineer and design engineer who ships polished desktop software. You have deep expertise in Electron, Chromium media APIs (WebCodecs, MediaStream, AudioWorklet), native screen capture on macOS/Windows/Linux, real-time compositing, FFmpeg, packaging and code signing across every desktop target, and interface craft at the level of Linear, Raycast, and Screen Studio.

You do not produce demos. You produce a working, installable, shippable product that someone can download as a `.exe`, `.dmg`, or `.AppImage` and use immediately.

---

# MISSION

Build **Recast** — a free, open-source, local-first desktop app for macOS, Windows, and Linux that turns raw screen recordings into cinematic demo and tutorial videos.

Positioning: *Screen Studio's polish, Cap's simplicity, Cursorful's shareability — zero subscription, zero account, zero upload.*

Everything runs **100% offline on the user's machine**. No cloud, no login, no telemetry by default, no watermarks, no feature gates.

---

# REPOSITORY & NAMING (canonical — do not drift)

| Thing | Value |
|---|---|
| Product | **Recast** |
| GitHub | `https://github.com/SudhirDevOps1/recast` |
| Default branch | `main` |
| Binary | `recast` |
| Project file | `.recast` |
| Style preset | `.recaststyle` |
| URL scheme | `recast://` |
| App ID | `app.recast.desktop` |
| npm packages | `@recast/*` (workspace-private, not published) |
| Windows data | `%APPDATA%\Recast` |
| macOS data | `~/Library/Application Support/Recast` |
| Linux data | `~/.config/recast` |

Every artifact, folder, doc title, installer, window title, menu item, and log prefix uses **Recast**. No leftover template names, no placeholder branding, no generic generated scaffolding names.

Repository description:

> Recast — free, open-source, local-first screen recorder and cinematic editor for macOS, Windows, and Linux. Record, auto-zoom, caption, export. No account, no cloud.

Topics: `screen-recorder`, `screen-capture`, `electron`, `typescript`, `video-editing`, `auto-zoom`, `screen-studio-alternative`, `local-first`, `privacy`, `open-source`, `macos`, `windows`, `linux`.

If the repository does not exist yet:

```bash
git init -b main
git add .
git commit -m "chore: initialize Recast"
gh repo create SudhirDevOps1/recast --public \
  --description "Recast — free, open-source, local-first screen recorder and cinematic editor. Record, auto-zoom, caption, export. No account, no cloud." \
  --source . --remote origin --push
gh repo edit SudhirDevOps1/recast --add-topic screen-recorder,screen-capture,electron,typescript,video-editing,auto-zoom,local-first,privacy,open-source
```

Never force-push `main`, never rename the repo, never change the artifact prefix.

---

# NON-NEGOTIABLES

1. **Real end-to-end paths only.** No mock data, no placeholder buttons, no "coming soon" on core flows. Every visible control works or is removed.
2. **Offline-first.** Network only for opt-in model downloads and update checks. No account, no telemetry.
3. **Premium feel.** 60fps UI, spring motion, zero layout shift, no default Electron chrome, no unstyled component-library defaults.
4. **Every installer type ships** — see the packaging matrix. A release is not done until it builds green in CI for all three OSes.
5. **Crash-safe recording.** Segments on disk; a crash leaves a recoverable file.
6. **Honest platform reporting.** If Wayland or an old macOS cannot do something, say so in the UI with a fix. Never silently degrade.
7. **Docs are part of the product.** A feature without docs is not done.

---

# USERS & JOBS

- **Indie dev / founder** — 90-second product demo, auto-zoomed, exported in under 5 minutes.
- **Designer / PM** — annotated walkthrough with arrows, highlights, callouts.
- **Course creator** — 10–40 minute tutorial with face cam, captions, reusable style presets.
- **Support / QA** — bug capture with system audio and redaction.

Primary job: **record once, look professionally edited, never open a timeline-based NLE.**

---

# PHASES (each phase must end with something installable)

**Phase 0 — spikes.** Prove capture at 1080p60, hardware encode, Windows + macOS 14.2+ loopback, 60 Hz cursor sampling, deterministic render, crash recovery, and FFmpeg bundling on all six targets. Write `SPIKE-RESULTS.md` with measured numbers before building UI.

**Phase 1 — record → trim → export.** Source picker (screen/window/area), mic + system audio, countdown, pause/resume, global hotkey, floating tray, library, trim, MP4 export, onboarding, Windows `.exe` installer, macOS unsigned DMG, Linux AppImage.

**Phase 2 — cinematic editor.** Cursor track, auto-zoom, manual keyframes, cursor styling, frame/background system, aspect ratios, speed, presets, undo/redo, signed + notarized macOS build.

**Phase 3 — audio + captions.** Waveform, gain, fades, noise gate, −14 LUFS normalization, ducking, region blur, local Whisper captions with burn-in and `.srt`/`.vtt`.

**Phase 4 — distribution.** Full installer matrix, signing on all platforms, auto-update with rollback, docs site, opt-in crash reporting, `PERFORMANCE.md`, `STATUS.md`.

---

# STACK

- Electron (latest stable) + TypeScript strict + Vite.
- pnpm workspaces monorepo: `apps/desktop`, `packages/ui`, `packages/capture`, `packages/editor`, `packages/export`, `packages/shared`.
- React 19, Tailwind CSS v4, Radix primitives (owned and styled), Zustand, TanStack Virtual.
- Motion with a small token set; CSS/WAAPI for micro-interactions.
- Capture: `desktopCapturer` + `setDisplayMediaRequestHandler` (never the deprecated path), `getDisplayMedia`, WebCodecs `VideoEncoder` with hardware acceleration, `mp4-muxer` (H.264) and `webm-muxer` fallback. `MediaRecorder` only as a last resort.
- Audio: AudioWorklet mixer, mic and system on separate tracks, 48 kHz.
- Global input: `uiohook-napi`, 60 Hz sampling, batched IPC.
- Storage: `better-sqlite3` + `.recast` project files, atomic autosave every 5 s.
- Captions: `whisper.cpp` sidecar with model manager, ONNX worker fallback.
- Packaging: electron-builder + electron-updater.
- Quality: ESLint flat config, Prettier, `tsc --noEmit`, Vitest, Playwright Electron, golden-frame SSIM.

Security defaults: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP, zod-validated IPC on both ends, no remote code, no `shell` with untrusted input.

---

# ARCHITECTURE

- **Main** owns OS integration: windows, tray, shortcuts, permissions, file IO, FFmpeg supervision, updater, deep links, single instance.
- **Preload** exposes one typed bridge. Every channel declared in `packages/shared/ipc.ts` with request/response schemas and a documented version.
- **Renderer** owns UI and preview. Never blocks. Heavy work goes to workers.
- **Workers**: encode, mux, thumbnails, whisper.
- **Recording** writes fragmented segments every ~2 s with a 2 s keyframe interval plus a `session.json` manifest, so a crash is recoverable.
- **Compositor** is a pure function of `(project, timeMs) → frame`, shared by preview and export. That is what guarantees they match.
- **Export** is driven by a frame clock, never `requestAnimationFrame`.

---

# CAPTURE

- Source picker with a real overlay: dimmed backdrop, 4× magnifier with pixel coordinates, 1 px arrow nudge (10 px with Shift), resize handles, snap to window edges, Enter/Esc, multi-monitor and mixed-DPI aware.
- Countdown off/3/5/10 s with an animated ring and sound cue.
- Pause/resume without corrupting the file; paused time stitched out.
- Mic picker with a live meter and "no signal" warning; system audio toggle with per-OS explanation when unavailable.
- Face cam: device picker, circle/rounded/square, size, position, mirror, blur, recorded as a separate track.
- Live annotation: pen, highlighter, arrow, rectangle, ellipse, text, spotlight, click emphasis, optional keystroke HUD. Captured into the video **and** stored as vector data with timestamps.
- Up to 4K60, dropped-frame indicator, disk-space check, timer and size estimate in the tray.

# CURSOR & ZOOM

- 60 Hz position/click/scroll sampling into a timeline track.
- Auto-zoom: interest points → clustering (1.2 s, 80 px) → keyframes → critically damped spring smoothing.
- Intensities: subtle 1.25×/1.0 Hz, balanced 1.6×/1.2 Hz, punchy 2.0×/1.5 Hz.
- Manual keyframes with anchor in source coordinates, ease in/out/hold.
- Follow-cursor mode with an 18 % dead zone and clamped pan speed.
- Cursor look: native or rendered SVG, size, tint, outline, shadow, ripple, press scale, idle fade, path smoothing.
- Frame-accurate and deterministic between preview and export.

# EDITOR

- Tracks: video, cursor/zoom, annotations, audio, captions.
- Keyboard-first: Space, J/K/L, I/O, `S` split, arrows, ripple delete, undo/redo.
- Frame/background: padding, radius, border, layered shadow, solid/gradient/mesh/blurred-echo/custom image/transparent.
- Aspect ratios 16:9, 9:16, 1:1, 4:5, 21:9, custom, with safe-area guides.
- Trim, split, speed, freeze frame, multi-range delete.
- Audio: waveform, gain, fades, gate, −14 LUFS normalization, ducking.
- Redaction: static or tracked blur/pixelate, applied before encoding.
- Presets: 6 defaults, live thumbnails, `.recaststyle` import/export, one undo step.
- Command palette.

# CAPTIONS

- Fully local Whisper with a model manager (tiny/base/small).
- Word-level timestamps, editable text, auto line-breaks.
- Five styles, burn-in or `.srt`/`.vtt`.
- Language auto-detect; Hindi and English verified first.

# EXPORT

- MP4 H.264 default, HEVC, ProRes, WebM, GIF.
- Fallback chain: HW H.264 → HW HEVC → software → FFmpeg libx264 → MediaRecorder, with the used path shown.
- Pre-flight size/time estimate, cancel without leaving partial files, verify with `ffprobe` after muxing.
- Naming: `recast-{project}-{yyyyMMdd-HHmm}.mp4`, sanitized and de-duplicated.

---

# FFMPEG (bundled + downloadable)

Recast ships FFmpeg as the **safety net and utility layer**, not the primary engine.

Use it for: probing, crash-recovery remux (`-c copy`), thumbnails/filmstrips, 720p proxies, Whisper audio extraction, GIF palettes, software H.264 fallback, and two-pass `loudnorm`. The default record → edit → export path stays on WebCodecs and never shells out.

**Bundling**

- Binaries live in `resources/ffmpeg/<platform>-<arch>/` for `win32-x64`, `win32-arm64`, `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`.
- Never committed to git. `scripts/fetch-ffmpeg.mjs` downloads per `ffmpeg.lock.json` (pinned version + SHA-256 + URL + binary list), verifies the hash **before** extraction, strips, and writes a manifest.
- Runs from `prebuild`, `predist:*`, and CI. CI caches by URL + hash.
- electron-builder ships only the current target's folder and marks it `asarUnpack` so binaries stay executable.
- Target ≤ 45 MB added per platform.

**Runtime**

1. `RECAST_FFMPEG` env override.
2. Bundled binary.
3. `<userData>/bin/ffmpeg/`.
4. In-app download offer.

Validate with `ffmpeg -version` (2 s timeout) on launch. A missing binary must never crash the app — affected features degrade with a precise message and a **Repair** button.

**In-app download** (only when the bundled copy is missing or corrupt): explain why, show size and license, download with resume, verify SHA-256 against the signed manifest, atomically install, never run an unverified binary, roll back on failure.

**Security**: `spawn(binary, args)` with `shell: false`, argument arrays, timeout, and process-tree kill on cancel. Never interpolate filenames into a shell string.

**Licensing**: FFmpeg builds with libx264/libx265 are GPL, so **Recast is GPL-3.0-or-later**. Ship the license texts in `resources/ffmpeg/LICENSE.txt`. Document the MIT/LGPL alternative (no libx264, hardware encoders, OpenH264) in `docs/ffmpeg.md` so nobody relicenses by accident. Surface the FFmpeg version in **Settings → About → Media engine**.

---

# DESIGN SYSTEM

- Dark-first with a true light mode. One accent color. No rainbow gradients. No emoji as icons.
- 4pt spacing, real type scale, tabular numerals, radius and elevation tokens, hairline borders at low alpha.
- Motion: 120/180/240/320 ms, springs for physical elements, `prefers-reduced-motion` respected.
- Custom title bar, native window controls per OS, tray, menu-bar extra on macOS, ⌘K / Ctrl+K command palette.
- Mandatory states: empty, loading, error with recovery, offline, permission-denied, overflow, drag-hover, recording, paused, exporting, success.
- Onboarding: permissions → pick a preset → record a guided 10-second clip.
- Accessibility: keyboard nav, focus rings, ARIA, 4.5:1 contrast, captions, i18n scaffolding (en + hi).
- First-run sample project so the editor is never blank.

---

# PLATFORM REQUIREMENTS

**Windows (first-class)**
- Windows 10 1809+, x64 and ARM64.
- Per-monitor DPI and mixed-DPI correctness.
- WASAPI loopback audio, no virtual cable.
- Per-user install to `%LOCALAPPDATA%\Programs\Recast`, no UAC.
- `.recast` association, `recast://` protocol, single instance.
- Portable build with settings alongside the exe when writable.
- GPU fallback chain with a visible warning.

**macOS**
- Minimum 12.3; system audio requires 14.2+.
- Hardened runtime, camera/audio-input entitlements, correct usage strings.
- Live TCC status with deep links; handle "granted after launch" by offering a relaunch.
- Vibrancy, traffic lights, ⌘ shortcuts, Dock menu, menu-bar extra.

**Linux**
- X11: full support including area selection and cursor capture.
- Wayland: PipeWire portal only — never bypass the compositor. Explain missing cursor tracking and hotkeys.
- PipeWire monitor source for system audio; mic-only fallback when unavailable.
- Detect missing `libfuse2`/GTK and print a copyable fix command.

---

# PACKAGING MATRIX (all types, all OSes)

| OS | Artifact |
|---|---|
| Windows | NSIS `Recast-Setup-x.y.z.exe` (per-user, no UAC) |
| Windows | MSI `Recast-x.y.z.msi` (enterprise/GPO) |
| Windows | Portable `Recast-Portable-x.y.z.exe` |
| Windows | `Recast-x.y.z-arm64.exe` |
| Windows | `.nsis-web` stub (optional) |
| Windows | winget, Scoop, Chocolatey manifests |
| macOS | `arm64.dmg`, `x64.dmg`, `universal.dmg` |
| macOS | `.pkg` for MDM |
| macOS | notarized `.zip` + `latest-mac.yml` |
| macOS | Homebrew cask |
| Linux | AppImage, `.deb`, `.rpm`, `.tar.gz` |
| Linux | Flatpak (Flathub), Snap, AUR PKGBUILD |

Scripts: `pnpm dist:win`, `dist:mac`, `dist:linux`, `dist:all`.

Signing: Azure Trusted Signing or EV cert on Windows (timestamp every file); Developer ID + `notarytool` + stapling on macOS; GPG on Linux packages. Publish `SHA256SUMS` and a signed update feed. Be honest that a fresh OV certificate still triggers SmartScreen until reputation builds.

Auto-update: stable and beta channels, delta where supported, never restart mid-recording, documented rollback.

CI: `windows-latest` (x64), `windows-11-arm`, `macos-14`, `macos-13`, `ubuntu-22.04`. Build, sign, notarize, smoke-test the artifact, upload, auto-generate release notes. Nightly on `main`, releases on `v*`.

---

# DOCUMENTATION (required, not optional)

Create and maintain:

```
README.md                      product, features, install table, screenshots, status
AGENTS.md                      rules for coding agents working in the repo
CONTRIBUTING.md                setup, PR checklist, commit style
SECURITY.md                    disclosure process, threat model
CHANGELOG.md                   generated + hand-edited per release
STATUS.md                      honest real / partial / not-built list
PERFORMANCE.md                 measured numbers + method
docs/README.md                 index
docs/architecture.md           process model, IPC, storage, failure domains
docs/recording.md              sources, permissions, audio, recovery
docs/editing.md                timeline, zoom math, cursor, presets
docs/export.md                 encoders, muxing, determinism
docs/ffmpeg.md                 bundling, lockfile, download, licensing
docs/platform-support.md       honest capability matrix with test dates
docs/build.md                  setup and scripts
docs/packaging.md              every installer target
docs/code-signing.md           Windows, macOS, Linux signing
docs/keyboard-shortcuts.md     full map
docs/troubleshooting.md        real, confirmed issues only
docs/roadmap.md                phases + acceptance criteria
```

Rules: a feature without docs is not done. Never mark something "works" if it was not tested on that OS — write "planned" or "untested". Numbers are targets until measured.

---

# TESTING & QUALITY

- Unit: zoom math, spring interpolation, time mapping, preset serialization, IPC schemas, filename sanitization.
- Playwright Electron smoke: launch → record synthetic source → export → assert playable duration.
- Golden-frame SSIM ≥ 0.995 between preview and export.
- `pnpm verify` = lint + typecheck + unit + smoke, green before any phase is called done.
- Cross-platform install QA: Windows 100/125/150/200 % scaling, mixed-DPI, ARM64, portable, clean uninstall, VirusTotal clean; macOS fresh-account TCC flow; Linux X11 and Wayland.
- Budgets: cold start < 2.5 s, idle RAM < 250 MB, UI response < 100 ms, scrub 60 fps on a 10-minute project, dropped frames < 2 % at 1080p60, 1 min 1080p30 export < 30 s.

---

# WORKING RULES

1. **Research first.** Verify current docs before writing platform code: Electron `setDisplayMediaRequestHandler`, WebCodecs support matrices, ScreenCaptureKit on macOS 14/15, PipeWire portal limits, electron-builder targets, Azure Trusted Signing. Cite what you checked.
2. **Spike before you build.** Prove risky APIs with minimal runnable tests and report measured results.
3. **Vertical slices.** Record 5 s → trim → export → install the `.exe` before widening scope.
4. **No invisible work.** After each phase report: what runs, how to run it, what was measured, what is still fake.
5. **Ask before irreversible choices**: bundling FFmpeg, adding native dependencies, changing the project format, changing the license.
6. **Ship something runnable every session.** At minimum, an artifact the user can double-click.
7. **Keep `STATUS.md` honest.** Always.

---

# DELIVERABLES

1. Build plan, risk register, and phase breakdown before code.
2. A runnable monorepo: `pnpm dev`, `build`, `verify`, `dist:win`, `dist:mac`, `dist:linux`.
3. Working capture → edit → export on all three OSes.
4. Every installer in the packaging matrix, built by CI.
5. Design system in code with living tokens.
6. Complete docs set listed above.
7. Signed releases with `SHA256SUMS` and an update feed.
8. `STATUS.md` that tells the truth.

Build it properly. Make it feel expensive.
