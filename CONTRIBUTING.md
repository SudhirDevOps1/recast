# Contributing to Recast

Thanks for helping. Recast is a local-first, GPL-3.0 desktop app, and the bar is "would I install this on my own machine?"

## Before you start

1. Read [AGENTS.md](AGENTS.md) — the engineering rules apply to humans too.
2. Read [docs/roadmap.md](docs/roadmap.md) and pick something in the current phase.
3. Open an issue or comment on an existing one before starting anything larger than a typo.

Unsolicited large PRs usually get rejected for scope, not quality. A five-minute conversation saves a week.

## Setup

```bash
git clone https://github.com/SudhirDevOps1/recast.git
cd recast
corepack enable
pnpm install
pnpm ffmpeg:fetch
pnpm dev
```

## Making a change

1. Branch from `main`: `feat/zoom-dead-zone`, `fix/wayland-portal-crash`.
2. Keep the diff focused. One logical change per PR.
3. Write the test with the feature. Timing, zoom math, serialization, and IPC schemas are not optional.
4. Run `pnpm verify` before pushing.
5. Include a screenshot or a short capture for any UI change.

## Commit style

Conventional commits:

```
feat(editor): add follow-cursor dead zone
fix(capture): finalize segments when the display is unplugged
docs(ffmpeg): document the LGPL alternative
perf(export): reuse encoder between chunks
```

## Pull request checklist

- [ ] Works on the OSes I claim (say which, and which I could not test).
- [ ] `pnpm verify` passes.
- [ ] Tests added or updated.
- [ ] Docs updated (`docs/`, `README.md`, or `AGENTS.md`).
- [ ] No secrets, no large binaries, no committed media.
- [ ] `STATUS.md` updated if the feature's reality changed.
- [ ] Screenshots for UI changes.

## What gets rejected

- Mock data or placeholder buttons on core paths.
- Silent platform degradation ("it just doesn't work on Wayland" with no UI explanation).
- Features that require an account, a cloud service, or telemetry.
- Enormous refactors bundled with a feature.
- Dependencies with unclear licenses or no stated reason.

## Reporting bugs

Use the issue template. Include version, OS, display server, scaling, and the last session's `session.json`. Never attach personal recordings — a synthetic 5-second capture is enough.

## Security

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## License

By contributing you agree your work is licensed under GPL-3.0-or-later, and you have the right to submit it.
