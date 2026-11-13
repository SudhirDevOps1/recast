# Changelog

All notable changes to Recast are documented here. Format: Keep a Changelog; versioning: SemVer.

## [0.0.3](https://github.com/SudhirDevOps1/recast/compare/v0.0.2...v0.0.3) (2026-11-13)


### Features

* **desktop:** face-cam PiP, background image, cursor FX controls, Library thumbnails, export presets, premium polish ([e9cf7bc](https://github.com/SudhirDevOps1/recast/commit/e9cf7bcc34ac6a6c9c08ba7bedd793d3ed904d5a))
* **editor:** add interactive frame cropping, webcam bubble controls, and GIF loop options ([a354c9b](https://github.com/SudhirDevOps1/recast/commit/a354c9b401d604cbec4fb9973b49ea72e4f73a44))
* **editor:** design panel — full color pickers, gradient presets + angle, echo controls, custom aspect, cursor styling surface; refresh app screenshots + docs ([600c76b](https://github.com/SudhirDevOps1/recast/commit/600c76bed6268844890086ec26a0840a5785a479))
* eliminate double cursor, add video import pipeline, optimize low-spec performance ([172a8fb](https://github.com/SudhirDevOps1/recast/commit/172a8fb9ed894a50a2d1e26a41803d53c62ecd3c))
* implement Recast end-to-end — capture, editor, export, packaging ([894a3d0](https://github.com/SudhirDevOps1/recast/commit/894a3d0d39e37f0ad2fbddc9a5b07f1fc1fef271))
* **mcp:** add Model Context Protocol server and in-app AI Copilot panel ([12c66fe](https://github.com/SudhirDevOps1/recast/commit/12c66fe24a54fa1769fcb146c80602b5eb3db398))
* **mcp:** complete AI copilot engine, cursor toggle and clean whisper stream checks ([a170b20](https://github.com/SudhirDevOps1/recast/commit/a170b2082ee32ff5be14a6918eef46719f14edc7))
* Motion 2.0 — animation editing (easing, transitions, fades, cursor FX) + Timeline 2.0 ([f088210](https://github.com/SudhirDevOps1/recast/commit/f088210b0408e00f72b1df680c4314ffca38e363))
* **recorder:** Capptivo-parity phase 2 — live source thumbnails, refresh, pause/resume fix, actionable toasts ([931c023](https://github.com/SudhirDevOps1/recast/commit/931c023e7a500aba8fd624f9bae396acb16685b3))
* release v0.1.4 - crash-safe stop flow, suggest zooms, keystroke HUD & live annotations ([48db629](https://github.com/SudhirDevOps1/recast/commit/48db629924bc7adca312cd71766d393f0d080cb2))
* **settings:** Diagnostics section with Copy diagnostics bundle ([822721e](https://github.com/SudhirDevOps1/recast/commit/822721efad842fba0a54ac0b40196a97e0aa697a))
* **studio-grade:** implement market-parity recording lifecycle, capture exclusion, live HUD and cosmic studio aesthetics ([285a462](https://github.com/SudhirDevOps1/recast/commit/285a462c604c5c8464873c561c064befeaf6920b))
* **ui:** premium interaction states, rebuilt library, and media fixes ([ec0d50c](https://github.com/SudhirDevOps1/recast/commit/ec0d50c46ba22c5f3e1be417be0cc3459bb3b3c7))
* **website:** per-file SHA-256 preview and a mobile sticky download bar ([bfb36ec](https://github.com/SudhirDevOps1/recast/commit/bfb36ec49ac346dabcc99a91118c160d48eb1f89))
* **website:** premium redesign with motion and live release data ([c86bda0](https://github.com/SudhirDevOps1/recast/commit/c86bda0217f3a99812dd23e35e2985192cda83d8))
* **website:** use cases, internals, verify and live release list ([f127b27](https://github.com/SudhirDevOps1/recast/commit/f127b27c573256a675c7fb50081e293eb660dbe3))


### Bug Fixes

* **build:** bundle @recast/mcp and configure headless flags for smoke runner ([e15fa06](https://github.com/SudhirDevOps1/recast/commit/e15fa06e44c4181639a152cb253e1851d82699b2))
* **build:** eliminate vite dynamic import warnings and lint hook dependencies ([c87c990](https://github.com/SudhirDevOps1/recast/commit/c87c990778f424118baa31f4937933a55bb79514))
* **capture:** optimize recording performance, stop button responsiveness, and audio extraction resilience ([2dfcada](https://github.com/SudhirDevOps1/recast/commit/2dfcada0a1e58b6b252c539b8c14afd93abaa24b))
* **capture:** recording froze after the first 2s segment ([568baa2](https://github.com/SudhirDevOps1/recast/commit/568baa2282cef4d83c7d0afb09927d6001ebbeda))
* **capture:** register display-media handler — getDisplayMedia was always denied on Electron &gt;=22, recording never started; add Capptivo-parity plan ([593392b](https://github.com/SudhirDevOps1/recast/commit/593392bfd5674cd69f5b17782687fd853b82a15f))
* **capture:** root-cause the Windows 'Not supported' recording failure ([0ed43d4](https://github.com/SudhirDevOps1/recast/commit/0ed43d4e7331e90f71cf3c607e4e31f4cf7429d1))
* **ci:** drop packageManager pin — conflicts with pnpm/action-setup version input ([5b28b29](https://github.com/SudhirDevOps1/recast/commit/5b28b291ec38a43a6f7cd2eceb46f0cccd2ffcb1))
* declare browser globals in screenshot script (eslint no-undef on window) ([3d941b9](https://github.com/SudhirDevOps1/recast/commit/3d941b919ef0422394ff62b80ba48185d29789c5))
* **desktop:** bundle workspace deps + CJS sandboxed preload, dev-safe updater, renderer process.platform via bridge, honest smoke assertions ([61342d8](https://github.com/SudhirDevOps1/recast/commit/61342d863f252bf37bde2d4466bb0dde4d112cf7))
* **desktop:** restore default permissions and enable immediate show in smoke mode ([bb95c0e](https://github.com/SudhirDevOps1/recast/commit/bb95c0e57bec051a38deae8680003f16dc0520ef))
* **editor:** drive preview decode videos through FrameSync + segment-local seek mapping ([b23432e](https://github.com/SudhirDevOps1/recast/commit/b23432e45edb0c08f8efd38715dff74dfbd3b26a))
* **editor:** fix cursor loading and zoom camera viewport bounds ([cd62c7d](https://github.com/SudhirDevOps1/recast/commit/cd62c7d03ea54c559ed73d9daacc986012f5846f))
* **export:** repair the full record→edit→export chain — six blockers found by live debugging ([7bd770c](https://github.com/SudhirDevOps1/recast/commit/7bd770c1f4897b913adfe1aa7f31107ab1705114))
* **ffmpeg:** persist TOFU pinning for existing binaries; pin real linux-x64 hashes ([9713ac8](https://github.com/SudhirDevOps1/recast/commit/9713ac8b53fa8c946b7505aa3765e4fb543c71b7))
* **ffmpeg:** skip manifest for targets without binaries (win32-arm64) ([9480e0c](https://github.com/SudhirDevOps1/recast/commit/9480e0c4fac7553e4af5741f7e37d0e12a7921d2))
* **lint:** replace control regex with NO_COLOR in version sync test ([9197ea8](https://github.com/SudhirDevOps1/recast/commit/9197ea8b6e895b659eda5e7698e06fa78b1b8b55))
* **main:** isolate single-instance lock and guard tray init in smoke test mode ([dd6e0c4](https://github.com/SudhirDevOps1/recast/commit/dd6e0c4be98df846d51d0b7e2c13e8860c1c4759))
* **media:** resolve Windows drive paths in the recast-media handler ([3ac57df](https://github.com/SudhirDevOps1/recast/commit/3ac57dfb54989d6c9150b0cc82748e9d95e8c256))
* **media:** serve range requests from the recast-media protocol ([5db6d7c](https://github.com/SudhirDevOps1/recast/commit/5db6d7c0c779ebb60b01c4d69a91a280bc8eea56))
* **onboarding:** persist firstRunDone — Welcome dialog reopened on every launch ([ffa9ee2](https://github.com/SudhirDevOps1/recast/commit/ffa9ee228da5684ad414e37f4c3445aa84e522c2))
* **packaging:** electron-builder 26 schema — drop nsis.perUser, rename linux.desktop to desktopEntry ([505216d](https://github.com/SudhirDevOps1/recast/commit/505216da47282e87b0ec2343a5794e5857415700))
* **packaging:** linux desktop file uses nested entry map (v26 schema), validated locally ([66884f3](https://github.com/SudhirDevOps1/recast/commit/66884f323d8c1fb9057ebe56a6987363686ef8b4))
* **perf:** keep Chromium media buffers off tiny /dev/shm ([6de2352](https://github.com/SudhirDevOps1/recast/commit/6de23522ced49392fa3238709d3bd258b4853c0a))
* **protocol:** remove unused net reference to restore green CI ([c4557df](https://github.com/SudhirDevOps1/recast/commit/c4557dffcb828af40fdb8e862351763e54fb1fd2))
* recast-media served absolute paths relative to process cwd — black preview/exports ([8deaa6f](https://github.com/SudhirDevOps1/recast/commit/8deaa6f21d1775d20bd9c21f42ff31bf372a67e8))
* **recorder:** anchor capture clock to epoch, exclude toolbar, and harden cursor/audio pipelines ([b3a08bb](https://github.com/SudhirDevOps1/recast/commit/b3a08bb76fc16037a587b8938f64b76967250509))
* resolve black preview via dynamic media protocol & expand floating stop toolbar ([46e45bc](https://github.com/SudhirDevOps1/recast/commit/46e45bc84705586359c7cae02272e8fff031ae88))
* **smoke:** align export button selector and label ([f677e48](https://github.com/SudhirDevOps1/recast/commit/f677e48418074d4c4a11bdb4272ed04ea5568671))
* **tests:** handle ANSI escape codes in version sync unit test ([032e47d](https://github.com/SudhirDevOps1/recast/commit/032e47d72c4d9930d7e57926e2b73b2738736d36))
* **toolbar:** reposition stop control upfront and widen toolbar window to 620px ([3ef5c0d](https://github.com/SudhirDevOps1/recast/commit/3ef5c0de370f0c6939a9da11c02cd8c312bf9e0a))
* **ui:** English-only interface — drop the Hindi locale ([8a7ebeb](https://github.com/SudhirDevOps1/recast/commit/8a7ebeb8cd31b77d9901fd13aebcd9e12d5d6f86))
* **website:** explain the no-JS download state instead of a stuck spinner ([0ddcdd4](https://github.com/SudhirDevOps1/recast/commit/0ddcdd42d1155ec4355d400d28184027919a533d))
* **website:** lift the muted label colour to AA contrast ([c8be647](https://github.com/SudhirDevOps1/recast/commit/c8be64754eaa2de48d364b609578338704ef96f0))
* **website:** platform-aware, no-JS-proof downloads with feedback ([63d3835](https://github.com/SudhirDevOps1/recast/commit/63d3835474847fc6191d4d6310f7f04579bb093d))
* **website:** stop the hero version chip claiming v0.1.1 when release data fails ([d668e55](https://github.com/SudhirDevOps1/recast/commit/d668e55be4a7661457b6494e930877d746091205))
* **website:** stop the hidden mobile menu from swallowing every click ([ec2d35d](https://github.com/SudhirDevOps1/recast/commit/ec2d35d83d3a9cb03808843934acba949239d8ef))
* **website:** the FAQ accordion never opened its answer ([212f09b](https://github.com/SudhirDevOps1/recast/commit/212f09b891aeee8b8d40db0e13e670e9e327a090))
* **website:** trim meta description to search-result length ([2bd5cc4](https://github.com/SudhirDevOps1/recast/commit/2bd5cc4c7a333a092d000a9a83529e076c7a3673))
* **website:** version asset URLs so a fix is not hidden behind a 10-minute cache ([ce88343](https://github.com/SudhirDevOps1/recast/commit/ce88343ad5eab8b6b6f3d6d2b4026a4bc1ddf7f0))

## [0.0.2](https://github.com/SudhirDevOps1/recast/compare/v0.0.1...v0.0.2) (2026-11-12)


### Features

* **desktop:** face-cam PiP, background image, cursor FX controls, Library thumbnails, export presets, premium polish ([e9cf7bc](https://github.com/SudhirDevOps1/recast/commit/e9cf7bcc34ac6a6c9c08ba7bedd793d3ed904d5a))
* **editor:** add interactive frame cropping, webcam bubble controls, and GIF loop options ([a354c9b](https://github.com/SudhirDevOps1/recast/commit/a354c9b401d604cbec4fb9973b49ea72e4f73a44))
* **editor:** design panel — full color pickers, gradient presets + angle, echo controls, custom aspect, cursor styling surface; refresh app screenshots + docs ([600c76b](https://github.com/SudhirDevOps1/recast/commit/600c76bed6268844890086ec26a0840a5785a479))
* eliminate double cursor, add video import pipeline, optimize low-spec performance ([172a8fb](https://github.com/SudhirDevOps1/recast/commit/172a8fb9ed894a50a2d1e26a41803d53c62ecd3c))
* implement Recast end-to-end — capture, editor, export, packaging ([894a3d0](https://github.com/SudhirDevOps1/recast/commit/894a3d0d39e37f0ad2fbddc9a5b07f1fc1fef271))
* **mcp:** add Model Context Protocol server and in-app AI Copilot panel ([12c66fe](https://github.com/SudhirDevOps1/recast/commit/12c66fe24a54fa1769fcb146c80602b5eb3db398))
* **mcp:** complete AI copilot engine, cursor toggle and clean whisper stream checks ([a170b20](https://github.com/SudhirDevOps1/recast/commit/a170b2082ee32ff5be14a6918eef46719f14edc7))
* Motion 2.0 — animation editing (easing, transitions, fades, cursor FX) + Timeline 2.0 ([f088210](https://github.com/SudhirDevOps1/recast/commit/f088210b0408e00f72b1df680c4314ffca38e363))
* **recorder:** Capptivo-parity phase 2 — live source thumbnails, refresh, pause/resume fix, actionable toasts ([931c023](https://github.com/SudhirDevOps1/recast/commit/931c023e7a500aba8fd624f9bae396acb16685b3))
* release v0.1.4 - crash-safe stop flow, suggest zooms, keystroke HUD & live annotations ([48db629](https://github.com/SudhirDevOps1/recast/commit/48db629924bc7adca312cd71766d393f0d080cb2))
* **settings:** Diagnostics section with Copy diagnostics bundle ([822721e](https://github.com/SudhirDevOps1/recast/commit/822721efad842fba0a54ac0b40196a97e0aa697a))
* **studio-grade:** implement market-parity recording lifecycle, capture exclusion, live HUD and cosmic studio aesthetics ([285a462](https://github.com/SudhirDevOps1/recast/commit/285a462c604c5c8464873c561c064befeaf6920b))
* **ui:** premium interaction states, rebuilt library, and media fixes ([ec0d50c](https://github.com/SudhirDevOps1/recast/commit/ec0d50c46ba22c5f3e1be417be0cc3459bb3b3c7))
* **website:** per-file SHA-256 preview and a mobile sticky download bar ([bfb36ec](https://github.com/SudhirDevOps1/recast/commit/bfb36ec49ac346dabcc99a91118c160d48eb1f89))
* **website:** premium redesign with motion and live release data ([c86bda0](https://github.com/SudhirDevOps1/recast/commit/c86bda0217f3a99812dd23e35e2985192cda83d8))
* **website:** use cases, internals, verify and live release list ([f127b27](https://github.com/SudhirDevOps1/recast/commit/f127b27c573256a675c7fb50081e293eb660dbe3))


### Bug Fixes

* **build:** bundle @recast/mcp and configure headless flags for smoke runner ([e15fa06](https://github.com/SudhirDevOps1/recast/commit/e15fa06e44c4181639a152cb253e1851d82699b2))
* **capture:** optimize recording performance, stop button responsiveness, and audio extraction resilience ([2dfcada](https://github.com/SudhirDevOps1/recast/commit/2dfcada0a1e58b6b252c539b8c14afd93abaa24b))
* **capture:** recording froze after the first 2s segment ([568baa2](https://github.com/SudhirDevOps1/recast/commit/568baa2282cef4d83c7d0afb09927d6001ebbeda))
* **capture:** register display-media handler — getDisplayMedia was always denied on Electron &gt;=22, recording never started; add Capptivo-parity plan ([593392b](https://github.com/SudhirDevOps1/recast/commit/593392bfd5674cd69f5b17782687fd853b82a15f))
* **capture:** root-cause the Windows 'Not supported' recording failure ([0ed43d4](https://github.com/SudhirDevOps1/recast/commit/0ed43d4e7331e90f71cf3c607e4e31f4cf7429d1))
* **ci:** drop packageManager pin — conflicts with pnpm/action-setup version input ([5b28b29](https://github.com/SudhirDevOps1/recast/commit/5b28b291ec38a43a6f7cd2eceb46f0cccd2ffcb1))
* declare browser globals in screenshot script (eslint no-undef on window) ([3d941b9](https://github.com/SudhirDevOps1/recast/commit/3d941b919ef0422394ff62b80ba48185d29789c5))
* **desktop:** bundle workspace deps + CJS sandboxed preload, dev-safe updater, renderer process.platform via bridge, honest smoke assertions ([61342d8](https://github.com/SudhirDevOps1/recast/commit/61342d863f252bf37bde2d4466bb0dde4d112cf7))
* **desktop:** restore default permissions and enable immediate show in smoke mode ([bb95c0e](https://github.com/SudhirDevOps1/recast/commit/bb95c0e57bec051a38deae8680003f16dc0520ef))
* **editor:** drive preview decode videos through FrameSync + segment-local seek mapping ([b23432e](https://github.com/SudhirDevOps1/recast/commit/b23432e45edb0c08f8efd38715dff74dfbd3b26a))
* **editor:** fix cursor loading and zoom camera viewport bounds ([cd62c7d](https://github.com/SudhirDevOps1/recast/commit/cd62c7d03ea54c559ed73d9daacc986012f5846f))
* **export:** repair the full record→edit→export chain — six blockers found by live debugging ([7bd770c](https://github.com/SudhirDevOps1/recast/commit/7bd770c1f4897b913adfe1aa7f31107ab1705114))
* **ffmpeg:** persist TOFU pinning for existing binaries; pin real linux-x64 hashes ([9713ac8](https://github.com/SudhirDevOps1/recast/commit/9713ac8b53fa8c946b7505aa3765e4fb543c71b7))
* **ffmpeg:** skip manifest for targets without binaries (win32-arm64) ([9480e0c](https://github.com/SudhirDevOps1/recast/commit/9480e0c4fac7553e4af5741f7e37d0e12a7921d2))
* **main:** isolate single-instance lock and guard tray init in smoke test mode ([dd6e0c4](https://github.com/SudhirDevOps1/recast/commit/dd6e0c4be98df846d51d0b7e2c13e8860c1c4759))
* **media:** resolve Windows drive paths in the recast-media handler ([3ac57df](https://github.com/SudhirDevOps1/recast/commit/3ac57dfb54989d6c9150b0cc82748e9d95e8c256))
* **media:** serve range requests from the recast-media protocol ([5db6d7c](https://github.com/SudhirDevOps1/recast/commit/5db6d7c0c779ebb60b01c4d69a91a280bc8eea56))
* **onboarding:** persist firstRunDone — Welcome dialog reopened on every launch ([ffa9ee2](https://github.com/SudhirDevOps1/recast/commit/ffa9ee228da5684ad414e37f4c3445aa84e522c2))
* **packaging:** electron-builder 26 schema — drop nsis.perUser, rename linux.desktop to desktopEntry ([505216d](https://github.com/SudhirDevOps1/recast/commit/505216da47282e87b0ec2343a5794e5857415700))
* **packaging:** linux desktop file uses nested entry map (v26 schema), validated locally ([66884f3](https://github.com/SudhirDevOps1/recast/commit/66884f323d8c1fb9057ebe56a6987363686ef8b4))
* **perf:** keep Chromium media buffers off tiny /dev/shm ([6de2352](https://github.com/SudhirDevOps1/recast/commit/6de23522ced49392fa3238709d3bd258b4853c0a))
* **protocol:** remove unused net reference to restore green CI ([c4557df](https://github.com/SudhirDevOps1/recast/commit/c4557dffcb828af40fdb8e862351763e54fb1fd2))
* recast-media served absolute paths relative to process cwd — black preview/exports ([8deaa6f](https://github.com/SudhirDevOps1/recast/commit/8deaa6f21d1775d20bd9c21f42ff31bf372a67e8))
* **recorder:** anchor capture clock to epoch, exclude toolbar, and harden cursor/audio pipelines ([b3a08bb](https://github.com/SudhirDevOps1/recast/commit/b3a08bb76fc16037a587b8938f64b76967250509))
* resolve black preview via dynamic media protocol & expand floating stop toolbar ([46e45bc](https://github.com/SudhirDevOps1/recast/commit/46e45bc84705586359c7cae02272e8fff031ae88))
* **smoke:** align export button selector and label ([f677e48](https://github.com/SudhirDevOps1/recast/commit/f677e48418074d4c4a11bdb4272ed04ea5568671))
* **toolbar:** reposition stop control upfront and widen toolbar window to 620px ([3ef5c0d](https://github.com/SudhirDevOps1/recast/commit/3ef5c0de370f0c6939a9da11c02cd8c312bf9e0a))
* **ui:** English-only interface — drop the Hindi locale ([8a7ebeb](https://github.com/SudhirDevOps1/recast/commit/8a7ebeb8cd31b77d9901fd13aebcd9e12d5d6f86))
* **website:** explain the no-JS download state instead of a stuck spinner ([0ddcdd4](https://github.com/SudhirDevOps1/recast/commit/0ddcdd42d1155ec4355d400d28184027919a533d))
* **website:** lift the muted label colour to AA contrast ([c8be647](https://github.com/SudhirDevOps1/recast/commit/c8be64754eaa2de48d364b609578338704ef96f0))
* **website:** platform-aware, no-JS-proof downloads with feedback ([63d3835](https://github.com/SudhirDevOps1/recast/commit/63d3835474847fc6191d4d6310f7f04579bb093d))
* **website:** stop the hero version chip claiming v0.1.1 when release data fails ([d668e55](https://github.com/SudhirDevOps1/recast/commit/d668e55be4a7661457b6494e930877d746091205))
* **website:** stop the hidden mobile menu from swallowing every click ([ec2d35d](https://github.com/SudhirDevOps1/recast/commit/ec2d35d83d3a9cb03808843934acba949239d8ef))
* **website:** the FAQ accordion never opened its answer ([212f09b](https://github.com/SudhirDevOps1/recast/commit/212f09b891aeee8b8d40db0e13e670e9e327a090))
* **website:** trim meta description to search-result length ([2bd5cc4](https://github.com/SudhirDevOps1/recast/commit/2bd5cc4c7a333a092d000a9a83529e076c7a3673))
* **website:** version asset URLs so a fix is not hidden behind a 10-minute cache ([ce88343](https://github.com/SudhirDevOps1/recast/commit/ce88343ad5eab8b6b6f3d6d2b4026a4bc1ddf7f0))

## [Unreleased]

### Fixed
- **Face-cam PiP never appeared in the preview or in exports.** MediaRecorder writes the camera as a streaming WebM with no duration and no cues, so Chromium reports `duration = Infinity`, an empty `seekable` range, and silently refuses to move `currentTime`. Both the editor compositor and the export renderer seek the camera by time, so every frame showed the (transparent) first snapshot — the gold ring with nothing inside. Camera takes are now remuxed losslessly (`ffmpeg -c copy`, no re-encode, ~1 s) into an indexed WebM when the recorder writes them, and existing recordings are healed the first time they are opened. Verified by sampling the preview canvas (camera pixels now composited) and by the camera element reporting a seekable 50.3 s duration.
- **Editor preview stayed black on open.** The decode pipeline already had the frames — `FrameSync` was capturing snapshots and firing its redraw signal, but the canvas draw effect did not depend on that signal, so the first paint (before the videos finished loading) was never replaced. The redraw tick is now part of the effect dependencies; the preview shows real content as soon as the first frame is paintable.
- Every interactive control now has hover, press, focus-visible and disabled states. `Button`/`IconButton` pushed their colours as an inline `background` shorthand, which silently overrode any hover rule; they now expose component custom properties (`--rc-btn-*`, `--rc-icon-*`) that the shared stylesheet can override.
- Select trigger/items, Slider thumb, Switch, Dialog, Card and panel tabs all gained the same state layer, plus reduced-motion guards.
- Dialog has a close button and enter motion; `Tabs` no longer sets an invalid `padding-bottom: -1`.
- Switch thumb animates `transform` instead of `left` (no layout pass per frame).
- The **Recording** badge is reactive, and both it and the recorder view show a real clock (`mm:ss` / `h:mm:ss`) instead of raw seconds.
- Toasts use a tone-correct icon (`warning` / `check` / `sparkle`) and `role="alert"` for errors, so failures and successes no longer look identical.
- Library delete is two-step with a toast and an error path; opening a recording catches IPC failures instead of silently doing nothing.
- Timeline no longer prints a truncated segment id and two trim grips on blocks under 60 px; segment blocks stay selectable and trimmable, they just stop pretending to have room for a label.
- The "Zoom Intelligence" row no longer overflows the 320 px editor rail — the heuristic select is full width and the action sits below it.
- `recorder:requestStop` clears recorder state in `finally`, so a failed stop cannot leave the app in a recording state.
- Fixed a pre-existing lint error in `packages/capture/src/audio-mixer.ts` (unused catch binding).

### Added
- Library: header with count, search, sort (newest / oldest / longest / name), poster thumbnails fetched four at a time with skeleton placeholders, staggered card entrance, hover play affordance, and an empty "no matches" state.
- View transitions between Library, Record, Editor, Export and Settings; toast and dialog motion; shared `.rc-skeleton`, `.rc-card`, `.rc-stagger` and `.rc-tabstrip` primitives.
- `docs/premium-plan.md`: the code-level audit, the feel spec (five states, motion tokens, layout laws) and the Recordly/Capptivo feature roadmap (F1–F8) with an honesty rule for ticking anything off.

### Changed
- Editor panel tabs are a scrollable tab strip with `role="tablist"` / `aria-selected` semantics.

## [0.1.4] - 2026-11-10

### Fixed
- App crash / hang on stop flow: hardened `stopRecordingFlow()` in the renderer and `recorder:stop` in the main process with try/catch/finally, guaranteed resource release, and explicit cleanup of auxiliary floating windows (`toolbarWindow`, `areaWindow`) preventing orphaned processes and UI lockups.
- The hidden mobile menu no longer swallows clicks on small screens.
- The hero version chip no longer advertises a stale version when release data cannot be fetched.
- Small print and footer copy lifted to WCAG AA contrast (3.31:1 to about 5:1); Lighthouse accessibility is now 100.

### Added
- **Suggest zooms** (P0-1): Auto-zoom suggestions based on click clustering and dwell detection (cursor stillness <= 8 px for >= 500 ms) in the Motion panel. Pure function covered by unit tests.
- **Keystroke HUD** (P0-3): Real-time keycap overlays captured via `uiohook-napi` in the main sampler, batched into `cursor.jsonl`, and rendered through the shared compositor identically in preview and export.
- **Live Annotation Toolbar** (P0-2): Floating, draggable annotation toolbar offering Pen, Highlighter, Arrow, Rect tools, and color palette with non-blocking vector logging.
- Market research on the free open-source screen recorders (`docs/market-parity.md`): what Capptivo, OpenScreen, Recordly, Capturia, Focra, Reframed, screenize and OpenScreenStudio actually do, how their zoom, cursor, annotation, audio and export engines work, and where Recast stands against them - recorded as behaviour to copy, never as code.
- `prompts/parity-build-prompt.md` - the build brief for closing that gap in P0-P3 order (suggest zooms, live annotation toolbar, keystroke HUD, fixed zoom regions, cursor loop + click sounds + spotlight, per-track audio, aspect re-aim, platform export presets, native capture, i18n).
- Website download UX rebuild (`apps/website/`): platform-aware download tabs (Windows / macOS / Linux, with iPadOS and Android detected so a phone is never offered a 277 MB installer), an Apple Silicon / Intel switch that picks the matching DMG, a recommended-file tag, per-file sizes, a per-file SHA-256 preview (GitHub publishes a digest per release asset), a download toast carrying the file name and size, a direct `SHA256SUMS` link, a mobile sticky bar that offers to copy the page link, and a `noscript` note that states plainly what needs JavaScript.
- `scripts/check-website.mjs` — markup and asset audit (duplicate ids, in-page anchors, missing local files, `rel=noopener`, third-party scripts, asset-version drift, optional release-asset HEAD checks). Runs in the Website workflow before every Pages deploy.
- `scripts/check-docs.mjs` — documentation audit (relative links, in-page anchors, code-fence balance). Runs in the CI docs job.
- Enterprise documentation set: rewritten README (value props, capability table with honest state markers, mermaid architecture map, install matrix, audience-based doc map), new `docs/deployment.md`, `docs/security.md` and `docs/support.md`, a rebuilt `docs/architecture.md`, an at-a-glance table for platform support, and "Related" footers across the doc set.
- Nightly build labelling now shows the real build version carried by the assets, and the release list marks the latest stable versus nightly explicitly.

### Changed
- Test suite grew to 13 files / 95 tests (added `packages/editor/tests/suggest-zooms.test.ts`).

## [0.1.3] - 2026-11-10

### Fixed
- Editor preview showed random black frames - two stacked root causes, both now closed:
  - the hidden per-segment `<video>` decode elements behind the canvas preview were **never seeked or played**, so the preview sat frozen on frame 0 and the compositor filled the screen rect solid black whenever no frame was paintable. `packages/editor/src/frame-sync.ts` (FrameSync) drives them now: precise seeks while scrubbing (40 ms tolerance), playback at the clip's speed with a 120 ms hard resync, and a last-good-frame snapshot so the canvas never collapses to black mid-decode.
  - segment files are written with `firstTimestampBehavior: 'offset'` (file time starts at 0) while seeks used raw capture-clock times - every segment after the first (~2 s) seeked past its end ("black every few seconds"). All preview and export seeks now map through `segmentLocalTimeUs()`.

### Added
- Opt-in face-cam picture-in-picture, full slice: **Face camera** toggle + device picker (default-device fallback on unplug) -> renderer-side MediaRecorder track (`cam-0.webm`, VP8/VP9, timeslice) written additively beside the screen pipeline, so a camera failure can never block or corrupt the screen take -> manifest `project.media.camera` -> compositor PiP (corner position, width %, round crop, mirror, shadow, border, margin, opacity) -> editor Cam panel -> exporter seek + draw. Honest caveat: cam timing follows the capture clock, so takes that use pause may drift slightly in the overlay.
- Background image support: pick an image (copied into the session directory) and render it behind the screen card in preview and export.
- Cursor FX controls now exposed in the panel: smoothing, motion trail, click bounce.
- Library poster thumbnails: the ffmpeg poster frame is persisted as `thumbnail.png` instead of being re-spawned per visit, with a no-ffmpeg fallback that streams the first segment.
- Export presets in the export view.
- Premium UI polish pass.

### Changed
- Test suite grew to 12 files / 92 tests (was 9 / 76).

## [0.1.2] - 2026-11-10

### Fixed
- Windows editor preview: the `recast-media://` handler rebuilt absolute paths with `path.resolve('/' + decoded)`, which re-rooted `C:\...` into `\C:\...` and 404-ed every media request - the preview stayed black, export could not decode segments and thumbnails were dead. Fixed with `mediaPathFromUrl` and cross-platform regression tests (Node's win32/posix path modules run on any host). On-device Windows re-verification is still open.

### Changed
- Website redesign with motion, use cases, an internals pipeline, a verify panel and a live release list.
- Asset URLs are versioned so a fix is not hidden behind the 10-minute Pages cache.
- Meta description trimmed to search-result length.

## [0.1.1] - 2026-11-09

### Added
- Settings - Diagnostics with **Copy diagnostics bundle**: app/OS/FFmpeg/display-permission summary plus the last 200 lines of `capture.log`.
- Encoder-probe tests: the fallback chain can never escape a raw `DOMException`.
- Recorder phase 2: live source thumbnails, refresh, pause/resume fix and actionable toasts.
- A real end-to-end demo GIF in the README.

### Fixed
- Windows "Recording failed: Not supported" root-caused: `isConfigSupported()` is no longer trusted - every encoder candidate must actually `configure()` and drain a canary frame (`packages/capture/src/encoder-probe.ts`). A MediaRecorder compatibility mode still records VP8/VP9 when WebCodecs fails.
- `getDisplayMedia` was always denied on Electron >= 22 - the display-media handler is now registered in the main process, and the display stream is acquired synchronously inside the click handler before the countdown.
- Recording froze after the first 2 s segment.
- The full record - edit - export chain had six blockers, found by live debugging and repaired.
- `recast-media` served absolute paths relative to the process working directory - black preview and exports.
- Range requests are served from the `recast-media` protocol; Chromium media buffers are kept off a tiny `/dev/shm`; `firstRunDone` persists so the welcome dialog stops reopening on every launch; the interface is English-only.
- CI mirrors Electron and electron-builder downloads through npmmirror, and the smoke job installs FFmpeg for the synthetic-segment export test.

## [0.1.0] - initial build

### Added
- Monorepo: `apps/desktop` + `@recast/shared`, `@recast/capture`, `@recast/editor`, `@recast/export`, `@recast/ui`.
- Recording: screen/window/area sources via `desktopCapturer` + `setDisplayMediaRequestHandler`, WebCodecs `VideoEncoder` (hardware-preferred) with `mp4-muxer` segmentation every 2 s, atomic `session.json` manifest, `cursor.jsonl` input log (60 Hz sampling + uiohook-napi clicks/scroll), AudioWorklet mixer with separate mic/system tracks at 48 kHz Opus, pause/resume with clock compensation, global hotkeys, tray with live timer.
- Crash recovery: session scan, segment salvage plan, `ffmpeg -c copy` remux.
- Editor: pure compositor shared by preview and export; auto-zoom (interest detection -> clustering -> fit-clamped keyframes -> critically damped spring track), manual keyframes, follow-cursor mode (18 % dead zone, clamped pan), timeline with split/ripple delete, undo/redo, six built-in style presets, `.recaststyle` import/export, aspect ratios, frame/background system, command palette.
- Export: frame-clock renderer, encoder fallback chain (HW H.264 -> SW H.264 -> VP9/WebM), incremental positional MP4 writes, cancel-safe `.part` handling, ffprobe verification, GIF/ProRes via FFmpeg frame pipe, -14 LUFS loudnorm post-pass.
- FFmpeg safety net: `fetch-ffmpeg.mjs` + `ffmpeg.lock.json` with pinned SHA-256 hashes (registry-integrity-verified ffprobe tarballs), resolution chain env -> bundled -> user dir -> system PATH, in-app downloader with rollback, GPL licensing documentation.
- Captions (scaffolded, untested end-to-end): whisper.cpp sidecar with model manager, SRT/VTT import/export, burn-in styles.
- Packaging: electron-builder matrix (NSIS per-user, MSI, portable, arm64, DMG, pkg, zip, AppImage, deb, rpm, tar.gz), Flatpak/Snap/AUR/winget/Scoop/Chocolatey manifests, GitHub Actions verify + build matrices with SHA256SUMS release job.
- Design system: dark-first tokens with true light mode, 4 pt spacing, one accent, motion tokens, `prefers-reduced-motion`, custom title bar, accessibility pass (focus rings, ARIA roles, tabular numerals).
- Docs set: architecture, recording, editing, export, ffmpeg, platform support, build, packaging, code signing, keyboard shortcuts, troubleshooting, roadmap + honest STATUS.md.
