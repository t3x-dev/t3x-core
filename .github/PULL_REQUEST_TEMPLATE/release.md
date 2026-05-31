## Release PR

Promotes `dev` into `main`.

## Included Changes

List merged PRs or the comparison range:

-

## Release Impact

- [ ] No public package release intended
- [ ] Includes changesets for public package changes
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

- Runtime artifacts should be required only when `@t3x-dev/local` is in the release set.
- `@t3x-dev/yops`-only releases should avoid local runtime artifacts once
  release-set detection is automated.
- Merging this PR to `main` does not publish by itself unless the follow-up
  Changesets version/publish flow determines a publish is required.

## Known Risks

-
