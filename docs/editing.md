# Editing

## The compositor contract

`packages/editor/src/compositor.ts` exports two pure functions:

- `computeComposition(project, tUs, outW, outH, deps)` → a full draw plan (background, screen rect, visible source rect, cursor, annotations, redactions, captions).
- `drawComposition(ctx, comp, project, deps)` → paints the plan onto any 2D canvas.

Preview and export both call exactly these. There is no second rendering path — that is the determinism guarantee.

## Zoom math

```
cursor track (60 Hz) + clicks
  → interest points        speed ≥ 15% frame diagonal/s, clicks weight 2
  → clusters               1.2 s window, 80 px radius @1080p (resolution-scaled),
                           contiguous motion (≤ 50 ms gaps) chains into one region
  → keyframes              zoom = intensity target, clamped so the cluster (+45% margin)
                           always fits the frame; center clamped to the viewport;
                           pre-roll 300 ms; near-duplicates within 400 ms dropped
  → zoom track             fixed 16.667 ms grid, closed-form critically damped spring
                           (ω from intensity: 1.0 / 1.2 / 1.5 Hz), state carried
                           continuously across keyframe switches — no jumps
  → pose at t              binary search + linear interpolation
```

Intensities: `subtle` 1.25× / `balanced` 1.6× / `punchy` 2.0×.

**Follow mode** keeps the cursor inside an 18 % dead zone (of the zoomed viewport) and clamps pan speed to 2400 px/s; the camera never leaves the source bounds.

**Manual keyframes** carry an anchor in source coordinates and an **approach curve**. `out` (the default, labelled "Silky") keeps the original critically damped spring. Any other ease (`linear`, `in`, `inout`, `pop`, `hold`) blends from the pose at arm time to the keyframe pose over the same anticipation window (pre-roll 300 ms + post-roll 600 ms), shaped by `evalEase` in `packages/editor/src/easing.ts` — `pop` overshoots ~10 % (ease-out-back) for a physical settle, `hold` snaps at the end of the window. The spring state is pinned to the blended pose so consecutive keyframes stay continuous. Drag keyframe diamonds directly on the timeline (snap to clip edges and other keyframes) or double-click to delete.

All of it is pure and unit-tested (`packages/editor/tests/zoom-math.test.ts`): settle-without-overshoot, determinism, viewport clamping, dead-zone hold, discontinuity bounds.

## Timeline

- Clips map `sourceIn/OutUs ↔ timelineInUs` with per-clip `speed`; `buildTimeMap` lays them end to end.
- `splitClipsAt` splits at the playhead; `rippleDeleteRange` removes a range and pulls the rest left, re-laying the timeline so the model stays consistent.
- Keyboard: Space play/pause, J/K/L shuttle, S split, ←/→ frame step (Shift = 1 s), Home/End, ⌘Z/⇧⌘Z. Delete removes the selected clip (ripple) — or 1 s around the playhead when nothing is selected.
- The timeline strip (Timeline 2.0) has a time ruler, selectable clips, drag-to-trim edge handles (min 200 ms of source, bounded by the segment length; the rest of the timeline ripples), draggable manual keyframe diamonds, and transition/speed badges. Every structural edit re-lays the timeline sequentially (`relayout` in `TimelineStrip.tsx`) — the same ripple model as `buildTimeMap`.
- Autosave: every edit schedules an atomic `.recast` write 5 s later (and on demand from the palette).

## Cursor rendering

Styles: native (as captured), rendered pointer (SVG path, outline, shadow), dot, circle. Options: size, tint, outline width/color, press scale, click ripple (450 ms), idle fade (fade out after N ms without movement). The ripple and press state derive from the input log — the same events that drive auto-zoom.

## Motion 2.0 — transitions, fades, cursor FX

All of it renders through the shared compositor, so preview and export match frame for frame.

- **Clip intro transitions** — every clip carries `transitionIn` (`none | fade | slide-left | slide-up | zoom`) and `transitionMs` (120–1500 ms, default 450). The intro plays in the first `transitionMs` of the clip: the screen card fades (eased opacity), slides from the right / bottom (offset decays with ease-out), or settles from a 1.08× inflate. Overlays (cursor, annotations) ride the transformed rect.
- **Video fades** — `project.animation.fadeInMs / fadeOutMs` (0–3000 ms) draw a black overlay ramp at the very start/end of the timeline.
- **Cursor FX** — `clickBounce` (release overshoot via the `pop` curve over 260 ms), `trail` (fading position history over the last 180 ms), `cursorSmoothing` (0–1 exponential lag, τ = 20 ms + 180 ms · strength), `rippleColor`. Smoothing is a deterministic walk over the input log, so preview == export.
- **Speed** — per-clip `speed` slider (0.25–4×) in the Motion panel; the engine and time mapping were already speed-aware, the UI now exposes it.

Unit tests: `tests/easing.test.ts`, `tests/compositor.test.ts` (intro alpha/offsets, fade windows, bounce overshoot, trail), extended `tests/zoom-math.test.ts` (eased keyframe continuity, hold snap, chained keyframes), and the schema back-compat test in `packages/shared` (old `.recast` files parse with the new fields defaulted).

## Presets

- Six built-ins (`BUILTIN_PRESETS` in `packages/shared/src/style.ts`), schema-validated.
- `.recaststyle` files are JSON with `format: "recaststyle"` and `version: 1`; import parses + validates and applies as **one undo step**.
- Style covers: aspect ratio (incl. custom width/height), padding, radius, border width + color, shadow level, background (solid / gradient with color pickers, angle and presets / mesh / blurred echo with blur-dim-scale sliders / transparent), cursor style (look, size, colors, outline, ripple color, press scale, idle fade), caption style.

## Captions

Imported/generated captions are stored as `.srt` next to the session media; the compositor renders them through the style (clean/bold/boxed/pill/karaoke) with auto line-breaking at 42 chars, two lines max.
