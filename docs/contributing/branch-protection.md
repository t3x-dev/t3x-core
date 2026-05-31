# Branch Protection

This document records the intended GitHub branch protection settings for the
current `dev` to `main` release flow. These settings are configured in GitHub
repository settings; committing this file does not apply them automatically.

## `dev`

`dev` is the integration branch for ordinary development PRs.

Recommended settings:

- Require a pull request before merging.
- Block direct pushes.
- Require conversation resolution before merge.
- Require approval from CODEOWNERS when protected files change.
- Require the PR validation workflow once it exists on the target branch.

Expected required status check after the PR validation workflow lands:

- `PR Validation / Check, build, and test`

## `main`

`main` is the release line.

Recommended settings:

- Require a pull request before merging.
- Block direct pushes.
- Require owner approval for release PRs.
- Require conversation resolution before merge.
- Require the PR validation workflow once it exists on the target branch.
- Require the release smoke workflow for release candidate PRs when it applies.

Expected required status checks after the relevant workflows land:

- `PR Validation / Check, build, and test`
- `local-smoke / Clean install smoke`

## Protected File Ownership

The CODEOWNERS rules should cover:

- `.github/CODEOWNERS`
- `.github/workflows/`
- `RELEASE.md`
- `release/`
- `docs/release/`
- `docs/contributing/branch-protection.md`

When those paths change, the PR should receive owner review even before GitHub
branch protection is fully wired.
