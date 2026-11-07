# Contributing to Recast

Thanks for helping build a genuinely free, local-first screen recorder.

## Setup

```bash
git clone https://github.com/SudhirDevOps1/recast
cd recast
pnpm install
pnpm fetch:ffmpeg        # optional — bundles the media-engine safety net
pnpm verify              # typecheck + lint + tests + build
pnpm dev
```

Requirements: Node ≥ 20.11, pnpm 9 (corepack). Linux contributors: `libfuse2` for AppImage dev runs.

## PR checklist

- [ ] `pnpm verify` green
- [ ] New logic in `packages/editor` (zoom/spring/time) has unit tests
- [ ] Any new IPC channel is declared in `packages/shared/src/ipc.ts` with zod schemas on both ends
- [ ] UI follows the design tokens (`packages/ui/src/tokens.css`); no hardcoded colors, no emoji icons
- [ ] STATUS.md and the relevant `docs/*.md` updated — a feature without docs is not done
- [ ] No secrets, no placeholder text, no "coming soon" buttons
- [ ] Performance-relevant changes note their effect in the PR (numbers, not vibes)

## Commit style

Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `perf:`, `test:`. Scope optional (`feat(editor): …`).

## Where to work

| Area | Location |
|---|---|
| Capture pipeline | `packages/capture` |
| Compositor, zoom math | `packages/editor` |
| Export | `packages/export` |
| Design system | `packages/ui` |
| IPC contract, schemas | `packages/shared` |
| Main process | `apps/desktop/src/main` |
| Renderer app | `apps/desktop/src/renderer` |
| Packaging | `apps/desktop/electron-builder.yml`, `packaging/` |

See AGENTS.md for the working rules that govern this repo (crash-safe recording, compositor-as-contract, honest STATUS).
