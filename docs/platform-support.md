# Platform support

Status: **specification — all rows are planned, none are verified yet.**

This table exists so nobody promises a feature the OS cannot deliver. When a row is tested on real hardware, replace `Planned` with `Verified` and add the date and machine in the notes.

## Capability matrix

| Capability | Windows 10/11 | macOS 12.3–14.1 | macOS 14.2+ | Linux X11 | Linux Wayland |
|---|---|---|---|---|---|
| Full-screen capture | Planned | Planned | Planned | Planned | Planned (portal) |
| Window capture | Planned | Planned | Planned | Planned | Portal-dependent |
| Area capture | Planned | Planned | Planned | Planned | Portal-dependent |
| System audio | Planned | **Unsupported** | Planned | Planned | Planned |
| Microphone | Planned | Planned | Planned | Planned | Planned |
| Camera overlay | Planned | Planned | Planned | Planned | Planned |
| Global cursor tracking | Planned | Planned | Planned | Planned | Limited |
| Global hotkeys | Planned | Planned | Planned | Planned | Compositor-dependent |
| Click-through tray | Planned | Planned | Planned | Planned | Compositor-dependent |
| Hardware encode | Planned | Planned | Planned | Planned | Planned |
| Auto-update | Planned | Planned | Planned | Planned | Planned |

## Windows

- Minimum **Windows 10 1809 (build 17763)**, x64 and ARM64.
- Capture runs through Chromium's Window Graphics Capture path; no extra driver.
- System audio uses **WASAPI loopback** — no virtual cable needed.
- DPI: per-monitor awareness is mandatory. Moving the window between a 100 % and a 150 % monitor must not blur or resize it.
- Per-user install into `%LOCALAPPDATA%\Programs\Recast`; no UAC prompt.
- `Recast.exe` registers `.recast` and `recast://`, and enforces a single instance.
- ARM64 devices (Snapdragon X) get the same feature set; if a codec is missing, fall back visibly rather than silently.

Known risks:

- SmartScreen will warn on unsigned builds. Signing is documented in `docs/code-signing.md`.
- Some corporate machines block WASAPI loopback via policy. Detect and explain.
- HDR displays can produce washed-out captures; detect HDR and warn, with an SDR fallback.

## macOS

- Minimum **macOS 12.3** for ScreenCaptureKit.
- System audio capture requires **macOS 14.2+**. On older versions the toggle is disabled with an explanation — not hidden, not silently ignored.
- Required Info.plist keys: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSScreenCaptureUsageDescription`.
- Entitlements: camera, audio-input, and `allow-jit` if the renderer needs it. Hardened runtime enabled.
- TCC handling:
  - Screen Recording requires a relaunch after granting — detect and offer it.
  - Accessibility is needed only for global cursor tracking.
  - A revoked permission mid-recording must pause cleanly, not produce a corrupt file.
- Native chrome: traffic lights, vibrancy, ⌘ shortcuts, Dock menu, menu-bar extra.

Known risks:

- ScreenCaptureKit behavior changed across 13, 14, and 15. Test each major version.
- Notarization requires an Apple Developer account. Unsigned builds will be blocked by Gatekeeper.
- Retina scaling: capture in points vs pixels must be handled once, centrally.

## Linux

### X11

- Full support: screen, window, area, cursor position, global hotkeys.
- Cursor capture via XFixes.
- Audio via PulseAudio/PipeWire monitor sources.

### Wayland

Wayland deliberately prevents apps from capturing the screen or reading global input. Recast does **not** try to bypass this.

- Capture goes through the **PipeWire portal** (`xdg-desktop-portal` + `xdg-desktop-portal-gnome`/`-kde`). The compositor shows its own picker; Recast cannot pre-select a window or area.
- Global cursor position is generally unavailable. Auto-zoom falls back to manual zoom, and the UI says why.
- Global hotkeys depend on the compositor; Recast registers a portal shortcut where supported and otherwise asks the user to bind a command.
- System audio requires a PipeWire monitor source; if the portal does not expose one, Recast offers mic-only.

This is a compositor limitation, not a bug. The UI states it plainly and links to `docs/troubleshooting.md`.

## Distribution coverage

| Package | Windows | macOS | Linux |
|---|---|---|---|
| Native installer | NSIS `.exe`, `.msi` | `.dmg`, `.pkg` | `.deb`, `.rpm` |
| Portable | `.exe` | `.zip` | AppImage, `.tar.gz` |
| Package manager | winget, Scoop, Chocolatey | Homebrew cask | Flathub, Snap, AUR |
| Auto-update | electron-updater | electron-updater + Sparkle-compatible feed | electron-updater |

Full detail: `docs/packaging.md`.

## How to report a platform result

When you test a row, open a PR that updates this file with:

```
| System audio | Verified 2026-03-04 · Win 11 23H2 · Realtek ALC897 |
```

No date and no hardware means no verification.
