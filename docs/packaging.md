# Packaging

Status: specification. The full matrix is the release contract — a release is not done until every row builds green in CI.

## Artifact matrix

| OS | Artifact | Tool | Purpose | Notes |
|---|---|---|---|---|
| Windows | `Recast-Setup-x.y.z.exe` | electron-builder NSIS | Default installer | Per-user, no UAC, desktop + Start Menu shortcuts |
| Windows | `Recast-x.y.z.msi` | electron-builder MSI (WiX) | Enterprise / GPO / Intune | Per-machine option |
| Windows | `Recast-Portable-x.y.z.exe` | electron-builder portable | No install, USB | Settings live next to the exe when writable |
| Windows | `Recast-x.y.z-arm64.exe` | electron-builder | Snapdragon laptops | Same features |
| Windows | `.nsis-web` | electron-builder | Small stub installer | Optional |
| Windows | winget manifest | `wingetcreate` | `winget install Recast` | Submitted to winget-pkgs |
| Windows | Scoop manifest | bucket PR | Dev-friendly install | Community bucket first |
| Windows | Chocolatey package | `choco pack` | Enterprise familiarity | Optional |
| macOS | `Recast-x.y.z-arm64.dmg` | electron-builder | Apple Silicon | Primary |
| macOS | `Recast-x.y.z-x64.dmg` | electron-builder | Intel | Primary |
| macOS | `Recast-universal.dmg` | electron-builder | One download for both | ~2× size |
| macOS | `Recast-x.y.z.pkg` | electron-builder | MDM / managed installs | Signed installer |
| macOS | `Recast-x.y.z.zip` + `latest-mac.yml` | electron-builder | Auto-update payload | Required by electron-updater |
| macOS | Homebrew cask | `brew` cask | `brew install --cask recast` | PR to homebrew-cask |
| Linux | `Recast-x.y.z.AppImage` | electron-builder | Universal, no install | Document `libfuse2` |
| Linux | `recast_x.y.z_amd64.deb` | electron-builder | Debian / Ubuntu | GPG-sign |
| Linux | `recast-x.y.z.x86_64.rpm` | electron-builder | Fedora / RHEL / openSUSE | GPG-sign |
| Linux | `recast-x.y.z.tar.gz` | electron-builder | Generic / AUR source | |
| Linux | Flatpak | flatpak-builder + Flathub | Sandboxed | Portal-correct permissions |
| Linux | Snap | snapcraft | Auto-updating | Strict confinement needs testing |
| Linux | AUR PKGBUILD | AUR | Arch users | |

## Scripts

```json
{
  "scripts": {
    "dist:win": "electron-builder --win --x64 --arm64",
    "dist:mac": "electron-builder --mac --arm64 --x64",
    "dist:mac:universal": "electron-builder --mac --universal",
    "dist:linux": "electron-builder --linux AppImage deb rpm tar.gz",
    "dist:all": "pnpm dist:win && pnpm dist:mac && pnpm dist:linux"
  }
}
```

## electron-builder notes

- `asar: true`, with `asarUnpack: ["resources/ffmpeg/**", "**/*.node"]`.
- `files` allowlist — never ship source maps, tests, docs, or dev dependencies.
- `extraResources` carries FFmpeg and license texts.
- `artifactName` pattern: `${productName}-${version}-${arch}.${ext}` for consistency across OSes.
- `protocols` registers `recast://`.
- `fileAssociations` registers `.recast` and `.recaststyle`.
- `directories.buildResources` = `build/` (icons, entitlements, installer assets).
- `publish` = GitHub releases; electron-updater reads `latest.yml`.
- `compression: maximum` for NSIS; skip `differentialPackage` until the first releases exist.

## Icons and assets

| Asset | Spec |
|---|---|
| `build/icon.icns` | 1024×1024 source, macOS |
| `build/icon.ico` | 256/128/64/48/32/16, Windows |
| `build/icons/` | 16→512 PNGs, Linux |
| `build/installerHeader.bmp` | 150×57, NSIS |
| `build/installerSidebar.bmp` | 164×314, NSIS |
| `build/trayTemplate.png` | 16×16 + @2x, macOS template image |

## Versioning

- SemVer. `0.y.z` until the first stable release.
- Pre-releases: `1.2.0-beta.1` published to the `beta` update channel.
- `CHANGELOG.md` generated from conventional commits, edited by hand before tagging.

## Release process

1. `pnpm verify` green on `main`.
2. Bump version, update `CHANGELOG.md`.
3. Tag `v1.2.0`, push.
4. CI builds the full matrix, signs, notarizes, and creates a **draft** GitHub release.
5. Smoke-test each artifact on real hardware using the checklist in `docs/code-signing.md`.
6. Publish the release; electron-updater picks up `latest.yml` within minutes.
7. Announce, then watch crash-free sessions for 48 hours.

## Install QA checklist (release gate)

- [ ] Windows 10 22H2, Windows 11 23H2, and an ARM64 device.
- [ ] Windows at 100 / 125 / 150 / 200 % scaling on a mixed-DPI dual-monitor setup.
- [ ] Per-user install completes without an admin prompt; uninstall leaves no files, registry keys, or shortcuts.
- [ ] Portable build runs from a read-only folder and from a USB stick.
- [ ] VirusTotal: zero detections on the signed installer.
- [ ] macOS on a fresh user account: TCC prompts appear and the relaunch flow works.
- [ ] macOS Gatekeeper accepts the notarized app; `spctl -a -vv` passes.
- [ ] Linux: AppImage on Ubuntu 22.04, `.deb` on Debian 12, `.rpm` on Fedora 40.
- [ ] Linux Wayland: portal picker appears; the UI explains missing cursor tracking.
- [ ] Every artifact launches, records 10 seconds, and exports a playable file.

## Size budget

| Artifact | Budget |
|---|---|
| Windows installer | ≤ 150 MB |
| macOS DMG | ≤ 170 MB |
| Linux AppImage | ≤ 170 MB |
| Flatpak | ≤ 200 MB |

If a build exceeds budget, the PR must explain why and propose a reduction.
