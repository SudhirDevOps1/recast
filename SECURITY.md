# Security Policy

## Supported versions

| Version | Support |
|---|---|
| latest release | ✅ |
| older releases | upgrade — we do not backport |

## Reporting a vulnerability

**Do not open a public issue for security reports.**

Use GitHub's private vulnerability reporting on
[github.com/SudhirDevOps1/recast/security/advisories](https://github.com/SudhirDevOps1/recast/security/advisories).
You will get an acknowledgment within 5 days, and a fix or a stated timeline
within 30 days. Credit in the changelog unless you ask otherwise.

## Threat model (what we defend, what we don't)

Recast is a local-first desktop app. Trust boundaries:

1. **Renderer ↔ main (IPC).** The renderer runs web content and is fully sandboxed (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`). Every IPC channel is declared in `packages/shared/src/ipc.ts` with zod schemas validated on **both** ends. Main-process handlers treat renderer input as hostile:
   - `app:revealInFolder` / `app:openUrl` are allowlisted (only repo URLs through `shell.openExternal`).
   - `export:readFile` / `capture:readCaptions` only serve paths inside the recordings tree with known extensions.
   - `recast-media://` protocol serves only files under the recordings/projects roots.
2. **Child processes.** FFmpeg/whisper are spawned with `shell: false`, argument arrays, timeouts, and process-tree kill on cancel. Filenames are never interpolated into a shell string. Downloaded binaries are verified against pinned SHA-256 hashes before they can execute (`ffmpeg.lock.json` + `scripts/fetch-ffmpeg.mjs`); an unverified download is quarantined, never run.
3. **Files on disk.** Recording sessions and projects live under the user's data dir with the platform default permissions. Recast does not encrypt at rest — if your threat model includes local disk access, full-disk encryption is the right tool.
4. **Network.** Default state makes **zero** network requests. Opt-in only: update checks (off by default), Whisper model download, FFmpeg in-app download. All downloads are TLS + pinned-hash verified.
5. **Recorded content.** Screen recordings can contain sensitive data. Recast offers blur/pixelate redaction applied at composition time (before encoding) but **does not** auto-redact; the user is responsible for what they record.

Out of scope: attacks requiring local code execution already, malicious devices plugged into the machine, and OS-level compromises.

## Automated scanning

- Dependabot (npm + actions) weekly; grouped minor/patch updates.
- CI runs the full verify gate on every push.
- Report known CVEs in dependencies to the same private channel.

## Secrets hygiene for contributors

Never commit tokens or certificates. The GitHub token used for CI/release management is referenced via `secrets.*` only. If a credential is accidentally pasted into an issue/PR/chat, **revoke it immediately** — rotation is the fix, not history edits.
