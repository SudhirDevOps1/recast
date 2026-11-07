# Editing

Status: specification. Implementation starts in Phase 2.

## Model

The project is a plain JSON document (`.recast`) plus media references. Everything is expressed in **integer milliseconds** on one monotonic timeline. The renderer is a pure function of `(project, timeMs) → frame`, which is what makes preview and export identical.

```ts
type Project = {
  id: string;
  version: number;
  source: { width: number; height: number; duration: number };
  canvas: { aspect: '16:9' | '9:16' | '1:1' | '4:5' | '21:9' | 'custom'; width: number; height: number };
  tracks: {
    video: VideoClip[];
    cursor: CursorTrack;
    zoom: ZoomKeyframe[];
    annotations: Annotation[];
    audio: AudioTrack[];
    captions: CaptionCue[];
  };
  style: StyleRef;          // preset + overrides
  background: Background;
  frame: FrameStyle;
  export: ExportSettings;
};
```

## Timeline

- Tracks: video · cursor/zoom · annotations · audio · captions.
- Horizontal zoom from 4 px/s to 400 px/s; virtualized rendering (only visible clips mount).
- Snapping to playhead, clip edges, keyframes, and caption boundaries.
- Ripple delete closes gaps on all tracks; plain delete leaves them.
- Undo/redo is a command stack with coalescing for drags (one entry per gesture).

### Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `J` / `K` / `L` | Reverse / pause / forward (repeat to speed up) |
| `I` / `O` | Set in / out |
| `←` / `→` | Step 1 frame |
| `Shift + ←/→` | Step 1 second |
| `S` | Split at playhead |
| `Delete` | Delete selection |
| `Shift + Delete` | Ripple delete |
| `Z` | Toggle zoom tool |
| `⌘/Ctrl + Z` | Undo |
| `⌘/Ctrl + Shift + Z` | Redo |
| `⌘/Ctrl + K` | Command palette |

## Zoom engine

### Automatic

1. **Interest points** — clicks, scroll bursts, and dwell (cursor nearly stationary for > 600 ms).
2. **Clustering** — merge points closer than 1.2 s and 80 px into one region.
3. **Keyframes** — each region becomes `zoomTo(level, anchor, hold)` plus `zoomOut` when the cursor leaves.
4. **Smoothing** — animate with a critically damped spring:

```
ω = 2π · frequency          // frequency ≈ 1.2 Hz for "balanced"
ζ = 1                       // critically damped
x(t) = target + (x₀ − target) · (1 + ωt) · e^(−ωt)
```

No linear ramps, no overshoot, no jitter. Intensity presets scale `frequency` and `level`:

| Preset | Zoom | Frequency | Hold |
|---|---|---|---|
| Subtle | 1.25× | 1.0 Hz | 1.6 s |
| Balanced | 1.6× | 1.2 Hz | 1.2 s |
| Punchy | 2.0× | 1.5 Hz | 0.9 s |

### Manual

- Drag a keyframe to retime, drag its anchor to reframe, scroll to change level.
- Each keyframe has `easeIn`, `easeOut`, `hold`, and an optional `follow` flag.
- Anchor lives in **source** coordinates, so changing canvas aspect does not break it.

### Follow cursor

- Viewport follows the cursor only when it moves outside a dead zone (18 % of the viewport by default).
- Pan speed is clamped so fast cursor moves don't cause motion sickness.
- Disabled automatically during idle periods.

### Determinism

Export drives the same function with `t = frameIndex / fps`. No wall-clock values, no `Math.random()`, no CSS transitions in the export path. A golden-frame test compares preview and export with SSIM.

## Cursor

| Property | Range | Default |
|---|---|---|
| Style | native / rendered SVG | rendered |
| Size | 50–200 % | 100 % |
| Tint | none / accent / custom | none |
| Outline | 0–4 px | 1.5 px |
| Shadow | 0–100 % | 40 % |
| Click ripple | off / subtle / strong | subtle |
| Press scale | 1.0–1.3 | 1.12 |
| Idle fade | 0–2 s | 0.6 s |
| Path smoothing | 0–100 % | 60 % |

Path smoothing is a Catmull-Rom interpolation over the 60 Hz samples with velocity-aware resampling, so slow moves stay precise and fast moves stop looking steppy.

## Frame and background

- **Padding** 0–15 % of the shorter edge.
- **Corner radius** 0–40 px on the video, 0–60 px on the canvas.
- **Border** 0–3 px, low-alpha white or accent.
- **Shadow** layered ambient + key, never pure black.
- **Backgrounds**: solid, curated gradients, mesh/aurora, blurred screen echo (scaled 1.4×, 40 px blur, 35 % dim), custom image/video, transparent.
- **Safe area** guide for 9:16 and 1:1 exports so captions don't land under platform UI.

## Audio

- Waveform rendered from a precomputed peak file (min/max per 256 samples).
- Per-track gain, fade in/out, mute/solo.
- Noise gate with attack/release and a live gain-reduction meter.
- Loudness normalization to −14 LUFS (podcast/social) with true-peak limiting at −1 dBFS.
- Voice ducking: when speech energy exceeds a threshold, music drops by a configurable amount with a 250 ms release.

## Redaction

- Draw a region, choose blur or pixelate, set intensity.
- Region can be static or **tracked** — keyframes follow a feature between two anchor points.
- Redaction is applied before encoding, never as a preview-only overlay.

## Captions

- Local Whisper (see `docs/architecture.md`), word-level timestamps.
- Editable text blocks with auto line-breaking at a max characters-per-line setting.
- Five built-in styles: Clean, Bold, Pill, Broadcast, Minimal.
- Burn-in, or export `.srt` / `.vtt` sidecars.
- Language auto-detect; Hindi and English verified first.

## Presets

A preset stores frame + background + cursor + zoom intensity + caption style + export defaults.

- Shipped: Studio Dark, Paper, Aurora, Terminal, Minimal Light, Social Vertical.
- Saved as `.recaststyle` JSON, versioned, importable/exportable.
- Preset cards show a live thumbnail rendered from the user's own project, not a static image.
- Applying a preset is one undo step.

## What "done" means for Phase 2

- Auto-zoom on a real 3-minute recording looks intentional, not random, at all three intensities.
- Preview and export match on a golden-frame SSIM check.
- A preset can be created, exported, re-imported, and applied without visual drift.
- The timeline holds 60fps with a 10-minute 1080p project.
