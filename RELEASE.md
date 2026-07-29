# T3X Release Surface

This document declares the package surface for the current T3X alpha. The
machine-readable source of truth is [`release/surface.yaml`](release/surface.yaml);
this file is the human-readable mirror.

## NPM Release Packages

| Package | Path | Access | Tier | Publish State | Why Published |
|---|---|---|---|---|---|
| `@t3x-dev/local` | `apps/local` | public | alpha | applied | First-door local installer and no-key demo entrypoint. |
| `@t3x-dev/yops` | `packages/yops` | public | alpha | applied | Deterministic YAML operation contract. |
| `@t3x-dev/yschema` | `packages/yschema` | public | alpha | applied | Schema validation candidate for schema-backed structured state. |

`npm_publish: true` means the package is part of the alpha npm release surface.
`access: public` means the package is available through the public npm registry.

## Restricted Packages

These packages exist in the repository but are not part of the alpha npm release
surface. They may be promoted later after API stability review:

- `@t3x-dev/core`
- `@t3x-dev/api-client`
- `@t3x-dev/cli`
- `@t3x-dev/mcp`
- `@t3x-dev/api`
- `@t3x-dev/storage`
- `@t3x-dev/runner`

## Rules

- `release/surface.yaml` is the source of truth for automation.
- `RELEASE.md` must list the same npm-published packages as `release/surface.yaml`.
- NPM-published packages must have a README before the publish flip.
- NPM package additions, removals, or downgrades require owner approval and
  a stability note.
- Removing a package from the npm release surface is a breaking change.

## Changelog

- 2026-06-29: Promoted `@t3x-dev/yschema` into the public alpha npm release
  surface alongside `@t3x-dev/local` and `@t3x-dev/yops`.
- 2026-06-01: Kept the npm release surface to `@t3x-dev/local` and
  `@t3x-dev/yops`.
- 2026-05-31: Initial alpha declaration.
