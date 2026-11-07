# Packaging — every installer target

Configs live in `apps/desktop/electron-builder.yml`; community-repo manifests in `packaging/`.

## Windows

| Artifact | Target | Notes |
|---|---|---|
| `Recast-Setup-x.y.z.exe` | NSIS | Per-user (`perMachine: false`), no UAC, install dir selectable, no data deletion on uninstall |
| `Recast-x.y.z-enterprise.msi` | MSI | Per-machine for GPO deployment |
| `Recast-Portable-x.y.z.exe` | Portable | `portable.marker` → settings next to exe when writable |
| `Recast-Setup-x.y.z-arm64.exe` | NSIS arm64 | `ARCH_SUFFIX=-arm64` env in CI |
| winget | `packaging/winget/` | Submitted after first signed release |
| Scoop | `packaging/scoop/` | auto-update via GitHub checkver |
| Chocolatey | `packaging/choco/` | Community repo submission |
| `.nsis-web` stub | optional | Not built yet (❌) |

## macOS

| Artifact | Notes |
|---|---|
| `Recast-x.y.z-arm64.dmg` | hardened runtime, entitlements (audio, camera, JIT) |
| `Recast-x.y.z-x64.dmg` | macos-13 runner |
| `Recast-x.y.z.pkg` | MDM installs |
| `Recast-x.y.z-<arch>-mac.zip` + `latest-mac.yml` | electron-updater feed |
| Homebrew cask | submitted after notarized releases exist |
| Universal DMG | ❌ not built yet (two slices shipped instead) |

## Linux

| Artifact | Notes |
|---|---|
| `Recast-x.y.z-x64.AppImage` | smoke-tested in CI (`--appimage-extract` + resource check) |
| `.deb`, `.rpm`, `.tar.gz` | depends: libgtk-3, libnss3, libasound2 |
| Flatpak | `packaging/flatpak/app.recast.desktop.json` (Flathub submission pending) |
| Snap | `packaging/snapcraft.yaml` (strict, gnome extension) |
| AUR | `packaging/aur/PKGBUILD` (hash filled from published SHA256SUMS) |

## File association & protocol

`.recast` (project) and `.recaststyle` (style preset) associations plus the `recast://` deep link (`app.setAsDefaultProtocolClient`, single-instance routed) are declared for all platforms.

## Scripts

```bash
pnpm dist:win        # NSIS + MSI + portable (x64)
pnpm dist:win:arm64  # arm64 suffix
pnpm dist:mac:arm64  # macos-14 runner
pnpm dist:mac        # universal build via macos-13 + macos-14 jobs
pnpm dist:linux      # AppImage + deb + rpm + tar.gz
```

## CI

`.github/workflows/build.yml`: five runner jobs (win x64, win arm64, mac arm64, mac x64, linux x64/arm64), FFmpeg caches keyed by the lockfile hash, AppImage smoke, then a release job that collects artifacts, writes `SHA256SUMS`, and publishes release notes on `v*` tags. Nightly on `main`.
