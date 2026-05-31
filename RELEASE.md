# T3X Release Surface

This document declares the package surface for the current T3X alpha. The
machine-readable source of truth is [`release/surface.yaml`](release/surface.yaml);
this file is the human-readable mirror.

## Public Packages

| Package | Path | Tier | Publish State | Why Public |
|---|---|---|---|---|
| `@t3x-dev/local` | `apps/local` | alpha | pending | First-door local installer and no-key demo entrypoint. |
| `@t3x-dev/yops` | `packages/yops` | alpha | pending | Public deterministic YAML operation contract. |

`publish_state: pending` means the package is in the intended alpha public
surface, but its `package.json` still has `publishConfig.access: restricted`.
The publish flip is handled separately by the local publish workstream.

## Restricted Packages

These packages exist in the repository but are not part of the alpha public
surface. They may be promoted later after API stability review:

- `@t3x-dev/core`
- `@t3x-dev/yschema`
- `@t3x-dev/api-client`
- `@t3x-dev/cli`
- `@t3x-dev/mcp`
- `@t3x-dev/api`
- `@t3x-dev/storage`
- `@t3x-dev/runner`

## Rules

- `release/surface.yaml` is the source of truth for automation.
- `RELEASE.md` must list the same public packages as `release/surface.yaml`.
- Public packages must have a README before the publish flip.
- Public package additions, removals, or downgrades require owner approval and
  a stability note.
- Removing a package from the public surface is a breaking change.

## Changelog

- 2026-05-31: Initial alpha declaration. `@t3x-dev/local` and `@t3x-dev/yops`
  are marked public with pending publish flips.
