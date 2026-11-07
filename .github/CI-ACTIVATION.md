# CI activation (pending token scope)

The complete workflows for this repository — `.github/workflows/ci.yml`
(verify gate: typecheck + lint + unit tests + build + electron smoke) and
`.github/workflows/build.yml` (six-runner installer matrix + SHA256SUMS
release job) — are **written and reviewed** but parked out of the pushed
tree because the current GitHub token lacks the `workflow` scope.
(`dependabot.yml` is already active — it does not need that scope.)

## Activate in one of two ways

1. **Regenerate the fine-grained PAT** with Repository permissions →
   Workflows → Read and write, then from the local clone:

   ```bash
   git checkout main            # local branch carries the workflows
   git push origin main
   ```

2. **Or via the web UI**: create `.github/workflows/ci.yml` and
   `.github/workflows/build.yml` from the source archive shipped with the
   deliverables (`recast-ci-workflows/` folder).

Until activated, the repository runs its pre-existing adaptive `ci.yml`
preflight, which detects the app code and runs the docs/lint jobs.
