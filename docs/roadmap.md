# Roadmap

Status: Phase 0 not started. This file is the contract for what gets built, in what order, and what "done" means.

Guiding rule: **every phase ends with something a stranger can download and use.** No phase ends with scaffolding.

---

## Phase 0 — Feasibility spikes

Goal: prove the risky parts before building a UI on top of them. Two weeks.

| # | Spike | Success looks like |
|---|---|---|
| 0.1 | Screen capture + hardware encode | 1080p60 for 5 minutes, < 2 % dropped frames, playable MP4 |
| 0.2 | System audio | Windows loopback + macOS 14.2+ loopback captured and muxed |
| 0.3 | Global cursor sampling | 60 Hz samples for 60 seconds, < 1 % missing, correct timestamps |
| 0.4 | Deterministic render | Same frame rendered twice is byte-identical |
| 0.5 | Crash recovery | Kill the process mid-recording, rebuild a playable file |
| 0.6 | FFmpeg bundling | Packaged app runs `ffmpeg -version` on all six targets |

Exit criteria: a written `SPIKE-RESULTS.md` with measured numbers, and a decision log for anything that failed. If a spike fails, the plan changes here — not after three weeks of UI work.

---

## Phase 1 — Record → Trim → Export (MVP)

Goal: a usable recorder. This is the first public pre-release.

**Scope**

- Source picker: screen, window, area, with the full selection overlay.
- Mic + system audio, separate tracks, live meters.
- Countdown, pause/resume, global hotkey, floating tray.
- Segmented recording with crash recovery.
- Library with thumbnails, rename, delete, duplicate.
- Trim, split, and basic playback in a minimal editor.
- MP4 H.264 export with a progress screen.
- Onboarding: permissions → first recording.
- Windows `.exe` installer; macOS unsigned `.dmg`; Linux AppImage.

**Done when**

- 10-minute 1080p60 recording on all three OSes with no dropped-frame warning.
- Stop → playable file in under 3 s.
- Crash recovery works from a forced kill.
- First-run onboarding takes under 60 seconds to a completed recording.
- `pnpm verify` green, installer published as a GitHub pre-release.

---

## Phase 2 — The cinematic layer

Goal: the reason people choose Recast over a plain recorder.

**Scope**

- Cursor track: 60 Hz sampling, smoothing, follow mode.
- Auto-zoom with three intensities, plus manual keyframes.
- Cursor styling: size, tint, outline, shadow, ripple, press scale, idle fade.
- Frame and background system: padding, radius, border, shadow, gradients, mesh, blurred echo, custom image, transparent.
- Aspect ratios and safe-area guides.
- Speed, freeze frame, ripple delete, full undo/redo.
- Presets: 6 defaults, save/apply/import/export `.recaststyle`.
- Full editor timeline with keyboard control.
- Export presets and pre-flight estimates.

**Done when**

- A 3-minute demo auto-zooms and looks intentional at all three intensities.
- Preview and export match on SSIM ≥ 0.995.
- A preset round-trips without visual drift.
- Timeline holds 60 fps with a 10-minute 1080p project.
- macOS DMG is signed and notarized.

---

## Phase 3 — Audio and captions

Goal: tutorials that do not need a second app.

**Scope**

- Waveform, gain, fades, noise gate, −14 LUFS normalization, voice ducking.
- Region blur and pixelate, with optional tracking.
- Local Whisper captions: model manager, word-level timing, five styles, burn-in or `.srt`/`.vtt`.
- Hindi + English verified; language auto-detect.
- Face cam editing: reposition, resize, hide, blur background.

**Done when**

- A 20-minute spoken tutorial transcribes in a reasonable time on a mid-tier laptop, fully offline.
- Caption timing stays within 200 ms of speech after editing.
- Normalization hits −14 LUFS ± 0.5 on three test recordings.
- Redaction is verified against the exported file, not just the preview.

---

## Phase 4 — Distribution and trust

Goal: a project people can install without fear.

**Scope**

- Full installer matrix: NSIS, MSI, portable, ARM64, DMG (arm64/x64/universal), PKG, AppImage, deb, rpm, tar.gz, Snap, Flatpak, AUR.
- winget, Scoop, Chocolatey, Homebrew cask.
- Code signing on all three platforms, notarization, GPG-signed Linux packages.
- Auto-update with stable/beta channels and a rollback path.
- Docs site, screenshots, demo videos.
- Opt-in crash reporting (never on by default).
- `PERFORMANCE.md`, `STATUS.md`, `CHANGELOG.md`.

**Done when**

- Every artifact in `docs/packaging.md` builds green in CI.
- Clean-machine install passes the release gate checklist.
- A user can install, record, export, and update without touching a terminal.
- `STATUS.md` is accurate and current.

---

## Explicit non-goals

- Cloud storage, accounts, or sharing links.
- A full NLE: no multicam, color grading, or complex compositing.
- Mobile apps.
- Live streaming.
- Editing non-screen footage as a primary use case.

Saying no keeps the app fast and the scope shippable.

---

## How work is tracked

- One GitHub issue per deliverable, labeled `phase-0` … `phase-4`.
- A milestone per phase; a milestone closes only when its "Done when" list is true.
- Anything untested is labeled `untested`, never `done`.
- `STATUS.md` is updated in the same PR that changes reality.
