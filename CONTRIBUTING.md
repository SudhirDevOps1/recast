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

## Documentation standards

Documentation is part of the product here: the rule is that **a feature without docs is not done**.

| Rule | Why |
|---|---|
| Never claim something "works" that was not tested on that OS | The project sells honesty over marketing; a wrong claim costs more than a missing one |
| Update `STATUS.md` in the same commit as the change | STATUS.md is the running record of what is real |
| Use the shared markers - verified / implemented / partial / not built / planned | Readers scan for state, not for prose |
| Link with relative paths and keep them valid | `pnpm check:docs` fails the build on a dead link |
| Add a "Related" footer when you create a doc | Every doc must say where to go next |
| Record numbers, not adjectives | "cold start 1.9 s on the QA machine", not "blazingly fast" |

New document? Put it in `docs/`, list it in `docs/README.md`, add it to the required-files list in
`.github/workflows/ci.yml`, and give it an "At a glance" table plus a "Related" footer.

```bash
pnpm check:docs        # link, anchor and code-fence integrity
pnpm check:website     # markup and asset integrity for the site
```

## Review

| Area | What a reviewer checks |
|---|---|
| Correctness | Failing case covered by a test, not just the happy path |
| Boundaries | New IPC channel declared once with zod schemas on both ends |
| Design | Uses the tokens in `packages/ui/src/tokens.css`; no hardcoded colors, no emoji icons |
| Robustness | Capture path stays crash-safe; the compositor stays a pure function of `(project, time)` |
| Honesty | STATUS.md and `docs/*.md` updated; no claim outruns the tests |

