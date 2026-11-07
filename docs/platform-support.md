# Platform support — honest capability matrix

Nothing here says "works" unless it was tested on that OS. Untested = untested.

Legend: ✅ tested working · 🟡 implemented, awaiting on-device verification · 🟠 partially implemented · ❌ not available · — not applicable

## macOS

| Capability | 12.3–14.1 | 14.2+ | Notes |
|---|---|---|---|
| Screen capture | 🟡 | 🟡 | ScreenCaptureKit-backed via Electron; verify on QA pass |
| System audio (loopback) | ❌ | 🟡 | Requires 14.2+; stated in UI |
| Microphone / camera | 🟡 | 🟡 | TCC prompts; status deep links; relaunch after grant |
| Window capture | 🟡 | 🟡 | |
| Area selection | 🟡 | 🟡 | |
| Cursor tracking (uiohook) | 🟡 | 🟡 | Accessibility permission may be required |
| Global hotkeys | 🟡 | 🟡 | |
| Traffic lights / menu-bar tray / Dock | 🟡 | 🟡 | hiddenInset traffic lights implemented |
| Signing + notarization | ❌ | ❌ | Pipeline ready (entitlements, notarytool env), no certificate yet |

Minimum macOS: 12.3.

## Windows

| Capability | Win 10 1809+ x64 | ARM64 | Notes |
|---|---|---|---|
| Screen capture | 🟡 | 🟡 | |
| System audio (WASAPI loopback) | 🟡 | 🟡 | No virtual cable needed |
| Window capture | 🟡 | 🟡 | |
| Area selection | 🟡 | 🟡 | |
| Cursor tracking | 🟡 | 🟡 | |
| Global hotkeys | 🟡 | 🟡 | |
| Per-user install, no UAC | 🟡 | 🟡 | NSIS `perMachine: false` |
| Portable mode | 🟡 | 🟡 | `portable.marker` beside exe; settings adjacent when writable |
| MSI (enterprise/GPO) | 🟡 | — | WiX-based target |
| Code signing (Azure Trusted Signing) | ❌ | ❌ | Env plumbing ready; SmartScreen will warn until reputation builds — documented, not hidden |
| Per-monitor DPI / mixed-DPI | 🟡 | 🟡 | Chromium handles scaling; verify 125/150/200 % on QA pass |

## Linux

| Capability | X11 | Wayland | Notes |
|---|---|---|---|
| Screen capture | 🟡 | 🟡 | Wayland via xdg-desktop-portal/PipeWire only — never bypassing the compositor |
| Window capture | 🟡 | 🟡 | Portal-dependent |
| Area selection | 🟡 | ❌ | Overlay window needs X11; Wayland shows the limitation in the UI |
| Cursor tracking | 🟡 | ❌ | uiohook cannot hook Wayland; auto-zoom disabled with explanation |
| Global hotkeys | 🟡 | ❌ | Same limitation, stated |
| System audio | ❌ | ❌ | Mic-only fallback; PipeWire monitor capture is on the roadmap |
| AppImage | 🟡 | 🟡 | Missing `libfuse2` detection with a copyable fix command planned (troubleshooting.md) |
| deb/rpm/tar.gz | 🟡 | 🟡 | |
| Flatpak / Snap / AUR | 🟠 | 🟠 | Manifests authored; not submitted yet |

## Verified in CI (2026-11-07)

- ✅ linux-x64 FFmpeg bundle fetch + hash pinning + binary execution (sandbox CI-equivalent)
- ✅ Full verify gate (typecheck/lint/tests/build) on linux
- ❌ Windows/macOS device runs — not performed yet; everything above marked 🟡 for those OSes reflects code-complete-untested status

## Test log

| Date | OS | What was tested | Result |
|---|---|---|---|
| 2026-11-07 | Linux x64 (CI sandbox) | verify gate, build, ffmpeg fetch/pin | pass |
| — | Windows 10/11 x64 | pending | — |
| — | macOS 14 arm64 | pending | — |
