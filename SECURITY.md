# Security policy

## Reporting a vulnerability

Do **not** open a public issue. Use GitHub's private vulnerability reporting:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Include reproduction steps, affected version, OS, and impact.

You can expect an acknowledgement within 72 hours and a status update within 7 days. Please give us 90 days before public disclosure, or less if a fix ships sooner.

## Scope

In scope:

- Electron hardening bypasses (context isolation, sandbox, CSP, IPC validation).
- Path traversal or arbitrary file write through project files, presets, or media imports.
- Command injection through FFmpeg invocation or shell usage.
- Update pipeline compromise (unsigned or unverified payloads).
- Malicious `.recast` / `.recaststyle` files that execute code or exfiltrate data.
- Permission-handling bugs that capture more than the user approved.

Out of scope:

- Attacks requiring an already-compromised machine.
- Denial of service by recording a very large screen for a very long time.
- Issues in third-party codecs or drivers with no Recast-specific trigger.
- Social engineering.

## Design commitments

- No account, no telemetry, no uploads. The only outbound requests are opt-in model downloads and update checks.
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP.
- All IPC validated with zod on both ends; privileged channels check the calling window.
- FFmpeg is invoked with `spawn` and argument arrays, never a shell.
- Downloaded binaries and update payloads are checksum-verified; unsigned payloads are rejected.
- User files are opened read-only unless the user explicitly saves over them.

## Supported versions

| Version | Supported |
|---|---|
| Latest stable | Yes |
| Latest beta | Fixes only |
| Older | No |

## Credit

Reporters are credited in the release notes unless they prefer to stay anonymous.
