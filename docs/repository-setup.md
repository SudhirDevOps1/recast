# Repository setup — the one-time clicks that a CI token cannot do

The push token used to build this repository is deliberately least-privilege
(Contents + Workflows only — it can commit code and run CI, nothing else).
Five repository settings therefore have to be done once, by someone with
**admin** access, from the web UI or with a fuller token. Total time: ~3
minutes.

## 1. Enable GitHub Pages (website)

`.github/workflows/website.yml` tries to enable Pages itself
(`actions/configure-pages` with `enablement: true`). If that step fails:

1. **Settings → Pages**
2. **Build and deployment → Source** → *GitHub Actions*
3. Re-run the *Website* workflow (Actions → Website → Run workflow).

Or via API with an admin token:

```bash
curl -X POST -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/SudhirDevOps1/recast/pages \
  -d '{"build_type":"workflow"}'
```

## 2. Protect `main`

**Settings → Rules → Rulesets → New branch ruleset** (or Settings → Branches →
Add rule) for `main`:

- Require a pull request before merging: **off** (solo maintainer; flip on when the team grows)
- Require status checks to pass: **on**, with these checks required:
  - `Docs integrity`
  - `Lint, types, tests (ubuntu-22.04)`
  - `Lint, types, tests (windows-latest)`
  - `Lint, types, tests (windows-11-arm)`
  - `Lint, types, tests (macos-14)`
  - `Lint, types, tests (macos-15)`
  - `Smoke (ubuntu-22.04)`
- Block force pushes: **on**
- Require linear history: **on**
- Restrict deletions: **on**

Or via API with an admin token:

```bash
curl -X PUT -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/SudhirDevOps1/recast/branches/main/protection \
  -d '{
    "required_status_checks": {"strict": true, "contexts": [
      "Docs integrity",
      "Lint, types, tests (ubuntu-22.04)",
      "Lint, types, tests (windows-latest)",
      "Lint, types, tests (windows-11-arm)",
      "Lint, types, tests (macos-14)",
      "Lint, types, tests (macos-15)",
      "Smoke (ubuntu-22.04)"
    ]},
    "enforce_admins": false,
    "required_pull_request_reviews": null,
    "restrictions": null,
    "required_linear_history": true,
    "allow_force_pushes": false,
    "allow_deletions": false
  }'
```

`enforce_admins: false` keeps direct pushes possible for the maintainer while
still gating PR merges. Tighten it when contributors join.

## 3. Repository "About" description and website link

**Settings → General → Description**:

> Recast — free, open-source, local-first screen recorder and cinematic editor for macOS, Windows and Linux. Record, auto-zoom, caption, export. No account, no cloud.

**Website** → `https://sudhirdevops1.github.io/recast/`

## 4. Close the held Dependabot PRs

The four breaking-major dependency PRs (zod 4, electron-vite 6,
@vitejs/plugin-react 6, @types/node 26) are deliberately held — `.github/dependabot.yml`
now ignores their major bumps, so closing them once is permanent. The four
actions-bump PRs auto-close once Dependabot notices the majors are already on
`main`.

## 5. Code-signing secrets (when certificates arrive)

Add these in **Settings → Secrets and variables → Actions** — the release and
nightly workflows already pass them to electron-builder, which signs when
they're present and skips cleanly when they're not:

| Secret | Used for |
|---|---|
| `CSC_LINK`, `CSC_KEY_PASSWORD` | macOS code signing (PFX) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarization (also flip `notarize: true` in `apps/desktop/electron-builder.yml`) |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows code signing |

See [docs/code-signing.md](code-signing.md) for the full signing plan.
