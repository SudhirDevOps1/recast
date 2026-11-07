# AGENTS.md

Instructions for AI coding agents (Claude Code, Cursor, Codex, Copilot, OpenCode) working in this repository.

## What this repo is

**Recast** — a free, open-source, local-first screen recorder and cinematic editor for macOS, Windows, and Linux.

Right now the repo is **spec-first**: documentation, the master build prompt, and the project contract. Application code is added in Phase 1. Do not invent a "finished" app in the README; keep status claims honest.

Read in this order before writing code:

1. [`prompts/build-prompt.md`](prompts/build-prompt.md) — the full product and engineering brief.
2. [`docs/architecture.md`](docs/architecture.md) — process model and boundaries.
3. [`docs/roadmap.md`](docs/roadmap.md) — what to build, in which order.
4. [`docs/platform-support.md`](docs/platform-support.md) — what each OS can actually do.
5. [`docs/ffmpeg.md`](docs/ffmpeg.md) — binary bundling and licensing rules.

## Non-negotiables

- **No fake features.** Every visible control works or is removed. No mock data on core paths.
- **Offline by default.** No account, no telemetry, no uploads. Network only for opt-in model downloads and update checks.
- **Honest platform reporting.** If Wayland or an old macOS cannot do something, say so in the UI with a fix — never silently degrade.
- **Crash-safe recording.** Segmented writes, recovery on relaunch.
- **Deterministic export.** Preview and output must match frame-for-frame.
- **Premium feel.** 60fps interactions, spring motion, no default Electron chrome, no unstyled shadcn defaults.

## Naming contract

Use the product name everywhere. Binary `recast`, project file `.recast`, style `.recaststyle`, URL scheme `recast://`, app ID `app.recast.desktop`, packages `@recast/*`.

Do not rename these without updating every doc, script, and installer config at once.

## Commands (target contract)

```bash
pnpm dev          # run the app in development
pnpm build        # compile all packages
pnpm verify       # lint + typecheck + unit + electron smoke
pnpm dist:win     # Windows: nsis, msi, portable, arm64
pnpm dist:mac     # macOS: dmg (arm64/x64/universal), pkg, zip
pnpm dist:linux   # Linux: AppImage, deb, rpm, tar.gz, snap
pnpm dist:all     # everything
pnpm docs:dev     # local docs preview
```

If a command does not exist yet, add it to `package.json` in the same PR that uses it.

## Engineering rules

- TypeScript strict. No `any` in exported types. Validate every IPC payload with zod on **both** ends.
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP. No remote code.
- Main process owns OS integration; renderer owns UI; heavy work goes to workers. The renderer must never block.
- Never pass an untrusted string to a shell. Use `spawn` with argument arrays and `shell: false`.
- All timestamps in the project model are integer milliseconds on a single monotonic clock; never mix `Date.now()` with media time.
- Any new dependency needs a one-line justification in the PR description. Native modules need a note about build impact for all three OSes.
- Write the test with the feature. Zoom math, keyframe interpolation, time mapping, preset serialization, and IPC schemas need unit tests.

## FFmpeg rules

- Binaries are **never committed**. They are fetched by `scripts/fetch-ffmpeg.mjs` using `ffmpeg.lock.json` (version + SHA-256 per platform), then unpacked from ASAR via electron-builder `asarUnpack`.
- Runtime resolution order: `RECAST_FFMPEG` env override → bundled binary → user-data cache → offer in-app download.
- Downloads must show consent, progress, resumable transfer, checksum verification, and a rollback on corruption.
- The app is GPL-3.0 because it bundles a GPL FFmpeg build. Changing that requires the LGPL path documented in `docs/ffmpeg.md` first.
- FFmpeg is a utility and fallback layer. The default record/export path stays on WebCodecs.

## Design rules

- Tokens live in `packages/ui/src/tokens.ts` (and a generated CSS variable file). No hard-coded hex values in components.
- Motion tokens: 120 / 180 / 240 / 320 ms. Springs for physical elements. Respect `prefers-reduced-motion`.
- Ship every state: empty, loading, error, offline, permission-denied, overflow, drag-hover, recording, paused, exporting.
- Keyboard-first: every action reachable without a mouse; shortcuts documented in `docs/keyboard-shortcuts.md`.
- Accessibility: visible focus, ARIA labels, 4.5:1 contrast, captions.

## Documentation rules

- A feature is not done until its doc is updated.
- Docs are written for a stranger: what it does, why it exists, how to verify it, what it cannot do.
- Keep the platform matrix in `docs/platform-support.md` truthful. If you could not test an OS, say "untested", not "works".

## Commits and PRs

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `build:`, `chore:`.
- One logical change per PR. Include: what changed, how it was verified, measured numbers where relevant, and anything still fake.
- Screenshots or a short screen recording for any UI change.
- `pnpm verify` must pass before a PR is opened.

## Definition of done

A feature is done when:

1. It works on all three OSes, or the limitation is documented and surfaced in the UI.
2. Tests cover the logic that can silently break (math, timing, serialization, IPC).
3. The relevant doc is updated.
4. `pnpm verify` passes.
5. `STATUS.md` reflects reality — real, partial, or not built.
