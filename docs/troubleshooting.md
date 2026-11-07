# Troubleshooting

Status: specification. Entries are added as real issues are confirmed — not guessed.

## General

### The app launches but the window is blank

1. Quit Recast completely (tray icon → Quit).
2. Launch with `RECAST_LOG_LEVEL=debug`.
3. Check `<userData>/logs/main.log` for CSP or preload errors.
4. If a renderer crash loop is detected, Recast opens a safe-mode window with hardware acceleration disabled.

### Recording stops after a few seconds

Usually disk or permissions. Recast writes `session.json` per recording with the stop reason. Open **Settings → Diagnostics → Last session** to see it.

### Export fails at 90 %

The encoder probably ran out of GPU memory. Retry with **Draft** quality; if it succeeds, the source is too large for hardware encode on that machine. The export screen lists the encoder path used.

### Audio is out of sync

Recast corrects drift against a monotonic clock. If drift still appears, the file was likely produced by **compatibility mode** (`MediaRecorder`), which has a variable frame rate. Re-export from the project rather than sharing the raw capture.

---

## Windows

### "Windows protected your PC"

The build is unsigned or has no SmartScreen reputation yet. Verify the SHA-256 against the release page. Signed builds eventually lose this prompt; see `docs/code-signing.md`.

### No system audio

- Some managed devices disable WASAPI loopback by policy.
- Check **Settings → Sound → More sound settings → Recording** for a loopback device.
- Bluetooth headsets often expose only a microphone profile; switch to speakers to test.

### Blurry UI on a second monitor

Mixed-DPI handling is a release gate. If it happens, report both monitors' scaling percentages — that is exactly the data needed to fix it.

### Installer asks for admin rights

It should not. The default installer is per-user. If you see a UAC prompt, you downloaded the MSI (per-machine) instead of the NSIS setup.

### Portable build forgets settings

Settings live next to the executable when that folder is writable; otherwise in `%APPDATA%`. Moving the folder moves the settings only if the folder was writable.

---

## macOS

### "Recast would like to record this computer's screen"

Required. Approve it in **System Settings → Privacy & Security → Screen Recording**, then **quit and reopen Recast** — macOS requires a relaunch before capture works.

### Screen recording permission looks granted but capture is black

This is the classic "granted after launch" state. Recast detects it and offers a relaunch. If it persists, remove Recast from the list with the `−` button, re-add it, and relaunch.

### Auto-zoom does nothing

Global cursor tracking needs **Accessibility** permission. Without it, Recast records normally and auto-zoom falls back to manual.

### System audio toggle is disabled

System audio capture requires **macOS 14.2 or newer**. On older versions, record the microphone or use a virtual audio device.

### "Recast is damaged and can't be opened"

The build was not notarized, or the download was corrupted.

```bash
xattr -dr com.apple.quarantine /Applications/Recast.app
```

If that does not help, re-download and verify the checksum.

---

## Linux

### Wayland: the app cannot see my windows

Wayland only exposes the portal picker. Recast asks the compositor for a stream and the compositor decides what you can share. This is by design and cannot be worked around without compositor support.

### Wayland: no cursor tracking, so auto-zoom is manual

Global pointer position is not exposed to sandboxed apps. Recast explains this in the UI. Log in with an X11 session if you need automatic zoom.

### AppImage does not start

```bash
sudo apt install libfuse2
```

Or run with `--appimage-extract-and-run`.

### No system audio

Check that a PipeWire monitor source exists:

```bash
pactl list short sources
```

Pick the `.monitor` source in **Settings → Audio → System source**.

### Global hotkeys do nothing

The compositor owns global shortcuts. Bind a command in your desktop's keyboard settings that runs:

```bash
recast --start-recording
```

### Blank window on NVIDIA

Try `--disable-gpu` or set `LIBVA_DRIVER_NAME` appropriately. Report the GPU and driver version.

---

## Reporting a bug

Include:

- Recast version and build hash (Settings → About).
- OS version, display server (X11/Wayland), and scaling.
- The last session's `session.json` (redact file paths if needed).
- Whether the bundled or downloaded FFmpeg was used.
- Steps that reproduce it, and whether it happens every time.

Open an issue using the bug template. Do not include personal recordings; a 5-second synthetic capture is usually enough.
