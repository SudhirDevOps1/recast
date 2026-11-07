# FFmpeg

Status: specification. Implementation starts in Phase 1.

Recast ships FFmpeg. Not as the primary engine — as the **safety net and utility layer**.

## Why it exists

| Job | Why FFmpeg |
|---|---|
| Probe media | `ffprobe` is the only reliable way to read real container/stream metadata |
| Recover a crashed recording | Remux fragmented segments with `-c copy` — no quality loss, no re-encode |
| Thumbnails and filmstrip | Fast keyframe extraction for the library and timeline |
| Proxy generation | 4K → 720p proxy once, so scrubbing stays at 60 fps |
| Audio extraction | 16 kHz mono WAV for Whisper |
| GIF export | Palette optimization that no browser API does well |
| Software fallback | `libx264` when hardware encode is unavailable |
| Loudness | `loudnorm` two-pass for −14 LUFS normalization |

The default record → edit → export path uses **WebCodecs** and never shells out. FFmpeg is invoked only when it is the correct tool, or when something else failed.

## What is bundled

Per platform and architecture:

```
resources/ffmpeg/
  win32-x64/      ffmpeg.exe  ffprobe.exe
  win32-arm64/    ffmpeg.exe  ffprobe.exe
  darwin-arm64/   ffmpeg      ffprobe
  darwin-x64/     ffmpeg      ffprobe
  linux-x64/      ffmpeg      ffprobe
  linux-arm64/    ffmpeg      ffprobe
```

- Binaries are **never committed** to git. They are fetched at build time.
- electron-builder copies only the current target's folder and marks it `asarUnpack`, so the executables stay runnable.
- Binaries are stripped before packaging. Target: ≤ 45 MB added per platform (compressed installer delta is smaller).

## The lockfile

`ffmpeg.lock.json` pins everything:

```json
{
  "version": "7.1",
  "license": "GPL-3.0",
  "builds": {
    "win32-x64": {
      "url": "https://.../ffmpeg-7.1-win64-gpl.zip",
      "sha256": "…",
      "binaries": ["ffmpeg.exe", "ffprobe.exe"]
    }
  }
}
```

Rules:

- A version bump is its own PR, with the upstream changelog linked.
- The SHA-256 is verified **before** extraction; a mismatch aborts the build.
- CI caches the downloaded archive keyed by URL + hash.
- The provenance URL and license text ship in `resources/ffmpeg/LICENSE.txt`.

## Build script

`scripts/fetch-ffmpeg.mjs`:

1. Reads `ffmpeg.lock.json` and the current `process.platform` / `process.arch`.
2. Skips if the target directory already matches the recorded hash.
3. Downloads with retry and resume into `.cache/`.
4. Verifies SHA-256, extracts only the needed binaries, strips them.
5. Writes `resources/ffmpeg/<platform>-<arch>/.manifest.json` with version, hash, and `ffmpeg -version` output.
6. Fails the build loudly if anything is missing.

Runs automatically from `prebuild`, `predist:*`, and CI.

## Runtime resolution

```
1. RECAST_FFMPEG                  (developer / power-user override)
2. <resources>/ffmpeg/<os>-<arch>/ (bundled)
3. <userData>/bin/ffmpeg/          (previously downloaded)
4. in-app download offer           (consent required)
```

- On launch, main validates the binary: exists, executable, `ffmpeg -version` succeeds within 2 s.
- A failed validation does not crash the app. Affected features show a precise message and a "Repair" button.
- Every invocation uses `spawn(binary, args)` with `shell: false`, an argument array, a timeout, and cancellation that kills the process tree.
- Never interpolate user filenames into a shell string.

## In-app download

When the bundled binary is missing (trimmed build, corrupted install, unsupported arch):

1. Explain what is needed and why, with the license and size.
2. Download to `<userData>/bin/ffmpeg.download` with resume support.
3. Verify SHA-256 against the signed manifest.
4. Atomically rename into place; delete the previous copy only after success.
5. If verification fails, discard the file and offer a retry — never run an unverified binary.

The download is **optional**. Without it, Recast still records and exports via WebCodecs; only utility features degrade.

## Licensing

This is the part people get wrong.

- FFmpeg builds that include **libx264 / libx265** are **GPL**. Linking or bundling them with the app makes the combined work GPL.
- **Recast therefore ships as GPL-3.0-or-later.** That is a deliberate, documented choice: it keeps `libx264` available as a software fallback and keeps distribution simple.
- The alternative — an **MIT/Apache app** — requires an **LGPL FFmpeg build without libx264/libx265**, hardware encoders for H.264, and a separately licensed software encoder such as Cisco OpenH264. That path is more complex and is documented here so nobody "accidentally" relicenses.

If the license ever changes:

1. Update `LICENSE`, `README.md`, `package.json`, and this document in the same PR.
2. Rebuild the FFmpeg matrix with the correct configure flags.
3. Re-check every bundled dependency for compatibility.
4. Note the change in `CHANGELOG.md` with the date and reason.

## Update policy

- FFmpeg is pinned, not floating. No "latest" URLs.
- Review quarterly, or immediately for a security advisory.
- A bump must pass the full export matrix and the golden-frame test before merge.
- The version is surfaced in **Settings → About → Media engine**.

## Verification checklist

- [ ] `ffmpeg -version` and `ffprobe -version` run from the packaged app on all six targets.
- [ ] A recording recovered after a forced crash remuxes with `-c copy` and plays.
- [ ] Export still works after deleting the bundled binaries (WebCodecs path).
- [ ] Deleting bundled binaries triggers the download prompt, not a stack trace.
- [ ] Tampered binary hash is rejected.
- [ ] Installer size stays within budget.
