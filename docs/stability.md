# Stability Summary

T3X is in public alpha. The release-facing contract is intentionally narrow
while the core product and package boundaries harden.

## Current Release Surface

The public alpha release surface is:

- `@t3x-dev/local`
- `@t3x-dev/yops`
- `@t3x-dev/yschema`

The source of truth is [`RELEASE.md`](../RELEASE.md) and
[`release/surface.yaml`](../release/surface.yaml). Other packages remain internal
or preview until explicitly promoted.

## What Alpha Means

- External use is expected through the public npm package surface.
- Breaking changes are allowed when they are intentional, reviewed, and
  documented.
- User-visible package changes require a changeset.
- Public behavior should have tests, smoke checks, or conformance coverage
  appropriate to the risk.

## YOps Contract

YOps is part of the public alpha surface. Its runtime source of truth is
`packages/yops/yops.yaml`.

Contract-bearing YOps changes include operation names, operation families,
fields, field types, enum values, path syntax, YAML declaration profile, parser
behavior, canonical serialization, runtime error codes, validator diagnostic
codes, conformance cases, recipes, and examples.

New YOps operation names are not added directly to the frozen core surface.
They start as experimental extensions and require conformance cases before
promotion.

See [`docs/release/stability-policy.md`](release/stability-policy.md) for
the full policy, including the gate for future YOps spec-tightening PRs.

## YSchema Contract

YSchema is part of the public alpha surface as a validation candidate for
schema-backed structured state. Its public API can still evolve during alpha,
but user-visible behavior changes require a changeset and release notes.

## Preview and Internal Surfaces

CLI, MCP, API, runner, storage, and other workspace packages are available for
source development and preview integration work. Their external contracts may
change before promotion.
