# Support

Recast is maintained in the open. There is no support SLA and no ticket queue - help comes from the issue
tracker, the release notes and the documentation. This page tells you what to do before you ask, and what to
expect when you do.

## Before you file anything

1. **Check the version.** Only the latest release is supported; older releases are not backported.
2. **Search the known issues.** [troubleshooting.md](troubleshooting.md) lists confirmed issues with their
   fix (SmartScreen, Gatekeeper quarantine, libfuse2, black preview after granting a permission,
   Wayland limitations, missing whisper.cpp).
3. **Export the diagnostics bundle.** Settings - Diagnostics - **Copy diagnostics bundle**. It carries the
   app version, OS, FFmpeg state, display-permission state and the last 200 lines of `capture.log`. It is
   written to disk by you and never uploaded.
4. **Reproduce on the latest build.** The `nightly` prerelease carries the same artifact matrix and the
   same checksums as a stable release; if the bug is gone there, it was fixed.

## How to get help

| Topic | Where |
|---|---|
| Bug report | [GitHub issues](https://github.com/SudhirDevOps1/recast/issues) |
| Feature request | [GitHub issues](https://github.com/SudhirDevOps1/recast/issues) with the `enhancement` label |
| Question | [GitHub issues](https://github.com/SudhirDevOps1/recast/issues) - there is no discussion board yet |
| Security report | Private advisory channel, never a public issue - see [SECURITY.md](../SECURITY.md) |
| Breaking change or regression | [STATUS.md](../STATUS.md) and the [changelog](https://github.com/SudhirDevOps1/recast/releases) |

## Bug report template

```markdown
### What happened
One sentence. What the user expected vs. what they saw.

### Repro
1. Recast version: (Settings > About, or the release tag)
2. OS and version: (Windows 11 23H2 / macOS 14.4 / Ubuntu 24.04)
3. Steps:
   - ...
4. Diagnostics bundle: (attached)

### Expected
What should have happened instead.

### Notes
Encoder path shown in the export panel, capture mode (screen/window/area),
whether the recording is still in the Library, any error text verbatim.
```

Screenshots of the export panel or the diagnostics panel usually answer the next question before you post.

## What to expect

| Situation | Expectation |
|---|---|
| Reproducible bug | Acknowledged, ideally with a fix in the next release. |
| Platform-specific bug (Windows/macOS/Linux) | Slower - on-device QA hardware is limited, and macOS Intel builds are cross-compiled without a native test pass yet. |
| Feature request | Discussed against the [roadmap](roadmap.md); may land, may not. |
| Security report | Acknowledged within 5 days, fix or stated timeline within 30 days. |

The project follows a strict honesty rule: nothing is marked "working" that was not tested on that OS, and
feature work without documentation does not count as done. [STATUS.md](../STATUS.md) is the running record.

## Quick reference

| Symptom | First thing to try |
|---|---|
| Installer blocked on Windows | Expected while unsigned - verify `SHA256SUMS`, then "More info - Run anyway". |
| "Recast is damaged" on macOS | Unsigned-build quarantine - `xattr -cr /Applications/Recast.app`. |
| Black preview after granting permission | Restart Recast; macOS does not re-read TCC grants in a running process. |
| AppImage will not start | `sudo apt install libfuse2`. |
| Captions say "No whisper.cpp binary found" | Install `whisper.cpp` - `brew install whisper-cpp` or `scoop install whisper-cpp`. |
| Export says "FFmpeg encode failed" | GIF and ProRes need the FFmpeg safety net - Settings - Media engine - Install. |
| Missing recording after a crash | By design at most 2 s are lost; recovered sessions appear in the Library on next launch. |
| Auto-zoom does nothing on Wayland | By design - uiohook cannot hook Wayland; use an X11 session. |

## Related

- [troubleshooting.md](troubleshooting.md) - confirmed issues with fixes
- [support.md](support.md) - this page
- [platform-support.md](platform-support.md) - what works where
- [deployment.md](deployment.md) - for IT administrators
