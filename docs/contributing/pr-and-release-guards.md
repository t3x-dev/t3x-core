# PR and Release Guards

This document describes the practical guardrails contributors should follow
when opening pull requests during alpha.

## Ordinary Development PRs

Target ordinary pull requests at `dev`.

Before requesting review:

- Link the issue the PR resolves.
- Fill in release impact.
- Run the smallest relevant local verification commands.
- Add a changeset if the PR changes user-visible behavior for `@t3x-dev/local`
  or `@t3x-dev/yops`.

Use `no-release-impact` only when the PR does not affect public package behavior
or documented public contracts.

## Required Checks

The current baseline for PRs into `dev` and `main` is:

```bash
pnpm check:release-pr
pnpm check
pnpm check:release-surface
pnpm build
pnpm test
```

`pnpm check:release-pr` is only meaningful when CI passes pull request metadata
through environment variables. Locally, use it with explicit metadata when
testing a release PR guard.

Large PRs may need more targeted smoke checks. Product release PRs into `main`
use the full release guard described in
[Maintainer Release Flow](../../.github/release-flow.md).

## Product Release PRs

Normal releases into `main` use `release/x.y.z` branches, where `x.y.z` is the
T3X product release version.

Release PRs must include:

- `T3X product release version: \`x.y.z\`` in the PR body.
- Included changes or a comparison range.
- User-facing release notes.
- A `Package Releases` section containing either `- None` or the complete
  current npm publish surface:
  `- \`@t3x-dev/local\`: patch` and `- \`@t3x-dev/yops\`: patch`.

The release PR policy check also validates changeset files:

- `Package Releases: - None` rejects checked-in `.changeset/*.md` files.
- Package release entries require at least one `.changeset/*.md`.
- Listed public packages must appear in changeset frontmatter.
- Public packages in changeset frontmatter must appear in `Package Releases`.
- Package releases currently require both restricted alpha npm packages:
  `@t3x-dev/local` and `@t3x-dev/yops`.

The product release version is independent from npm package versions. If the
release publishes no packages, write `- None` in `Package Releases`; final
GitHub Release notes omit package information for code-only releases.

Hotfix PRs may target `main` from `hotfix/*`, but they still need product
release metadata and release notes. Changesets version package PRs are exempt
from the product release branch naming rule.

## Protected Files

Changes to these areas require owner review:

- `.github/CODEOWNERS`
- `.github/release-flow.md`
- `.github/workflows/`
- `RELEASE.md`
- `release/`
- `docs/release/`
- `docs/contributing/branch-protection.md`
- `docs/contributing/pr-and-release-guards.md`

## Review Tools

No AI reviewer is required today. AI review tools can help catch mistakes once
configured, but they are not the source of truth. Hard merge decisions should be
based on:

- Required GitHub Actions.
- Owner review for protected files.
- Human review of behavior and release impact.

## Release Impact Checklist

Use this decision table when filling out a PR.

| Change type | Changeset required? |
| --- | --- |
| `@t3x-dev/local` user-visible behavior | Yes |
| `@t3x-dev/yops` user-visible behavior | Yes |
| Runtime artifact or install behavior | Yes |
| Public docs contract | Usually yes |
| CI-only change | No |
| Contributor-only docs | No |
| Internal package refactor | Usually no |

Product release version bumps are separate from this table. Every merge to
`main` gets a product release version even when this table says no changeset is
required.
