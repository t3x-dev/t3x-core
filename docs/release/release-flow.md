# Release Flow

This document defines the branch, pull request, versioning, and publish flow for
T3X. It is the human-facing release policy and should evolve as the project
moves from alpha toward broader releases. Machine-readable release metadata can
live under `release/` when needed.

## Branch Model

T3X currently uses a lightweight `dev` to `main` release flow.

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
- Clear release impact declaration.

During bootstrap, these guards are being added incrementally. If a guard is not
yet wired in GitHub Actions, the PR must state the local command or follow-up
issue that covers it.

No AI reviewer is required today. If Copilot, Greptile, or a similar reviewer is
enabled later, it should be treated as advisory unless branch protection makes a
specific check required. GitHub Actions remain the hard gate. Owner review is
recommended for protected release, workflow, and ownership files, but it is not
required by the current bootstrap rulesets.

## Release PRs Into `main`

A release PR promotes the current `dev` state into `main`.

Cadence:

- Daily or every few days during active alpha work.
- Slower cadence is acceptable when `dev` contains risky changes.
- Emergency hotfixes use the hotfix exception above.

Target release PR guards:

- Clean install.
- Full build.
- Full test run.
- Local runtime build or dry-run when `@t3x-dev/local` is affected.
- Local install smoke when `@t3x-dev/local` is affected.
- No-key demo smoke when demo/runtime behavior is affected.
- Release surface and stability policy checks when public packages are affected.
- Owner review for protected release, workflow, and ownership changes.

Some target release guards are not fully automated yet. They are part of the
alpha release-readiness workstreams and should become required checks before
the first public alpha publish.

Release PR checklist:

1. Confirm `dev` is green and contains only changes intended for the release.
2. Open a pull request from `dev` into `main` using the release PR template.
3. List included PRs or the comparison range.
4. Declare whether public packages are affected.
5. Confirm changesets are present when public package behavior changed.
6. Wait for PR validation and release surface checks.
7. Request owner review when protected release, workflow, or ownership files
   changed.
8. Merge to `main` only after required checks pass and review expectations are
   satisfied.

After the release PR merges, the `Release` workflow runs on `main`.

- If unconsumed changesets are present, Changesets creates a
  `chore: version packages` pull request.
- If the version packages PR merges, the same workflow publishes the package
  artifacts.
- If no changesets or version package commit are present, no package publish is
  expected.

Do not manually publish from `dev`. Publishing starts from `main` only.

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

The target release behavior is to avoid building or publishing runtime artifacts
for a `yops`-only release. The current workflow still needs release-set
detection before that behavior is fully automated.

## Ownership

The following areas require owner review before merging:

- Branch and release policy.
- GitHub workflows.
- CODEOWNERS.
- Public package surface declarations.
- Stability policy.
- Runtime publish behavior.
