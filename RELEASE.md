# T3X Release Surface

This document declares the package surface for the current T3X alpha. The
machine-readable source of truth is [`release/surface.yaml`](release/surface.yaml);
this file is the human-readable mirror.

## NPM Release Packages

| Package | Path | Access | Tier | Publish State | Release Train | Why Published |
|---|---|---|---|---|---|---|
| `@t3x-dev/local` | `apps/local` | public | alpha | applied | paused | Existing public local installer; runtime artifact publishing stays explicit. |
| `@t3x-dev/yops` | `packages/yops` | public | alpha | applied | active | Deterministic YAML operation contract. |
| `@t3x-dev/transition` | `packages/transition` | public | alpha | applied | active | Protocol contracts, Replay, identity, and integrity verification for third-party agents and MCP tools. |
| `@t3x-dev/yschema` | `packages/yschema` | public | alpha | applied | active | Schema validation candidate for schema-backed structured state. |

`npm_publish: true` means the package is part of the alpha npm release surface.
`access: public` means the package is available through the public npm registry.
`release_train: active` means automated package release preparation may select
the package. `release_train: paused` keeps an existing public package available
without selecting it in the default release train.

## Restricted Packages

These packages exist in the repository but are not part of the alpha npm release
surface. They may be promoted later after API stability review:

- `@t3x-dev/core`
- `@t3x-dev/api`
- `@t3x-dev/api-client`
- `@t3x-dev/cli`
- `@t3x-dev/mcp`
- `@t3x-dev/storage`
- `@t3x-dev/runner`

## Rules

- `release/surface.yaml` is the source of truth for automation.
- `RELEASE.md` must list the same npm-published packages as `release/surface.yaml`.
- NPM-published packages must have a README before the publish flip.
- Package releases may publish an active release-train package subset.
- Paused packages stay public but are not selected by automated package
  publishing.
- Internal and preview workspace versions are source bookkeeping values; when
  Changesets changes them during package versioning, they are synchronized to
  the Product Release version. This does not make those packages publishable.
- NPM package additions, removals, or downgrades require owner approval and
  a stability note.
- Removing a package from the npm release surface is a breaking change.

## Changelog

- 2026-08-10: Promoted `@t3x-dev/transition` into the public alpha npm release
  surface, paused `@t3x-dev/local` from automated release-train publishing, and
  allowed active packages to release independently.
- 2026-06-29: Promoted `@t3x-dev/yschema` into the public alpha npm release
  surface alongside `@t3x-dev/local` and `@t3x-dev/yops`.
- 2026-06-01: Kept the npm release surface to `@t3x-dev/local` and
  `@t3x-dev/yops`.
- 2026-05-31: Initial alpha declaration.
