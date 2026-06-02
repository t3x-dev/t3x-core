# @t3x-dev/core

## 0.3.1

### Patch Changes

- Updated dependencies [[`d1fe2a8`](https://github.com/t3x-dev/t3x-core/commit/d1fe2a8bd0e455221059a6e5dba4bc7d9a8eba0d)]:
  - @t3x-dev/yops@0.3.1
  - @t3x-dev/yschema@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [[`b96e862`](https://github.com/t3x-dev/t3x-core/commit/b96e862f393e3471b0c838e6a082cb4e94b632e8), [`7b7c9b6`](https://github.com/t3x-dev/t3x-core/commit/7b7c9b69cf4cf4960327f5050386c8dbe9c6f422)]:
  - @t3x-dev/yops@0.3.0
  - @t3x-dev/yschema@0.3.0

## 0.2.0

### Patch Changes

- [#935](https://github.com/t3x-dev/t3x-core/pull/935) [`17e9670`](https://github.com/t3x-dev/t3x-core/commit/17e9670c2bc64e8d623cc82ee4bb54cb307d7dc4) Thanks [@etht3x](https://github.com/etht3x)! - Tie the v2 extractor compiler's pre-existing-path seed to contributing items only.

  `compileExtractionDraft` previously walked every input draft item to build the
  `preExisting` set passed into `dedupeDefineOps`. That made dropped items —
  items that failed compile in `allowPartial` mode, or items the empty-defines
  guard filtered out — silently contribute their `target_ref.path` to
  ancestor-define injection. A surviving sibling add at a fresh path could
  then lose its required `define` ancestor because the dropped item's
  unverified existence claim had already marked the ancestor as known.

  The seed is now collected inline as each item is judged: only items whose ops
  survive the compile failure / empty-defines / dropped-malformed-target checks
  contribute to `preExisting`. Behavioural impact is limited to the buggy case
  above; every existing regression test passes unchanged.

  Closes [#932](https://github.com/t3x-dev/t3x/issues/932).

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

- Updated dependencies [[`235dd13`](https://github.com/t3x-dev/t3x-core/commit/235dd13c82ed3639f2b2e5554a00e4d75d01623f), [`b6c1828`](https://github.com/t3x-dev/t3x-core/commit/b6c18280a67c942945dc0ab5a2e8b06dde9d01e2)]:
  - @t3x-dev/yops@0.2.0
  - @t3x-dev/yschema@0.2.0

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/yops@0.1.5
  - @t3x-dev/yschema@0.1.5

## 0.1.4

### Patch Changes

- [#913](https://github.com/t3x-dev/t3x-core/pull/913) [`53c17f7`](https://github.com/t3x-dev/t3x-core/commit/53c17f7d04e50eed6e24e4d4c7ac4e951df112f4) Thanks [@etht3x](https://github.com/etht3x)! - Repair extraction quotes against markdown-stripped turn content

  When a turn carries inline markdown (`**bold**`, `*italic*`, `` `code` ``)
  but the LLM extractor quotes the rendered (stripped) text, the bare quote
  isn't a substring of raw turn content and source validation hard-fails.

  `repairOpQuotes` now projects raw turn content into a stripped form while
  preserving a per-character map back to raw indices. A first-occurrence
  match in stripped maps to a contiguous raw span (which embeds whatever
  markers fell inside the matched stretch) — preserving the verbatim-
  substring invariant. Determinism is mechanical: single left-to-right
  scan, no regex backtracking, no fuzzy scoring, no fragment stitching.

  Reduces `unverifiable_quote` failures for assistant turns that use bold
  or inline-code formatting in the source text.

- Updated dependencies []:
  - @t3x-dev/yops@0.1.4
  - @t3x-dev/yschema@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/yops@0.1.3
  - @t3x-dev/yschema@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/yops@0.1.2
  - @t3x-dev/yschema@0.1.2

## 0.0.5

### Patch Changes

- [#814](https://github.com/t3x-dev/t3x-core/pull/814) [`89ca840`](https://github.com/t3x-dev/t3x-core/commit/89ca84057e9ca5e965f4720c75753d39f13cacd3) Thanks [@lqw905](https://github.com/lqw905)! - Fix release blockers across core packages, including test and compatibility issues in @t3x-dev/core, @t3x-dev/yops, @t3x-dev/api, @t3x-dev/storage, and @t3x-dev/mcp-lib. This release improves build/test stability, aligns edge-case behavior with the current spec, and resolves issues blocking the automated release pipeline.

- Updated dependencies [[`89ca840`](https://github.com/t3x-dev/t3x-core/commit/89ca84057e9ca5e965f4720c75753d39f13cacd3)]:
  - @t3x-dev/yops@0.1.1
  - @t3x-dev/yschema@0.1.1

## 0.0.4

### Patch Changes

- Add token usage metering across all LLM call sites. Unified LLMGenerateResult with usage tracking, token_usage table, per-endpoint breakdown query, and GET /v1/usage endpoint extension. User profile update and API key user scoping.

## 0.0.3

### Patch Changes

- add skipBuiltinAuth option to createApp

## 0.0.2

### Patch Changes

- Add frame-graph types, Delta, SemanticContent exports and fix postgres migration

## 0.2.0

### Minor Changes

- Initial release
