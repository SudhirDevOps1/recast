# AGENTS.md — rules for coding agents in this repo

This file governs any automated agent (human or AI) contributing to Recast.

## Identity

- Product name is **Recast**. Binary `recast`. App ID `app.recast.desktop`. Project files `.recast`, style presets `.recaststyle`, protocol `recast://`.
- Never introduce placeholder branding, template names, or generic scaffolding names. Every artifact uses the canonical table in README.md.
- Never force-push `main`, never rename the repo, never change the artifact prefix.

## Hard rules

1. **No fake paths.** No mock data, no placeholder buttons, no "coming soon" on core flows. Every visible control either works end-to-end or is removed. If a capability depends on something not yet implemented, the UI states that honestly (e.g. the FFmpeg Repair flow) — it does not pretend.
2. **No silent degradation.** Platform gaps are reported in the UI with a fix (see `capabilities` in `app:getPlatformInfo`). If Wayland can't do cursor tracking, the app says so and links to docs/platform-support.md.
3. **STATUS.md stays truthful.** After any change, update STATUS.md. Never mark something "works" unless it was tested on that OS. Untested code is "untested", unfinished code is "planned" or "not built".
4. **Docs are part of the feature.** A feature without a docs update is not done. Numbers in docs are targets until measured in PERFORMANCE.md.
5. **Secrets never enter git.** No tokens, keys, certificates, or credentials in commits, logs, or docs. GitHub Actions secrets are referenced, never written. `.env` files are git-ignored and must never be committed. If a secret lands in history, the token is revoked and rotated immediately — do not attempt history scrubbing first.
6. **Security defaults are non-negotiable.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP, zod-validated IPC on both ends (every channel declared in `packages/shared/src/ipc.ts`), no remote code, `shell: false` for every child process, argument arrays only. Never route user-controlled paths through a shell or through `shell.openExternal` (allowlist URLs).
7. **The compositor is the contract.** Preview and export MUST render through `packages/editor/src/compositor.ts`. Adding a rendering path outside it is a bug even if it looks right.
8. **Export uses the frame clock.** Never `requestAnimationFrame` for export timing.
9. **Recording must stay crash-safe.** Segments every ~2 s, atomic manifest writes (tmp + rename), `cursor.jsonl` batches. Any change that writes recording data in-place or unatomically is rejected.
10. **FFmpeg is a safety net.** The default record → edit → export path stays on WebCodecs. FFmpeg is used for probe/remux/thumbnails/GIF/ProRes/loudnorm/Whisper-extraction. Never make it a hard dependency of the core path.

## Commands

```bash
pnpm verify            # typecheck + lint + test + build — must be green before any phase is called done
pnpm dev               # dev run
pnpm fetch:ffmpeg      # stage FFmpeg binaries per ffmpeg.lock.json (--pin to record hashes)
pnpm smoke             # Playwright Electron smoke (RECAST_SMOKE=1, built app)
pnpm dist:linux|mac|win
pnpm check:website    # website markup + asset audit (runs in website.yml before every deploy)
pnpm check:docs       # docs links, anchors and code fences (runs in the CI docs job)
```

## Code conventions

- TypeScript strict everywhere. New IPC channels are declared in `packages/shared/src/ipc.ts` with zod schemas for request AND response; both ends validate.
- Design tokens live in `packages/ui/src/tokens.css`. Use them; never hardcode colors. Dark-first, one accent, no rainbow gradients, no emoji as icons.
- Motion: 120/180/240/320 ms tokens; springs for physical elements; respect `prefers-reduced-motion`.
- Zoom math, springs, time mapping stay in `packages/editor` and stay pure — every new behavior gets a unit test.
- Commits: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`…). PRs include what was measured (see WORKING RULES in the project brief) and what remains fake/untested.

## Spikes and irreversible choices

Ask before: bundling new native dependencies, changing the `.recast` project format, changing the license, adding network calls (any), changing the packaging matrix. Prove risky platform APIs with minimal spikes and record results (SPIKE-RESULTS.md) before building UI on top.
