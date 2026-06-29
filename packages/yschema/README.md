# @t3x-dev/yschema

Schema validation helpers for T3X structured state. YSchema is the alpha
validation candidate that checks schema-backed YAML data and can report
deterministic fixes as YOps-compatible operations.

## What

`@t3x-dev/yschema` validates structured YAML values against a small schema
contract used by T3X. It is designed to sit next to YOps: YSchema checks state,
and YOps remains the deterministic mutation path.

## Why

T3X needs schema-backed state to be reviewable before it becomes a commit.
YSchema gives callers a package-level validation surface for catching shape
issues and preparing deterministic repair operations without requiring an LLM
in the mutation path.

## Release status

`@t3x-dev/yschema` is part of the public T3X alpha release surface. Package
visibility is public on npm, and the version is aligned with the T3X alpha
release train.

## Install

```bash
npm install @t3x-dev/yschema
```

## Sample

```typescript
import { validateTree } from '@t3x-dev/yschema';

const result = validateTree({
  schema: {
    yschema: '0.1',
    name: 'release-plan',
    nodes: {
      plan: {
        required: true,
        requiredSlots: ['title'],
        slots: {
          title: { type: 'string' },
        },
      },
    },
  },
  tree: {
    plan: {
      title: 'Release plan',
    },
  },
});

if (!result.valid) {
  console.log(result.errors);
}
```
