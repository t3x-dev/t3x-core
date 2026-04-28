---
"@t3x-dev/yops": minor
"@t3x-dev/core": patch
---

Declare op-path metadata as part of the YOps spec.

Each op in `yops.yaml` now carries a `path_fields:` block naming the field(s)
that hold YOps paths, with three roles:

- `primary` — single-path ops (`define.path`, `set.path`, etc.).
- `source` — read-from path on two-path ops (`move.from`, `clone.from`).
- `destination` — write-to path on two-path ops (`move.to`, `clone.to`).

The TS reference engine surfaces this via `OpSpec.path_fields` and a new
`OpRegistry.getOpPaths(op)` that returns each path tagged by role. A new
contract test in `packages/yops/__tests__/path-fields.test.ts` enforces
that every op declares `path_fields`, every declared field name actually
exists in the op's `fields:` block, and only known roles appear.

Internal change in `@t3x-dev/core`: `compiler.ts` replaces the hardcoded
18-op `primaryPathOf` switch with a registry lookup. Adding a 19th op
upstream now only needs the op to declare its `path_fields:` — no
follow-up edit in core.
