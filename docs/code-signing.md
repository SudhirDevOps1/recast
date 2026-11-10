# Code signing

Status first: **no release is signed today** — certificates are not yet in place. The plumbing below is implemented and every release until signing works states "unsigned" plainly.

## Windows

- **Plan**: Azure Trusted Signing (preferred) or an EV certificate. Timestamp every file (RFC 3161). electron-builder `signtoolOptions` wired via env vars in CI (`AZURE_SIGNING_*` secrets).
- **Reality check**: a fresh OV certificate triggers SmartScreen warnings until reputation builds. This is stated in the README and on release notes — we do not hide it or suggest disabling SmartScreen.
- MSI: signed as part of the same tool chain.

## macOS

- **Plan**: Developer ID Application certificate → `electron-builder` signs with hardened runtime + entitlements (`build/entitlements.mac.plist`: JIT, audio-input, camera, apple-events) → `notarytool` (App Store Connect API key via `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` env) → `stapler` staples the DMG.
- CI (`macos-14`, `macos-13`) imports the certificate from secrets (`MAC_CERTIFICATE`, base64 P12).
- Until signing exists, Gatekeeper requires `xattr -cr Recast.app` — the release notes will say exactly that instead of pretending it's signed.

## Linux

- AppImage: GPG signature on the `SHA256SUMS` file (decisions: sign the manifest, not the binary — simpler verification for users).
- deb/rpm: dpkg/rpm GPG signing keys provisioned as CI secrets.
- SHA256SUMS published with every release; AUR PKGBUILD consumes the published hashes.

## Update feed

- `electron-updater` with the GitHub provider (`publish` block in electron-builder.yml); `latest.yml` / `latest-mac.yml` generated per platform.
- Channels: `stable` and `beta` (Settings → About). Update checks are **opt-in** (off by default).
- Never restart mid-recording: the install path checks for an active session and refuses with a precise reason.
- Rollback: previous installers remain attached to each GitHub release; the update feed only points forward.

## CI signing environment

Until certificates exist, `build.yml` and `release.yml` set
`CSC_IDENTITY_AUTO_DISCOVERY: 'false'` and do **not** map signing secrets to
env — GitHub injects empty strings for absent secrets and electron-builder
treats `CSC_LINK=''` as a file path, failing the build with
`<project dir> not a file`. When certificates arrive, add this block to the
`env:` of both workflows' build job, flip the flag to `'true'`, and set
`notarize: true` in `apps/desktop/electron-builder.yml`:

```yaml
      CSC_LINK: ${{ secrets.CSC_LINK }}
      CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
      WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
      WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
      APPLE_ID: ${{ secrets.APPLE_ID }}
      APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
      APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

electron-builder publishing is disabled (`--publish never` everywhere);
releases are published by `release.yml` from uploaded artifacts plus
`SHA256SUMS`.

## Related

- [packaging.md](packaging.md) - the artifacts that need signing
- [deployment.md](deployment.md) - what IT sees on day one
- [../SECURITY.md](../SECURITY.md) - the trust model
