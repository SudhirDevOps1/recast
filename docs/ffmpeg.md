# FFmpeg — the safety net and utility layer

Recast's core record → edit → export path runs on WebCodecs and never shells out. FFmpeg is used for:

- probing (`ffprobe`) and post-export verification
- crash-recovery remux (`-f concat -c copy`)
- thumbnails / filmstrips
- Whisper audio extraction (16 kHz mono WAV)
- GIF encode (`palettegen` → `paletteuse`, bayer dither)
- ProRes encode (`prores_ks`, frame pipe)
- two-pass `loudnorm` (−14 LUFS)

## Resolution order (launch time)

1. `RECAST_FFMPEG` / `RECAST_FFPROBE` env overrides
2. bundled `resources/ffmpeg/<platform>-<arch>/`
3. `<userData>/bin/ffmpeg/` (in-app download)
4. system `PATH`

Validation: `ffmpeg -version` with a **2 s timeout** at launch. A missing or broken binary never crashes the app — the status surfaces in Settings → Media engine, affected features show a precise message and a **Repair** button.

## Bundling

- `scripts/fetch-ffmpeg.mjs` downloads per `ffmpeg.lock.json` (pinned version + URL + SHA-256 + member list), verifies hashes **before** the binary is used, quarantines mismatches as `.unverified`, and writes a `manifest.json` next to the binaries.
- ffprobe binaries come from the `ffprobe-static@3.1.0` npm tarball, additionally verified against the registry's official `dist.integrity` sha512 before extraction.
- Hash pinning is TOFU: `node scripts/fetch-ffmpeg.mjs --pin` records the first verified SHA-256 into the lockfile; every later fetch (and CI) verifies against it. linux-x64 is pinned already.
- CI caches `resources/ffmpeg/<target>` keyed by `hashFiles('ffmpeg.lock.json')`.
- electron-builder ships only the current target's folder via `extraResources` and marks it `asarUnpack` so binaries stay executable.
- `win32-arm64` and `linux-arm64` (ffprobe) have no prebuilt sources yet — the app degrades to the in-app downloader there, stated in docs/platform-support.md.

## In-app download (only when bundled copy is missing/corrupt)

Explains why it's needed → shows size and license → downloads with resume → verifies SHA-256 against the pinned manifest → atomically installs → never executes an unverified binary → rolls back (deletes `.part`) on any failure.

## Security

`spawn(binary, args)` with `shell: false`, argument arrays, timeouts, and process-tree kill on cancel (`taskkill /T /F` on Windows, `kill(-pid)` on POSIX process groups). Filenames are never interpolated into shell strings.

## Licensing

The pinned builds (ffmpeg-static b6.0) are GPL builds including libx264/libx265. Shipping them alongside Recast makes **Recast GPL-3.0-or-later** (`LICENSE` at the repo root; notice also shipped as `resources/ffmpeg/LICENSE.txt` next to the binaries).

If you redistribute Recast **without** the GPL FFmpeg binaries (WebCodecs-only paths, hardware encoders, OpenH264), your build can carry a different license per your own GPL-compliance analysis — FFmpeg's LGPL build options are documented upstream. What you may not do is ship the bundled GPL binaries under a different license.
