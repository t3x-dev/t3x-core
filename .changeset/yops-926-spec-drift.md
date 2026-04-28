---
"@t3x-dev/yops": minor
"@t3x-dev/core": patch
---

Close YOps spec ↔ engine ↔ handler contract drift (PR #926, retrospective).

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
