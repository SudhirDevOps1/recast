# Code signing

Status: specification. Signing is required before the first public release; unsigned builds still work but warn.

Signing is not optional polish. Without it Windows shows "Unknown publisher" and macOS refuses to launch the app at all on a default machine.

## Windows

### Options

| Option | Cost | Notes |
|---|---|---|
| Azure Trusted Signing | ~$10/month | Cheapest legitimate path for individuals; cloud HSM, no hardware token |
| OV certificate | $200–400/year | Requires a hardware token (since June 2023); SmartScreen reputation builds over time |
| EV certificate | $300–600/year | Immediate SmartScreen reputation in most cases; hardware token |

**Recommended for this project: Azure Trusted Signing.** It fits a solo maintainer, avoids shipping a token, and integrates cleanly with GitHub Actions.

### Setup

1. Create an Azure Trusted Signing account and a certificate profile.
2. Add these repository secrets:
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_CODE_SIGNING_ACCOUNT`
   - `AZURE_CERT_PROFILE`
3. In `electron-builder.yml`:

```yaml
win:
  signtoolOptions:
    publisherName: "SudhirDevOps1"
    signingHashAlgorithms: [sha256]
    rfc3161TimeStampServer: "http://timestamp.acs.microsoft.com"
```

4. Sign `Recast-Setup-*.exe`, `Recast-*.msi`, `Recast-Portable-*.exe`, and the app executable. Unblocked files must be signed, not just the installer.

### Verify

```powershell
Get-AuthenticodeSignature .\Recast-Setup-1.0.0.exe | Format-List
```

Expected: `Status = Valid`, `SignerCertificate` present, timestamp present.

### SmartScreen reality

A brand-new OV certificate still triggers "Windows protected your PC" until download volume builds reputation. EV certificates and Trusted Signing mitigate this faster. Do not promise users a warning-free install until you have tested on a clean Windows machine.

## macOS

### Requirements

- Apple Developer Program membership ($99/year).
- **Developer ID Application** certificate.
- App-specific password or App Store Connect API key for notarization.

### Entitlements

`build/entitlements.mac.plist`:

```xml
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.device.camera</key><true/>
<key>com.apple.security.device.audio-input</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
```

Screen recording itself does not use an entitlement — it is a TCC permission granted by the user.

### Sign and notarize

```bash
codesign --deep --force --options runtime \
  --entitlements build/entitlements.mac.plist \
  --sign "Developer ID Application: Your Name (TEAMID)" Recast.app

xcrun notarytool submit Recast-1.0.0.dmg \
  --apple-id "$APPLE_ID" --team-id "$TEAM_ID" --password "$APP_PASSWORD" --wait

xcrun stapler staple Recast-1.0.0.dmg
```

electron-builder does this automatically when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` are present.

### Verify

```bash
spctl -a -vv Recast.app      # accepted, source=Notarized Developer ID
codesign -dv --verbose=4 Recast.app
stapler validate Recast-1.0.0.dmg
```

### Unsigned fallback

If credentials are unavailable, the release notes must say:

> This build is unsigned. macOS will block it. Right-click → Open, or run `xattr -dr com.apple.quarantine /Applications/Recast.app`.

Never claim a build is notarized unless `spctl` passes.

## Linux

- **GPG-sign** `.deb` and `.rpm` packages and the repository metadata (`Release`, `Release.gpg`, `InRelease`).
- Publish the public key and a `SHA256SUMS` file with every release.
- AppImage: ship the `.zsync` file so users can update; optionally embed a signature.
- Flatpak: Flathub handles signing.
- Snap: the store signs revisions.

```bash
gpg --armor --detach-sign SHA256SUMS
sha256sum -c SHA256SUMS
```

## Secrets in CI

| Secret | Used by |
|---|---|
| `AZURE_*` | Windows signing |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD` | macOS sign + notarize |
| `GPG_PRIVATE_KEY`, `GPG_PASSPHRASE` | Linux repo signing |
| `GH_TOKEN` | Releases, updater feed |

Rules:

- Secrets live in GitHub Environments with required reviewers for release jobs.
- Fork PRs never receive secrets; they build unsigned artifacts only.
- Rotate on any suspected exposure and document it in `SECURITY.md`.

## Release gate

- [ ] `Get-AuthenticodeSignature` valid on every Windows artifact.
- [ ] Timestamp present on every signature.
- [ ] `spctl -a -vv` passes on the macOS DMG and the installed `.app`.
- [ ] `stapler validate` passes.
- [ ] GPG verification passes on Linux packages.
- [ ] `SHA256SUMS` published and correct.
- [ ] Clean-machine install tested for each OS.
