# Release Flow

This document defines the branch, pull request, versioning, and publish flow for
T3X. It is the human-facing release policy and should evolve as the project
moves from alpha toward broader releases. Machine-readable release metadata can
live under `release/` when needed.

## Branch Model

T3X uses a product release flow with separate package publishing.

- Feature branches are created from `dev`.
- Ordinary development pull requests target `dev`.
- `dev` is the integration branch. It should stay buildable and testable, but
  it is not automatically a published release.
- Product release branches use `release/x.y.z`, where `x.y.z` is the T3X
  product release version.
- Release candidate pull requests promote `release/x.y.z` into `main`.
- `main` is the product release line. Every normal merge to `main` must be
  represented by a T3X product release version and release notes.
- npm/package publishing is optional for a product release and is controlled by
  Changesets after the product release merges.

Hotfixes may target `main` directly from `hotfix/*` only when the fix must
bypass the normal release train. Hotfix PRs still need a T3X product release
version and release notes. After a hotfix lands, the same change must be merged
back into `dev`.

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

## Product Release PRs Into `main`

A product release PR promotes a reviewed release candidate into `main`.

Cadence:

- Daily or every few days during active alpha work.
- Slower cadence is acceptable when `dev` contains risky changes.
- Emergency hotfixes use the hotfix exception above.

Release branch naming:

- Use `release/x.y.z` for normal product releases, for example
  `release/0.4.0`.
- Use `hotfix/*` only for urgent fixes that bypass the normal release train.
- Do not use product release branch names for package versions. A branch named
  `release/0.4.0` means T3X product release `0.4.0`; it does not imply every
  npm package publishes `0.4.0`.
- Changesets version package pull requests may target `main` from the
  Changesets automation branch and are exempt from the product release branch
  naming rule.

Product release versioning:

- Every normal merge to `main` must have a T3X product release version.
- User-visible product changes should usually bump the minor version during
  `0.x`.
- Fixes, CI/release guard changes, docs corrections, and small internal
  adjustments can use a patch bump.
- The product release version is recorded in the release PR body and should be
  tagged after merge as `t3x-vx.y.z`.
- Package versions remain independent and are determined by Changesets.

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
2. Create `release/x.y.z` from `dev`.
3. Open a pull request from `release/x.y.z` into `main` using the release PR
   template.
4. Fill in the T3X product release version. It must match the release branch
   name.
5. List included PRs or the comparison range.
6. Add user-facing release notes. Use `Package Releases: - None` when no package
   publish is intended.
7. Fill in the `Package Releases` section. List each package that should publish
   or use `- None`.
8. Confirm changesets are present when public package behavior changed.
9. Wait for PR validation and release surface checks.
10. Request owner review when protected release, workflow, or ownership files
   changed.
11. Merge to `main` only after required checks pass and review expectations are
   satisfied.

After the product release PR merges, the `Release` workflow runs on `main`.

- If unconsumed changesets are present, Changesets creates a
  `chore: version packages` pull request.
- If the version packages PR merges, the same workflow publishes the package
  artifacts.
- If no changesets or version package commit are present, the product release is
  code-only and no package publish is expected.
- The workflow records product releases by creating a `t3x-vx.y.z` GitHub
  Release from the merged release PR notes. Changesets version package PRs do
  not create product release records.

The `Release` workflow must create the `chore: version packages` pull request
with the `CHANGESETS_TOKEN` repository secret. This secret should be a GitHub
personal access token from a human or bot account with permission to create pull
requests. Do not rely on the default `GITHUB_TOKEN` for this step: pull requests
created by `GITHUB_TOKEN` do not recursively run GitHub Actions, so required
checks can stay stuck as `Expected - Waiting to be reported`.

When the workflow needs to create the version packages pull request and
`CHANGESETS_TOKEN` is missing, it should fail before opening the pull request.

Do not manually publish from `dev`. Publishing starts from `main` only.

## Product Versioning and Changesets

Merging to `main` always represents a T3X product release. It does not
automatically mean a new npm package version is published. Package publishing
requires explicit release intent through changesets or an equivalent version PR.

There are two version streams:

- T3X product releases: `t3x-vx.y.z`, represented by `release/x.y.z` branches
  and release notes.
- npm packages: `@t3x-dev/local@x.y.z`, `@t3x-dev/yops@x.y.z`, and future
  package artifacts managed by Changesets.

These versions can differ. For example, T3X product release `0.4.0` may publish
no packages, or it may publish `@t3x-dev/yops@0.2.1` while leaving
`@t3x-dev/local` unchanged.

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

When an ordinary PR into `dev` has no package or product release impact, mark it
as `no-release-impact` in the PR body or label. A product release PR into
`main` must still include the product release version and release notes.

PR validation checks the structured `Package Releases` section against the
checked-in changeset files:

- `Package Releases: - None` requires no `.changeset/*.md` files in the release
  branch.
- Package entries require at least one `.changeset/*.md` file.
- Each listed public package must appear in a changeset frontmatter entry.
- Each public package in changeset frontmatter must appear in `Package
  Releases`.

## Publish Rules

Publishing happens from `main` only after the package versioning step determines
that npm packages changed.

- `@t3x-dev/yops` releases publish npm package artifacts only.
- `@t3x-dev/local` releases publish npm package artifacts and runtime artifacts.
- Runtime artifacts are built only when `@t3x-dev/local` is in the release set.
- Release review and dry-run packaging must not publish real artifacts.
- A product release may publish zero packages. In that case the release notes
  must say `Package releases: None`.

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
