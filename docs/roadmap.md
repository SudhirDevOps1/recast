# Roadmap — phases and acceptance criteria

A phase is done when its acceptance criteria are met AND `pnpm verify` is green AND the docs/STATUS entries for the phase are updated. Every phase ends with something installable.

## Phase 0 — spikes ✅ (2026-11-07)

Prove before building UI:
- [x] WebCodecs `VideoEncoder` config chain incl. `avc.format: 'avc'` (avcc) for mp4-muxer — resolved in code, isConfigSupported-driven
- [x] mp4-muxer `StreamTarget` positional writes → main-process `.part` file handles
- [x] webm-muxer v5 API (`A_OPUS`, `V_VP9`, `firstTimestampBehavior: 'offset'`) — verified against the shipped .d.ts
- [x] Segmented writing with atomic manifest — implemented
- [x] Epoch-anchored cross-process clocks (main sampler ↔ renderer recorder) — implemented
- [x] FFmpeg fetch + TOFU pinning + registry-integrity-verified tarballs — **measured**: linux-x64 ffmpeg 6.0-static 78.7 MB (sha256 pinned), ffprobe 4.0.2-static 64.5 MB; both execute
- [x] Better-sqlite3 + electron-builder `asarUnpack` configuration
- [ ] 1080p60 capture + hardware encode on real Windows/macOS hardware — **pending device QA**
- [x] Zoom engine math (detect → cluster → keyframes → spring) — 41 unit tests green

## Phase 1 — record → trim → export ✅ implemented / 🟡 device QA pending

- [x] Source picker (screen/window/area), mic + system audio, countdown, pause/resume
- [x] Global hotkeys, floating tray with timer, library
- [x] Trim/split/ripple delete, MP4 export with verification
- [x] Onboarding flow (permissions → preset → guided 10-second record)
- [ ] Acceptance: record 5 s → trim → export on all three OSes with the built installer — **pending device QA**

## Phase 2 — cinematic editor ✅ implemented

- [x] Cursor track, auto-zoom (3 intensities), manual keyframes, follow-cursor mode
- [x] Cursor styling (look/size/tint/outline/shadow/ripple/press/idle-fade)
- [x] Frame/background system, aspect ratios, presets + `.recaststyle`
- [x] Undo/redo, command palette
- [ ] Acceptance: golden-frame SSIM ≥ 0.995 preview↔export — harness pending

## Phase 3 — audio + captions 🟠

- [x] Waveform, gain, fades, noise gate, −14 LUFS (two-pass loudnorm)
- [ ] Ducking (music bed) — ❌
- [x] Static blur/pixelate redaction; ❌ tracked redaction
- [x] Local Whisper captions (model manager, burn-in, .srt/.vtt) — 🟡 untested end-to-end
- [ ] Word-level timestamps — ❌
- [ ] Acceptance: 10-minute tutorial with face cam + captions — ❌ face cam separate track not built

## Phase 4 — distribution ❌ → 🟠

- [x] Full installer matrix configs + CI
- [ ] Signing on all platforms (certificates pending)
- [ ] Auto-update feed live with rollback documentation (wired, not live)
- [ ] Docs site (repo docs complete; hosted site pending)
- [x] Opt-in crash reporting stance: **none by default; no telemetry** — decided against adding it
- [ ] PERFORMANCE.md with measured numbers (budgets are targets today)
- [ ] Cross-platform install QA matrix (see docs/platform-support.md test log)

## Related

- [../STATUS.md](../STATUS.md) - what is real today
- [../CHANGELOG.md](../CHANGELOG.md) - release history
- [platform-support.md](platform-support.md) - the device QA matrix
