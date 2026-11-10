# Recast — market parity build prompt

Paste this into Claude Code, Cursor, Codex, or any agentic coding tool. It is the brief for the next phase:
close the gap with the free open-source screen recorders without breaking Recast's promises.

The research behind this brief lives in [docs/market-parity.md](../docs/market-parity.md). Read it first.

---

# ROLE

You are a senior product engineer and design engineer who ships polished desktop software. You know Electron,
Chromium media APIs (WebCodecs, MediaStream, AudioWorklet), real-time compositing, FFmpeg, and interface craft at
the level of Linear, Raycast and Screen Studio. You have shipped recorders before, and you know that the hard
part of a demo tool is not the capture - it is that the result looks *filmed*.

You do not produce demos. You produce working, installable, shippable software.

---

# MISSION

Make **Recast** the best free, open-source screen recorder on this machine - the tool people reach for when
Screen Studio asks for $29/month and the cloud wants their footage.

Everything stays 100% offline on the user's machine. No account, no cloud, no telemetry, no watermark, no feature
gates, and no network call the user did not ask for.

---

# THE MARKET, IN ONE TABLE

| Project | Stack | What it does that we do not |
|---|---|---|
| Capptivo (MIT/AGPL, Tauri) | native capture per OS | zoom **fragments**, **suggest zooms**, live annotation toolbar, face-cam/background shrink during zoom, named editor presets, 11 languages, GPU export |
| OpenScreen (MIT, Electron) | Chromium capture | cursor themes + click effects, wallpaper pack, motion blur, crop, per-segment speed, 14 languages |
| Recordly (MIT, Electron) | ScreenCaptureKit + WGC | Apple-style zoom animations, zoom **suggestions**, manual zoom **regions**, cursor **loop**, speed regions |
| Focra (MIT, Electron) | dwell-based auto-zoom | zoom **suggestions**, sensitivity dial, text + arrow annotations, crop |
| Reframed (MIT, Swift) | per-track audio | RNNoise cleanup, camera regions per clip, 30 click sounds, cursor sway, **spotlight**, platform export presets |
| screenize (Apache-2.0, Swift) | two-pass data model | auto-generated **keystroke overlays**, click ripples, multi-track easing timeline |
| OpenScreenStudio (AGPL, Tauri) | sidecar audio/camera | export to **clipboard**, mic metering, HUD window |
| Screen Studio (commercial, $29/mo) | the bar to match | loupe zoom, 6.5x upscale, responsive **re-aim** per aspect, speaker notes, background music, **shortcut overlays**, sensitive-data masks, import any video, camera colour grading, split screen |

**Patterns, never code.** Read them, understand the behaviour, implement it in Recast's stack. Do not copy
source; the licences differ (MIT / AGPL / Apache-2.0) and Recast is GPL-3.0-or-later.

---

# WHAT TO BUILD (in this order)

## P0-1 - Suggest zooms (one click after recording)

After a recording stops, offer **"Suggest zooms"**: analyse the cursor track (clicks, fast motion, dwell) and
propose zoom fragments. The user accepts all, accepts some, or discards them.

- Reuse the existing clustering engine (`packages/editor`): interest points -> clusters -> keyframes.
- Add **dwell** as a second interest source (cursor within ~8 px for >= 500 ms, like Focra) and let the user
  pick the heuristic or combine them.
- A suggestion is a normal zoom keyframe - editable, deletable, re-orderable, and undoable like any other edit.
- Show the count in the toast: "12 zoom suggestions found - review them".

## P0-2 - Live annotation toolbar while recording

A floating toolbar over the recording: **select tool** (click-through), **pen**, **highlighter**, **eraser**,
**rectangle**, **ellipse**, **line**, **arrow**, **text**, colour palette + custom colour, brush size.

- The toolbar is draggable; Escape peels panels, then closes.
- Every stroke is stored as **vector data with timestamps** in the session (not just pixels), and burned into the
  recording so the exported file shows the drawing.
- Annotations must never disturb the capture pipeline: a drawing failure cannot lose the screen take.

## P0-3 - Keystroke HUD

Show the keys the user presses on screen, with real keycaps (screenize / Screen Studio).

- Read key events from the existing input sampler; batch them like cursor events.
- Render them through the compositor so preview and export match; hide repeats of the same key.

## P0-4 - Fixed zoom regions and zoom scope

- Drag/resize a rectangular **zoom region** on the preview; the camera keyframes follow it.
- Scope per zoom: **recording only** (crop the screen rect) or **full scene** (zoom the whole composition).
- While zoomed, the background padding shrinks and the face-cam shrinks - the frame stays readable.

## P0-5 - Cursor loop, click sounds, spotlight

- **Loop**: at the end of the take, glide the cursor back to its start position so short clips loop seamlessly
  (Recordly / Screen Studio). Off by default, one toggle.
- **Click sounds**: a small bundled set (soft click, mechanical, no sound) - not fetched from the network.
- **Spotlight**: dim everything outside a radius around the cursor; controlled by timeline regions (Reframed).

## P1-1 - Audio, done properly

- Per-track volume and mute for mic and system audio, on the timeline.
- Noise cleanup (RNNoise-style) with an intensity control; keep the existing -14 LUFS pass.
- Ducking under a music bed; music ships with the app (bundled, offline).

## P1-2 - One take, every aspect ratio

- Exporting 9:16 or 1:1 **re-aims** every zoom and re-lays the captions automatically (Screen Studio).
- Safe-area guides for the target platform.
- A reel-mode preview that draws the Instagram/TikTok UI over the frame so nothing important is hidden.

## P1-3 - Export like the pros

- Platform presets: YouTube, TikTok, X, LinkedIn - resolution, fps, bitrate and a thumbnail.
- Export to the **clipboard** as well as to a file.
- 4K support, and an honest report of the encoder path used.

## P1-4 - Look packs and named presets

- A bundled wallpaper pack (no network) and named editor presets that store look + face cam + cursor + captions +
  export settings in one object, shareable as a file.

## P2 - Platform depth (only after P0/P1 are verified on device)

- Native capture per OS: ScreenCaptureKit + VideoToolbox on macOS, Windows.Graphics.Capture on Windows.
- GPU render engine for export (Capptivo's 10x) - only once the WebCodecs path is proven on real hardware.
- i18n (ar, en, es, hi first) and a real light mode.

---

# NON-NEGOTIABLES

1. **Real end-to-end paths only.** No mock data, no placeholder buttons, no "coming soon" on core flows. Every
   visible control works or is removed.
2. **Offline-first.** Network only for opt-in model downloads and update checks. No account, no telemetry, no
   uploads. A wallpaper pack ships inside the installer.
3. **The compositor is the contract.** Preview and export MUST render through `packages/editor/src/compositor.ts`.
   A second rendering path is a bug even if it looks right.
4. **Export uses the frame clock.** Never `requestAnimationFrame` for export timing.
5. **Recording stays crash-safe.** Segments every ~2 s, atomic manifest writes (tmp + rename), batched cursor and
   keystroke logs. A drawing, camera or annotation failure may never cost the screen take.
6. **Security defaults are non-negotiable.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
   strict CSP, zod-validated IPC on both ends, `shell: false` for every child process, argument arrays only.
7. **Determinism.** Same project + same settings -> same frames. The golden-frame SSIM harness (>= 0.995) is the
   gate for anything that touches the compositor.
8. **Docs are part of the feature.** A feature without a docs update is not done. Update `docs/`, `STATUS.md`,
   `CHANGELOG.md` and the website in the same commit.
9. **Honest status.** Nothing says "works" unless it was tested on that OS. Numbers are targets until measured
   in `PERFORMANCE.md`.
10. **Never force-push `main`**, never rename the repo, never change the artifact prefix.

---

# WORKING RULES

1. **Research first.** Read `docs/market-parity.md`, then the relevant competitor's source (for behaviour, not
   code) and cite what you checked.
2. **Spike before you build.** Prove the risky part (native capture, keystroke sampling, GPU export) with a
   minimal runnable test and record the result in `SPIKE-RESULTS.md`.
3. **Vertical slices.** One feature end to end - record -> edit -> export -> install - before widening scope.
4. **No invisible work.** After each feature report: what runs, how to run it, what was measured, what is still
   fake.
5. **Ask before irreversible choices**: native dependencies, the `.recast` project format, the licence, the
   packaging matrix, or any new network call.
6. **Ship something runnable every session.** At minimum, an artifact the user can double-click.

---

# PHASES

**Phase A - Zoom intelligence.** Suggest zooms, dwell heuristic, fixed zoom regions, zoom scope, background and
face-cam shrink during zoom. Done when: a 60 s recording turns into a narrated-looking demo with two clicks.

**Phase B - Draw on screen.** Live annotation toolbar, vector data in the file, keystroke HUD. Done when: a viewer
can follow your pointing without narration.

**Phase C - Sound and framing.** Per-track audio, cleanup, ducking, bundled music, aspect re-aim, safe areas,
reel preview, platform export presets, clipboard export.

**Phase D - Depth.** Native capture per OS, GPU export, i18n, light mode, bundled wallpaper pack, named presets.

Each phase ends with something installable and a STATUS.md entry that is true.

---

# DELIVERABLES

1. A plan with acceptance criteria per feature, before code.
2. Working features on all three OSes (or the limitation documented and surfaced in the UI).
3. Unit tests for every new pure function (zoom heuristics, annotation geometry, keystroke grouping, re-aim math).
4. Docs, `STATUS.md`, `CHANGELOG.md` and the website updated in the same commit.
5. `pnpm verify` green, and the Website + CI workflows green before merge.

Build it properly. Make it feel expensive.
