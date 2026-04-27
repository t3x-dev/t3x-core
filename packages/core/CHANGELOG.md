# @t3x-dev/core

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
