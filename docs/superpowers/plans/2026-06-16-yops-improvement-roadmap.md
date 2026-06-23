# YOps Improvement Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `@t3x-dev/yops` into a product-grade mutation contract with a YAML human surface, a JSON-compatible object model, canonical audit form, and atomic apply behavior.

**Architecture:** Keep the generic engine deterministic and schema-free. YAML declarations parse into the YOPS Document Model; the engine executes the object model; canonical JSON is used for audit/hash identity; LLM draft or intent models remain upstream of YOPS.

**Tech Stack:** TypeScript, Vitest, `packages/yops/yops.yaml`, `js-yaml@4.1.1` for YAML formatting, direct `yaml@2.x` parser dependency for AST-level profile checks, JSON-compatible `YValue`, YOPS canonical serialization.

---

## Resolved Decisions

- Use `parseYOpsYaml` and `validateYOpsYaml` as the strict public parser/validator APIs. Do not add a second permissive public parser unless an external alpha consumer proves it is needed.
- Enforce the strict YAML profile during alpha and document it with a changeset because parser tightening is contract-bearing.
- Keep `YOpsResult.doc` required. On failure, return an original-document clone instead of the partially applied working document.
- Keep `canonicalKey` as the equality/order helper used by `unique` and `sort`. Add a separate audit-facing canonical JSON API rather than pretending `canonicalKey` was originally designed for audit.
- Treat product preview/review integration as a follow-up project after package hardening. This plan creates package-level affordances and docs only.

---

## File Structure

- Modify `packages/yops/README.md`: public language, architecture diagram, API wording.
- Modify `packages/yops/package.json`: package description and parser dependency if `yaml` is used directly.
- Modify `packages/yops/yops.yaml`: document model, serialization, YAML profile, canonical form, atomicity, extension lane.
- Modify `packages/yops/src/format.ts`: strict YAML declaration parsing.
- Create `packages/yops/src/yamlProfile.ts`: parser-profile enforcement and reusable parse result.
- Modify `packages/yops/src/validator.ts`: use the same strict YAML parser as `parseYOpsYaml`.
- Modify `packages/yops/src/canonical.ts`: add audit-facing canonical JSON helpers while preserving existing equality helpers.
- Modify `packages/yops/src/index.ts`: export the new canonical helpers and parser-profile types if public.
- Modify `packages/yops/src/engine.ts`: return original document on failure.
- Modify `packages/yops/src/types.ts`: update comments for JSON-compatible values and atomic failure result semantics.
- Modify `packages/yops/scripts/generate-json-schema.ts`: describe the YOPS Document Model as JSON-compatible.
- Modify tests under `packages/yops/__tests__/`: parser profile, canonical audit form, atomic failure.
- Modify `docs/stability.md` and `release/surface.yaml`: mark YAML parser/profile behavior as contract-bearing.
- Create a changeset in `.changeset/`: alpha contract tightening for `@t3x-dev/yops`.

---

## GitHub Issue Stages

Create one GitHub issue per stage. Execute stages in order unless a maintainer
explicitly chooses to split Stage 2 into two parallel PRs after resolving
`yops.yaml` ownership.

| Stage | GitHub issue | Primary risk | Depends on | Expected PR shape |
| --- | --- | --- | --- | --- |
| 1 | [#1152](https://github.com/t3x-dev/t3x-core/issues/1152) YOPS: define YAML surface and document model contract | Low | none | docs/spec wording |
| 2 | [#1153](https://github.com/t3x-dev/t3x-core/issues/1153) YOPS: add YAML profile conformance tests | Medium | Stage 1 | failing tests/spec cases |
| 3 | [#1154](https://github.com/t3x-dev/t3x-core/issues/1154) YOPS: enforce strict YAML declaration profile | Medium | Stage 2 | parser implementation |
| 4 | [#1155](https://github.com/t3x-dev/t3x-core/issues/1155) YOPS: publish canonical document serialization | Medium | Stage 1 | canonical API + tests |
| 5 | [#1156](https://github.com/t3x-dev/t3x-core/issues/1156) YOPS: make failed apply results atomic | High | Stage 1 | engine semantic change |
| 6 | [#1157](https://github.com/t3x-dev/t3x-core/issues/1157) YOPS: define extension lane policy | Low | Stage 1 | governance docs/spec |
| 7 | [#1158](https://github.com/t3x-dev/t3x-core/issues/1158) T3X: create product follow-up issues for YOPS preview and draft intent | Medium | Stages 1-6 | issue creation only |

### Subagent Execution Model

Use one fresh subagent per stage. The main agent reviews each subagent's diff
before the next stage starts.

For each stage:

1. Dispatch one subagent with only that stage section and the relevant files.
2. Require the subagent to run the stage-specific verification commands.
3. Main agent reviews the diff and reruns the same verification.
4. Commit that stage before starting the next one.
5. Stop and discuss if a stage reveals a contract conflict with the roadmap.

Do not run Stage 2 and Stage 3 in parallel. Stage 3 depends on the exact tests
from Stage 2. Do not run Stage 5 in parallel with any stage touching
`engine.ts`, `types.ts`, or failure-shape tests.

### GitHub Issue Creation

GitHub CLI is available for this repo. Create issues with:

```bash
gh issue create --repo t3x-dev/t3x-core --title "<title>" --body "<body>"
```

Use the issue bodies below. Add labels only if the repo already has matching
labels; otherwise keep issue creation label-free.

#### Stage 1 Issue Body

```markdown
## Goal

Clarify YOPS as a declarative operation language over JSON-compatible YAML
documents without changing runtime behavior.

## Scope

- Update public wording in `packages/yops/README.md` and `packages/yops/package.json`.
- Add YOPS Document Model, YAML Declaration, JSON object, and Canonical JSON terminology to `packages/yops/yops.yaml`.
- Mark YAML profile/parser/canonical serialization behavior as contract-bearing in stability docs.
- Add a changeset for alpha contract hardening.

## Acceptance Criteria

- README no longer implies arbitrary YAML is the portable contract.
- `yops.yaml` distinguishes human YAML declaration from machine object model.
- `docs/stability.md` treats YAML profile/parser behavior as contract-bearing.
- `release/surface.yaml` describes `@t3x-dev/yops` as JSON-compatible YAML operations.
- `pnpm --filter @t3x-dev/yops build` passes.
- `node tools/standards/check-row-3-yops-stability.mjs` passes.

## Plan Reference

`docs/superpowers/plans/2026-06-16-yops-improvement-roadmap.md#stage-1-contract-language-and-stability-scope`
```

#### Stage 2 Issue Body

```markdown
## Goal

Define YAML profile behavior as conformance tests before parser implementation.

## Scope

- Add parser behavior tests to `packages/yops/__tests__/format.test.ts`.
- Add validator parity tests to `packages/yops/__tests__/validator.test.ts`.
- Add pure-data YAML profile cases to `packages/yops/yops.yaml`.

## Acceptance Criteria

- JSON syntax input is accepted.
- `on`, `off`, `yes`, and `no` are tested as strings.
- Anchors, aliases, merge keys, and multiple YAML documents have explicit rejection tests.
- Tests fail before Stage 3 where current permissive parser behavior does not match the profile.

## Plan Reference

`docs/superpowers/plans/2026-06-16-yops-improvement-roadmap.md#stage-2-yaml-profile-conformance-tests`
```

#### Stage 3 Issue Body

```markdown
## Goal

Make `parseYOpsYaml` and `validateYOpsYaml` enforce the YOPS YAML declaration profile.

## Scope

- Add `packages/yops/src/yamlProfile.ts`.
- Use the same strict profile parser from `format.ts` and `validator.ts`.
- Add direct `yaml@2.x` dependency if AST-level checks are needed.
- Keep `formatYOps` emitting the current YAML envelope unless tests require otherwise.

## Acceptance Criteria

- Stage 2 parser-profile tests pass.
- `parseYOpsYaml` and `validateYOpsYaml` reject the same profile violations.
- Existing valid bare-array and `{ yops: [...] }` declarations still parse.
- `pnpm --filter @t3x-dev/yops typecheck` passes.

## Plan Reference

`docs/superpowers/plans/2026-06-16-yops-improvement-roadmap.md#stage-3-strict-yaml-profile-parser`
```

#### Stage 4 Issue Body

```markdown
## Goal

Publish an audit-facing canonical JSON helper while preserving existing equality/order helpers.

## Scope

- Keep `canonicalKey` behavior for `unique` and `sort`.
- Add `canonicalJson` or equivalent audit-facing API in `packages/yops/src/canonical.ts`.
- Export the helper from `packages/yops/src/index.ts`.
- Update schema/spec language to describe YOPS canonical serialization.

## Acceptance Criteria

- Existing `canonicalKey`, `compareCodepoints`, and `compareYValues` tests keep passing.
- Equivalent mappings with different insertion order produce identical canonical audit output.
- The docs do not falsely claim RFC 8785/JCS unless the implementation and tests actually adopt that algorithm.
- `pnpm --filter @t3x-dev/yops test -- __tests__/canonical.test.ts` passes.

## Plan Reference

`docs/superpowers/plans/2026-06-16-yops-improvement-roadmap.md#stage-4-document-model-and-canonical-audit-api`
```

#### Stage 5 Issue Body

```markdown
## Goal

Make failed YOPS apply results atomic by returning the original document state instead of the partially applied working document.

## Scope

- Update `packages/yops/src/engine.ts` failure returns.
- Update `YOpsResult` comments in `packages/yops/src/types.ts`.
- Change tests currently pinning partial failure state.
- Add atomicity language to `packages/yops/yops.yaml`.

## Acceptance Criteria

- A multi-op document that fails midway reports the failing op index.
- Failed result `doc` equals the original document state.
- Input document remains unmutated.
- Full `@t3x-dev/yops` test suite passes.
- Changeset clearly calls this a semantic contract tightening.

## Plan Reference

`docs/superpowers/plans/2026-06-16-yops-improvement-roadmap.md#stage-5-atomic-failure-semantics`
```

#### Stage 6 Issue Body

```markdown
## Goal

Define the extension lane so the 18 core operations do not grow casually.

## Scope

- Add extension policy language to `packages/yops/yops.yaml`.
- Add README governance language.
- Add stability docs for new operation promotion.

## Acceptance Criteria

- Core 18 ops are described as the YOPS 1.x conformance surface.
- New ops start as experimental namespaced extensions.
- Promotion requires production evidence, conformance cases, and stability review.
- YOPS build and stability checks pass.

## Plan Reference

`docs/superpowers/plans/2026-06-16-yops-improvement-roadmap.md#stage-6-extension-lane-policy`
```

#### Stage 7 Issue Body

```markdown
## Goal

Create product follow-up issues for YOPS preview/review and upstream draft intent modeling.

## Scope

- Create one issue for T3X before/after preview and review flow.
- Create one issue for the upstream YOPS Draft / Intent Model.
- Do not implement product behavior in this package-hardening PR.

## Acceptance Criteria

- Product follow-up issue references `packages/core/src/t3x-yops/engine.ts`, `packages/core/src/t3x-yops/replay.ts`, `packages/api/src/ops/yops-apply.ts`, and `packages/api/src/routes/yops-validate.openapi.ts`.
- Draft/intent issue references `packages/core/src/extractors/v2/types.ts`, `providerDraft.ts`, `compiler.ts`, and `pipeline.ts`.
- Both issues state that generic `@t3x-dev/yops` remains LLM-free and schema-free.

## Plan Reference

`docs/superpowers/plans/2026-06-16-yops-improvement-roadmap.md#stage-7-product-integration-follow-up-issues`
```

---

### Stage 1: Contract Language And Stability Scope

**Files:**
- Modify: `packages/yops/README.md`
- Modify: `packages/yops/package.json`
- Modify: `packages/yops/yops.yaml`
- Modify: `docs/stability.md`
- Modify: `release/surface.yaml`
- Create: `.changeset/yops-contract-hardening.md`

- [ ] **Step 1: Update public package wording**

In `packages/yops/package.json`, change the description to:

```json
"description": "Declarative operations over JSON-compatible YAML documents"
```

In `packages/yops/README.md`, change the opening from:

````markdown
Declarative YAML operations. 18 atomic ops for any YAML document.

```text
YAML in  ->  YOps  ->  YAML out
```
````

to:

````markdown
Declarative operations over JSON-compatible YAML documents. 18 deterministic
ops for human-readable YAML declarations and machine-validated object models.

```text
YAML declaration  ->  YOPS Document Model  ->  updated document
JSON object       ->  YOPS Document Model  ->  updated document
```
````

- [ ] **Step 2: Add contract terminology to `yops.yaml`**

Near the top of `packages/yops/yops.yaml`, after `description`, add:

```yaml
document_model:
  name: YOPS Document Model
  description: >
    The normative machine contract for YOPS. Values are JSON-compatible:
    string, number, boolean, null, sequence, or mapping with string keys.

serializations:
  yaml_declaration:
    description: Human-readable YAML 1.2 profile accepted by YOPS parsers.
  json_object:
    description: Native JSON-compatible object form used by APIs and SDKs.
  canonical_json:
    description: Deterministic audit/hash serialization of the document model.
```

- [ ] **Step 3: Mark parser/profile behavior as contract-bearing**

In `docs/stability.md`, extend the YOps Contract paragraph so it includes
serialization and parser behavior:

```markdown
Contract-bearing YOps changes include operation names, operation families,
fields, field types, enum values, path syntax, YAML declaration profile,
parser behavior, canonical serialization, runtime error codes, validator
diagnostic codes, conformance cases, recipes, and examples.
```

In `release/surface.yaml`, update the `@t3x-dev/yops` `why:` field to:

```yaml
why: Public deterministic operation contract for JSON-compatible YAML documents.
```

- [ ] **Step 4: Add a changeset**

Create `.changeset/yops-contract-hardening.md` with:

```markdown
---
"@t3x-dev/yops": minor
---

Clarify YOPS as a declarative operation language over JSON-compatible YAML
documents. This documents the YAML declaration surface, the YOPS Document Model,
and canonical JSON as contract-bearing alpha surfaces.
```

- [ ] **Step 5: Verify docs/spec wording**

Run:

```bash
pnpm --filter @t3x-dev/yops build
node tools/standards/check-row-3-yops-stability.mjs
git diff --check
```

Expected:

```text
@t3x-dev/yops build exits 0
{"row_id":"row-3","status":"pass",...}
git diff --check exits 0 with no output
```

- [ ] **Step 6: Commit**

```bash
git add packages/yops/README.md packages/yops/package.json packages/yops/yops.yaml docs/stability.md release/surface.yaml .changeset
git commit -m "docs(yops): define YAML surface and document model"
```

---

### Stage 2: YAML Profile Conformance Tests

**Files:**
- Modify: `packages/yops/__tests__/format.test.ts`
- Modify: `packages/yops/__tests__/validator.test.ts`
- Modify: `packages/yops/yops.yaml`

- [ ] **Step 1: Add parser behavior tests before implementation**

Append these tests to `packages/yops/__tests__/format.test.ts`:

```ts
describe('parseYOpsYaml — YAML profile', () => {
  it('treats YAML 1.2 legacy boolean words as strings', () => {
    const result = parseYOpsYaml(`
yops:
  - set: { path: words/on, value: on }
  - set: { path: words/off, value: off }
  - set: { path: words/yes, value: yes }
  - set: { path: words/no, value: no }
  - set: { path: flags/enabled, value: true }
  - set: { path: empty/value, value: null }
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops[0]).toEqual({ set: { path: 'words/on', value: 'on' } });
    expect(result.ops[1]).toEqual({ set: { path: 'words/off', value: 'off' } });
    expect(result.ops[2]).toEqual({ set: { path: 'words/yes', value: 'yes' } });
    expect(result.ops[3]).toEqual({ set: { path: 'words/no', value: 'no' } });
    expect(result.ops[4]).toEqual({ set: { path: 'flags/enabled', value: true } });
    expect(result.ops[5]).toEqual({ set: { path: 'empty/value', value: null } });
  });

  it('rejects anchors and aliases in YOPS declarations', () => {
    const result = parseYOpsYaml(`
yops:
  - set: &base { path: a, value: 1 }
  - *base
`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/anchor|alias/i);
  });

  it('rejects merge keys in YOPS declarations', () => {
    const result = parseYOpsYaml(`
yops:
  - set:
      <<: { path: a, value: 1 }
`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/merge/i);
  });

  it('rejects multiple YAML documents', () => {
    const result = parseYOpsYaml(`
yops: []
---
yops: []
`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/multiple documents/i);
  });
});
```

- [ ] **Step 2: Add validator parity tests**

Append these tests to `packages/yops/__tests__/validator.test.ts`:

```ts
describe('validateYOpsYaml — YAML profile', () => {
  it('reports profile violations through diagnostics', () => {
    const diagnostics = validateYOpsYaml(`
yops:
  - set: &base { path: a, value: 1 }
  - *base
`);

    expect(diagnostics.some((d) => d.level === 'error')).toBe(true);
    expect(diagnostics.map((d) => d.message).join('\n')).toMatch(/anchor|alias/i);
  });

  it('accepts JSON syntax because JSON is valid profile input', () => {
    const diagnostics = validateYOpsYaml(`{"yops":[{"set":{"path":"a","value":1}}]}`);
    expect(diagnostics.filter((d) => d.level === 'error')).toEqual([]);
  });
});
```

- [ ] **Step 3: Add pure-data conformance cases to `yops.yaml`**

Add a top-level `yaml_profile.tests` block:

```yaml
yaml_profile:
  version: "1.0"
  tests:
    - name: json syntax input is accepted
      input: '{"yops":[{"set":{"path":"a","value":1}}]}'
      ok: true
    - name: anchors are rejected
      input: |
        yops:
          - set: &base { path: a, value: 1 }
          - *base
      ok: false
      error_matches: anchor|alias
    - name: multiple documents are rejected
      input: |
        yops: []
        ---
        yops: []
      ok: false
      error_matches: multiple documents
```

- [ ] **Step 4: Run tests and confirm the new rejection cases fail**

Run:

```bash
pnpm --filter @t3x-dev/yops test -- __tests__/format.test.ts __tests__/validator.test.ts
```

Expected before Task 3 implementation:

```text
Tests for anchors/aliases, merge keys, or multiple documents fail because the
current parser delegates to js-yaml.load without profile enforcement.
```

- [ ] **Step 5: Commit failing tests only if using strict TDD branch discipline**

```bash
git add packages/yops/__tests__/format.test.ts packages/yops/__tests__/validator.test.ts packages/yops/yops.yaml
git commit -m "test(yops): define YAML profile conformance"
```

---

### Stage 3: Strict YAML Profile Parser

**Files:**
- Create: `packages/yops/src/yamlProfile.ts`
- Modify: `packages/yops/src/format.ts`
- Modify: `packages/yops/src/validator.ts`
- Modify: `packages/yops/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add `yaml` as a direct runtime parser dependency**

Run:

```bash
pnpm --filter @t3x-dev/yops add yaml@^2.8.3
```

Expected:

```text
packages/yops/package.json includes "yaml" under dependencies.
pnpm-lock.yaml records yaml for @t3x-dev/yops.
```

- [ ] **Step 2: Create `yamlProfile.ts`**

Create `packages/yops/src/yamlProfile.ts`:

```ts
import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  type Node,
  type Pair,
  type Scalar,
} from 'yaml';

export interface ProfileParseOk {
  ok: true;
  value: unknown;
}

export interface ProfileParseError {
  ok: false;
  error: string;
}

export type ProfileParseResult = ProfileParseOk | ProfileParseError;

function scalarKeyValue(key: unknown): string | null {
  if (!isScalar(key)) return null;
  return typeof key.value === 'string' ? key.value : null;
}

function hasAnchor(node: unknown): boolean {
  return !!node && typeof node === 'object' && typeof (node as { anchor?: unknown }).anchor === 'string';
}

function inspectNode(node: unknown, errors: string[], path: string): void {
  if (!node) return;

  if (isAlias(node)) {
    errors.push(`${path}: aliases are not supported in YOPS YAML declarations`);
    return;
  }

  if (hasAnchor(node)) {
    errors.push(`${path}: anchors are not supported in YOPS YAML declarations`);
  }

  if (isMap(node)) {
    const seen = new Set<string>();
    for (const item of node.items as Pair[]) {
      const key = scalarKeyValue(item.key);
      if (key === null) {
        errors.push(`${path}: mapping keys must be strings`);
      } else {
        if (key === '<<') {
          errors.push(`${path}.${key}: merge keys are not supported in YOPS YAML declarations`);
        }
        if (seen.has(key)) {
          errors.push(`${path}.${key}: duplicate mapping key`);
        }
        seen.add(key);
      }
      inspectNode(item.key, errors, `${path}.<key>`);
      inspectNode(item.value, errors, key === null ? `${path}.<value>` : `${path}.${key}`);
    }
    return;
  }

  if (isSeq(node)) {
    node.items.forEach((item: Node | null, index: number) => {
      inspectNode(item, errors, `${path}[${index}]`);
    });
    return;
  }

  if (isScalar(node)) {
    const scalar = node as Scalar;
    const tag = scalar.tag;
    if (tag && !tag.startsWith('tag:yaml.org,2002:')) {
      errors.push(`${path}: custom YAML tags are not supported in YOPS YAML declarations`);
    }
  }
}

export function parseYOpsProfileYaml(source: string): ProfileParseResult {
  let documents;
  try {
    documents = parseAllDocuments(source, {
      version: '1.2',
      uniqueKeys: true,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (documents.length !== 1) {
    return { ok: false, error: `YOPS YAML declarations must contain exactly one document; got multiple documents` };
  }

  const document = documents[0];
  const parserErrors = [...document.errors, ...document.warnings];
  if (parserErrors.length > 0) {
    return { ok: false, error: parserErrors.map((e) => e.message).join('; ') };
  }

  const profileErrors: string[] = [];
  inspectNode(document.contents, profileErrors, '$');
  if (profileErrors.length > 0) {
    return { ok: false, error: profileErrors.join('; ') };
  }

  return { ok: true, value: document.toJSON() };
}
```

- [ ] **Step 3: Wire `format.ts` through the profile parser**

Replace the `js-yaml` parse path in `packages/yops/src/format.ts`:

```ts
import * as yaml from 'js-yaml';
```

with:

```ts
import * as yaml from 'js-yaml';
import { parseYOpsProfileYaml } from './yamlProfile';
```

Then replace the parse block in `parseYOpsYaml` with:

```ts
  const profileResult = parseYOpsProfileYaml(yamlStr);
  if (!profileResult.ok) {
    return { ok: false, error: profileResult.error };
  }

  const parsed = profileResult.value;
```

Keep `formatYOps` on `js-yaml.dump` unless emitter behavior needs changing.

- [ ] **Step 4: Wire `validator.ts` through the same profile parser**

In `packages/yops/src/validator.ts`, remove the `js-yaml` import used only for
parsing and import:

```ts
import { parseYOpsProfileYaml } from './yamlProfile';
```

Replace the parse block in `validateYOpsYaml` with:

```ts
  const profileResult = parseYOpsProfileYaml(yamlStr);
  if (!profileResult.ok) {
    return [
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_INVALID_YAML,
        `YAML parse error: ${profileResult.error}`,
        { op_index: null, field: null }
      ),
    ];
  }

  const parsed = profileResult.value;
```

- [ ] **Step 5: Run parser tests**

Run:

```bash
pnpm --filter @t3x-dev/yops test -- __tests__/format.test.ts __tests__/validator.test.ts
pnpm --filter @t3x-dev/yops typecheck
```

Expected:

```text
format.test.ts and validator.test.ts pass
typecheck exits 0
```

- [ ] **Step 6: Commit**

```bash
git add packages/yops/src/yamlProfile.ts packages/yops/src/format.ts packages/yops/src/validator.ts packages/yops/package.json pnpm-lock.yaml packages/yops/__tests__/format.test.ts packages/yops/__tests__/validator.test.ts packages/yops/yops.yaml
git commit -m "feat(yops): enforce YAML declaration profile"
```

---

### Stage 4: Document Model And Canonical Audit API

**Files:**
- Modify: `packages/yops/src/types.ts`
- Modify: `packages/yops/src/canonical.ts`
- Modify: `packages/yops/src/index.ts`
- Modify: `packages/yops/__tests__/canonical.test.ts`
- Modify: `packages/yops/scripts/generate-json-schema.ts`
- Modify: `packages/yops/yops.yaml`

- [ ] **Step 1: Update type comments**

In `packages/yops/src/types.ts`, change the `YValue` comment to:

```ts
 * YValue: JSON-compatible YAML value in the YOPS Document Model
 * YOp: discriminated union of all 18 operations
 * YOpsResult/YOpsError: execution result types
```

- [ ] **Step 2: Add audit-facing canonical helpers without replacing `canonicalKey`**

In `packages/yops/src/canonical.ts`, keep `canonicalKey` unchanged and add:

```ts
/**
 * Audit-facing canonical JSON serialization for YOPS document-model values.
 *
 * This intentionally reuses the same codepoint-ordered mapping rule as
 * `canonicalKey`, so equality/order helpers and audit serialization agree.
 * It is a YOPS canonical form; do not label it RFC 8785/JCS unless the spec
 * and tests explicitly adopt that external algorithm.
 */
export function canonicalJson(value: YValue): string {
  return canonicalKey(value);
}
```

- [ ] **Step 3: Export the helper**

In `packages/yops/src/index.ts`, add:

```ts
export { canonicalJson, canonicalKey, compareCodepoints, compareYValues } from './canonical';
```

- [ ] **Step 4: Add canonical audit tests**

In `packages/yops/__tests__/canonical.test.ts`, change the import to:

```ts
import { canonicalJson, canonicalKey, compareCodepoints, compareYValues } from '../src/canonical';
```

Then append:

```ts

describe('canonicalJson', () => {
  it('serializes mappings independent of insertion order', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('serializes a YOPS document-model envelope deterministically', () => {
    expect(
      canonicalJson({
        yops: [{ set: { value: 1, path: 'a' } }],
      })
    ).toBe('{"yops":[{"set":{"path":"a","value":1}}]}');
  });
});
```

- [ ] **Step 5: Update generated schema description**

In `packages/yops/scripts/generate-json-schema.ts`, change `description` to:

```ts
description:
  'YOPS Document Model — JSON-compatible object representation of declarative ' +
  'operations over YAML documents. YAML declarations parse into this shape.',
```

- [ ] **Step 6: Update `yops.yaml` canonical form language**

Add under `serializations.canonical_json`:

```yaml
    algorithm: yops-canonical-json-v1
    rule: >
      Serialize JSON-compatible YOPS values with mappings sorted by Unicode
      codepoint order. This form is for audit and hash identity, not authoring.
```

- [ ] **Step 7: Verify**

Run:

```bash
pnpm --filter @t3x-dev/yops test -- __tests__/canonical.test.ts
pnpm --filter @t3x-dev/yops build
```

Expected:

```text
canonical.test.ts passes
build exits 0 and regenerates dist/yops.schema.json
```

- [ ] **Step 8: Commit**

```bash
git add packages/yops/src/types.ts packages/yops/src/canonical.ts packages/yops/src/index.ts packages/yops/__tests__/canonical.test.ts packages/yops/scripts/generate-json-schema.ts packages/yops/yops.yaml
git commit -m "feat(yops): publish canonical document serialization"
```

---

### Stage 5: Atomic Failure Semantics

**Files:**
- Modify: `packages/yops/src/engine.ts`
- Modify: `packages/yops/src/types.ts`
- Modify: `packages/yops/__tests__/engine.test.ts`
- Modify: `packages/yops/__tests__/edge-cases.test.ts`
- Modify: `packages/yops/yops.yaml`

- [ ] **Step 1: Change tests to require original document on failure**

In `packages/yops/__tests__/engine.test.ts`, change the fail-fast assertion:

```ts
expect(result.doc).toEqual({ a: 1, b: 2 });
```

to:

```ts
expect(result.doc).toEqual({ a: 1 });
```

In `packages/yops/__tests__/edge-cases.test.ts`, replace the test named
`partial failure preserves last good state` with:

```ts
it('partial failure returns the original document state', () => {
  const input: YValue = {};
  const r = applyYOps(input, [
    { set: { path: 'a', value: 1 } },
    { set: { path: 'b', value: 2 } },
    { drop: { path: 'nonexistent' } },
  ]);
  expect(r.ok).toBe(false);
  expect(r.doc).toEqual({});
  expect(input).toEqual({});
});
```

- [ ] **Step 2: Run tests and confirm current behavior fails**

Run:

```bash
pnpm --filter @t3x-dev/yops test -- __tests__/engine.test.ts __tests__/edge-cases.test.ts
```

Expected before implementation:

```text
The updated atomicity assertions fail because engine.ts currently returns the
partially applied working document on error.
```

- [ ] **Step 3: Update engine implementation**

In `packages/yops/src/engine.ts`, update the file comment:

```ts
 * Deep clones input so the original is never mutated.
 * Fail-fast and atomic: stops at the first error and returns the original
 * document state on failure.
```

Inside `applyYOps`, replace:

```ts
let current = deepClone(doc);
```

with:

```ts
const original = deepClone(doc);
let current = deepClone(original);
```

Then replace every failure return shaped like:

```ts
doc: current,
```

with:

```ts
doc: original,
```

Do not change successful returns.

- [ ] **Step 4: Update result type comment**

In `packages/yops/src/types.ts`, add above `YOpsResult`:

```ts
// On failure, doc is the original document state. Partial working state is
// never exposed as the result document.
```

- [ ] **Step 5: Add atomicity language to `yops.yaml`**

Add:

```yaml
execution:
  atomicity: >
    A YOPS document is applied atomically. Operations apply in order against a
    working copy. If any operation fails, application stops, the error reports
    the failing op index, and the result document is the original document
    state.
```

- [ ] **Step 6: Verify**

Run:

```bash
pnpm --filter @t3x-dev/yops test -- __tests__/engine.test.ts __tests__/edge-cases.test.ts
pnpm --filter @t3x-dev/yops test
node tools/standards/check-row-3-yops-stability.mjs
```

Expected:

```text
Targeted tests pass
Full @t3x-dev/yops test suite passes
YOps stability check passes
```

- [ ] **Step 7: Commit**

```bash
git add packages/yops/src/engine.ts packages/yops/src/types.ts packages/yops/__tests__/engine.test.ts packages/yops/__tests__/edge-cases.test.ts packages/yops/yops.yaml
git commit -m "feat(yops): make failed apply results atomic"
```

---

### Stage 6: Extension Lane Policy

**Files:**
- Modify: `packages/yops/yops.yaml`
- Modify: `docs/stability.md`
- Modify: `packages/yops/README.md`

- [ ] **Step 1: Add extension policy to `yops.yaml`**

Add:

```yaml
extension_policy:
  core_ops: frozen_for_1_x
  rule: >
    The 18 core operations are the stable conformance surface for YOPS 1.x.
    New operations must start as namespaced extensions, marked experimental,
    and excluded from core conformance until promoted by a later spec version.
  promotion_requires:
    - production usage evidence
    - conformance cases
    - stability review
```

- [ ] **Step 2: Add README governance language**

Add a short section after the operations table:

```markdown
## Extension Policy

The 18 core operations are the YOPS 1.x conformance surface. New operation
ideas start as experimental namespaced extensions and are excluded from core
conformance until promoted with production evidence, tests, and stability
review.
```

- [ ] **Step 3: Add stability wording**

In `docs/stability.md`, add:

```markdown
New YOps operation names are not added directly to the frozen core surface.
They start as experimental extensions and require conformance cases before
promotion.
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @t3x-dev/yops build
node tools/standards/check-row-3-yops-stability.mjs
git diff --check
```

Expected:

```text
build exits 0
stability check passes
git diff --check exits 0
```

- [ ] **Step 5: Commit**

```bash
git add packages/yops/yops.yaml docs/stability.md packages/yops/README.md
git commit -m "docs(yops): define extension lane policy"
```

---

### Stage 7: Product Integration Follow-Up Issues

**Files:**
- Create: issue descriptions in the project tracker, or create local planning notes if issues are not available from the working session.
- Reference: `packages/core/src/t3x-yops/engine.ts`
- Reference: `packages/core/src/t3x-yops/replay.ts`
- Reference: `packages/api/src/ops/yops-apply.ts`
- Reference: `packages/api/src/routes/yops-validate.openapi.ts`

- [ ] **Step 1: Create follow-up issue for T3X preview/review**

Issue title:

```text
Productize YOPS preview and review flow
```

Issue body:

```markdown
Goal: every proposed YOPS document can produce a before/after diff before it is
persisted.

Acceptance criteria:
- Proposed YOPS ops can be previewed against a base document without committing.
- Failed YOPS apply never writes partial state.
- Rejected or cherry-picked ops are represented as a new atomic YOPS document.
- Human and LLM error renderers share the same structured error object.

Initial files:
- packages/core/src/t3x-yops/engine.ts
- packages/core/src/t3x-yops/replay.ts
- packages/api/src/ops/yops-apply.ts
- packages/api/src/routes/yops-validate.openapi.ts
```

- [ ] **Step 2: Create follow-up issue for LLM draft/intent model**

Issue title:

```text
Define upstream YOPS Draft / Intent Model
```

Issue body:

```markdown
Goal: keep LLM planning richer than executable YOPS while preserving YOPS as
the deterministic source of truth.

Acceptance criteria:
- Draft model can carry intent, evidence, confidence, and target references.
- Deterministic compiler produces YOPS Document Model ops.
- YOPS engine remains unaware of LLM metadata and schema semantics.
- Compiler tests prove invalid drafts do not bypass YOPS validation.

Initial files:
- packages/core/src/extractors/v2/types.ts
- packages/core/src/extractors/v2/providerDraft.ts
- packages/core/src/extractors/v2/compiler.ts
- packages/core/src/extractors/v2/pipeline.ts
```

- [ ] **Step 3: Commit local issue notes only if issue tracker is unavailable**

If the issues cannot be created in the tracker from this session, create:

```text
docs/superpowers/plans/2026-06-16-yops-product-followups.md
```

and paste the two issue bodies above.

Commit:

```bash
git add docs/superpowers/plans/2026-06-16-yops-product-followups.md
git commit -m "docs(yops): add product follow-up issues"
```

---

## Final Verification

- [ ] **Step 1: Run package verification**

```bash
pnpm --filter @t3x-dev/yops build
pnpm --filter @t3x-dev/yops test
pnpm --filter @t3x-dev/yops typecheck
pnpm --filter @t3x-dev/yops api-extract:verify
```

Expected:

```text
All commands exit 0.
```

- [ ] **Step 2: Run release/stability verification**

```bash
node tools/standards/check-row-3-yops-stability.mjs
git diff --check
git status --short
```

Expected:

```text
YOps stability metadata passes.
git diff --check has no output.
git status shows only intentional files, or a clean tree after commits.
```

- [ ] **Step 3: Self-review before PR**

Check these conditions manually:

```text
README says YAML declaration, not arbitrary YAML.
yops.yaml names Document Model, YAML Declaration, and Canonical JSON.
parseYOpsYaml and validateYOpsYaml share parser-profile enforcement.
canonicalKey remains available for equality/order behavior.
canonicalJson is documented as YOPS canonical form, not falsely as RFC 8785.
Failed apply result returns original document state.
Core 18 operations are unchanged except for failure atomicity semantics.
Changeset calls out parser and atomicity contract tightening.
```
