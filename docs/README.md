# Recast documentation

Start here.

| Doc | Read it when |
|---|---|
| [architecture.md](architecture.md) | You need the process model, IPC rules, or storage layout |
| [recording.md](recording.md) | You are working on capture, audio, permissions, or recovery |
| [editing.md](editing.md) | You are working on the timeline, zoom engine, cursor, or presets |
| [export.md](export.md) | You are touching encoders, muxers, or render determinism |
| [ffmpeg.md](ffmpeg.md) | You are bundling, updating, or debugging FFmpeg |
| [platform-support.md](platform-support.md) | You need to know what an OS can actually do |
| [build.md](build.md) | You are setting up a dev environment |
| [packaging.md](packaging.md) | You are producing installers |
| [code-signing.md](code-signing.md) | You are publishing a release |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | You are adding or changing an action |
| [troubleshooting.md](troubleshooting.md) | A user reports a platform problem |
| [roadmap.md](roadmap.md) | You want to know what is next |

## Conventions used in these docs

- **Status** at the top of each file is one of: `specification`, `in progress`, `implemented`.
- "Planned" means designed but not built. "Verified" means tested on real hardware, with the date and machine recorded.
- Numbers are targets until they appear in `PERFORMANCE.md` with a measurement method.
- Anything the OS cannot do is written down here before it is written into the UI.

## Writing docs

- Explain the *why* before the *how*.
- Prefer a table over a paragraph when comparing platforms or formats.
- Every doc ends with what "done" means, so reviewers have something to check.
- If code and docs disagree, the code is wrong until proven otherwise — fix one of them in the same PR.
