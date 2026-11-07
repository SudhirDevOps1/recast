# Recording

Status: specification. Implementation starts in Phase 1.

## The flow

```
Launch → optional onboarding → pick source → configure audio/cam → countdown
→ record (tray controls) → stop → auto-save into Library → open in Editor
```

Target: from hotkey to "recording" in under 1.5 seconds, and from stop to "file ready" in under 3 seconds.

## Sources

| Mode | Picker | Notes |
|---|---|---|
| Entire screen | Click a display thumbnail | Multi-display list with resolution and scaling |
| Window | List of capturable windows with app icons and thumbnails | Respects minimized state |
| Custom area | Drag on a full-screen overlay | Magnifier, pixel readout, snapping, keyboard nudge |

### Area selection overlay

- Dim everything outside the selection at 55 % black.
- Live magnifier (4×) with the pixel under the cursor in `x, y` and a `W × H` readout.
- Arrow keys move the selection by 1 px, Shift+Arrow by 10 px, Alt+Arrow resizes.
- Snap to window edges and screen thirds within 8 px.
- `Enter` confirms, `Esc` cancels, `Space` re-draws.
- Works per display; the overlay opens on the display under the cursor.

## Permissions

| Platform | Permission | When asked | If denied |
|---|---|---|---|
| macOS | Screen Recording | First capture | Explain + deep link to System Settings, offer retry |
| macOS | Microphone | First mic use | Disable mic track, keep recording |
| macOS | Camera | First cam use | Disable cam, keep recording |
| macOS | Accessibility | First cursor tracking | Disable auto-zoom, keep recording |
| Windows | None for screen | — | — |
| Linux X11 | None | — | — |
| Linux Wayland | Portal dialog per session | Each capture | Explain that the portal controls the source |

Rules:

- Never ask for a permission before the user actually needs it.
- Always show current status next to the feature, not in a modal at launch.
- On macOS, detect the "granted but app must restart" state and offer a one-click relaunch.

## Audio

- **Microphone**: device picker, live input meter, "no signal" warning before the countdown starts.
- **System audio**: toggle with a per-OS explanation when unavailable.
- Both are recorded on separate tracks. The editor mixes them.
- Sample rate normalized to 48 kHz; drift corrected against the video clock.
- Sync target: audio and video within ±1 frame over a 30-minute recording.

### System audio by platform

| Platform | Method | Requirement |
|---|---|---|
| Windows 10/11 | WASAPI loopback | None |
| macOS 14.2+ | ScreenCaptureKit audio | Supported OS |
| macOS < 14.2 | Not supported natively | Offer mic-only, explain |
| Linux | PipeWire monitor source | PipeWire + portal |
| Linux (PulseAudio) | Monitor source | May need user to pick the sink |

## Face cam

- Device picker with live preview at 15 fps.
- Shape: circle, rounded square, square. Size: 12–35 % of frame height.
- Position: 9-point grid or free drag.
- Mirror toggle, subtle background blur, drop shadow.
- Recorded as a separate video track so the editor can move or hide it later.

## Live annotation

Tool palette appears during recording with a hotkey, and is captured into the video **and** stored as vector data with timestamps.

Tools: pen, highlighter, arrow, rectangle, ellipse, text, spotlight/dim, click emphasis, keystroke HUD.

- Strokes are recorded as points + pressure + timestamp, not as rendered bitmaps, so the editor can re-style or delete them.
- The live overlay is rendered into the captured frame by the compositor, not by drawing on the screen.
- Cursor is hidden while drawing only if the user enables "hide cursor while annotating".

## Tray and controls

- Floating capsule, ~64 px tall, draggable anywhere.
- Shows elapsed time, live audio waveform, file size estimate, pause/stop.
- Global hotkeys: start/stop, pause/resume, toggle drawing, toggle mic mute.
- Click-through outside the capsule so it never blocks the recorded content.
- During recording the main window can be minimized or closed without stopping capture.

## Segmented recording and recovery

- Chunks of ~2 s written to `recordings/<session>/segments/`.
- A session manifest (`session.json`) records start time, source, tracks, and chunk index.
- On relaunch, `recovery.ts` scans for manifests without a `stoppedAt` marker and offers to rebuild.
- Rebuild = concatenate segments, remux with FFmpeg (stream copy, no re-encode), regenerate the preview thumbnail.
- Recovery must never silently delete the user's segments.

## Failure handling

| Event | Behavior |
|---|---|
| Mic unplugged mid-recording | Keep recording, banner warning, track marked `discontinuous` |
| Camera taken by another app | Freeze last frame, warn, keep screen capture running |
| Display disconnected | Stop that track, finalize file, warn |
| Resolution change | Insert a keyframe and continue; note the transition in the manifest |
| Disk below 500 MB | Warn; below 100 MB finalize and stop |
| Encoder crash | Restart encoder, accept a 1-frame gap, log it |
| App crash | Recovery flow on next launch |
| Sleep / wake | Pause automatically; resume on wake or offer to stop |

## What "done" means for Phase 1

- Record 10 minutes at 1080p60 on Windows, macOS, and Linux X11 without a dropped-frame warning.
- Stop produces a playable file in under 3 seconds.
- Killing the app mid-recording and relaunching recovers a playable file.
- System audio works on Windows and macOS 14.2+.
- Tray never blocks the recorded content.
