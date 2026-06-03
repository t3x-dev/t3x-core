# @t3x-dev/yops

Declarative YAML operations. 18 atomic ops for any YAML document.

```
YAML in  →  YOps  →  YAML out
```

## Release status

`@t3x-dev/yops@0.3.1` is part of the restricted T3X alpha release surface.
Package visibility may be limited to accounts with alpha access.

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

## Install

```bash
npm install @t3x-dev/yops
```

## Quick Start

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

## Path Syntax

```
config/database/host          # mapping keys
items/[0]                     # array by index
users/[name=alice]/role       # array by key match (with type coercion)
```

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
```

## The Spec

`yops.yaml` is the canonical specification. It defines all 18 operations, their fields, rules, error codes, and executable test cases. Any language can implement a YOps engine by:

1. Parsing `yops.yaml`
2. Implementing 18 handler functions
3. Running the spec's test cases for conformance

The TypeScript package is the reference implementation.

## License

[Apache License 2.0](./LICENSE)
