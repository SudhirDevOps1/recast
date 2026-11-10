# Security and privacy

What Recast does with your data, what it asks the operating system for, and what it deliberately does not do.
The authoritative policy - including the private reporting channel - is [SECURITY.md](../SECURITY.md).

## Network behaviour

| Situation | Network traffic |
|---|---|
| Normal use | **None.** No account, no analytics, no crash reporting, no telemetry. |
| Update check | One request per check, **off by default**, user-initiated. |
| Whisper caption model | Downloaded on demand into the data directory, then local. |
| FFmpeg safety net | Downloaded on demand into the data directory, then local. |

Downloads are TLS and verified against pinned SHA-256 hashes before they can execute. An unverified
download is quarantined, never run.

## Permissions Recast requests

| Permission | Platform | Why | Deny-safe behaviour |
|---|---|---|---|
| Screen recording | macOS, Windows, Linux | The product itself | Recording is refused with a recorded reason; the app explains what to grant. |
| Microphone | all | Voice-over tracks | Mic track is empty; the rest of the recording continues. |
| Camera | all | Face-cam device (device enumeration only, separate track not built) | Feature stays greyed out with the reason. |
| Accessibility | macOS, Linux | Cursor position and global hotkeys | Auto-zoom and hotkeys are disabled with an explanation instead of failing silently. |
| Display capture | Wayland via the portal | Screen and window capture | Portal denial is answered cleanly and logged. |

On macOS the TCC prompts are per-user: granting Screen Recording after the app has launched is not picked
up by the running process, so Recast offers a relaunch from the permission sheet.

## Trust boundaries

1. **Renderer to main.** The renderer runs web content and is fully sandboxed (`contextIsolation: true`,
   `sandbox: true`, `nodeIntegration: false`). Every IPC channel is declared once in
   `packages/shared/src/ipc.ts` with zod schemas validated on **both** sides. Main-process handlers treat
   renderer input as hostile: `app:revealInFolder` and `app:openUrl` are allowlisted, file-serving
   channels only serve paths inside the recordings and projects trees, and the `recast-media://` protocol
   only serves files under those roots.
2. **Child processes.** FFmpeg and whisper are spawned with `shell: false`, argument arrays, timeouts and
   process-tree kill on cancel. A filename is never interpolated into a shell string.
3. **Files on disk.** Everything lives under the user data directory with platform default permissions.
   **Recast does not encrypt at rest** - if your threat model includes local disk access, use full-disk
   encryption or an encrypted volume for the data directory.
4. **Recorded content.** A recording can contain anything on the screen. Recast applies blur and pixelate
   redaction at composition time, before encoding, but it does **not** auto-redact: what you record is
   your responsibility.

Out of scope: attacks that already require local code execution, malicious devices plugged into the
machine, and OS-level compromises.

## What is stored, and where

| Data | Location | Notes |
|---|---|---|
| Settings | `<data>/settings.json` | Atomic writes, no secrets |
| Library index | `<data>/library.db` | SQLite in WAL mode, projects and recordings only |
| Projects | `<data>/projects/<id>.recast` | JSON, autosaved every 5 s |
| Recordings | `<data>/recordings/<sessionId>/` | Segments, `session.json` manifest, `cursor.jsonl` |
| Diagnostics log | `<data>/logs/capture.log` | NDJSON, 512 KB, one rotation slot |
| Optional binaries | `<data>/bin/ffmpeg/` | Verified downloads |
| Optional models | `<data>/models/` | Whisper ggml models |

No recording, transcript or telemetry ever leaves the machine unless you export it yourself.

## Diagnostics

Settings - Diagnostics - **Copy diagnostics bundle** produces a summary of app version, OS, FFmpeg state,
display-permission state and the last 200 capture log lines. It is written to disk by you, on demand - it is
never uploaded.

## Update and binary integrity

| Artifact | Protection today |
|---|---|
| Release installers | Unsigned. Integrity comes from the published `SHA256SUMS`; the website shows each file's hash prefix. |
| Update feed | `electron-updater` against a generic GitHub provider; opt-in, not live as a feed with a documented rollback path. |
| FFmpeg binaries | Pinned SHA-256 per platform-arch in `ffmpeg.lock.json`, verified before execution. |
| Whisper models | Downloaded on demand; not hash-pinned yet. |

Signing pipelines (Azure Trusted Signing, Developer ID + notarytool) have the environment plumbing in
place but no certificates yet - see [code-signing.md](code-signing.md).

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting:
<https://github.com/SudhirDevOps1/recast/security/advisories>. Acknowledgment within 5 days, a fix or a
stated timeline within 30 days, credit in the changelog unless you ask otherwise.

Supported versions: the latest release. Older releases are not backported - upgrade instead.

## Related

- [deployment.md](deployment.md) - rollout, offline installs, version pinning
- [architecture.md](architecture.md) - process model and IPC contract
- [troubleshooting.md](troubleshooting.md) - permission and platform issues
