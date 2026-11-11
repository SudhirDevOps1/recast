# Premium plan — make Recast feel expensive

`/plan` for the "it looks cheap, the animation is bad, there are bugs" pass. Everything below is grounded in
code that exists in this repository today, not in a mockup. Line references are to the commit that introduced
this document.

Rules that do not change:

- Nothing here is called done until `pnpm verify` is green **and** the behaviour was checked on a real window.
- A visual state (hover / press / focus / disabled) is part of the feature, not decoration. A control without
  those states is unfinished.
- No new dependency for motion. CSS + the tokens in `packages/ui/src/tokens.css` are enough.
- `prefers-reduced-motion: reduce` turns every animation and transform off, without hiding content.

---

## Part 1 — Audit: what actually feels cheap

These are real defects found by reading the code, ordered by how much they cost the product.

| # | Where | Defect | Why it matters |
|---|---|---|---|
| 1 | `packages/ui/src/components/primitives.tsx:55,79` | `.rc-button` and `.rc-icon-button` are applied to every button in the app, but **neither class exists in any CSS file** (0 matches). The inline `transition` currently animates nothing. | There is no hover, no press, no disabled and no focus feedback on the primary interaction surface. This is the single biggest "web page, not an app" tell. |
| 2 | `views/App.tsx:118` | `useApp.getState().recorderState` is read **during render** without subscribing. | The red `Recording` badge can stay stale — no subscription means no re-render when recording starts or stops. |
| 3 | `views/App.tsx:158-160` | The toast renders `IconX` for every tone that is not `info`. | A successful save shows a red-looking ✕ glyph. Success and failure look the same. |
| 4 | `views/Library.tsx:59-62` | Delete calls `library:delete` immediately, with no confirmation, no toast and no error path. | One misclick permanently destroys a recording. Unacceptable for a recorder. |
| 5 | `views/Library.tsx:43-57` | `open()` has no `catch`. | An IPC rejection becomes an unhandled promise rejection and a silent no-op — the click just does nothing. |
| 6 | `views/Library.tsx:23-41` | Poster frames are fetched **serially**, one IPC per project, with no placeholder. | The grid pops in one card at a time; large libraries look broken while loading. |
| 7 | `views/Library.tsx:82` | The library is a bare grid — no title, no count, no search, no sort. | With 30 recordings the page is unusable. Every competitor has search. |
| 8 | `components/overlays.tsx:71-79` | `Select` trigger and items have no hover, focus or checked styling. | The most-used control in the editor looks like a native browser select. |
| 9 | `components/overlays.tsx:152-167` | Slider thumb has no hover, drag or focus state. | Dragging a slider gives no confirmation that it is grabbed. |
| 10 | `components/overlays.tsx:183-213` | `Switch` has no focus ring. | Keyboard users cannot see the focused control. |
| 11 | `components/overlays.tsx:17-69` | `Dialog` has no close affordance and no motion. | Escape is the only way out; it appears instantly, with no layering cue. |
| 12 | `components/overlays.tsx:255` | `paddingBottom: -1` — invalid CSS (negative padding), clearly meant `marginBottom: -1`. | Silent no-op; the tab underline never overlaps the border. |
| 13 | `views/EditorView.tsx:218-225` | Six panel tabs (`Motion / Style / Cam / Crop / Audio / CC`) at `px-3` + `text-sm` in a fixed 320 px rail. | The strip overflows with no scroll and no wrap. Also no `role="tablist"` semantics. |
| 14 | `renderer/styles.css` | Only two animations exist app-wide (`panel-in`, `anim-pop`); `anim-pop` is used in exactly zero places. | Route changes snap; overlays appear as if the compositor hiccupped. |
| 15 | `packages/ui/src/tokens.css:15` | `--surface-hover` is defined and never used (0 matches). | Evidence for #1/#8: the hover layer was designed and never wired. |
| 16 | `views/App.tsx:86` | `void editorOpen;` dead statement. | Noise in the one file every contributor reads first. |
| 17 | `views/App.tsx:84-91` | `openProject()` has no `try/catch`. | A corrupt project silently fails to open. |
| 18 | `views/App.tsx:143` | Toast is always `role="status"`, even for errors. | Screen readers announce failures as polite status updates. |
| 19 | `views/RecorderView.tsx:190` | The live recording timer is `Math.floor(elapsedUs / 1_000_000)` + `s`. | A 12-minute take reads `721s` instead of `12:01`. The one number a user stares at during a recording is not a clock. |

---

## Part 2 — The feel spec

### Type and surface

- One accent (`--accent`), one family, one scale. Already true — protect it.
- Elevation is earned: `--shadow-1` for resting controls, `--shadow-2` for floating rows, `--shadow-3` for
  dialogs and toasts. A card does not get a shadow until it is hovered or raised.
- Hairline borders at `--hairline` by default, `--hairline-strong` on interactive edges.

### The four states (non-negotiable)

Every clickable surface defines all of these:

| State | What changes |
|---|---|
| idle | token background, hairline border |
| hover | background moves one step up the surface ramp; border strengthens; primary gains glow |
| press | `translateY(0.5px)` + `scale(0.99)` (buttons), `scale(0.94)` (icon buttons) |
| focus-visible | 2 px accent ring, 2 px offset, visible on dark and light |
| disabled | 45 % opacity, `cursor: default`, no hover/press |

### Motion

- Durations are tokens: `--dur-fast` 120 ms (state), `--dur-base` 180 ms (panels), `--dur-slow` 240 ms
  (dialogs, toasts), `--dur-slower` 320 ms (view changes).
- Easing is `--ease-out` for everything entering, `--ease-in-out` only for reversible pairs.
- Enter from 4 px below + 0 opacity (panels), 8 px + 0.98 scale (toasts), 0.97 `scale` (dialogs).
- Never animate `width`, `height`, `top` or `left`. Transform and opacity only.
- Library cards stagger in with 24 ms steps, capped at 8 items.
- `prefers-reduced-motion: reduce` → animation `none`, transforms `none`, durations `0ms`.

### Layout laws

- The editor rail is 320 px and its tab strip scrolls horizontally instead of overflowing.
- Grids use `clamp()` gutters and collapse at 900 px and 640 px, not at arbitrary Tailwind breakpoints.
- Nothing is centred with `position: absolute` when flex does the job.

---

## Part 3 — Feature parity (Recordly / Capptivo), honestly

Already shipped and marked real in [STATUS.md](../STATUS.md): suggest zooms with a dwell heuristic, keystroke
HUD, live annotation toolbar, manual zoom keyframes, face-cam PiP, background image, cursor FX, export presets.

Next, in the order that produces visible value per unit of risk:

| # | Feature | Reference behaviour | Acceptance criteria |
|---|---|---|---|
| F1 | **Zoom regions** | Capptivo fragments / Recordly regions | Drag a rectangle on the preview; it becomes a zoom keyframe clamped to the media rect; scope chip chooses *recording only* or *full scene*; both preview and export read the same field |
| F2 | **Cursor loop + click sounds** | Recordly loop, Reframed click pack | One toggle in Motion; the last 400 ms glide the cursor back to its first sample; a bundled 3-sound pack (offline); export matches preview |
| F3 | **Spotlight** | Reframed | A timeline region dims everything outside a radius around the cursor; the compositor already understands `spotlight` annotations, so this is a control + data path |
| F4 | **Suggest zooms: review tray** | Recordly suggestions | Suggestions arrive as a reviewed list (accept / reject per item) before they become keyframes; count shown in the toast |
| F5 | **Per-track audio** | Reframed | Mic and system gain + mute on the timeline, persisted in the project, honoured by export |
| F6 | **Aspect re-aim** | Screen Studio | Switching to 9:16 re-projects every zoom centre and re-lays captions; safe-area guides toggle |
| F7 | **Library search, sort, rename** | every competitor | Search by name, sort by newest/oldest/longest, rename inline, all persisted |
| F8 | **Named presets** | Capptivo editor presets | Save look + cam + cursor + captions + export as one named object; import/export as `.recaststyle` |

F1–F4 are the "looks like Screen Studio" cluster. F5–F8 are table stakes.

---

## Part 4 — Phases

### Phase 0 — Feel foundation (this pass)

- [x] Interaction layer for `.rc-button`, `.rc-icon-button`, `.rc-select-*`, `.rc-slider-*`, `.rc-switch`,
      `.rc-dialog`, `.rc-toast`, `.rc-card`, `.rc-nav-button`, `.rc-tabstrip`, `.rc-skeleton`.
- [x] Every state in Part 2 implemented, reduced-motion safe.
- [x] Toast: correct icon per tone, `role="alert"` for errors, enter motion.
- [x] Reactive recording badge with a live elapsed timer.
- [x] Route transition between Library / Record / Editor / Export / Settings.
- [x] Editor panel tabs: scrollable strip, proper tab semantics.
- [x] Library: header, count, search, sort, two-step delete, error handling, parallel thumbnails,
      skeleton placeholders, staggered entrance.
- [x] Recording timer reads as a clock (`mm:ss` / `h:mm:ss`), in both the recorder and the title bar.
- [x] Dead code removed (`void editorOpen`).

### Phase 1 — Zoom intelligence polish (F1, F4)

Zoom regions, scope, suggestion review tray. Acceptance: a 60 s take becomes a narrated-looking demo in two
clicks, and every suggestion is individually rejectable.

### Phase 2 — Cursor and sound polish (F2, F3)

Cursor loop, bundled click pack, spotlight regions. Acceptance: a short clip loops seamlessly; click sounds are
offline and removable.

### Phase 3 — Audio and framing (F5, F6)

Per-track gain/mute, aspect re-aim, safe areas, reel preview.

### Phase 4 — Library and presets (F7, F8)

Search/sort/rename, named presets, bundled wallpaper pack.

### Phase 5 — Depth (from `docs/market-parity.md`)

Native capture per OS, GPU export, i18n, light-mode QA. Only after Phases 1–4 are verified on device.

---

## Part 5 — Verification

Per phase, in this order:

1. `pnpm typecheck` — no new `any`, no `@ts-expect-error`.
2. `pnpm lint` — zero warnings in touched files.
3. `pnpm test` — new pure logic has a unit test; the suite never shrinks.
4. `pnpm build` — three renderer entries still build.
5. `node scripts/check-docs.mjs` and `node scripts/check-website.mjs`.
6. Manual window pass: hover, press, Tab-through, `prefers-reduced-motion`, empty library, 30-item library,
   delete confirm, failed open.

**Honesty rule:** a checkbox in Part 4 is ticked only when all six steps passed. Anything else stays unticked
and is described as "in progress" in STATUS.md.

**Related**

- [market-parity.md](market-parity.md) — the competitor research
- [../prompts/parity-build-prompt.md](../prompts/parity-build-prompt.md) — the build brief
- [editing.md](editing.md) — editor model
- [../STATUS.md](../STATUS.md) — what is real today
