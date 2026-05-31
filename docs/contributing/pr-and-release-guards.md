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

The expected baseline for PRs into `dev` is:

```bash
pnpm check
pnpm test
pnpm build
```

Large PRs may need more targeted smoke checks. Release PRs into `main` use the
full release guard described in [Alpha release flow](../release/alpha-release-flow.md).

## Protected Files

Changes to these areas require owner review:

- `.github/`
- `docs/release/`
- `release/`
- `RELEASE.md`
- `STABILITY.md`
- `CODEOWNERS`

## Review Tools

AI review tools can help catch mistakes, but they are not the source of truth.
Hard merge decisions should be based on:

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
