# @t3x-dev/yops

## 0.2.0

### Minor Changes

- [#929](https://github.com/t3x-dev/t3x-core/pull/929) [`235dd13`](https://github.com/t3x-dev/t3x-core/commit/235dd13c82ed3639f2b2e5554a00e4d75d01623f) Thanks [@etht3x](https://github.com/etht3x)! - Close YOps spec ↔ engine ↔ handler contract drift (PR [#926](https://github.com/t3x-dev/t3x/issues/926), retrospective).

  Externally-observable changes consumers should know about:

  - **`define` is strict.** Parent must exist and be a mapping; no more
    silent mkdir-p, no more replacing a scalar/null/array intermediate
    with `{}`. Returns `PATH_NOT_FOUND` or `NOT_A_MAPPING` instead.
    To create a multi-segment path, define each ancestor explicitly.
  - **`formatYOps` emits `{ yops: [...] }`** instead of a bare array,
    matching the spec's normative root form. `parseYOpsYaml` now accepts
    both shapes for backwards compatibility.
  - **Error code corrections.** Several handlers now distinguish "path
    missing" from "wrong type" instead of folding both into one code:
    - `pick` / `omit`: missing path → `PATH_NOT_FOUND` (was `NOT_A_MAPPING`).
    - `fold`: missing path → `PATH_NOT_FOUND` (was `NOT_FOLDABLE`).
    - `nest` / `merge`: missing path → `PATH_NOT_FOUND` (was `NOT_A_MAPPING`),
      missing sibling key → `NOT_SIBLINGS` (was `PATH_NOT_FOUND`).
    - `split`: missing path → `PATH_NOT_FOUND` (was `NOT_A_MAPPING`).
    - `rename`: dropped the unreachable `NOT_A_MAPPING` branch from the
      declared error set; the handler couldn't actually emit it.
  - **`sort` / `unique` are language-portable.** String comparison now
    uses Unicode codepoints (not UTF-16 code units, not locale collation);
    `unique` equality uses canonical encoding with mapping keys sorted by
    codepoint, so `{a:1,b:2}` and `{b:2,a:1}` deduplicate as expected
    regardless of YAML key order.
  - **Engine boundary is now defensive.** Malformed ops from
    `parseYOpsYaml` (`null`, scalar, array, `{ set: null }`,
    `{ set: 'x' }`) now yield typed `INVALID_OP` instead of throwing a
    TypeError.
  - **Op-key resolution skips `source` metadata.** A YAML emitter that
    sorts keys alphabetically and produces `{ source, set: ... }` now
    applies and classifies correctly as `set` instead of falling through.

  Internal change in `@t3x-dev/core`: the v2 extractor compiler now emits
  ancestor `define` ops automatically when a multi-segment path is being
  created, so the strict `define` semantics don't break extraction.

  Spec coverage: `yops.yaml` now declares every error code each handler
  emits, every declared code is exercised by at least one conformance test
  case, and `error_reference.thrown_by` is rebuilt from a static handler
  scan. A new `error-contracts.test.ts` keeps all three layers locked
  together.

- [#934](https://github.com/t3x-dev/t3x-core/pull/934) [`b6c1828`](https://github.com/t3x-dev/t3x-core/commit/b6c18280a67c942945dc0ab5a2e8b06dde9d01e2) Thanks [@etht3x](https://github.com/etht3x)! - Declare op-path metadata as part of the YOps spec.

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

## 0.1.5

## 0.1.4

## 0.1.3

## 0.1.2

## 0.1.1

### Patch Changes

- [#814](https://github.com/t3x-dev/t3x-core/pull/814) [`89ca840`](https://github.com/t3x-dev/t3x-core/commit/89ca84057e9ca5e965f4720c75753d39f13cacd3) Thanks [@lqw905](https://github.com/lqw905)! - Fix release blockers across core packages, including test and compatibility issues in @t3x-dev/core, @t3x-dev/yops, @t3x-dev/api, @t3x-dev/storage, and @t3x-dev/mcp-lib. This release improves build/test stability, aligns edge-case behavior with the current spec, and resolves issues blocking the automated release pipeline.
