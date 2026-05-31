# Alpha Release Flow

This document defines the alpha branch, pull request, versioning, and publish
flow for T3X. It is the human-facing release policy. Machine-readable release
metadata can live under `release/` when needed.

## Branch Model

T3X uses a lightweight `dev` to `main` release flow during alpha.

- Feature branches are created from `dev`.
- Ordinary development pull requests target `dev`.
- `dev` is the integration branch. It should stay buildable and testable, but
  it is not automatically a published release.
- Release candidate pull requests merge `dev` into `main`.
- `main` is the publish line. It should represent code that has passed release
  checks and is eligible for npm/package publishing.

Hotfixes may target `main` directly only when the fix must bypass the normal
release train. After a hotfix lands, the same change must be merged back into
`dev`.

## PRs Into `dev`

Every issue should normally produce one pull request into `dev`.

Required PR information:

- Linked issue.
- Summary of behavior changed.
- Verification commands or workflow results.
- Release impact declaration.
- Changeset status when public packages are affected.

Required guards for `dev`:

- Lint and format checks.
- Affected package build and tests.
- Release surface consistency checks when release metadata changes.
- CODEOWNERS approval for protected release, workflow, and ownership files.

AI review tools such as Copilot or Greptile may be used as advisory reviewers,
but GitHub Actions and required human ownership checks remain the hard gates.

## Release PRs Into `main`

A release PR promotes the current `dev` state into `main`.

Cadence:

- Daily or every few days during active alpha work.
- Slower cadence is acceptable when `dev` contains risky changes.
- Emergency hotfixes use the hotfix exception above.

Required release PR guards:

- Clean install.
- Full build.
- Full test run.
- Local runtime build or dry-run when `@t3x-dev/local` is affected.
- Local install smoke when `@t3x-dev/local` is affected.
- No-key demo smoke when demo/runtime behavior is affected.
- Release surface and stability policy checks when public packages are affected.
- Owner approval.

## Versioning and Changesets

Merging to `main` does not automatically mean a new public version is published.
Publishing requires explicit release intent through changesets or an equivalent
version PR.

A changeset is required when a pull request changes user-visible behavior for a
public alpha package:

- `@t3x-dev/local`
- `@t3x-dev/yops`

Examples that require a changeset:

- Public API or CLI behavior changes.
- Bug fixes that users receive through npm packages.
- Install, runtime, or no-key demo behavior changes.
- Documented public contract changes.

Examples that usually do not require a changeset:

- Internal-only refactors.
- CI workflow changes.
- Contributor docs.
- Tests that do not change package behavior.
- Changes limited to restricted/internal packages that are not exported through
  a public package.

When a PR has no release impact, mark it as `no-release-impact` in the PR body
or label.

## Publish Rules

Publishing happens from `main` only after the versioning step determines that
public packages changed.

- `@t3x-dev/yops` releases publish npm package artifacts only.
- `@t3x-dev/local` releases publish npm package artifacts and runtime artifacts.
- Runtime artifacts are built only when `@t3x-dev/local` is in the release set.
- Release review and dry-run packaging must not publish real artifacts.

The release workflow should avoid building or publishing runtime artifacts for a
`yops`-only release.

## Ownership

The following areas require owner review before merging:

- Branch and release policy.
- GitHub workflows.
- CODEOWNERS.
- Public package surface declarations.
- Stability policy.
- Runtime publish behavior.
