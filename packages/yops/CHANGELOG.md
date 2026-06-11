# @t3x-dev/yops

## 0.5.0

### Minor Changes

- [#1128](https://github.com/t3x-dev/t3x-core/pull/1128) [`43ba36d`](https://github.com/t3x-dev/t3x-core/commit/43ba36d0747bcf3378a2a08e18f631b8a98e84f9) Thanks [@lqw905](https://github.com/lqw905)! - Publish the public alpha package surface and GitHub Release assets for local and YOps.

## 0.4.1

### Patch Changes

- [#1113](https://github.com/t3x-dev/t3x-core/pull/1113) [`96d873f`](https://github.com/t3x-dev/t3x-core/commit/96d873f987f9424c251cc19256a7c5a0e2ff3df4) Thanks [@a996qaq](https://github.com/a996qaq)! - Validate restricted alpha package publishing pipeline.

## 0.4.0

### Minor Changes

- [#1091](https://github.com/t3x-dev/t3x-core/pull/1091) [`917f01f`](https://github.com/t3x-dev/t3x-core/commit/917f01f918a2066cd8755008aa4c4b4372532df9) Thanks [@lqw905](https://github.com/lqw905)! - Release 0.4.0 local runtime and YOps alpha surface updates.

## 0.3.1

### Patch Changes

- [#1048](https://github.com/t3x-dev/t3x-core/pull/1048) [`d1fe2a8`](https://github.com/t3x-dev/t3x-core/commit/d1fe2a8bd0e455221059a6e5dba4bc7d9a8eba0d) Thanks [@lqw905](https://github.com/lqw905)! - Publish a refreshed YOps package with the current operation engine and schema artifacts.

## 0.3.0

### Minor Changes

- [#938](https://github.com/t3x-dev/t3x-core/pull/938) [`b96e862`](https://github.com/t3x-dev/t3x-core/commit/b96e862f393e3471b0c838e6a082cb4e94b632e8) Thanks [@etht3x](https://github.com/etht3x)! - YOps path escape (proposal A′) and document validator skeleton.

  **Path escape — quoted segments.** A path segment that begins with `"` is now read
  as a quoted key with a small escape grammar: `\"` is a literal double quote and
  `\\` is a literal backslash. Every other character inside the quotes is literal,
  including `/`, `[`, `]`, and `=`. Unquoted segments are unchanged. This lets
  paths address keys that legitimately contain reserved characters
  (`config/"db/prod"/host` resolves to the key `db/prod` under `config`) without
  forking the wire format.

  **`tryParsePath`.** Strict parser for the validator. Returns typed
  `UNCLOSED_QUOTE` / `INVALID_ESCAPE` errors instead of falling through to a
  silent literal-key interpretation. Existing callers continue to use `parsePath`,
  which stays permissive.

  **Document validator (`validateYOpsYaml` / `validateYOpsOps`).** New surface
  that returns `YOpsDiagnostic[]` for pre-flight checks: never throws, never
  auto-fixes. Two entry points so callers with parsed objects (API, MCP, CLI)
  don't pay a YAML round-trip. Catches: YAML envelope shape, op-key
  uniqueness/recognition, payload mapping shape, required/unknown/typed/enum
  fields, path-syntax errors, and op-specific cross-field refinements
  (starting with `assert` requiring at least one of `equals`, `exists`, or
  `type` — mirrors the `.refine(...)` clause in `schema.ts` so preflight
  and apply-time agree on which payloads are well-formed).

  **Engine-validator alignment.** The validator deliberately does NOT
  impose a key-format grammar (no SNAKE_CASE_KEY rule). The runtime parser
  and engine accept any non-empty string as a plain key — including
  hyphens, dots, and whitespace — and there are explicit edge-case tests
  covering keys like `my-config.v2` and `my key`. Validator findings must
  not reject inputs the engine would happily apply. Reserved characters
  (`/`, `[`, `]`, `=`, `"`) are addressed via the quoted-segment escape,
  not via a SNAKE_CASE-style restriction.

  **Advisory `YOPS_PATH_LIKELY_DOUBLE_ESCAPED`.** Emitted at `severity:
info` when `\"` patterns appear OUTSIDE any quoted segment (heuristic
  for accidental YAML+YOps double-quoting). Inside a quoted segment `\"`
  is the documented escape for a literal `"` and never triggers the
  advisory. Never blocks apply.

  **Stable diagnostic codes.** All codes documented in `yops.yaml` under
  `diagnostic_codes:` and exported as `YOPS_DIAGNOSTIC_CODES`. Adding new
  codes is non-breaking; renaming or removing requires a major bump.

  Design proposed in [#930](https://github.com/t3x-dev/t3x/issues/930), pending maintainer alignment. Out of scope for
  this release: dry-run preflight (lives in `@t3x-dev/core`, future PR),
  `source_span` population (reserved in the type, returns null for now),
  WebUI / API / MCP / CLI consumer integration (wait for validator to
  stabilise), removing the `. → /` silent normalisation in
  `@t3x-dev/core`'s extractor compiler (separate follow-up; validator
  becomes its first consumer).

### Patch Changes

- [#947](https://github.com/t3x-dev/t3x-core/pull/947) [`7b7c9b6`](https://github.com/t3x-dev/t3x-core/commit/7b7c9b69cf4cf4960327f5050386c8dbe9c6f422) Thanks [@etht3x](https://github.com/etht3x)! - YOps validator–engine alignment: cross-field refinements + rootable paths.

  The pre-flight validator added in [#938](https://github.com/t3x-dev/t3x/issues/938) caught most schema-level errors but missed three classes of misalignment with the runtime engine. Without these fixes, callers using `validateYOpsOps` as a preflight gate would either let invalid payloads through (false negatives) or block valid ones (false positives).

  **Fixed false negatives** (validator was passing inputs the engine rejects):

  - Required non-path string fields must be non-empty: `rename.to`, `nest.under`, `merge.into`. Mirrors `z.string().min(1)` in `schema.ts`. Emits `YOPS_OP_REFINEMENT_VIOLATION`.
  - Outer-level extra keys are rejected. The schema applies `.strict()` to the outer op object; the validator now matches by emitting `YOPS_OP_FIELD_UNKNOWN` for any outer key that isn't the resolved op name or a documented metadata key (`source`).
  - Source metadata is validated against the `SourceSchema` discriminated union: `type` must be `'llm'` or `'human'`; `human` requires non-empty `author`; `llm` requires `turn_ref` with non-empty `turn_hash` and `quote`. Emits `YOPS_OP_REFINEMENT_VIOLATION`.
  - Sequence fields whose elements must be strings (`nest.keys`, `merge.keys`, `pick.keys`, `omit.keys`, and the inner arrays of `split.into`) now have their elements type-checked. Mirrors `z.array(z.string())` clauses. Emits `YOPS_OP_REFINEMENT_VIOLATION`.

  **Fixed false positives** (validator was blocking inputs the engine accepts):

  - `path: ''` on rootable-path ops (`nest`, `split`, `merge`, `pick`, `omit`) targets the document root and is accepted by the runtime parser and engine. The validator no longer emits `YOPS_PATH_EMPTY` for these. Mirrors `RootablePathSchema = z.string()` in `schema.ts` for these five ops.

  **Property-style coverage test.** New `validator-engine-alignment.test.ts` asserts both directions:

  1. Every payload that `validateOps` (zod) rejects must produce at least one error-severity diagnostic from `validateYOpsOps`.
  2. Every payload that `applyYOps` accepts must produce zero error-severity diagnostics from `validateYOpsOps`.

  Adding a new op or schema refinement should add a fixture in both bundles so the alignment stays exhaustive over time.

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
