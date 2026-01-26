# V4 Phase 2 & Phase 3 GitHub Issues

> Copy each issue section below directly into GitHub "New Issue" form.
> Total: 10 issues

---

## Issue Overview

| ID | Title | Labels | Effort | Assignee | Depends On |
|----|-------|--------|--------|----------|------------|
| GATE-1 | Leaf module foundation | `blocking` | 30-45min | Either | - |
| GEN-1 | Prompt builder | `core` | 1.5h | Dev A | GATE-1 |
| GEN-2 | Generate service | `core` | 1.5h | Dev A | GEN-1 |
| GEN-3 | Generate API handler | `api` | 1.5h | Dev A | GEN-2 |
| VAL-1 | Validation logic | `core` | 2h | Dev B | GATE-1 |
| VAL-2 | Validate API handler | `api` | 1.5h | Dev B | VAL-1 |
| KW-1 | Keyword optimization | `core` | TBD | TBD | - |
| E2E-1 | E2E test script | `test` | 1h | Either | GEN-3, VAL-2 |
| E2E-2 | E2E run & report | `test` | 1h | Either | E2E-1 |

---

## GATE-1: Leaf Module Foundation

### Title
```
feat(core): Leaf module foundation for parallel development
```

### Labels
```
priority: P0, type: infrastructure, blocking
```

### Body

```markdown
## Summary

Create the foundation for `packages/core/src/leaf/` module to enable parallel development of Generate (GEN-*) and Validate (VAL-*) features.

**BLOCKING** - All GEN-* and VAL-* issues depend on this.

## Problem

GEN and VAL features both need to create files in the same directory. Without shared foundation, merge conflicts are guaranteed.

## Tasks

- [ ] Create `packages/core/src/leaf/` directory
- [ ] Create `packages/core/src/leaf/types.ts` with interface contracts (see below)
- [ ] Create `packages/core/src/leaf/index.ts` with ownership comments
- [ ] Update `packages/core/src/index.ts` to export leaf module
- [ ] Add placeholder comments to `apps/api/src/routes/leaves.openapi.ts`
- [ ] Create `feat/v4-phase2` integration branch
- [ ] Verify `pnpm build:core` passes

## Type Contract (types.ts)

```typescript
import type { CommitV4, Leaf, Constraint, Assertion } from '../types/v4';

// === Generation Types (GEN-* uses) ===
export interface BuildPromptOptions {
  commit: CommitV4;
  leaf: Leaf;
  additionalInstructions?: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  metadata: {
    sentenceCount: number;
    requireCount: number;
    excludeCount: number;
  };
}

export interface GenerateOptions extends BuildPromptOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateResult {
  output: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  prompt: { system: string; user: string };
}

// === Validation Types (VAL-* uses) ===
export interface ValidateOptions {
  output: string;
  constraints: Constraint[];
  embedder?: EmbeddingProvider;
}

export interface ValidationResult {
  assertions: Assertion[];
  allPassed: boolean;
  passedCount: number;
  failedCount: number;
}

export interface ConstraintCheckResult {
  constraint: Constraint;
  passed: boolean;
  evidence?: { found?: string; location?: number; similarity?: number };
  message: string;
}

// === Shared Constants ===
export const SEMANTIC_REQUIRE_THRESHOLD = 0.85;
export const SEMANTIC_EXCLUDE_THRESHOLD = 0.70;
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
export const DEFAULT_TEMPERATURE = 0.7;
```

## File Ownership After This Issue

| File | GEN-* Owner | VAL-* Owner |
|------|-------------|-------------|
| `leaf/types.ts` | SHARED (frozen) | SHARED (frozen) |
| `leaf/build-prompt.ts` | ✅ | ❌ |
| `leaf/generate.ts` | ✅ | ❌ |
| `leaf/validate-constraints.ts` | ❌ | ✅ |
| `leaf/index.ts` | Add exports | Add exports |

## Acceptance Criteria

- [ ] `pnpm build:core` passes
- [ ] `pnpm test:core` passes
- [ ] Both developers confirmed `types.ts` is acceptable
- [ ] Integration branch `feat/v4-phase2` created
- [ ] Feature branches created:
  - `feat/v4-gen` (Developer A)
  - `feat/v4-val` (Developer B)

## Blocks

- GEN-1, GEN-2, GEN-3
- VAL-1, VAL-2

## Estimated Effort

30-45 minutes
```

---

## GEN-1: Prompt Builder (Core)

### Title
```
feat(core): Leaf prompt builder
```

### Labels
```
priority: P0, type: feature, package: core
```

### Body

```markdown
## Summary

Create the prompt builder that constructs LLM prompts from commit sentences and leaf constraints.

## Problem

To generate leaf output, we need to build a well-structured prompt that:
- Includes all commit sentences as source material
- Instructs the LLM about the output format (tweet, article, etc.)
- Tells the LLM which strings MUST appear (REQUIRE constraints)
- Tells the LLM which strings MUST NOT appear (EXCLUDE constraints)

## Tasks

- [ ] Create `packages/core/src/leaf/build-prompt.ts`
- [ ] Implement `buildLeafPrompt(options: BuildPromptOptions): BuiltPrompt`
- [ ] Implement `buildSystemPrompt(leafType: string): string`
- [ ] Implement `getTypeInstructions(leafType, config): string` for each type:
  - [ ] tweet/twitter (280 chars)
  - [ ] weibo (Chinese)
  - [ ] wechat
  - [ ] article (headings, sections)
  - [ ] email (greeting, sign-off)
  - [ ] slack
- [ ] Implement `formatConstraints(constraints): { requires, excludes }`
- [ ] Write unit tests `packages/core/src/__tests__/leaf/build-prompt.test.ts`

## Files to Create

| File | Action |
|------|--------|
| `packages/core/src/leaf/build-prompt.ts` | CREATE |
| `packages/core/src/__tests__/leaf/build-prompt.test.ts` | CREATE |

## Function Signature

```typescript
export function buildLeafPrompt(options: BuildPromptOptions): BuiltPrompt;
```

## Test Cases

```typescript
describe('buildLeafPrompt', () => {
  it('includes all sentences in prompt');
  it('includes type-specific instructions for tweet');
  it('includes type-specific instructions for article');
  it('includes REQUIRE constraints as "must include"');
  it('includes EXCLUDE constraints as "must not include"');
  it('includes additional instructions when provided');
  it('returns correct metadata counts');
});
```

## Acceptance Criteria

- [ ] `buildLeafPrompt()` returns valid `BuiltPrompt`
- [ ] All leaf types have appropriate instructions
- [ ] REQUIRE constraints formatted with "MUST include EXACTLY"
- [ ] EXCLUDE constraints formatted with "MUST NOT include"
- [ ] All unit tests pass
- [ ] `pnpm build:core` passes

## Dependencies

- Blocked by: GATE-1
- Blocks: GEN-2

## Estimated Effort

1.5 hours

## Assignee

Developer A
```

---

## GEN-2: Generate Service (Core)

### Title
```
feat(core): Leaf generation service with LLM integration
```

### Labels
```
priority: P0, type: feature, package: core
```

### Body

```markdown
## Summary

Create the generation service that calls Claude to generate leaf output.

## Problem

We have a prompt builder (GEN-1), now we need to:
- Call the Anthropic Claude API
- Handle the response
- Return structured result with usage stats

## Tasks

- [ ] Create `packages/core/src/leaf/generate.ts`
- [ ] Implement `generateLeafOutput(options: GenerateOptions): Promise<GenerateResult>`
- [ ] Implement `isGenerationConfigured(): boolean` (checks ANTHROPIC_API_KEY)
- [ ] Handle Anthropic API errors (rate limit, timeout, etc.)
- [ ] Update `packages/core/src/leaf/index.ts` to export generate functions
- [ ] Write unit tests (mock Anthropic client)

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/core/src/leaf/generate.ts` | CREATE |
| `packages/core/src/leaf/index.ts` | MODIFY (add exports) |
| `packages/core/src/__tests__/leaf/generate.test.ts` | CREATE |

## Function Signatures

```typescript
export async function generateLeafOutput(options: GenerateOptions): Promise<GenerateResult>;

export function isGenerationConfigured(): boolean;
```

## Implementation Notes

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { buildLeafPrompt } from './build-prompt';

export async function generateLeafOutput(options: GenerateOptions): Promise<GenerateResult> {
  const { model = DEFAULT_MODEL, temperature = DEFAULT_TEMPERATURE, maxTokens = 1024 } = options;

  const { systemPrompt, userPrompt } = buildLeafPrompt(options);

  const client = new Anthropic();
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Extract text and return result
}
```

## Test Cases

```typescript
describe('generateLeafOutput', () => {
  it('calls Anthropic with correct parameters');
  it('extracts text from response');
  it('returns usage statistics');
  it('uses default model when not specified');
  it('uses default temperature when not specified');
});

describe('isGenerationConfigured', () => {
  it('returns true when ANTHROPIC_API_KEY is set');
  it('returns false when ANTHROPIC_API_KEY is not set');
});
```

## Acceptance Criteria

- [ ] `generateLeafOutput()` calls Anthropic API correctly
- [ ] Returns `GenerateResult` with output, model, usage, prompt
- [ ] `isGenerationConfigured()` checks environment variable
- [ ] Errors are wrapped with context
- [ ] All unit tests pass (with mocked Anthropic)
- [ ] `pnpm build:core` passes

## Dependencies

- Blocked by: GEN-1
- Blocks: GEN-3

## Estimated Effort

1.5 hours

## Assignee

Developer A
```

---

## GEN-3: Generate API Handler

### Title
```
feat(api): POST /v1/leaves/:id/generate endpoint
```

### Labels
```
priority: P0, type: feature, package: api
```

### Body

```markdown
## Summary

Implement the API endpoint that generates leaf output.

## Problem

Core generation logic exists (GEN-1, GEN-2), now we need an API endpoint so the WebUI can trigger generation.

## Tasks

- [ ] Add route definition for `POST /v1/leaves/:id/generate` in `leaves.openapi.ts`
- [ ] Implement handler:
  - [ ] Check `isGenerationConfigured()`
  - [ ] Get leaf by ID (404 if not found)
  - [ ] Get source commit by hash (404 if not found)
  - [ ] Call `generateLeafOutput()`
  - [ ] Update leaf with output and `generated_at`
  - [ ] Return result
- [ ] Handle errors (400, 404, 429, 500)
- [ ] Add imports for core functions
- [ ] Write integration tests

## Files to Modify/Create

| File | Action |
|------|--------|
| `apps/api/src/routes/leaves.openapi.ts` | MODIFY |
| `apps/api/src/__tests__/leaves-generate.test.ts` | CREATE |

## API Specification

**Endpoint**: `POST /v1/leaves/:id/generate`

**Request Body**:
```json
{
  "instructions": "Keep it formal",
  "model": "claude-sonnet-4-20250514",
  "temperature": 0.7
}
```
All fields optional.

**Success Response (200)**:
```json
{
  "success": true,
  "data": {
    "leaf": {
      "id": "leaf_xxx",
      "output": "Generated content here...",
      "generated_at": "2026-01-23T10:00:00Z",
      ...
    },
    "generation": {
      "model": "claude-sonnet-4-20250514",
      "usage": {
        "input_tokens": 150,
        "output_tokens": 80
      }
    }
  }
}
```

**Error Responses**:
| Status | Code | When |
|--------|------|------|
| 400 | `GENERATION_NOT_CONFIGURED` | No ANTHROPIC_API_KEY |
| 404 | `LEAF_NOT_FOUND` | Leaf doesn't exist |
| 404 | `COMMIT_NOT_FOUND` | Source commit missing |
| 429 | `RATE_LIMITED` | Anthropic rate limit |
| 500 | `GENERATION_FAILED` | Other LLM errors |

## Test Cases

```typescript
describe('POST /v1/leaves/:id/generate', () => {
  it('generates output successfully');
  it('saves output and generated_at to leaf');
  it('returns generation metadata');
  it('accepts optional parameters');
  it('returns 400 when generation not configured');
  it('returns 404 for non-existent leaf');
  it('returns 404 when source commit missing');
});
```

## Acceptance Criteria

- [ ] Endpoint returns 200 with generated output
- [ ] Leaf record updated with `output` and `generated_at`
- [ ] Returns correct error codes
- [ ] Integration tests pass
- [ ] `pnpm test --filter @t3x/api` passes

## Dependencies

- Blocked by: GEN-2
- Blocks: E2E-1

## Estimated Effort

1.5 hours

## Assignee

Developer A
```

---

## VAL-1: Validation Logic (Core)

### Title
```
feat(core): Leaf constraint validation logic
```

### Labels
```
priority: P0, type: feature, package: core
```

### Body

```markdown
## Summary

Create the validation logic that checks if generated output respects constraints.

## Problem

After generating output, we need to verify:
- REQUIRE constraints: required strings are present
- EXCLUDE constraints: forbidden strings are absent

## Tasks

- [ ] Create `packages/core/src/leaf/validate-constraints.ts`
- [ ] Implement `validateConstraints(options): Promise<ValidationResult>` (async, supports semantic)
- [ ] Implement `validateConstraintsExactOnly(output, constraints): ValidationResult` (sync, exact only)
- [ ] Implement helpers:
  - [ ] `validateRequireExact()` - case-insensitive substring search
  - [ ] `validateRequireSemantic()` - cosine similarity >= 0.85
  - [ ] `validateExcludeExact()` - verify string absent
  - [ ] `validateExcludeSemantic()` - cosine similarity < 0.70
  - [ ] `generateAssertionId()` - creates `ast_` prefixed ID
  - [ ] `cosineSimilarity()` - vector similarity
- [ ] Write comprehensive unit tests

## Files to Create

| File | Action |
|------|--------|
| `packages/core/src/leaf/validate-constraints.ts` | CREATE |
| `packages/core/src/__tests__/leaf/validate-constraints.test.ts` | CREATE |

## Function Signatures

```typescript
// Async version (supports semantic matching)
export async function validateConstraints(options: ValidateOptions): Promise<ValidationResult>;

// Sync version (exact matching only, no embedder needed)
export function validateConstraintsExactOnly(output: string, constraints: Constraint[]): ValidationResult;
```

## Validation Rules

| Constraint | Match Mode | Rule | Threshold |
|------------|------------|------|-----------|
| REQUIRE | exact | Case-insensitive substring | - |
| REQUIRE | semantic | Cosine similarity | >= 0.85 |
| EXCLUDE | exact | String must NOT appear | - |
| EXCLUDE | semantic | Cosine similarity | < 0.70 |

## Test Cases

```typescript
describe('REQUIRE exact match', () => {
  it('passes when required string is present');
  it('fails when required string is missing');
  it('is case-insensitive');
  it('finds partial matches');
});

describe('EXCLUDE exact match', () => {
  it('passes when excluded string is absent');
  it('fails when excluded string is present');
  it('is case-insensitive');
});

describe('multiple constraints', () => {
  it('validates all and returns correct counts');
  it('reports partial failures correctly');
});

describe('assertion IDs', () => {
  it('generates unique IDs with ast_ prefix');
  it('links assertion to constraint via constraint_id');
});

describe('semantic matching', () => {
  it('returns error when embedder not provided');
});
```

## Acceptance Criteria

- [ ] REQUIRE exact: passes when present, fails when absent
- [ ] EXCLUDE exact: passes when absent, fails when present
- [ ] Case-insensitive matching
- [ ] Assertions have `ast_` prefix IDs
- [ ] Each assertion links to `constraint_id`
- [ ] Returns `allPassed`, `passedCount`, `failedCount`
- [ ] All unit tests pass
- [ ] `pnpm build:core` passes

## Dependencies

- Blocked by: GATE-1
- Blocks: VAL-2

## Estimated Effort

2 hours

## Assignee

Developer B
```

---

## VAL-2: Validate API Handler

### Title
```
feat(api): POST /v1/leaves/:id/validate endpoint
```

### Labels
```
priority: P0, type: feature, package: api
```

### Body

```markdown
## Summary

Implement the API endpoint that validates leaf output against constraints.

## Problem

Core validation logic exists (VAL-1), now we need an API endpoint so the WebUI can trigger validation.

## Tasks

- [ ] Add route definition for `POST /v1/leaves/:id/validate` in `leaves.openapi.ts`
- [ ] Implement handler:
  - [ ] Get leaf by ID (404 if not found)
  - [ ] Check output exists (400 if not)
  - [ ] Handle empty constraints (return success with 0 counts)
  - [ ] Call `validateConstraintsExactOnly()` or `validateConstraints()`
  - [ ] Update leaf with assertions
  - [ ] Return validation summary
- [ ] Update `packages/core/src/leaf/index.ts` to export validation functions
- [ ] Write integration tests

## Files to Modify/Create

| File | Action |
|------|--------|
| `apps/api/src/routes/leaves.openapi.ts` | MODIFY |
| `packages/core/src/leaf/index.ts` | MODIFY (add exports) |
| `apps/api/src/__tests__/leaves-validate.test.ts` | CREATE |

## API Specification

**Endpoint**: `POST /v1/leaves/:id/validate`

**Request Body**:
```json
{
  "use_semantic": false
}
```
All fields optional. Default: exact matching only.

**Success Response (200)**:
```json
{
  "success": true,
  "data": {
    "leaf": {
      "id": "leaf_xxx",
      "assertions": [
        {
          "id": "ast_abc123",
          "constraint_id": "cst_def456",
          "passed": true,
          "details": "Found required string \"$5,000\" at position 15"
        },
        {
          "id": "ast_xyz789",
          "constraint_id": "cst_ghi012",
          "passed": true,
          "details": "Correctly excluded \"competitor\" - not found in output"
        }
      ],
      ...
    },
    "validation": {
      "all_passed": true,
      "passed_count": 2,
      "failed_count": 0
    }
  }
}
```

**Error Responses**:
| Status | Code | When |
|--------|------|------|
| 400 | `NO_OUTPUT` | Leaf has no generated output |
| 404 | `LEAF_NOT_FOUND` | Leaf doesn't exist |
| 500 | `VALIDATION_FAILED` | Unexpected error |

## Test Cases

```typescript
describe('POST /v1/leaves/:id/validate', () => {
  it('validates constraints successfully');
  it('saves assertions to leaf');
  it('returns validation summary');
  it('returns 400 when no output to validate');
  it('returns 404 for non-existent leaf');
  it('handles leaf with no constraints');
  it('assertion IDs have ast_ prefix');
});
```

## Acceptance Criteria

- [ ] Endpoint returns 200 with validation results
- [ ] Assertions saved to leaf record
- [ ] Returns `all_passed`, `passed_count`, `failed_count`
- [ ] Returns 400 if no output
- [ ] Returns 404 if leaf not found
- [ ] Handles empty constraints gracefully
- [ ] Integration tests pass
- [ ] `pnpm test --filter @t3x/api` passes

## Dependencies

- Blocked by: VAL-1
- Blocks: E2E-1

## Estimated Effort

1.5 hours

## Assignee

Developer B
```

---

## KW-1: Keyword Extraction Optimization

### Title
```
feat(core): Keyword extraction optimization
```

### Labels
```
priority: P1, type: enhancement, package: core, needs-requirements
```

### Body

```markdown
## Summary

Optimize the keyword extraction in Ring 1 extractor.

## Current State

- Extracts keywords based on POS tags (NOUN, PROPN, VERB, ADJ)
- Applies stop word filtering
- Extracts anchor candidates (numbers, money, dates, entities)

Location: `packages/core/src/extractors/ringExtractor.ts`

## Potential Optimization Areas

- [ ] Stop word list improvements
- [ ] Multi-language support (Chinese via jieba)
- [ ] Domain-specific keyword recognition
- [ ] Anchor candidate accuracy
- [ ] Deduplication/lemmatization improvements

## Files Likely to Modify

| File | Purpose |
|------|---------|
| `packages/core/src/extractors/ringExtractor.ts` | Main logic |
| `packages/core/src/extractors/types.ts` | Types |
| `packages/core/configs/extractors/*.yml` | Domain rules |

## Tasks

[To be specified based on requirements]

## Acceptance Criteria

[To be specified]

## Dependencies

None - can run in parallel with GEN-* and VAL-*

## Estimated Effort

TBD

## Status

⚠️ **Needs requirements clarification**
```

---

## E2E-1: E2E Test Script

### Title
```
test: Create V4 E2E test script
```

### Labels
```
priority: P0, type: test
```

### Body

```markdown
## Summary

Create an automated E2E test script that tests the complete V4 flow.

## Problem

We need automated verification that all V4 features work together end-to-end.

## Tasks

- [ ] Create `scripts/e2e-test-v4.sh`
- [ ] Implement test cases:
  - [ ] Health check
  - [ ] Create project
  - [ ] Create conversation
  - [ ] Create V4 commit (verify schema, sentences)
  - [ ] Create leaf with constraints (verify `cst_` prefix)
  - [ ] Generate output (or skip if no API key)
  - [ ] Validate constraints (verify `ast_` prefix)
  - [ ] Pin conversation (verify `pin_` prefix)
  - [ ] Verify duplicate pin returns 409
  - [ ] Get leaf by ID
  - [ ] List leaves by commit
  - [ ] Cleanup (delete project)
- [ ] Make script executable
- [ ] Add color-coded output (pass/fail/skip)
- [ ] Add summary at end

## File to Create

| File | Action |
|------|--------|
| `scripts/e2e-test-v4.sh` | CREATE |

## Usage

```bash
# Default (localhost:3000)
./scripts/e2e-test-v4.sh

# Custom URL
BASE_URL=http://host:port ./scripts/e2e-test-v4.sh
```

## Expected Output

```
========================================
 T3X V4 End-to-End Test
========================================
API: http://localhost:3000/api/v1

1. Health Check
   ✓ API is healthy
2. Create Project
   ✓ Created project: proj_xxx
3. Create Conversation
   ✓ Created conversation: conv_xxx
4. Create V4 Commit
   ✓ Created commit: sha256:xxx...
   ✓ Commit has correct schema
   ✓ Commit has 3 sentences
5. Create Leaf
   ✓ Created leaf: leaf_xxx
   ✓ Constraint IDs have cst_ prefix
6. Generate Output
   ○ Generate (skipped - ANTHROPIC_API_KEY not set)
7. Validate Constraints
   ○ Validate (skipped - no output)
8. Pin Resources
   ✓ Pinned conversation: pin_xxx
   ✓ Pin ID has pin_ prefix
9. Duplicate Pin Handling
   ✓ Duplicate pin returns 409
   ✓ Error code is DUPLICATE_PIN
...

========================================
 Results: 15 passed, 0 failed, 2 skipped / 17 total
========================================
```

## Acceptance Criteria

- [ ] Script is executable (`chmod +x`)
- [ ] All test cases implemented
- [ ] Proper error handling (script stops on failure)
- [ ] Color-coded output
- [ ] Summary shows pass/fail/skip counts
- [ ] Script returns exit code 1 if any failures

## Dependencies

- Blocked by: GEN-3, VAL-2

## Estimated Effort

1 hour

## Assignee

Either developer
```

---

## E2E-2: E2E Run & Report

### Title
```
test: Run V4 E2E tests and generate regression report
```

### Labels
```
priority: P0, type: test
```

### Body

```markdown
## Summary

Run all tests and document results in a regression report.

## Problem

After completing GEN and VAL features, we need to verify no regressions and document the results.

## Tasks

### Automated Tests
- [ ] Run `pnpm test:core` - document result
- [ ] Run `pnpm test:storage` - document result
- [ ] Run `pnpm test --filter @t3x/api` - document result
- [ ] Run `./scripts/e2e-test-v4.sh` - document result

### Manual Tests
- [ ] Open WebUI, navigate to project
- [ ] Verify V4 commits display correctly
- [ ] Create a new leaf with constraints
- [ ] Click Generate (verify output or "not configured" message)
- [ ] Click Validate (verify assertions appear)
- [ ] Pin/Unpin resources
- [ ] Check Context panel
- [ ] Verify no console errors

### Documentation
- [ ] Create `docs/reports/v4-e2e-regression-YYYY-MM-DD.md`
- [ ] Document test environment
- [ ] Document all test results
- [ ] List any issues found
- [ ] List any regressions
- [ ] Add recommendations

## Report Template

Create `docs/reports/v4-e2e-regression-YYYY-MM-DD.md`:

```markdown
# V4 E2E Regression Report

**Date**: YYYY-MM-DD
**Tester**: [Name]
**Branch**: feat/v4-phase2

## Test Environment

- Node.js: [version]
- pnpm: [version]
- Database: PGLite
- OS: [os]

## Automated Tests

| Test Suite | Result | Count |
|------------|--------|-------|
| `pnpm test:core` | PASS/FAIL | X tests |
| `pnpm test:storage` | PASS/FAIL | X tests |
| `pnpm test --filter @t3x/api` | PASS/FAIL | X tests |
| `e2e-test-v4.sh` | PASS/FAIL | X passed, Y failed, Z skipped |

## Manual Tests

| Test | Result | Notes |
|------|--------|-------|
| V4 commits display | PASS/FAIL | |
| Create leaf | PASS/FAIL | |
| Generate output | PASS/FAIL/SKIP | |
| Validate constraints | PASS/FAIL | |
| Pin/Unpin | PASS/FAIL | |
| Context panel | PASS/FAIL | |
| No console errors | PASS/FAIL | |

## Issues Found

### Regressions
- None / [List any]

### New Issues
- None / [List any]

## Recommendations

[Any suggestions]

## Sign-off

- [ ] All critical tests pass
- [ ] No blocking regressions
- [ ] Ready for merge to main
```

## Acceptance Criteria

- [ ] All automated tests pass
- [ ] Manual tests completed
- [ ] Report created with all sections filled
- [ ] Any issues documented
- [ ] Ready for merge decision

## Dependencies

- Blocked by: E2E-1

## Estimated Effort

1 hour

## Assignee

Either developer
```

---

## Quick Reference

### Issue Creation Order

1. **GATE-1** (create first, blocks everything)
2. **GEN-1**, **VAL-1** (can create in parallel)
3. **GEN-2** (after GEN-1)
4. **GEN-3**, **VAL-2** (after GEN-2 and VAL-1)
5. **KW-1** (anytime)
6. **E2E-1** (after GEN-3 and VAL-2)
7. **E2E-2** (after E2E-1)

### Dependency Graph

```
GATE-1
├──► GEN-1 ──► GEN-2 ──► GEN-3 ──┐
│                                 ├──► E2E-1 ──► E2E-2
└──► VAL-1 ──► VAL-2 ────────────┘

KW-1 (independent)
```

### GitHub Labels to Create

```
priority: P0
priority: P1
type: infrastructure
type: feature
type: enhancement
type: test
package: core
package: api
blocking
needs-requirements
```

### After Creating Issues

1. Update each issue's "Dependencies" section with actual issue numbers
2. Link blocking issues using GitHub's "Blocks" feature
3. Assign developers
4. Create milestone "V4 Phase 2"

---

*Total: 10 issues*
*Estimated total effort: ~12-14 hours*
