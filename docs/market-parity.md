# Market parity — free open-source screen recorders, 2026-11-10

What the free, open-source alternatives to Screen Studio actually do, how they do it, and which parts
Recast should copy as **behaviour** (never as code — the licences differ and are listed per project).

Sources: each project's own README / release notes / landing page, read 2026-11-10. Competitor claims are
self-reported; Recast's own state comes from [STATUS.md](../STATUS.md). Every "Recast has / missing" row below
is a claim we can defend today.

## The field

| Project | Stack | Licence | Capture path | Standout features | Scale |
|---|---|---|---|---|---|
| **Capptivo** | Tauri 2 + Rust + React 19, pixi.js, WGSL | MIT (README) | Native per OS: ScreenCaptureKit + VideoToolbox, Windows.Graphics.Capture + NVENC/QuickSync/AMF, xdg-portal + PipeWire | Zoom *fragments* on the timeline, **auto-suggest zooms from clicks**, live annotation toolbar (select tool, pen, highlighter, eraser, shapes, text), face-cam shrink during zoom, background padding shrink during zoom, named editor presets, 11 UI languages, GPU render engine (10x faster export) | ~1.07k stars, v1.0.4 |
| **OpenScreen** | Electron | MIT | Chromium `getDisplayMedia` | Webcam PiP, zoom depth/duration/easing, cursor themes + smoothing + click effects, on-device captions, wallpapers, motion blur, crop, per-segment speed, text/arrow/image annotations with animation presets, snapping guides + waveform, 14 languages | the OSS baseline |
| **Recordly** | Electron (fork of OpenScreen) | MIT | ScreenCaptureKit (macOS), native WGC helper (Windows), WASAPI | Apple-style zoom animations, auto zoom **suggestions**, manual zoom regions, smooth pans, **cursor loop** (freeze-frame return), macOS cursor assets, speed regions, `.recordly` projects | the most-polished OSS look |
| **Capturia** | Electron (re-baselined OpenScreen fork) | MIT | Chromium | GPU export with CPU fallback | maintenance fork |
| **Focra** | **Electron + React** (closest stack to Recast) | MIT | Chromium, dual audio mixed in one Web Audio stream | **Dwell-based auto-zoom** (cursor still within 8 px for >= 500 ms), sensitivity 0.1-1.0, text + arrow annotations, crop, background, local Whisper captions | closest architectural sibling |
| **Reframed** | Swift / macOS | MIT | ScreenCaptureKit | RNNoise mic cleanup, fullscreen-webcam segments, camera regions per clip with transitions, per-track volume/mute, 30 click sounds, cursor sway, **spotlight** (dims outside a radius), platform export presets | richest audio/segment model |
| **screenize** | Swift | Apache-2.0 | ScreenCaptureKit | **Two-pass model**: raw capture + mouse/click/keyboard data, then editor generates zoom, click-effect and **keystroke** keyframes; multi-track timeline with easing | smartest data model |
| **OpenScreenStudio** | Tauri 2 + React 19 + TS | AGPL | In-process ScreenCaptureKit, webcam sidecar, WAV audio sidecars anchored to the first video frame | Export to **clipboard**, separate mic/system tracks, mic metering, HUD window | cleanest data plumbing |

Commercial anchors: **Screen Studio** (macOS, $29/mo) - two zoom types (classic + loupe), 6.5x AI upscale, cursor
idle-hide + loop, responsive re-aim of zooms per aspect ratio, speaker notes, background music, click sounds,
shortcut overlays, sensitive-data masks, import any video, clipboard export, shareable links + comments,
camera colour grading + split screen. **FocuSee** - AI subtitles in 50+ languages, filler-word removal, avatar,
background removal, teleprompter. **Cursorful** - browser-based, zoom triggered by rapid clicks. **Cap / Loom /
Descript / VEED** - cloud-first, the opposite of Recast's promise.

## How the interesting parts actually work

**Zoom.** Three competing heuristics, all cheap:
- *click clustering* (Recast today): clicks + fast motion -> interest points -> 1.2 s / 80 px clusters -> keyframes.
- *dwell* (Focra): cursor stays within 8 px for >= 500 ms -> that point is an interest.
- *click-only* (Screen Studio, Capptivo): zoom where the user actually clicked.
Capptivo adds a **fragment model**: a zoom is an object on the timeline (scale, centre, easing, scope), and the
motion *between* fragments is generated automatically. Recordly adds *suggestions*: a one-click pass that proposes
zoom fragments from the cursor track when you open a fresh recording.

**Cursor.** The trick every serious app uses: capture the **pointer as data** (60 Hz position + click events),
draw your own cursor in the compositor. Screen Studio goes further - it records the screen *without* the OS cursor
and re-adds a styled one afterwards, which is why cursor size/style can change after recording. Effects on top:
smoothing (spring/exponential), motion blur, click ripple/bounce, idle fade, sway, loop.

**Annotations.** Capptivo records them into the video *and* keeps them as vector data with timestamps; the
toolbar is draggable and Escape peels panels before closing. screenize generates keystroke overlays from the
keyboard event stream; Screen Studio shows real keycaps.

**Audio.** Recast already separates mic and system tracks. Reframed adds per-track volume/mute, RNNoise cleanup,
segment-level camera transitions. Screen Studio adds background music, normalisation and filler removal.

**Export.** Capptivo v1.0.4 replaced the browser frame path with a native GPU renderer (Metal / DX12 / Vulkan) and
cut a 76 s 1080p60 export from 176 s to 17 s. Reframed and OpenScreen ship platform presets (YouTube / X /
TikTok); Screen Studio adds "one take -> wide, square, vertical" with automatic re-aim of every zoom and caption.

**Local-first.** All the OSS options keep projects in the OS app-data dir, no account, no upload. Capptivo,
OpenScreen, Reframed and screenize ship 11-14 UI languages. Only Screen Studio pulls from the network
(Unsplash backgrounds, share links).

## Where Recast stands

| Capability | Recast today | Market best | Gap |
|---|---|---|---|
| Capture + crash safety | ✅ 2 s segments, atomic manifest, recovery remux | Capptivo (native per OS) | Native capture (ScreenCaptureKit / WGC) would fix macOS/Windows quality - big |
| Auto-zoom | ✅ clustering + spring + follow mode + manual keyframes | Capptivo / Recordly / Focra | **Suggest zooms** (one click after recording), dwell heuristic as an alternative |
| Zoom as timeline objects | 🟡 keyframes only | Capptivo fragments, Recordly regions | Fixed **zoom regions** (drag/resize), scope (recording-only vs full scene), background/cam shrink during zoom |
| Cursor | ✅ styles, smoothing, trail, bounce, ripple, idle fade | Recordly / Screen Studio | Cursor **loop**, **sway**, more cursor packs (Tahoe etc.), click **sounds**, double-cursor check on Windows/Linux |
| Live annotations | ❌ recording; 🟠 editor engine | Capptivo toolbar, Screen Studio masks | **Live toolbar** (select/pen/highlighter/eraser/shapes/text) + vector data in the file |
| Keystroke HUD | ❌ | screenize, Screen Studio | Cheap win - keyboard events already available in uiohook |
| Face cam | ✅ PiP (new) | Capptivo + shrink during zoom | Shrink/offset face-cam at peak zoom |
| Backgrounds | ✅ solid/gradient/mesh/echo/**image**/transparent | + Unsplash pack (network) | Ship a **bundled** wallpaper pack (keeps the offline promise) |
| Captions | 🟡 whisper wired, untested | all OSS ship it | Finish the device QA; add word-level timestamps |
| Audio | ✅ mic + system separate, gate, -14 LUFS | Reframed | Per-track volume/mute, RNNoise, ducking, silence removal |
| Timeline | ✅ ruler, trim, split, ripple, keyframe drag | screenize multi-track | Per-clip camera regions, timeline zoom, speed-up-typing |
| Aspect ratios | ✅ many ratios | Screen Studio re-aim | **Auto re-aim** of zooms/captions per aspect, safe-area guides, reel-mode preview |
| Export | ✅ MP4/WebM/HEVC/ProRes/GIF + presets | + platform presets, clipboard | Per-platform presets (YouTube/TikTok/X), export to clipboard, 4K |
| Presets | ✅ `.recaststyle` | + named editor presets | Shareable named presets (look + cam + cursor + captions + export in one) |
| i18n / theme | ❌ no i18n; light theme tokens only | 11-14 languages | i18n (ar/en/es/hi/...) + a real light mode |
| Project import | ❌ | Screen Studio imports any video | Import an existing MP4 and edit it like a recording |
| Teleprompter / notes | ❌ | Screen Studio, FocuSee | Speaker notes on screen while recording |

## Priorities

**P0 - the differentiators (copy the behaviour, not the code)**
1. **Suggest zooms** - one click after a recording proposes zoom fragments from the cursor track (Recordly/Capptivo).
   Recast already has the data and the engine; this is a pure-UI feature over existing primitives.
2. **Live annotation toolbar** - select tool, pen, highlighter, eraser, rectangle/ellipse/line/arrow, text; drawn
   shapes are stored as vector data with timestamps *and* burned into the recording (Capptivo's model).
3. **Keystroke HUD** - real keycaps from the keyboard event stream (screenize/Screen Studio).
4. **Fixed zoom regions + zoom scope** - drag/resize a region, choose "recording only" or "full scene" (Capptivo).
5. **Cursor loop + click sounds + spotlight** - small, high-perceived-polish (Recordly/Reframed/Screen Studio).

**P1 - audio and framing**
6. Per-track volume/mute, ducking, silence removal, RNNoise-style cleanup (Reframed).
7. Auto re-aim of zooms + captions per aspect ratio, safe-area guides, reel-mode preview (Screen Studio).
8. Per-platform export presets + export to clipboard + 4K (Reframed/OpenScreenStudio/Screen Studio).
9. Ship a bundled wallpaper pack and named editor presets (no network).

**P2 - platform depth**
10. Native capture per OS (ScreenCaptureKit on macOS, WGC on Windows) - the biggest quality jump, biggest cost.
11. GPU render engine for export (Capptivo's 10x) - only after the WebCodecs path is proven on-device.
12. i18n (start with ar/en/es/hi) and a real light mode.

**P3 - scope to decide**
13. Import an external video, teleprompter/speaker notes, split-screen layout, camera colour grading, face tracking.

## Rules for this work

- **Patterns, never code.** Capptivo (MIT/AGPL), OpenScreen (MIT), Recordly (MIT), Reframed (MIT), screenize
  (Apache-2.0) - read them, understand the behaviour, implement it in Recast's stack. Do not copy source.
- Keep the promise: no account, no cloud, no telemetry, no network call that the user did not ask for. A wallpaper
  pack ships inside the installer; it is not fetched from Unsplash.
- The compositor stays the single rendering path; export stays on the frame clock; recording stays crash-safe.
- STATUS.md, docs and the release notes follow the change in the same commit, and nothing is called "working"
  that was not tested on that OS.

**Related**

- [../prompts/parity-build-prompt.md](../prompts/parity-build-prompt.md) - the build prompt for this work
- [capptivo-parity.md](capptivo-parity.md) - the older Capptivo gap analysis
- [editing.md](editing.md) - the editor model these features extend
- [recording.md](recording.md) - the capture model these features extend
- [../STATUS.md](../STATUS.md) - what is real today
