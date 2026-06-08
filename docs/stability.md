# Stability Summary

T3X is in restricted alpha. The release-facing contract is intentionally narrow
while the core product and package boundaries harden.

## Current Release Surface

The restricted alpha release surface is:

- `@t3x-dev/local`
- `@t3x-dev/yops`

The source of truth is [`RELEASE.md`](../RELEASE.md) and
[`release/surface.yaml`](../release/surface.yaml). Other packages remain internal
or preview until explicitly promoted.

## What Alpha Means

- External use is expected, but package access may be restricted.
- Breaking changes are allowed when they are intentional, reviewed, and
  documented.
- User-visible package changes require a changeset.
- Public behavior should have tests, smoke checks, or conformance coverage
  appropriate to the risk.

## YOps Contract

YOps is part of the restricted alpha surface. Its runtime source of truth is
`packages/yops/yops.yaml`.

Contract-bearing YOps changes include operation names, operation families,
fields, field types, enum values, path syntax, runtime error codes, validator
diagnostic codes, conformance cases, recipes, and examples.

See [`docs/release/stability-policy.md`](release/stability-policy.md) for
the full policy, including the gate for future YOps spec-tightening PRs.

## Preview and Internal Surfaces

CLI, MCP, API, runner, storage, and other workspace packages are available for
source development and preview integration work. Their external contracts may
change before promotion.
