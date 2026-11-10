# Deployment

For IT administrators rolling Recast out to machines you do not sit in front of. It covers silent installs,
managed deployment, offline verification and version pinning.

> **Honesty note.** The installers are **unsigned** today - certificates are not available yet
> (see [code-signing.md](code-signing.md)). Expect SmartScreen on Windows and a Gatekeeper quarantine on
> macOS. Every statement below is what the pipeline actually does today.

## Install targets

| Platform | Artifact | Install profile | Machine-wide |
|---|---|---|---|
| Windows x64 | `Recast-Setup-x.y.z.exe` | NSIS, per-user (`perMachine: false`), no UAC prompt | No |
| Windows x64 | `Recast-x.y.z-enterprise.msi` | WiX MSI, per-machine | Yes - use this for GPO |
| Windows x64 | `Recast-Portable-x.y.z.exe` | Runs from any writable folder, settings next to the exe | No |
| Windows ARM64 | `Recast-Setup-x.y.z-arm64.exe` | Native ARM64 NSIS | No |
| macOS arm64 | `Recast-x.y.z-arm64.dmg` | Drag to Applications | No |
| macOS x64 | `Recast-x.y.z-x64.dmg` | Drag to Applications (cross-compiled on arm64 CI) | No |
| Linux x64 | `Recast-x.y.z-x86_64.AppImage` | chmod +x, run | No |
| Linux x64 | `.deb` / `.rpm` / `.tar.gz` | System package | Yes |

Packaging details per target: [packaging.md](packaging.md).

## Windows: silent deployment

MSI (per-machine, GPO-friendly):

```powershell
msiexec /i "Recast-0.1.3-enterprise.msi" /qn /norestart
```

Uninstall silently:

```powershell
msiexec /x "Recast-0.1.3-enterprise.msi" /qn /norestart
```

NSIS (per-user, no elevation):

```powershell
Start-Process "Recast-Setup-0.1.3.exe" -ArgumentList "/S" -Wait
```

Deployment notes:

- The NSIS installer never requests elevation and never deletes user data on uninstall.
- The MSI is the target for Group Policy, Intune and SCCM; it installs per-machine.
- Portable builds are the option for locked-down machines where no installer may run - the settings and
  library live next to the executable when the folder is writable.

## macOS: managed deployment

| Method | State today |
|---|---|
| Drag and drop the DMG | Works. First launch needs `xattr -cr /Applications/Recast.app` because the build is unsigned. |
| MDM (`.pkg` payload) | **Temporarily out of the CI matrix.** electron-builder 26.18 fails the unsigned productbuild step (`ENOENT ... unlink app.recast.desktop.pkg`). The config block is kept and returns with signing. |
| Notarization | Not available yet - no Developer ID certificate. See [code-signing.md](code-signing.md). |

Permissions are granted per user, not per machine: Screen Recording, Microphone, Camera and Accessibility
are TCC prompts. A managed deployment must therefore also ship a profile or a first-run instruction -
[security.md](security.md) lists what is requested and why.

## Linux: package deployment

```bash
# Debian / Ubuntu
sudo dpkg -i Recast-0.1.3-amd64.deb
# or
sudo apt install ./Recast-0.1.3-amd64.deb

# Fedora / RHEL
sudo rpm -i Recast-0.1.3-x86_64.rpm
```

AppImage needs `libfuse2` on distros that no longer ship it (Ubuntu 22.04+):

```bash
sudo apt install libfuse2
```

Flatpak, Snap and AUR manifests are authored in `packaging/` but **not yet submitted** to their upstream
repositories - do not plan a rollout on them yet.

## Offline and air-gapped rollouts

Recast performs **no network requests** in its default configuration. Update checks are off by default,
and the Whisper model plus the optional FFmpeg binary are the only downloads, both user-initiated. So an
air-gapped machine needs no proxy, no allow-listing and no telemetry endpoint.

Offline rollout procedure:

1. Download the release artifacts and `SHA256SUMS` on a networked machine.
2. Copy them to the target share or media.
3. Verify the files (below).
4. Deploy with the command for your platform.

### Verify before you deploy

```bash
# Linux / macOS
sha256sum --check --ignore-missing SHA256SUMS
shasum -a 256 -c SHA256SUMS          # macOS
```

```powershell
# Windows
Get-FileHash -Algorithm SHA256 .\Recast-Setup-0.1.3.exe
```

The website shows the first bytes of each file's SHA-256 next to the file name, so a download can be
matched against the published hash without opening the archive.

## Version pinning

| Need | How |
|---|---|
| Freeze a version | Deploy the artifact of a specific tag (`v0.1.3`) - old releases stay downloadable. |
| Track the newest stable | Use the `latest` release assets. |
| Test before rollout | Use the `nightly` prerelease; it carries the same artifact matrix and the same checksums. |
| Roll back | Install the previous version over the new one. No telemetry-driven "latest" call is made unless you enable update checks. |

Auto-update is wired through `electron-updater` against a generic GitHub provider but is **opt-in and not
yet live** as a feed with a documented rollback path. Until then, treat the installed version as pinned by
your deployment tooling.

## Data locations and removal

| Platform | Data directory |
|---|---|
| Windows | `%APPDATA%\Recast` |
| macOS | `~/Library/Application Support/Recast` |
| Linux | `~/.config/recast` |
| Portable mode | next to the executable |

Everything Recast writes lives in that one directory: `settings.json`, `library.db`, `projects/`,
`recordings/`, `bin/ffmpeg/`, `models/` and `logs/capture.log`. Removing it removes all Recast state -
recordings included - so uninstall scripts should say so before they delete it.

Recordings are **not** encrypted at rest. If the machine is not encrypted at the disk level, use
full-disk encryption or a per-user encrypted volume for the data directory.

## Known deployment gaps

- Signing and notarization on every platform - certificates pending.
- `.pkg` (MDM) target - temporarily out of the CI matrix.
- Flatpak / Snap / AUR submissions - manifests authored, not submitted.
- Automatic update feed with documented rollback - wired, not live.
- Cross-platform install QA matrix (125 / 150 / 200 % scaling, mixed DPI, clean uninstall, fresh macOS
  account TCC flow, Wayland portal run) - still open; see [platform-support.md](platform-support.md).
