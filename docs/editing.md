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

**Manual keyframes** carry an anchor in source coordinates and an ease (`in`/`out`/`hold`); they integrate through the same spring.

All of it is pure and unit-tested (`packages/editor/tests/zoom-math.test.ts`): settle-without-overshoot, determinism, viewport clamping, dead-zone hold, discontinuity bounds.

## Timeline

- Clips map `sourceIn/OutUs ↔ timelineInUs` with per-clip `speed`; `buildTimeMap` lays them end to end.
- `splitClipsAt` splits at the playhead; `rippleDeleteRange` removes a range and pulls the rest left, re-laying the timeline so the model stays consistent.
- Keyboard: Space play/pause, J/K/L shuttle, S split, ←/→ frame step (Shift = 1 s), Home/End, ⌘Z/⇧⌘Z, Delete ripple-deletes 1 s around the playhead.
- Autosave: every edit schedules an atomic `.recast` write 5 s later (and on demand from the palette).

## Cursor rendering

Styles: native (as captured), rendered pointer (SVG path, outline, shadow), dot, circle. Options: size, tint, outline width/color, press scale, click ripple (450 ms), idle fade (fade out after N ms without movement). The ripple and press state derive from the input log — the same events that drive auto-zoom.

## Presets

- Six built-ins (`BUILTIN_PRESETS` in `packages/shared/src/style.ts`), schema-validated.
- `.recaststyle` files are JSON with `format: "recaststyle"` and `version: 1`; import parses + validates and applies as **one undo step**.
- Style covers: aspect ratio, padding, radius, border, shadow level, background (solid/gradient/mesh/blurred echo/transparent/image), cursor style, caption style.

## Captions

Imported/generated captions are stored as `.srt` next to the session media; the compositor renders them through the style (clean/bold/boxed/pill/karaoke) with auto line-breaking at 42 chars, two lines max.
