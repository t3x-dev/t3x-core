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
If this product release publishes packages, replace None with one line per package:

- `@t3x-dev/local`: patch
- `@t3x-dev/yops`: patch

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
- Runtime artifacts should be required only when `@t3x-dev/local` is in the release set.
- `@t3x-dev/yops`-only releases should avoid local runtime artifacts once
  release-set detection is automated.
- Merging this PR to `main` does not publish by itself unless the follow-up
  Changesets version/publish flow determines a publish is required.

## Release Notes

User-facing release notes:

-

## Known Risks

-
