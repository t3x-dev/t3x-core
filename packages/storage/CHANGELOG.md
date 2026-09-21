# @t3x-dev/storage

## 1.4.0

### Minor Changes

- [#1577](https://github.com/t3x-dev/t3x-core/pull/1577) [`00e817a`](https://github.com/t3x-dev/t3x-core/commit/00e817af6e4df1f5fd1b6a11b05d012b40560267) Thanks [@jjy0230](https://github.com/jjy0230)! - Validate archive-local repository records, canonical object identities, commit
  membership, branch heads and parent closure using the shared CommitV2 verifier.
  Reject unknown fields, duplicates, unbounded inputs and external object resolution.
  Structural integrity does not authorize restore or prove policy evaluation/replay.

- [#1577](https://github.com/t3x-dev/t3x-core/pull/1577) [`00e817a`](https://github.com/t3x-dev/t3x-core/commit/00e817af6e4df1f5fd1b6a11b05d012b40560267) Thanks [@jjy0230](https://github.com/jjy0230)! - Expose legacy YOps through a project-scoped historical-evidence API and preserve user-removed
  rows by archiving them out of active replay instead of physically deleting their audit content.

- [#1577](https://github.com/t3x-dev/t3x-core/pull/1577) [`00e817a`](https://github.com/t3x-dev/t3x-core/commit/00e817af6e4df1f5fd1b6a11b05d012b40560267) Thanks [@jjy0230](https://github.com/jjy0230)! - Publish immutable author description, README, tags and image resources alongside
  an exact project commit. Verify content hashes and project permissions, preserve
  historical bundles, and keep author sidecars out of business YAML/JSON exports.

- [#1577](https://github.com/t3x-dev/t3x-core/pull/1577) [`00e817a`](https://github.com/t3x-dev/t3x-core/commit/00e817af6e4df1f5fd1b6a11b05d012b40560267) Thanks [@jjy0230](https://github.com/jjy0230)! - Add explicit Workspace downloads of exact committed YAML/JSON with idempotent delivery receipts. Preserve generation targets as legacy instead of creating new Leaves. Schema v73 adds delivery evidence independently of CommitV2.

### Patch Changes

- [#1577](https://github.com/t3x-dev/t3x-core/pull/1577) [`00e817a`](https://github.com/t3x-dev/t3x-core/commit/00e817af6e4df1f5fd1b6a11b05d012b40560267) Thanks [@jjy0230](https://github.com/jjy0230)! - Add a permission-aware published Schema Catalog projection with immutable release references, literal search, loose tag filters, editorial collections and stable pagination. Keep definition metadata separate from starter data and runtime validation claims.

- [#1577](https://github.com/t3x-dev/t3x-core/pull/1577) [`00e817a`](https://github.com/t3x-dev/t3x-core/commit/00e817af6e4df1f5fd1b6a11b05d012b40560267) Thanks [@jjy0230](https://github.com/jjy0230)! - Allow Schema releases to pin an integrity-checked author introduction and bundled cover image. Require project edit authority for Schema publication, identity/lifecycle changes and composition writes. Keep private introduction references out of public and foreign-project catalog results.

- [#1577](https://github.com/t3x-dev/t3x-core/pull/1577) [`00e817a`](https://github.com/t3x-dev/t3x-core/commit/00e817af6e4df1f5fd1b6a11b05d012b40560267) Thanks [@jjy0230](https://github.com/jjy0230)! - Persist exact Schema Studio candidate references with idempotent addition, scoped removal and live source access checks. Resolve latest once, redact unavailable sources, and keep candidates separate from Workspace bindings.

- [#1577](https://github.com/t3x-dev/t3x-core/pull/1577) [`00e817a`](https://github.com/t3x-dev/t3x-core/commit/00e817af6e4df1f5fd1b6a11b05d012b40560267) Thanks [@jjy0230](https://github.com/jjy0230)! - Validate project archive JSON payload framing, UTF-8, declared record counts and per-record byte bounds in addition to checksums. Full graph validation and restore remain separate boundaries.

- Updated dependencies []:
  - @t3x-dev/core@1.3.1

## 1.2.1

### Patch Changes

- [#1365](https://github.com/t3x-dev/t3x-core/pull/1365) [`0fd3a1c`](https://github.com/t3x-dev/t3x-core/commit/0fd3a1c975177137228ce98b2f2982db4400ca3d) Thanks [@etht3x](https://github.com/etht3x)! - Persist merge decisions separately from deterministic preparation, protect autosaves with decision revisions, and retain a read-only compatibility path for legacy embedded decisions.

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

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@1.0.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`6e91a08`](https://github.com/t3x-dev/t3x-core/commit/6e91a0887edb3b61397d9ca4ddda9f1b85d41ea7)]:
  - @t3x-dev/core@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [[`17e9670`](https://github.com/t3x-dev/t3x-core/commit/17e9670c2bc64e8d623cc82ee4bb54cb307d7dc4), [`235dd13`](https://github.com/t3x-dev/t3x-core/commit/235dd13c82ed3639f2b2e5554a00e4d75d01623f), [`b6c1828`](https://github.com/t3x-dev/t3x-core/commit/b6c18280a67c942945dc0ab5a2e8b06dde9d01e2)]:
  - @t3x-dev/core@0.2.0

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [[`53c17f7`](https://github.com/t3x-dev/t3x-core/commit/53c17f7d04e50eed6e24e4d4c7ac4e951df112f4)]:
  - @t3x-dev/core@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.1.2

## 0.0.5

### Patch Changes

- [#814](https://github.com/t3x-dev/t3x-core/pull/814) [`89ca840`](https://github.com/t3x-dev/t3x-core/commit/89ca84057e9ca5e965f4720c75753d39f13cacd3) Thanks [@lqw905](https://github.com/lqw905)! - Fix release blockers across core packages, including test and compatibility issues in @t3x-dev/core, @t3x-dev/yops, @t3x-dev/api, @t3x-dev/storage, and @t3x-dev/mcp-lib. This release improves build/test stability, aligns edge-case behavior with the current spec, and resolves issues blocking the automated release pipeline.

- Updated dependencies [[`89ca840`](https://github.com/t3x-dev/t3x-core/commit/89ca84057e9ca5e965f4720c75753d39f13cacd3)]:
  - @t3x-dev/core@0.0.5

## 0.0.4

### Patch Changes

- Add token usage metering across all LLM call sites. Unified LLMGenerateResult with usage tracking, token_usage table, per-endpoint breakdown query, and GET /v1/usage endpoint extension. User profile update and API key user scoping.

- Updated dependencies []:
  - @t3x-dev/core@0.0.4

## 0.0.3

### Patch Changes

- add skipBuiltinAuth option to createApp

- Updated dependencies []:
  - @t3x-dev/core@0.0.3

## 0.0.2

### Patch Changes

- Add frame-graph types, Delta, SemanticContent exports and fix postgres migration

- Updated dependencies []:
  - @t3x-dev/core@0.0.2

## 0.2.0

### Minor Changes

- Initial release

### Patch Changes

- Updated dependencies []:
  - @t3x-dev/core@0.2.0
