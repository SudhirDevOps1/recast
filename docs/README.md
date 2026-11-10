# Documentation

Everything Recast can and cannot do, written for the four people who actually read it: an end user, an IT
administrator, an engineer joining the codebase, and a maintainer shipping a release.

> **Honesty rule.** Nothing in this documentation says a feature "works" unless it was tested on that OS.
> Anything untested says so. [STATUS.md](../STATUS.md) is the source of truth for feature state.

## Start here

| Doc | Audience | What it covers |
|---|---|---|
| [README](../README.md) | Everyone | Product overview, capabilities, install matrix, architecture at a glance |
| [platform-support.md](platform-support.md) | End user, IT | Honest capability matrix per OS with test dates |
| [deployment.md](deployment.md) | IT / operations | Silent installs, GPO and MDM rollout, offline verification, version pinning |
| [security.md](security.md) | IT, security | Data flow, permissions, at-rest state, update verification, reporting |
| [support.md](support.md) | Everyone | Diagnostics bundle, bug-report template, known issues, response expectations |
| [troubleshooting.md](troubleshooting.md) | End user | Real, confirmed issues only - with the fix for each |

## Using Recast

| Doc | What it covers |
|---|---|
| [recording.md](recording.md) | Sources, permissions, audio tracks, crash recovery, capture diagnostics |
| [editing.md](editing.md) | Timeline, zoom math, cursor styling, motion, presets, undo model |
| [export.md](export.md) | Encoder chain, muxing, determinism, loudness, verification |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | Full shortcut map, per platform |

## Engineering

| Doc | What it covers |
|---|---|
| [architecture.md](architecture.md) | Process model, IPC contract, storage layout, failure domains, determinism |
| [build.md](build.md) | Prerequisites, workspace layout, scripts, native modules |
| [packaging.md](packaging.md) | Every installer target, CI matrices, updater feed, community manifests |
| [code-signing.md](code-signing.md) | Windows and macOS signing pipelines, notarization, current state |
| [ffmpeg.md](ffmpeg.md) | Bundling, hash pinning, in-app download, licensing implications |
| [repository-setup.md](repository-setup.md) | One-time admin settings: Pages, branch protection, secrets |

## Project

| Doc | What it covers |
|---|---|
| [roadmap.md](roadmap.md) | Phases with explicit acceptance criteria |
| [market-parity.md](market-parity.md) | The free open-source competitors (Capptivo, OpenScreen, Recordly, Focra, Reframed, screenize), how they work, and where Recast stands |
| [../prompts/parity-build-prompt.md](../prompts/parity-build-prompt.md) | Build prompt for the parity work |
| [../prompts/build-prompt.md](../prompts/build-prompt.md) | The original master brief |
| [STATUS.md](../STATUS.md) | What is real, what is partial, what is not built - updated per release |
| [CHANGELOG.md](../CHANGELOG.md) | Release history |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How to propose a change and get it merged |
| [PERFORMANCE.md](../PERFORMANCE.md) | Performance budgets and the method behind them |
| [AGENTS.md](../AGENTS.md) | Repository rules for coding agents |

## Where things live on disk

| Platform | Data directory |
|---|---|
| Windows | `%APPDATA%\Recast` |
| macOS | `~/Library/Application Support/Recast` |
| Linux | `~/.config/recast` |
| Portable mode | next to the executable, when writable |

Inside it: `settings.json`, `library.db` (SQLite), `projects/<id>.recast`,
`recordings/<sessionId>/` (segments, manifest, cursor track), `bin/ffmpeg/` (optional binaries),
`models/` (Whisper models) and `logs/capture.log` (diagnostics, 512 KB with one rotation slot).

## Conventions used across these docs

| Marker | Meaning |
|---|---|
| **verified** | Tested on that OS or in CI; the result is reproducible |
| **implemented** | Code complete and unit-covered, on-device QA still pending |
| **partial** | Scaffolded - the plumbing exists, the feature does not |
| **not built** | Explicitly absent - do not plan around it |
| **planned** | Accepted into the roadmap with acceptance criteria, not started |
