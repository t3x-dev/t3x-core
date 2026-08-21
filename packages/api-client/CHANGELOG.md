# @t3x-dev/api-client

## 1.3.0

### Minor Changes

- [#1358](https://github.com/t3x-dev/t3x-core/pull/1358) [`7b56ef2`](https://github.com/t3x-dev/t3x-core/commit/7b56ef20168650e04567611757963d87e12d16da) Thanks [@lqw905](https://github.com/lqw905)! - Add the open YSchema Module Composition v2 contract, deterministic compiler, and immutable Blueprint-backed Schema Version publishing while preserving v1 Composition replay compatibility.

### Patch Changes

- Updated dependencies [[`3124c5a`](https://github.com/t3x-dev/t3x-core/commit/3124c5a7dc87625bec37f3ae05fab2d097812d5e)]:
  - @t3x-dev/core@1.2.1

## 1.0.2

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@1.0.1

## 1.0.0

## Unreleased

- Add `client.generation` for complete and streaming model invocation and provider discovery.
- Add `client.sourceThreads` for durable source metadata, immutable turns, context, and repository evidence.
- Keep the existing `chat`, conversation, and turn methods as deprecated compatibility aliases over the same `/v1/chat*`, `/v1/conversations*`, and `/v1/turns*` routes.
- Correct the typed Generation response and provider-catalog shapes to match the existing API wire contract.
- Require `project_id` when appending a turn, matching the existing server contract.
- Remove the unusable `listAgentDrafts` method, whose advertised endpoint never existed.

## 0.6.0

## 0.5.1

## 0.5.0

## 0.4.1

## 0.4.0

## 0.3.1

## 0.3.0

## 0.2.0

## 0.1.5

## 0.1.4

## 0.1.3

## 0.1.2

## 0.2.0

### Minor Changes

- Initial release
