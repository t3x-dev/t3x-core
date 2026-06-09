## Release PR

Promotes a reviewed product release into `main`.

## Product Release

T3X product release version: `0.0.0`

Expected product tag after merge:

- `t3x-v0.0.0`

## Included Changes

List merged PRs or the comparison range:

-

## Package Releases

- None

<!--
If this product release publishes packages, replace None with the complete
current npm publish surface and the target package versions:

- `@t3x-dev/local`: 0.0.0
- `@t3x-dev/yops`: 0.0.0

Use concrete package versions here, not changeset bump types like patch/minor.
CI validates this section against .changeset/*.md.
-->

## Required Checks

- [ ] PR Validation passed
- [ ] Release surface check passed
- [ ] Local/runtime smoke reviewed when `@t3x-dev/local` is affected
- [ ] No-key demo smoke reviewed when demo/runtime behavior is affected
- [ ] Owner review requested when protected release, workflow, or ownership files changed

## Packaging Notes

- Product release version is independent from npm package versions.
- Every merge to `main` must have a product release version and release notes.
- Package publish is optional and happens only through Changesets/version PRs.
- Package Releases entries use final target package versions. Changeset files
  use bump types such as patch/minor/major.
- Code-only releases use `Package Releases: - None`; final GitHub Release notes
  omit package information.
- Current package releases include both `@t3x-dev/local` and `@t3x-dev/yops`,
  so runtime artifacts are required for package releases.
- Merging this PR to `main` does not publish by itself unless the follow-up
  Changesets version/publish flow determines a publish is required.

## Release Notes

User-facing release notes:

-

## Known Risks

-
