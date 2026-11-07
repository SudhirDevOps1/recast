# Troubleshooting

Real, confirmed issues only — speculation goes to GitHub issues, not here.

## Linux: AppImage does not start — "dlopen(): error loading libfuse.so.2"

**Status:** expected on distros without libfuse2 (Ubuntu 22.04+ ships without it by default).

Fix:

```bash
sudo apt install libfuse2
```

(In-app detection with a copyable command is planned — tracked in STATUS.md.)

## Windows: SmartScreen blocked the installer

**Status:** expected until code-signing reputation builds. The current artifacts are unsigned; see docs/code-signing.md for the signing plan. Click "More info → Run anyway", or verify `SHA256SUMS` from the release before running.

## macOS: "Recast is damaged and can't be opened"

**Status:** expected for unsigned builds (Gatekeeper quarantine). Fix for unsigned builds:

```bash
xattr -cr /Applications/Recast.app
```

Signed + notarized builds remove this step.

## macOS: screen recording shows a black frame

**Status:** TCC permission granted after launch is not picked up by a running process. Grant Screen Recording in System Settings → Privacy & Security, then **restart Recast**. The in-app permission sheet deep-links to the right pane and offers a relaunch.

## Wayland: auto-zoom does nothing / global hotkeys don't fire

**Status:** by design, not a bug. uiohook and X11 overlays don't work under Wayland; Recast captures through the portal only. The app shows a persistent notice when this limitation is active. For the full feature set, use an X11 session.

## Windows: system audio not captured

**Status:** requires capturing a **screen** source (WASAPI loopback is bound to the display stream by Electron). Capture a screen instead of a window if audio is missing, and check the "System audio" switch state — the UI disables it when the platform doesn't provide it.

## Export fails with "FFmpeg encode failed"

**Status:** GIF/ProRes require the FFmpeg safety net. Settings → Media engine shows the current status and an Install button (in-app download with hash verification). MP4/WebM exports never need FFmpeg.

## Captions say "No whisper.cpp binary found"

**Status:** captions are fully local and need the whisper.cpp CLI. Install:

```bash
brew install whisper-cpp        # macOS
scoop install whisper-cpp       # Windows
```

(Or build from source — whisper.cpp releases.) The model manager downloads ggml models on demand.

## Recording is missing after a crash

**Status:** by design, at most the last 2 seconds are lost. Closed fragments survive; check the Library — recovered sessions surface automatically on next launch with a notice.
