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
- Require the PR validation workflow.

Current required status check:

- `PR Validation / Check, build, and test`

During the bootstrap phase, approving reviews and CODEOWNERS review are
recommended for protected files but are not enforced by the active ruleset.

## `main`

`main` is the release line.

Recommended settings:

- Require a pull request before merging.
- Block direct pushes.
- Require conversation resolution before merge.
- Require the PR validation workflow.
- Require the branch to be up to date before merge.

Current required status check:

- `PR Validation / Check, build, and test`

`local-smoke / Clean install smoke` is a target release guard for package and
runtime-sensitive changes. It is not currently a required branch rule.

## Protected File Ownership

The CODEOWNERS rules should cover:

- `.github/CODEOWNERS`
- `.github/workflows/`
- `RELEASE.md`
- `release/`
- `docs/release/`
- `docs/contributing/branch-protection.md`

When those paths change, the PR should receive owner review even before GitHub
branch protection requires it. Current bootstrap rules allow maintainers to
self-merge once required checks pass.
