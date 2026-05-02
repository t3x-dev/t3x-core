---
"@t3x-dev/yops": patch
---

YOps validator–engine alignment: cross-field refinements + rootable paths.

The pre-flight validator added in #938 caught most schema-level errors but missed three classes of misalignment with the runtime engine. Without these fixes, callers using `validateYOpsOps` as a preflight gate would either let invalid payloads through (false negatives) or block valid ones (false positives).

**Fixed false negatives** (validator was passing inputs the engine rejects):
- Required non-path string fields must be non-empty: `rename.to`, `nest.under`, `merge.into`. Mirrors `z.string().min(1)` in `schema.ts`. Now emits `YOPS_OP_REFINEMENT_VIOLATION`.

**Fixed false positives** (validator was blocking inputs the engine accepts):
- `path: ''` on rootable-path ops (`nest`, `split`, `merge`, `pick`, `omit`) targets the document root and is accepted by the runtime parser and engine. The validator no longer emits `YOPS_PATH_EMPTY` for these. Mirrors `RootablePathSchema = z.string()` in `schema.ts` for these five ops.

**Property-style coverage test.** New `validator-engine-alignment.test.ts` asserts both directions:
1. Every payload that `validateOps` (zod) rejects must produce at least one error-severity diagnostic from `validateYOpsOps`.
2. Every payload that `applyYOps` accepts must produce zero error-severity diagnostics from `validateYOpsOps`.

Adding a new op or schema refinement should add a fixture in both bundles so the alignment stays exhaustive over time.
