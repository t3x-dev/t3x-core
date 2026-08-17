# @t3x-dev/yops

Declarative operations over JSON-compatible YAML documents. 18 deterministic
ops for human-readable YAML declarations and machine-validated object models.

```text
YAML declaration  ->  YOPS Document Model  ->  updated document
JSON object       ->  YOPS Document Model  ->  updated document
```

## What

`@t3x-dev/yops` validates and applies deterministic operations to
JSON-compatible YAML documents. YAML is the human declaration surface; the
parsed YOPS Document Model is the machine contract.

## Why

T3X uses YOps as the only mutation path for structured YAML state, so LLMs,
humans, and tools can propose changes while deterministic code validates and
applies them.

## Release status

`@t3x-dev/yops@1.1.1` is part of the public T3X alpha release surface.
Package visibility is public on npm.

## Stability policy

`yops.yaml` is the source of truth for operation and field stability. Every
operation and every field must declare one of these statuses:

| Status | Meaning | Maintainer rule |
|--------|---------|-----------------|
| `frozen` | Public contract. Removing it, changing its type, changing its meaning, or making it stricter is breaking. | Add a breaking-change declaration before changing it. |
| `evolving` | Public but still being refined during alpha. Compatible additions are allowed; removals or semantic changes still need a breaking-change declaration. | Prefer additive changes and document migration paths. |
| `experimental` | Not a stable contract yet. Consumers should expect change. | Promote to `evolving` or `frozen` before relying on it in public examples. |

Deprecated fields stay in the spec during their migration window and may declare:

- `deprecated_in`: the YOps spec/package version where deprecation began.
- `replacement_field`: the preferred field to use instead.

The engine returns a structured `DEPRECATED_FIELD` warning when an operation uses
a deprecated field. Warnings never change the deterministic document mutation
result; they are metadata for callers and migration tooling.

## Architecture

YOps has three layers, like OpenAPI / Zod / Hono:

```
YOps (spec)     →  defines what ops exist, their fields, their errors
Registry        →  parses the spec, validates handlers, enforces field contracts
Engine          →  dispatches ops to handlers, executes the pipeline
```

| Layer | File | Role | Analogy |
|-------|------|------|---------|
| **YOps** | `yops.yaml` | Operation spec — fields, rules, errors, test cases | OpenAPI |
| **Registry** | `registry.ts` + `spec.ts` | Parse spec, validate handlers, enforce fields | Zod |
| **Engine** | `engine.ts` + `handlers/` | Dispatch and execute operations | Hono |

The spec is the source of truth. The registry enforces it. The engine executes it.

## Recipe compiler foundation

YOps 1.x keeps the frozen 18-operation runtime union. Higher-level recipes and
macros compile outside the runtime union and must emit ordinary `YOp[]` before
replay. The package exposes profile metadata so callers can distinguish:

- `yops.ops.v1`: frozen 18-op conformance profile pinned to the v1 spec digest.
- `yops.primitives.v2-candidate`: experimental compiler target using
  `assert`, `set`, and `unset` only.

The first built-in compiler is `yops.recipe.replace-path.v1`, a base-aware path
replacement recipe. It expands to `assert + set` or `assert + unset`, so stale
base data fails before mutation. Recipe invocation provenance should be recorded
by proposals or request facts; Effect identity continues to contain only the
compiled operations.

## Install

This command uses the public npm package.

```bash
npm install @t3x-dev/yops
```

## Sample

```typescript
import { applyYOps } from '@t3x-dev/yops';

const doc = { config: { host: 'old' } };

const result = applyYOps(doc, [
  { set: { path: 'config/host', value: 'localhost' } },
  { set: { path: 'config/port', value: 5432 } },
  { define: { path: 'config/features' } },
  { populate: { path: 'config/features', values: { auth: true, logging: true } } },
]);

// result.ok === true
// result.doc === { config: { host: 'localhost', port: 5432, features: { auth: true, logging: true } } }
```

## Operations (18)

### DDL — Structure

| Op | Description | Example |
|----|-------------|---------|
| `define` | Create empty mapping at path | `{ define: { path: 'config/db' } }` |
| `drop` | Remove key and subtree | `{ drop: { path: 'config/legacy' } }` |
| `rename` | Change key name | `{ rename: { path: 'config/db', to: 'database' } }` |

### DML — Data

| Op | Description | Example |
|----|-------------|---------|
| `set` | Set value (creates intermediates) | `{ set: { path: 'config/host', value: 'x' } }` |
| `unset` | Remove key (idempotent) | `{ unset: { path: 'config/password' } }` |
| `populate` | Set multiple keys on mapping | `{ populate: { path: 'config', values: { a: 1, b: 2 } } }` |
| `append` | Add value to sequence | `{ append: { path: 'tags', value: 'new' } }` |

### DTL — Transform

| Op | Description | Example |
|----|-------------|---------|
| `move` | Relocate subtree | `{ move: { from: 'old', to: 'new' } }` |
| `clone` | Deep copy subtree | `{ clone: { from: 'defaults', to: 'prod' } }` |
| `nest` | Group siblings under wrapper | `{ nest: { path: 'config', keys: ['a','b'], under: 'group' } }` |
| `split` | Distribute keys into children | `{ split: { path: 'config', into: { db: ['host','port'] } } }` |
| `fold` | Collapse single-child wrapper | `{ fold: { path: 'config/wrapper' } }` |
| `merge` | Combine sibling mappings | `{ merge: { path: 'config', keys: ['a','b'], into: 'c' } }` |
| `sort` | Sort sequence | `{ sort: { path: 'items', by: 'name' } }` |
| `unique` | Deduplicate sequence | `{ unique: { path: 'tags' } }` |
| `pick` | Keep only listed keys | `{ pick: { path: 'config', keys: ['host'] } }` |
| `omit` | Remove listed keys | `{ omit: { path: 'config', keys: ['secret'] } }` |

### DCL — Control

| Op | Description | Example |
|----|-------------|---------|
| `assert` | Validate condition (read-only) | `{ assert: { path: 'version', equals: 2 } }` |

## Extension Policy

The 18 core operations are the YOPS 1.x conformance surface. New operation
ideas start as experimental namespaced extensions and are excluded from core
conformance until promoted with production evidence, tests, and stability
review.

## Path Syntax

```
config/database/host          # mapping keys
items/[0]                     # array by index
users/[name=alice]/role       # array by key match (with type coercion)
```

Quoted segments address keys containing reserved characters, for example
`config/"db/prod"/host`. Runtime operations reject malformed quoted or bracket
segments before mutation.

An index path such as `items/[0]` addresses an existing sequence element.
`set` rejects indexes outside the current sequence instead of creating sparse
arrays; use `append` to add a new final element.

## Execution Model

- Sequential — each op sees the result of previous ops
- Fail-fast — stops at first error
- Immutable — input document is never mutated
- Field validation — rejects missing/unknown fields before handler runs

## Error Codes

| Code | Meaning |
|------|---------|
| `PATH_NOT_FOUND` | Path does not exist |
| `ALREADY_EXISTS` | Target already exists |
| `NOT_A_MAPPING` | Expected mapping, got something else |
| `NOT_A_SEQUENCE` | Expected sequence, got something else |
| `NOT_FOLDABLE` | Mapping has != 1 child key |
| `INVALID_PATH` | Path syntax error or type mismatch |
| `INVALID_OP` | Missing/unknown field or invalid enum value |
| `ASSERTION_FAILED` | Assert condition not met |
| `UNKNOWN_OP` | Operation name not recognized |

## API

```typescript
// Execute operations
applyYOps(doc: YValue, ops: YOp[]): YOpsResult

// Validate operations without executing
validateOps(ops: unknown[]): ValidationResult

// Parse YAML string to ops array
parseYOpsYaml(yaml: string): ParseResult

// Classify op category
classifyYOp(op: YOp): 'ddl' | 'dml' | 'dtl' | 'dcl'

// Compile a base-aware path replacement recipe to primitive YOps
compileYOpsPathReplacement(input): readonly YOp[]
```

## The Spec

`yops.yaml` is the canonical specification. It defines all 18 operations, their fields, rules, error codes, and executable test cases. Any language can implement a YOps engine by:

1. Parsing `yops.yaml`
2. Implementing 18 handler functions
3. Running the spec's test cases for conformance

The TypeScript package is the reference implementation.

## License

[Apache License 2.0](../../LICENSE)
