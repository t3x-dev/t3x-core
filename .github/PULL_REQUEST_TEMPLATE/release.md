## Release PR

Promotes a reviewed product release into `main`.

## Product Release

T3X product release version: `0.0.0`

Release branch:

- [ ] `release/x.y.z`
- [ ] `hotfix/*`

Expected product tag after merge:

- `t3x-v0.0.0`

## Included Changes

List merged PRs or the comparison range:

-

## Release Impact

- [ ] Changesets included for public package changes
- [ ] No package publish intended
- [ ] Version/package PR expected after this merges to `main`
- [ ] Publish expected after the version/package PR merges

Public packages affected:

- [ ] `@t3x-dev/local`
- [ ] `@t3x-dev/yops`
- [ ] None

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

Package releases:

- None

## Known Risks

-
