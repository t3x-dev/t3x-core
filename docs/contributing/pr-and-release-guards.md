# PR and Release Guards

This document describes the practical guardrails contributors should follow
when opening pull requests during alpha.

## Ordinary Development PRs

Target ordinary pull requests at `dev`.

Before requesting review:

- Link the issue the PR resolves.
- Fill in release impact.
- Run the smallest relevant local verification commands.
- Add a changeset if the PR changes user-visible behavior for `@t3x-dev/local`,
  `@t3x-dev/yops`, `@t3x-dev/transition`, or `@t3x-dev/yschema`.

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
- A `Package Releases` section containing either `- None` or the active package
  release subset with concrete target versions, for example
  `- \`@t3x-dev/yops\`: 1.0.1`. One-time first publishes may use the current
  source version with an explicit marker, for example
  `- \`@t3x-dev/transition\`: 0.1.0 (first publish)`.

The scheduled Release Train creates draft Product Release PRs in code-only mode
by default. These PRs should use `Package Releases: - None` unless a maintainer
manually chooses package release mode. `@t3x-dev/local` remains an existing
public alpha package, but it is paused for scheduled package publishing because
the local runtime artifact path needs explicit runtime, install, and no-key demo
review. The active package release train currently includes `@t3x-dev/yops`,
`@t3x-dev/transition`, and `@t3x-dev/yschema`.

The release PR policy check also validates changeset files:

- `Package Releases: - None` rejects checked-in changesets for active or paused
  release-train packages.
- Package release entries require at least one matching `.changeset/*.md`,
  except entries explicitly marked `(first publish)` whose version matches the
  package's current `package.json`.
- Package release entries use final target package versions, not changeset bump
  types like `patch`, `minor`, or `major`.
- Listed active packages must appear in changeset frontmatter.
- Active packages in changeset frontmatter must appear in `Package Releases`.
- Paused packages, including `@t3x-dev/local`, cannot be listed in Package
  Releases by the scheduled release train.

The product release version is independent from npm package versions. If the
release publishes no packages, write `- None` in `Package Releases`; final
GitHub Release notes omit package information for code-only releases.
When package publishing does run, npm remains the primary install source, and
the packed npm package tarballs are also uploaded to the product GitHub Release
`t3x-vx.y.z` as archived assets for audit and direct download.

Internal and preview workspace source versions are repository bookkeeping
values. `pnpm version-packages` runs Changesets first, then synchronizes only
the internal source `package.json` versions that Changesets already changed to
the current T3X product release version. Public npm packages keep their own
package versions: `@t3x-dev/local`, `@t3x-dev/yops`,
`@t3x-dev/transition`, and `@t3x-dev/yschema`.

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
| `@t3x-dev/transition` user-visible behavior | Yes |
| `@t3x-dev/yschema` user-visible behavior | Yes |
| Runtime artifact or install behavior | Yes |
| Public docs contract | Usually yes |
| CI-only change | No |
| Contributor-only docs | No |
| Internal package refactor | Usually no |

Product release version bumps are separate from this table. Every merge to
`main` gets a product release version even when this table says no changeset is
required.
