# V4 Phase 2 & Phase 3 Issues

> **Status**: Ready for Development
> **Created**: 2026-01-23
> **Prerequisite**: Phase 1 E2E Run-Through completed
> **Team Size**: 2 developers (parallel development)

---

## Table of Contents

1. [Overview](#overview)
2. [Parallel Development Strategy](#parallel-development-strategy)
3. [Phase 2 Issues](#phase-2-feature-completion)
   - [P2-0: Gate Issue (Foundation)](#issue-p2-0-leaf-module-foundation-gate-issue)
   - [P2-1: Leaf Generate](#issue-p2-1-implement-leaf-output-generation)
   - [P2-2: Leaf Validate](#issue-p2-2-implement-leaf-constraint-validation)
   - [P2-3: Keyword Optimization](#issue-p2-3-keyword-extraction-optimization)
4. [Phase 3 Issues](#phase-3-e2e-regression-testing)
   - [P3-1: E2E Regression](#issue-p3-1-v4-e2e-regression-test-suite)
5. [Issue Summary](#issue-summary)

---

## Overview

This document contains detailed issues for:
- **Phase 2**: Feature completion (Leaf generate/validate, Keyword optimization)
- **Phase 3**: E2E regression testing

**Team Assignment**:
- Developer A: P2-1 (Generate) + P2-3 (Keyword, if time permits)
- Developer B: P2-2 (Validate)
- Either developer: P2-0 (Gate), P3-1 (Regression)

---

## Parallel Development Strategy

### Why This Matters

P2-1 (Generate) and P2-2 (Validate) both need to:
- Create files in `packages/core/src/leaf/`
- Add handlers to `apps/api/src/routes/leaves.openapi.ts`
- Add tests to `apps/api/src/__tests__/`

Without proper coordination, merge conflicts are guaranteed.

### Conflict Analysis Matrix

| File | P2-1 Needs | P2-2 Needs | Conflict Risk |
|------|------------|------------|---------------|
| `packages/core/src/leaf/types.ts` | Define types | Use types | **HIGH** - Must freeze before development |
| `packages/core/src/leaf/index.ts` | Create + export | Add export | **HIGH** - Both add lines |
| `packages/core/src/leaf/build-prompt.ts` | Create | - | None (P2-1 exclusive) |
| `packages/core/src/leaf/generate.ts` | Create | - | None (P2-1 exclusive) |
| `packages/core/src/leaf/validate-constraints.ts` | - | Create | None (P2-2 exclusive) |
| `apps/api/src/routes/leaves.openapi.ts` | Add generate handler | Add validate handler | **HIGH** - Both modify |
| `apps/api/src/__tests__/leaves-generate.test.ts` | Create | - | None (P2-1 exclusive) |
| `apps/api/src/__tests__/leaves-validate.test.ts` | - | Create | None (P2-2 exclusive) |
| `packages/core/src/index.ts` | Add leaf export | - | **LOW** - One line |

### Mitigation Strategy

#### 1. Gate Issue (P2-0) - MUST Complete First

Before P2-1 and P2-2 begin, one developer completes P2-0 which:
- Creates the `packages/core/src/leaf/` directory structure
- Defines and **freezes** `types.ts` (interface contract)
- Creates `index.ts` with clear ownership comments
- Adds placeholder comments in `leaves.openapi.ts`
- Sets up branch structure

**This eliminates 90% of potential conflicts.**

#### 2. File Ownership Rules

| File | Owner | Rule |
|------|-------|------|
| `leaf/build-prompt.ts` | P2-1 ONLY | Do not touch if you're P2-2 |
| `leaf/generate.ts` | P2-1 ONLY | Do not touch if you're P2-2 |
| `leaf/validate-constraints.ts` | P2-2 ONLY | Do not touch if you're P2-1 |
| `leaf/types.ts` | SHARED (frozen) | No modifications without team agreement |
| `leaf/index.ts` | SHARED | Add your exports at designated location |
| `leaves.openapi.ts` | SHARED | Add handlers at designated location |

#### 3. Branch Strategy

```
main
 └── feat/v4-phase2 (integration branch, created by P2-0)
      ├── feat/v4-p2-1-generate (Developer A)
      └── feat/v4-p2-2-validate (Developer B)
```

**Merge Order** (critical to avoid conflicts):
1. P2-1 merges to `feat/v4-phase2` first
2. P2-2 rebases from `feat/v4-phase2`, resolves any conflicts, then merges
3. `feat/v4-phase2` merges to `main` after both complete

#### 4. Daily Sync Protocol

Every day, both developers should:
1. Rebase from `feat/v4-phase2` to catch any shared changes
2. Communicate if touching any SHARED file
3. Report blockers immediately

#### 5. Contract Change Protocol

If either developer needs to modify `types.ts`:
1. Create a discussion issue or Slack thread
2. Propose the change with rationale
3. Wait for other developer to acknowledge
4. One person makes the change, pushes to `feat/v4-phase2`
5. Both developers rebase immediately

### P2-3 (Keyword) Independence

P2-3 modifies completely different files:

| P2-3 Files | Conflict with P2-1/P2-2 |
|------------|-------------------------|
| `packages/core/src/extractors/*.ts` | None |
| `packages/core/configs/extractors/*.yml` | None |
| `packages/core/src/__tests__/extractors/*.ts` | None |

**Conclusion**: P2-3 can run fully in parallel with P2-1/P2-2.

---

## Phase 2: Feature Completion

### Issue P2-0: Leaf Module Foundation (Gate Issue)

**Priority**: P0 (BLOCKING - Must complete before P2-1 and P2-2)
**Estimated Effort**: 30-45 minutes
**Owner**: Either developer (notify team when complete)
**Blocks**: P2-1, P2-2

#### Problem Statement

P2-1 (Generate) and P2-2 (Validate) both need to create files in `packages/core/src/leaf/` and modify `leaves.openapi.ts`. Without establishing shared infrastructure first, developers will face merge conflicts that waste time and introduce bugs.

This gate issue creates the foundation that enables true parallel development.

#### Goals

1. Create directory structure for the leaf module
2. Define and freeze type contracts (interfaces both sides will use)
3. Establish clear file ownership boundaries
4. Set up branch structure for parallel development
5. Add placeholder comments to guide where each developer adds code

#### Background Context

**Current State**:
- `packages/core/src/leaf/` directory does NOT exist
- Leaf types are defined in `packages/core/src/types/v4/index.ts`
- `leaves.openapi.ts` has CRUD handlers but no generate/validate

**After This Issue**:
- `packages/core/src/leaf/` exists with `types.ts` and `index.ts`
- Type contracts are frozen
- Both developers know exactly where to add their code
- Integration branch is ready

#### Detailed Tasks

##### Task 1: Create Directory Structure

```bash
# From repository root
cd packages/core/src
mkdir -p leaf
touch leaf/index.ts
touch leaf/types.ts
```

##### Task 2: Create Type Contracts

Create `packages/core/src/leaf/types.ts`:

```typescript
/**
 * Leaf Module Types
 *
 * IMPORTANT: This file is FROZEN during parallel development.
 * Any changes require agreement from both P2-1 and P2-2 developers.
 *
 * @see docs/plans/v4-phase2-phase3-issues.md#contract-change-protocol
 */

import type { CommitV4, Leaf, Constraint, Assertion } from '../types/v4';

// ============================================================
// Generation Types (Used by P2-1)
// ============================================================

/**
 * Options for building the LLM prompt
 */
export interface BuildPromptOptions {
  /** Source commit containing sentences */
  commit: CommitV4;
  /** Leaf containing constraints and config */
  leaf: Leaf;
  /** Additional user instructions to include in prompt */
  additionalInstructions?: string;
}

/**
 * Result of prompt building
 */
export interface BuiltPrompt {
  /** System prompt for LLM */
  systemPrompt: string;
  /** User prompt for LLM */
  userPrompt: string;
  /** Metadata about the prompt */
  metadata: {
    /** Number of sentences from commit */
    sentenceCount: number;
    /** Number of REQUIRE constraints */
    requireCount: number;
    /** Number of EXCLUDE constraints */
    excludeCount: number;
  };
}

/**
 * Options for generating leaf output
 */
export interface GenerateOptions extends BuildPromptOptions {
  /** LLM model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Temperature for generation (0-1, default: 0.7) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

/**
 * Result of leaf generation
 */
export interface GenerateResult {
  /** Generated output text */
  output: string;
  /** Model used for generation */
  model: string;
  /** Token usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** The prompts that were sent to the LLM */
  prompt: {
    system: string;
    user: string;
  };
}

// ============================================================
// Validation Types (Used by P2-2)
// ============================================================

/**
 * Options for validating constraints against output
 */
export interface ValidateOptions {
  /** The generated output to validate */
  output: string;
  /** Constraints to validate against */
  constraints: Constraint[];
  /** Optional embedder for semantic matching */
  embedder?: EmbeddingProvider;
}

/**
 * Embedding provider interface (simplified)
 * Full implementation in packages/core/src/providers/embedding/
 */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Result of constraint validation
 */
export interface ValidationResult {
  /** Individual assertion results */
  assertions: Assertion[];
  /** Whether all constraints passed */
  allPassed: boolean;
  /** Count of passed constraints */
  passedCount: number;
  /** Count of failed constraints */
  failedCount: number;
}

/**
 * Detailed result for a single constraint check
 */
export interface ConstraintCheckResult {
  /** The constraint that was checked */
  constraint: Constraint;
  /** Whether the constraint passed */
  passed: boolean;
  /** Evidence of what was found (or not found) */
  evidence?: {
    /** The string that was found (for exact match) */
    found?: string;
    /** Position in output where it was found */
    location?: number;
    /** Similarity score (for semantic match) */
    similarity?: number;
  };
  /** Human-readable explanation */
  message: string;
}

// ============================================================
// Shared Constants
// ============================================================

/** Semantic match threshold for REQUIRE constraints (must exceed) */
export const SEMANTIC_REQUIRE_THRESHOLD = 0.85;

/** Semantic match threshold for EXCLUDE constraints (must be below) */
export const SEMANTIC_EXCLUDE_THRESHOLD = 0.70;

/** Default LLM model for generation */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Default temperature for generation */
export const DEFAULT_TEMPERATURE = 0.7;

/** Default max tokens for generation */
export const DEFAULT_MAX_TOKENS = 1024;
```

##### Task 3: Create Module Index

Create `packages/core/src/leaf/index.ts`:

```typescript
/**
 * Leaf Module
 *
 * LLM-powered output generation with constraint validation.
 *
 * FILE OWNERSHIP (during parallel development):
 * ┌─────────────────────────────┬─────────┬─────────┐
 * │ File                        │ P2-1    │ P2-2    │
 * ├─────────────────────────────┼─────────┼─────────┤
 * │ types.ts                    │ SHARED (frozen)   │
 * │ build-prompt.ts             │ ✅ Own  │ ❌      │
 * │ generate.ts                 │ ✅ Own  │ ❌      │
 * │ validate-constraints.ts     │ ❌      │ ✅ Own  │
 * │ index.ts                    │ Add exports below │
 * └─────────────────────────────┴─────────┴─────────┘
 *
 * @module leaf
 */

// ===========================================
// Types (shared, frozen)
// ===========================================
export * from './types';

// ===========================================
// P2-1 Exports (Developer A adds here)
// ===========================================
// TODO: Uncomment when build-prompt.ts is ready
// export * from './build-prompt';

// TODO: Uncomment when generate.ts is ready
// export * from './generate';

// ===========================================
// P2-2 Exports (Developer B adds here)
// ===========================================
// TODO: Uncomment when validate-constraints.ts is ready
// export * from './validate-constraints';
```

##### Task 4: Update Core Package Exports

Edit `packages/core/src/index.ts`, add at the end:

```typescript
// ===========================================
// Leaf Module (V4 - LLM generation + validation)
// ===========================================
export * from './leaf';
```

##### Task 5: Add Placeholder Comments to API Routes

Edit `apps/api/src/routes/leaves.openapi.ts`. Find the Route Handlers section and add clear separation:

```typescript
// ============================================================
// Route Handlers - CRUD (existing)
// ============================================================

// POST /v1/leaves - Create leaf
leavesRoutes.openapi(createLeafRoute, async (c) => {
  // ... existing handler
});

// GET /v1/leaves/:id - Get leaf
leavesRoutes.openapi(getLeafRoute, async (c) => {
  // ... existing handler
});

// ... other existing CRUD handlers ...

// ============================================================
// Route Handlers - Generation (P2-1 Developer A adds here)
// ============================================================

// TODO P2-1: Add POST /v1/leaves/:id/generate handler here
// Route definition should be added above in Route Definitions section

// ============================================================
// Route Handlers - Validation (P2-2 Developer B adds here)
// ============================================================

// TODO P2-2: Add POST /v1/leaves/:id/validate handler here
// Route definition should be added above in Route Definitions section
```

##### Task 6: Create Integration Branch

```bash
# Ensure you're on latest main
git checkout main
git pull origin main

# Create integration branch
git checkout -b feat/v4-phase2

# Stage and commit all changes
git add packages/core/src/leaf/
git add packages/core/src/index.ts
git add apps/api/src/routes/leaves.openapi.ts

git commit -m "feat(core): add leaf module foundation for parallel development

Created packages/core/src/leaf/ module structure:
- types.ts: Frozen interface contracts for Generate and Validate
- index.ts: Module exports with ownership documentation

Updated packages/core/src/index.ts:
- Export leaf module

Updated apps/api/src/routes/leaves.openapi.ts:
- Added placeholder comments for P2-1 and P2-2 handlers

This foundation enables P2-1 (Generate) and P2-2 (Validate) to
develop in parallel without merge conflicts.

Refs: docs/plans/v4-phase2-phase3-issues.md

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push integration branch
git push -u origin feat/v4-phase2
```

##### Task 7: Verify Build

```bash
# Ensure no compilation errors
pnpm build:core

# Ensure no test regressions
pnpm test:core
```

##### Task 8: Create Developer Branches

After pushing `feat/v4-phase2`, each developer creates their branch:

**Developer A (P2-1 Generate):**
```bash
git checkout feat/v4-phase2
git checkout -b feat/v4-p2-1-generate
git push -u origin feat/v4-p2-1-generate
```

**Developer B (P2-2 Validate):**
```bash
git checkout feat/v4-phase2
git checkout -b feat/v4-p2-2-validate
git push -u origin feat/v4-p2-2-validate
```

#### Deliverables Checklist

- [ ] `packages/core/src/leaf/` directory created
- [ ] `packages/core/src/leaf/types.ts` created with all interfaces
- [ ] `packages/core/src/leaf/index.ts` created with ownership comments
- [ ] `packages/core/src/index.ts` updated to export leaf module
- [ ] `apps/api/src/routes/leaves.openapi.ts` updated with placeholder comments
- [ ] `pnpm build:core` passes
- [ ] `pnpm test:core` passes
- [ ] `feat/v4-phase2` branch created and pushed
- [ ] Developer A confirmed `feat/v4-p2-1-generate` branch created
- [ ] Developer B confirmed `feat/v4-p2-2-validate` branch created

#### Acceptance Criteria

- [ ] Both developers can import types from `@t3x/core` without errors
- [ ] Both developers understand which files they own
- [ ] Both developers have their feature branches ready
- [ ] Team agrees `types.ts` is frozen (no changes without discussion)

#### Communication Actions

After completing this issue:

1. Post in team channel:
   ```
   P2-0 Gate Issue complete!

   Integration branch: feat/v4-phase2

   @DeveloperA - Please create feat/v4-p2-1-generate from feat/v4-phase2
   @DeveloperB - Please create feat/v4-p2-2-validate from feat/v4-phase2

   types.ts is now FROZEN. Any changes require team discussion.
   ```

2. Confirm both developers have created their branches

3. Mark P2-0 as complete

---

### Issue P2-1: Implement Leaf Output Generation

**Priority**: P0
**Estimated Effort**: 4-6 hours
**Owner**: Developer A
**Branch**: `feat/v4-p2-1-generate`
**Dependencies**: P2-0 (Gate Issue)
**Blocked By**: P2-0

#### Problem Statement

The T3X leaf system exists but lacks the core functionality: generating output from committed knowledge. Currently:
- Leaves can be created, read, updated, deleted (CRUD complete)
- But `POST /v1/leaves/:id/generate` is a stub marked "future"
- No prompt building logic exists
- No LLM integration exists

Without generation capability, leaves are just empty containers. Users cannot realize the value of their committed semantic knowledge.

#### Goals

1. Build prompts from commit sentences + leaf constraints
2. Call LLM (Claude) to generate output
3. Save generated output to leaf record
4. Handle errors gracefully (rate limits, timeouts, etc.)

#### Background Context

**Leaf Type Reference** (from `packages/core/src/types/v4/index.ts`):
```typescript
type LeafType = 'deploy_agent' | 'tweet' | 'weibo' | 'wechat' | 'email' | 'article' | 'slack' | 'eval';
```

**Constraint Types**:
- `require`: Output MUST include this value (exact or semantic match)
- `exclude`: Output MUST NOT include this value

**Data Flow**:
```
CommitV4.content.sentences → Build Prompt → LLM → Output → Save to Leaf
                    ↑
          Leaf.constraints (included in prompt)
```

#### Files to Create/Modify

| File | Action | Ownership |
|------|--------|-----------|
| `packages/core/src/leaf/build-prompt.ts` | CREATE | P2-1 exclusive |
| `packages/core/src/leaf/generate.ts` | CREATE | P2-1 exclusive |
| `packages/core/src/leaf/index.ts` | MODIFY (add exports) | Shared |
| `apps/api/src/routes/leaves.openapi.ts` | MODIFY (add handler) | Shared |
| `apps/api/src/__tests__/leaves-generate.test.ts` | CREATE | P2-1 exclusive |
| `packages/core/src/__tests__/leaf/build-prompt.test.ts` | CREATE | P2-1 exclusive |

#### Detailed Tasks

##### Task 1: Create Prompt Builder

Create `packages/core/src/leaf/build-prompt.ts`:

```typescript
/**
 * Leaf Prompt Builder
 *
 * Constructs LLM prompts from commit sentences and leaf constraints.
 * The prompt instructs the LLM to:
 * 1. Generate content based on the source sentences
 * 2. Include all REQUIRE constraint values
 * 3. Avoid all EXCLUDE constraint values
 *
 * @module leaf/build-prompt
 */

import type { CommitV4, Leaf, Constraint } from '../types/v4';
import type { BuildPromptOptions, BuiltPrompt } from './types';

/**
 * Build system prompt for the LLM
 *
 * The system prompt establishes the LLM's role and general behavior.
 */
function buildSystemPrompt(leafType: string): string {
  return `You are a professional content generator. Your task is to create ${leafType} content based on provided source material.

CRITICAL RULES:
1. Generate content that captures the meaning of the source material
2. When given REQUIRED strings, you MUST include them EXACTLY as written
3. When given FORBIDDEN strings, you MUST NOT include them or similar phrases
4. Maintain appropriate tone and format for ${leafType} content
5. Be concise and engaging`;
}

/**
 * Get type-specific instructions for the content format
 */
function getTypeInstructions(leafType: string, config: Leaf['config']): string {
  const maxLength = config.max_tokens;

  switch (leafType) {
    case 'tweet':
    case 'twitter':
      return `Generate a tweet.
- Maximum ${maxLength || 280} characters
- Be concise and engaging
- Use natural language (hashtags optional)`;

    case 'weibo':
      return `Generate a Weibo post in Chinese.
- Maximum ${maxLength || 2000} characters
- Engaging for Chinese social media audience
- Can include emojis if appropriate`;

    case 'wechat':
      return `Generate a WeChat moments post.
- Can be longer than Weibo
- Personal and engaging tone
- Suitable for sharing with friends`;

    case 'article':
      return `Generate a well-structured article.
- Use clear headings (##) for sections
- Include introduction and conclusion
- Professional and informative tone`;

    case 'email':
      return `Generate a professional email.
- Include appropriate greeting
- Clear and concise body
- Professional sign-off`;

    case 'slack':
      return `Generate a Slack message.
- Professional but conversational
- Can use bullet points for clarity
- Appropriate for workplace communication`;

    default:
      return `Generate ${leafType} content in an appropriate format.`;
  }
}

/**
 * Format constraints for inclusion in the prompt
 */
function formatConstraints(constraints: Constraint[]): { requires: string; excludes: string } {
  const requires = constraints.filter(c => c.type === 'require');
  const excludes = constraints.filter(c => c.type === 'exclude');

  let requiresText = '';
  if (requires.length > 0) {
    requiresText = `
## REQUIRED (Must include EXACTLY as written)
${requires.map((c, i) => `${i + 1}. "${c.value}" (${c.match_mode} match)${c.description ? ` - ${c.description}` : ''}`).join('\n')}

IMPORTANT: These exact strings MUST appear in your output. Do not paraphrase or change them.`;
  }

  let excludesText = '';
  if (excludes.length > 0) {
    excludesText = `
## FORBIDDEN (Must NOT include)
${excludes.map((c, i) => `${i + 1}. "${c.value}"${c.reason ? ` (Reason: ${c.reason})` : ''}`).join('\n')}

IMPORTANT: These strings and similar phrases must NOT appear in your output.`;
  }

  return { requires: requiresText, excludes: excludesText };
}

/**
 * Build the complete prompt for leaf generation
 *
 * @param options - Build prompt options
 * @returns Built prompt with system and user components
 *
 * @example
 * ```typescript
 * const prompt = buildLeafPrompt({
 *   commit: myCommit,
 *   leaf: myLeaf,
 *   additionalInstructions: 'Keep it formal'
 * });
 *
 * // Use prompt.systemPrompt and prompt.userPrompt with LLM
 * ```
 */
export function buildLeafPrompt(options: BuildPromptOptions): BuiltPrompt {
  const { commit, leaf, additionalInstructions } = options;

  // Extract sentences from commit
  const sentences = commit.content.sentences.map(s => s.text);

  // Get type-specific instructions
  const typeInstructions = getTypeInstructions(leaf.type, leaf.config);

  // Format constraints
  const { requires, excludes } = formatConstraints(leaf.constraints);

  // Build system prompt
  const systemPrompt = buildSystemPrompt(leaf.type);

  // Build user prompt
  let userPrompt = `## SOURCE CONTENT
The following sentences contain the meaning you should convey:

${sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## OUTPUT FORMAT
${typeInstructions}`;

  // Add constraints if present
  if (requires) {
    userPrompt += `\n${requires}`;
  }
  if (excludes) {
    userPrompt += `\n${excludes}`;
  }

  // Add additional instructions if provided
  if (additionalInstructions) {
    userPrompt += `\n\n## ADDITIONAL INSTRUCTIONS\n${additionalInstructions}`;
  }

  // Add final instruction
  userPrompt += `\n\n---\nGenerate the ${leaf.type} content now. Remember to preserve all REQUIRED strings exactly.`;

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      sentenceCount: sentences.length,
      requireCount: leaf.constraints.filter(c => c.type === 'require').length,
      excludeCount: leaf.constraints.filter(c => c.type === 'exclude').length,
    },
  };
}
```

##### Task 2: Create Generation Service

Create `packages/core/src/leaf/generate.ts`:

```typescript
/**
 * Leaf Output Generation
 *
 * Generates leaf output by calling an LLM with the built prompt.
 * Currently supports Anthropic Claude models.
 *
 * @module leaf/generate
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildLeafPrompt } from './build-prompt';
import type { GenerateOptions, GenerateResult } from './types';
import { DEFAULT_MODEL, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS } from './types';

/**
 * Generate leaf output using Claude
 *
 * @param options - Generation options
 * @returns Generated output with metadata
 * @throws Error if LLM call fails
 *
 * @example
 * ```typescript
 * const result = await generateLeafOutput({
 *   commit: myCommit,
 *   leaf: myLeaf,
 *   model: 'claude-sonnet-4-20250514',
 *   temperature: 0.7
 * });
 *
 * console.log(result.output); // Generated content
 * console.log(result.usage);  // Token usage
 * ```
 */
export async function generateLeafOutput(options: GenerateOptions): Promise<GenerateResult> {
  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = options;

  // Build the prompt
  const { systemPrompt, userPrompt } = buildLeafPrompt(options);

  // Initialize Anthropic client
  // Uses ANTHROPIC_API_KEY environment variable
  const client = new Anthropic();

  try {
    // Call Claude
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text output
    const output = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      output,
      model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      prompt: {
        system: systemPrompt,
        user: userPrompt,
      },
    };
  } catch (error) {
    // Re-throw with more context
    if (error instanceof Anthropic.APIError) {
      throw new Error(`LLM generation failed: ${error.message} (status: ${error.status})`);
    }
    throw error;
  }
}

/**
 * Check if the Anthropic API key is configured
 *
 * @returns true if ANTHROPIC_API_KEY is set
 */
export function isGenerationConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
```

##### Task 3: Update Module Exports

Edit `packages/core/src/leaf/index.ts`, uncomment the P2-1 exports:

```typescript
// ===========================================
// P2-1 Exports (Developer A adds here)
// ===========================================
export * from './build-prompt';
export * from './generate';
```

##### Task 4: Add Route Definition

Edit `apps/api/src/routes/leaves.openapi.ts`. Add the route definition (near other route definitions):

```typescript
// POST /v1/leaves/:id/generate - Generate output
const generateLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/generate',
  tags: ['Leaves'],
  summary: 'Generate leaf output',
  description: 'Generates output for a leaf using LLM based on the source commit sentences and constraints.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            instructions: z.string().optional().describe('Additional instructions for the LLM'),
            model: z.string().optional().describe('LLM model to use'),
            temperature: z.number().min(0).max(1).optional().describe('Generation temperature'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Output generated successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              leaf: LeafResponse,
              generation: z.object({
                model: z.string(),
                usage: z.object({
                  input_tokens: z.number(),
                  output_tokens: z.number(),
                }),
              }),
            })
          ),
        },
      },
    },
    400: {
      description: 'Generation not configured or invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Leaf or source commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Generation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
```

##### Task 5: Implement Route Handler

Add the handler in the designated P2-1 section:

```typescript
// ============================================================
// Route Handlers - Generation (P2-1 Developer A adds here)
// ============================================================

// POST /v1/leaves/:id/generate
leavesRoutes.openapi(generateLeafRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  // Check if generation is configured
  if (!isGenerationConfigured()) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'GENERATION_NOT_CONFIGURED',
          message: 'LLM generation is not configured. Set ANTHROPIC_API_KEY environment variable.',
        },
      },
      400
    );
  }

  try {
    const db = await getDB();

    // Get leaf
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return c.json(
        {
          success: false as const,
          error: { code: 'LEAF_NOT_FOUND', message: `Leaf not found: ${id}` },
        },
        404
      );
    }

    // Get source commit
    const commit = await findCommitV4ByHash(db, leaf.commit_hash);
    if (!commit) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'COMMIT_NOT_FOUND',
            message: `Source commit not found: ${leaf.commit_hash}`,
          },
        },
        404
      );
    }

    // Generate output
    const result = await generateLeafOutput({
      commit,
      leaf,
      additionalInstructions: body.instructions,
      model: body.model,
      temperature: body.temperature,
    });

    // Update leaf with generated output
    const updatedLeaf = await updateLeaf(db, id, {
      output: result.output,
      generated_at: new Date().toISOString(),
    });

    return c.json({
      success: true as const,
      data: {
        leaf: toApiLeaf(updatedLeaf),
        generation: {
          model: result.model,
          usage: {
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
          },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Check for specific error types
    if (message.includes('rate limit')) {
      return c.json(
        {
          success: false as const,
          error: { code: 'RATE_LIMITED', message: 'LLM rate limit exceeded. Please try again later.' },
        },
        429
      );
    }

    return c.json(
      {
        success: false as const,
        error: { code: 'GENERATION_FAILED', message },
      },
      500
    );
  }
});
```

##### Task 6: Add Required Imports

At the top of `leaves.openapi.ts`, add:

```typescript
import { generateLeafOutput, isGenerationConfigured } from '@t3x/core';
import { findCommitV4ByHash } from '@t3x/storage/pglite';
```

##### Task 7: Write Unit Tests for Prompt Builder

Create `packages/core/src/__tests__/leaf/build-prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildLeafPrompt } from '../../leaf/build-prompt';
import type { CommitV4, Leaf } from '../../types/v4';

describe('buildLeafPrompt', () => {
  const mockCommit: CommitV4 = {
    hash: 'sha256:test',
    schema: 't3x/commit/v4',
    parents: [],
    author: { type: 'human', name: 'Test' },
    committed_at: new Date().toISOString(),
    content: {
      sentences: [
        { id: 's_1', text: 'Budget is $5,000 for the project.' },
        { id: 's_2', text: 'Deadline is January 2026.' },
      ],
    },
  };

  const mockLeaf: Leaf = {
    id: 'leaf_test',
    commit_hash: 'sha256:test',
    type: 'tweet',
    project_id: 'proj_test',
    constraints: [],
    config: {},
    created_at: new Date().toISOString(),
  };

  describe('basic prompt building', () => {
    it('includes all sentences in the prompt', () => {
      const result = buildLeafPrompt({ commit: mockCommit, leaf: mockLeaf });

      expect(result.userPrompt).toContain('Budget is $5,000');
      expect(result.userPrompt).toContain('Deadline is January 2026');
      expect(result.metadata.sentenceCount).toBe(2);
    });

    it('includes type-specific instructions for tweet', () => {
      const result = buildLeafPrompt({ commit: mockCommit, leaf: mockLeaf });

      expect(result.userPrompt).toContain('tweet');
      expect(result.userPrompt).toContain('280');
    });

    it('includes type-specific instructions for article', () => {
      const articleLeaf = { ...mockLeaf, type: 'article' as const };
      const result = buildLeafPrompt({ commit: mockCommit, leaf: articleLeaf });

      expect(result.userPrompt).toContain('article');
      expect(result.userPrompt).toContain('heading');
    });
  });

  describe('constraint handling', () => {
    it('includes REQUIRE constraints in prompt', () => {
      const leafWithRequire: Leaf = {
        ...mockLeaf,
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'exact', value: '$5,000' },
        ],
      };

      const result = buildLeafPrompt({ commit: mockCommit, leaf: leafWithRequire });

      expect(result.userPrompt).toContain('REQUIRED');
      expect(result.userPrompt).toContain('$5,000');
      expect(result.userPrompt).toContain('exact match');
      expect(result.metadata.requireCount).toBe(1);
    });

    it('includes EXCLUDE constraints in prompt', () => {
      const leafWithExclude: Leaf = {
        ...mockLeaf,
        constraints: [
          { id: 'cst_1', type: 'exclude', match_mode: 'exact', value: 'competitor', reason: 'Brand policy' },
        ],
      };

      const result = buildLeafPrompt({ commit: mockCommit, leaf: leafWithExclude });

      expect(result.userPrompt).toContain('FORBIDDEN');
      expect(result.userPrompt).toContain('competitor');
      expect(result.userPrompt).toContain('Brand policy');
      expect(result.metadata.excludeCount).toBe(1);
    });

    it('handles multiple constraints', () => {
      const leafWithMultiple: Leaf = {
        ...mockLeaf,
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'exact', value: '$5,000' },
          { id: 'cst_2', type: 'require', match_mode: 'semantic', value: 'deadline' },
          { id: 'cst_3', type: 'exclude', match_mode: 'exact', value: 'competitor' },
        ],
      };

      const result = buildLeafPrompt({ commit: mockCommit, leaf: leafWithMultiple });

      expect(result.metadata.requireCount).toBe(2);
      expect(result.metadata.excludeCount).toBe(1);
    });
  });

  describe('additional instructions', () => {
    it('includes additional instructions when provided', () => {
      const result = buildLeafPrompt({
        commit: mockCommit,
        leaf: mockLeaf,
        additionalInstructions: 'Keep it professional and formal',
      });

      expect(result.userPrompt).toContain('ADDITIONAL INSTRUCTIONS');
      expect(result.userPrompt).toContain('professional and formal');
    });

    it('does not include section when no additional instructions', () => {
      const result = buildLeafPrompt({ commit: mockCommit, leaf: mockLeaf });

      expect(result.userPrompt).not.toContain('ADDITIONAL INSTRUCTIONS');
    });
  });
});
```

##### Task 8: Write Integration Tests for API

Create `apps/api/src/__tests__/leaves-generate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { insertProject, createCommitV4, createLeaf } from '@t3x/storage';
import { setupTestDB, testData } from './setup';

// Mock the database
let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Mock LLM generation (don't call real API in tests)
vi.mock('@t3x/core', async () => {
  const actual = await vi.importActual('@t3x/core');
  return {
    ...actual,
    generateLeafOutput: vi.fn().mockResolvedValue({
      output: 'Generated tweet about $5,000 budget',
      model: 'claude-sonnet-4-20250514',
      usage: { inputTokens: 100, outputTokens: 50 },
      prompt: { system: 'test', user: 'test' },
    }),
    isGenerationConfigured: vi.fn().mockReturnValue(true),
  };
});

import { leavesRoutes } from '../routes/leaves.openapi';

describe('POST /v1/leaves/:id/generate', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testCommitHash: string;
  let testLeafId: string;

  const app = new Hono();
  app.route('/', leavesRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Generate Test' }));
    testProjectId = project.projectId;

    // Create test commit
    const commit = await createCommitV4(mockDB, {
      project_id: testProjectId,
      branch: 'main',
      sentences: [
        { id: 's_1', text: 'Budget is $5,000.' },
        { id: 's_2', text: 'Contact John Smith.' },
      ],
      author: { type: 'human', name: 'Test' },
    });
    testCommitHash = commit.hash;

    // Create test leaf
    const leaf = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      project_id: testProjectId,
      type: 'tweet',
      constraints: [
        { type: 'require', match_mode: 'exact', value: '$5,000' },
      ],
    });
    testLeafId = leaf.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('generates output successfully', async () => {
    const res = await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.leaf.output).toBeTruthy();
    expect(data.data.leaf.generated_at).toBeTruthy();
    expect(data.data.generation.model).toBe('claude-sonnet-4-20250514');
  });

  it('accepts optional parameters', async () => {
    const res = await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructions: 'Be very concise',
        temperature: 0.5,
      }),
    });

    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent leaf', async () => {
    const res = await app.request('/v1/leaves/leaf_nonexistent/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe('LEAF_NOT_FOUND');
  });

  it('returns 400 when generation not configured', async () => {
    // Override mock for this test
    const { isGenerationConfigured } = await import('@t3x/core');
    vi.mocked(isGenerationConfigured).mockReturnValueOnce(false);

    const res = await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('GENERATION_NOT_CONFIGURED');
  });
});
```

#### Deliverables Checklist

- [ ] `packages/core/src/leaf/build-prompt.ts` created
- [ ] `packages/core/src/leaf/generate.ts` created
- [ ] `packages/core/src/leaf/index.ts` exports updated
- [ ] `apps/api/src/routes/leaves.openapi.ts` route definition added
- [ ] `apps/api/src/routes/leaves.openapi.ts` handler implemented
- [ ] `packages/core/src/__tests__/leaf/build-prompt.test.ts` created
- [ ] `apps/api/src/__tests__/leaves-generate.test.ts` created
- [ ] All tests pass (`pnpm test`)
- [ ] Build succeeds (`pnpm build`)

#### Acceptance Criteria

- [ ] `POST /v1/leaves/:id/generate` returns 200 with generated output
- [ ] Generated output is saved to leaf record with `generated_at` timestamp
- [ ] Prompt includes all commit sentences
- [ ] Prompt includes REQUIRE constraints as "must include"
- [ ] Prompt includes EXCLUDE constraints as "must not include"
- [ ] Returns 404 if leaf not found
- [ ] Returns 404 if source commit not found
- [ ] Returns 400 if ANTHROPIC_API_KEY not set
- [ ] Returns 429 on rate limit
- [ ] Returns 500 on other LLM errors with message
- [ ] Unit tests cover prompt building edge cases
- [ ] Integration tests verify API behavior

#### Notes for WebUI Integration (Future)

After this issue is complete, the WebUI team can:
1. Enable the "Generate" button on leaf detail page
2. Call `POST /v1/leaves/:id/generate`
3. Display loading state during generation
4. Show generated output when complete
5. Handle error states

---

### Issue P2-2: Implement Leaf Constraint Validation

**Priority**: P0
**Estimated Effort**: 3-4 hours
**Owner**: Developer B
**Branch**: `feat/v4-p2-2-validate`
**Dependencies**: P2-0 (Gate Issue)
**Blocked By**: P2-0

#### Problem Statement

After generating leaf output, users need to verify that constraints were respected:
- Were all REQUIRE values included?
- Were all EXCLUDE values avoided?

Currently there is no validation logic. Users cannot:
- Know if "$5,000" was preserved or changed to "five thousand dollars"
- Detect if forbidden content (competitor names, etc.) appeared
- Get feedback on constraint violations

Without validation, the constraint system provides no guarantees.

#### Goals

1. Validate output against REQUIRE constraints (exact and semantic match)
2. Validate output against EXCLUDE constraints (exact and semantic match)
3. Generate detailed assertions explaining pass/fail
4. Save assertions to leaf record
5. Provide summary statistics

#### Background Context

**Constraint Types**:
```typescript
interface RequireConstraint {
  id: string;           // cst_xxx
  type: 'require';
  match_mode: 'exact' | 'semantic';
  value: string;        // Must appear in output
}

interface ExcludeConstraint {
  id: string;           // cst_xxx
  type: 'exclude';
  match_mode: 'exact' | 'semantic';
  value: string;        // Must NOT appear in output
}
```

**Assertion Schema** (validation result):
```typescript
interface Assertion {
  id: string;           // ast_xxx
  constraint_id: string;
  passed: boolean;
  details: string;      // What was found/not found
  lesson?: string;      // Human feedback for improvement
}
```

#### Files to Create/Modify

| File | Action | Ownership |
|------|--------|-----------|
| `packages/core/src/leaf/validate-constraints.ts` | CREATE | P2-2 exclusive |
| `packages/core/src/leaf/index.ts` | MODIFY (add export) | Shared |
| `apps/api/src/routes/leaves.openapi.ts` | MODIFY (add handler) | Shared |
| `apps/api/src/__tests__/leaves-validate.test.ts` | CREATE | P2-2 exclusive |
| `packages/core/src/__tests__/leaf/validate-constraints.test.ts` | CREATE | P2-2 exclusive |

#### Detailed Tasks

##### Task 1: Create Validation Logic

Create `packages/core/src/leaf/validate-constraints.ts`:

```typescript
/**
 * Leaf Constraint Validation
 *
 * Validates generated output against leaf constraints.
 * Supports both exact string matching and semantic similarity.
 *
 * @module leaf/validate-constraints
 */

import type { Constraint, Assertion } from '../types/v4';
import type { ValidateOptions, ValidationResult, ConstraintCheckResult, EmbeddingProvider } from './types';
import { SEMANTIC_REQUIRE_THRESHOLD, SEMANTIC_EXCLUDE_THRESHOLD } from './types';

/**
 * Generate a unique assertion ID
 */
function generateAssertionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'ast_';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Validate a REQUIRE constraint with exact matching
 *
 * Checks if the required value appears in the output (case-insensitive).
 */
function validateRequireExact(output: string, constraint: Constraint): ConstraintCheckResult {
  const outputLower = output.toLowerCase();
  const valueLower = constraint.value.toLowerCase();
  const index = outputLower.indexOf(valueLower);
  const passed = index !== -1;

  return {
    constraint,
    passed,
    evidence: passed
      ? { found: constraint.value, location: index }
      : undefined,
    message: passed
      ? `Found required string "${constraint.value}" at position ${index}`
      : `Required string "${constraint.value}" not found in output`,
  };
}

/**
 * Validate a REQUIRE constraint with semantic matching
 *
 * Uses embedding similarity to check if the required meaning is present.
 */
async function validateRequireSemantic(
  output: string,
  constraint: Constraint,
  embedder: EmbeddingProvider
): Promise<ConstraintCheckResult> {
  try {
    // Get embeddings for output and constraint value
    const [outputEmbedding, valueEmbedding] = await embedder.embedBatch([
      output,
      constraint.value,
    ]);

    const similarity = cosineSimilarity(outputEmbedding, valueEmbedding);
    const passed = similarity >= SEMANTIC_REQUIRE_THRESHOLD;

    return {
      constraint,
      passed,
      evidence: { similarity },
      message: passed
        ? `Semantic match found for "${constraint.value}" (similarity: ${similarity.toFixed(3)})`
        : `Semantic match failed for "${constraint.value}" (similarity: ${similarity.toFixed(3)}, threshold: ${SEMANTIC_REQUIRE_THRESHOLD})`,
    };
  } catch (error) {
    return {
      constraint,
      passed: false,
      message: `Semantic validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validate an EXCLUDE constraint with exact matching
 *
 * Checks that the excluded value does NOT appear in the output.
 */
function validateExcludeExact(output: string, constraint: Constraint): ConstraintCheckResult {
  const outputLower = output.toLowerCase();
  const valueLower = constraint.value.toLowerCase();
  const index = outputLower.indexOf(valueLower);
  const passed = index === -1; // Passed if NOT found

  return {
    constraint,
    passed,
    evidence: !passed
      ? { found: constraint.value, location: index }
      : undefined,
    message: passed
      ? `Correctly excluded "${constraint.value}" - not found in output`
      : `Forbidden string "${constraint.value}" found at position ${index}`,
  };
}

/**
 * Validate an EXCLUDE constraint with semantic matching
 *
 * Uses embedding similarity to check that excluded meaning is NOT present.
 */
async function validateExcludeSemantic(
  output: string,
  constraint: Constraint,
  embedder: EmbeddingProvider
): Promise<ConstraintCheckResult> {
  try {
    const [outputEmbedding, valueEmbedding] = await embedder.embedBatch([
      output,
      constraint.value,
    ]);

    const similarity = cosineSimilarity(outputEmbedding, valueEmbedding);
    const passed = similarity < SEMANTIC_EXCLUDE_THRESHOLD;

    return {
      constraint,
      passed,
      evidence: { similarity },
      message: passed
        ? `Correctly excluded "${constraint.value}" semantically (similarity: ${similarity.toFixed(3)})`
        : `Semantic exclusion failed - "${constraint.value}" may be present (similarity: ${similarity.toFixed(3)}, threshold: ${SEMANTIC_EXCLUDE_THRESHOLD})`,
    };
  } catch (error) {
    // On error, assume passed (can't prove it's present)
    return {
      constraint,
      passed: true,
      message: `Semantic exclusion check failed, assuming passed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validate a single constraint against the output
 */
async function validateSingleConstraint(
  output: string,
  constraint: Constraint,
  embedder?: EmbeddingProvider
): Promise<ConstraintCheckResult> {
  if (constraint.type === 'require') {
    if (constraint.match_mode === 'exact') {
      return validateRequireExact(output, constraint);
    } else {
      // Semantic match
      if (!embedder) {
        return {
          constraint,
          passed: false,
          message: 'Semantic matching requires an embedding provider, but none was provided',
        };
      }
      return validateRequireSemantic(output, constraint, embedder);
    }
  } else {
    // EXCLUDE constraint
    if (constraint.match_mode === 'exact') {
      return validateExcludeExact(output, constraint);
    } else {
      if (!embedder) {
        // Can't check semantic exclusion without embedder, assume passed
        return {
          constraint,
          passed: true,
          message: 'Semantic exclusion requires embedding provider - assuming passed',
        };
      }
      return validateExcludeSemantic(output, constraint, embedder);
    }
  }
}

/**
 * Convert constraint check result to assertion
 */
function toAssertion(result: ConstraintCheckResult): Assertion {
  return {
    id: generateAssertionId(),
    constraint_id: result.constraint.id,
    passed: result.passed,
    details: result.message,
    // lesson field can be added by user later
  };
}

/**
 * Validate all constraints against the output
 *
 * @param options - Validation options
 * @returns Validation result with assertions and summary
 *
 * @example
 * ```typescript
 * const result = await validateConstraints({
 *   output: 'Generated content with $5,000 budget',
 *   constraints: [
 *     { id: 'cst_1', type: 'require', match_mode: 'exact', value: '$5,000' },
 *     { id: 'cst_2', type: 'exclude', match_mode: 'exact', value: 'competitor' },
 *   ],
 * });
 *
 * console.log(result.allPassed);  // true
 * console.log(result.assertions); // Detailed results per constraint
 * ```
 */
export async function validateConstraints(options: ValidateOptions): Promise<ValidationResult> {
  const { output, constraints, embedder } = options;

  // Validate each constraint
  const results: ConstraintCheckResult[] = [];
  for (const constraint of constraints) {
    const result = await validateSingleConstraint(output, constraint, embedder);
    results.push(result);
  }

  // Convert to assertions
  const assertions = results.map(toAssertion);

  // Calculate summary
  const passedCount = assertions.filter(a => a.passed).length;
  const failedCount = assertions.filter(a => !a.passed).length;

  return {
    assertions,
    allPassed: failedCount === 0,
    passedCount,
    failedCount,
  };
}

/**
 * Quick validation check (exact match only, no embedder needed)
 *
 * Useful for quick validation without setting up an embedding provider.
 * Only validates exact match constraints; semantic constraints are skipped.
 *
 * @param output - The output to validate
 * @param constraints - Constraints to check
 * @returns Validation result for exact match constraints only
 */
export function validateConstraintsExactOnly(
  output: string,
  constraints: Constraint[]
): ValidationResult {
  const exactConstraints = constraints.filter(c => c.match_mode === 'exact');

  const results: ConstraintCheckResult[] = exactConstraints.map(constraint => {
    if (constraint.type === 'require') {
      return validateRequireExact(output, constraint);
    } else {
      return validateExcludeExact(output, constraint);
    }
  });

  const assertions = results.map(toAssertion);
  const passedCount = assertions.filter(a => a.passed).length;
  const failedCount = assertions.filter(a => !a.passed).length;

  return {
    assertions,
    allPassed: failedCount === 0,
    passedCount,
    failedCount,
  };
}
```

##### Task 2: Update Module Exports

Edit `packages/core/src/leaf/index.ts`, uncomment the P2-2 export:

```typescript
// ===========================================
// P2-2 Exports (Developer B adds here)
// ===========================================
export * from './validate-constraints';
```

##### Task 3: Add Route Definition

Edit `apps/api/src/routes/leaves.openapi.ts`. Add the route definition:

```typescript
// POST /v1/leaves/:id/validate - Validate constraints
const validateLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/validate',
  tags: ['Leaves'],
  summary: 'Validate leaf constraints',
  description: 'Validates the generated output against the leaf constraints. Returns detailed assertion results.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            use_semantic: z.boolean().optional().default(false).describe('Whether to use semantic matching (requires embedding provider)'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Validation complete',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              leaf: LeafResponse,
              validation: z.object({
                all_passed: z.boolean(),
                passed_count: z.number(),
                failed_count: z.number(),
              }),
            })
          ),
        },
      },
    },
    400: {
      description: 'No output to validate',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Leaf not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
```

##### Task 4: Implement Route Handler

Add the handler in the designated P2-2 section:

```typescript
// ============================================================
// Route Handlers - Validation (P2-2 Developer B adds here)
// ============================================================

// POST /v1/leaves/:id/validate
leavesRoutes.openapi(validateLeafRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Get leaf
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return c.json(
        {
          success: false as const,
          error: { code: 'LEAF_NOT_FOUND', message: `Leaf not found: ${id}` },
        },
        404
      );
    }

    // Check if output exists
    if (!leaf.output) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'NO_OUTPUT',
            message: 'Leaf has no generated output to validate. Call /generate first.',
          },
        },
        400
      );
    }

    // Check if there are any constraints
    if (!leaf.constraints || leaf.constraints.length === 0) {
      return c.json({
        success: true as const,
        data: {
          leaf: toApiLeaf(leaf),
          validation: {
            all_passed: true,
            passed_count: 0,
            failed_count: 0,
          },
        },
      });
    }

    // Validate constraints
    // For now, only use exact matching (semantic requires embedder setup)
    const result = body.use_semantic
      ? await validateConstraints({
          output: leaf.output,
          constraints: leaf.constraints,
          // TODO: Add embedder when configured
          // embedder: getEmbeddingProvider(),
        })
      : validateConstraintsExactOnly(leaf.output, leaf.constraints);

    // Update leaf with assertions
    const updatedLeaf = await updateLeaf(db, id, {
      assertions: result.assertions,
    });

    return c.json({
      success: true as const,
      data: {
        leaf: toApiLeaf(updatedLeaf),
        validation: {
          all_passed: result.allPassed,
          passed_count: result.passedCount,
          failed_count: result.failedCount,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(
      {
        success: false as const,
        error: { code: 'VALIDATION_FAILED', message },
      },
      500
    );
  }
});
```

##### Task 5: Add Required Imports

At the top of `leaves.openapi.ts`, add:

```typescript
import { validateConstraints, validateConstraintsExactOnly } from '@t3x/core';
```

##### Task 6: Write Unit Tests

Create `packages/core/src/__tests__/leaf/validate-constraints.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateConstraints, validateConstraintsExactOnly } from '../../leaf/validate-constraints';
import type { Constraint } from '../../types/v4';

describe('validateConstraints', () => {
  describe('REQUIRE exact match', () => {
    it('passes when required string is present', async () => {
      const result = await validateConstraints({
        output: 'Our budget is $5,000 for this project.',
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'exact', value: '$5,000' },
        ],
      });

      expect(result.allPassed).toBe(true);
      expect(result.passedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.assertions[0].passed).toBe(true);
      expect(result.assertions[0].details).toContain('Found');
    });

    it('fails when required string is missing', async () => {
      const result = await validateConstraints({
        output: 'Our budget is five thousand dollars.',
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'exact', value: '$5,000' },
        ],
      });

      expect(result.allPassed).toBe(false);
      expect(result.passedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.assertions[0].passed).toBe(false);
      expect(result.assertions[0].details).toContain('not found');
    });

    it('is case-insensitive', async () => {
      const result = await validateConstraints({
        output: 'Contact JOHN SMITH for details.',
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'John Smith' },
        ],
      });

      expect(result.allPassed).toBe(true);
    });

    it('finds partial matches', async () => {
      const result = await validateConstraints({
        output: 'The total cost is $5,000.00 USD.',
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'exact', value: '$5,000' },
        ],
      });

      expect(result.allPassed).toBe(true);
    });
  });

  describe('EXCLUDE exact match', () => {
    it('passes when excluded string is absent', async () => {
      const result = await validateConstraints({
        output: 'We offer the best service in the industry.',
        constraints: [
          { id: 'cst_1', type: 'exclude', match_mode: 'exact', value: 'CompetitorName' },
        ],
      });

      expect(result.allPassed).toBe(true);
      expect(result.assertions[0].passed).toBe(true);
      expect(result.assertions[0].details).toContain('Correctly excluded');
    });

    it('fails when excluded string is present', async () => {
      const result = await validateConstraints({
        output: 'Unlike CompetitorName, we offer better service.',
        constraints: [
          { id: 'cst_1', type: 'exclude', match_mode: 'exact', value: 'CompetitorName' },
        ],
      });

      expect(result.allPassed).toBe(false);
      expect(result.assertions[0].passed).toBe(false);
      expect(result.assertions[0].details).toContain('found at position');
    });

    it('is case-insensitive', async () => {
      const result = await validateConstraints({
        output: 'We are better than COMPETITORNAME in every way.',
        constraints: [
          { id: 'cst_1', type: 'exclude', match_mode: 'exact', value: 'CompetitorName' },
        ],
      });

      expect(result.allPassed).toBe(false);
    });
  });

  describe('multiple constraints', () => {
    it('validates all and returns correct counts', async () => {
      const result = await validateConstraints({
        output: 'Budget: $5,000. Contact: john@example.com. Best service!',
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'exact', value: '$5,000' },
          { id: 'cst_2', type: 'require', match_mode: 'exact', value: 'john@example.com' },
          { id: 'cst_3', type: 'exclude', match_mode: 'exact', value: 'competitor' },
        ],
      });

      expect(result.passedCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.allPassed).toBe(true);
      expect(result.assertions).toHaveLength(3);
    });

    it('reports partial failures correctly', async () => {
      const result = await validateConstraints({
        output: 'Budget: five thousand. Unlike competitor, we are better.',
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'exact', value: '$5,000' },     // FAIL
          { id: 'cst_2', type: 'exclude', match_mode: 'exact', value: 'competitor' }, // FAIL
          { id: 'cst_3', type: 'require', match_mode: 'exact', value: 'better' },     // PASS
        ],
      });

      expect(result.passedCount).toBe(1);
      expect(result.failedCount).toBe(2);
      expect(result.allPassed).toBe(false);
    });
  });

  describe('semantic matching', () => {
    it('returns error message when embedder not provided', async () => {
      const result = await validateConstraints({
        output: 'We have a five thousand dollar budget.',
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'semantic', value: '$5,000' },
        ],
        // No embedder provided
      });

      expect(result.assertions[0].passed).toBe(false);
      expect(result.assertions[0].details).toContain('embedding provider');
    });
  });

  describe('assertion IDs', () => {
    it('generates unique assertion IDs with ast_ prefix', async () => {
      const result = await validateConstraints({
        output: 'Test output',
        constraints: [
          { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'Test' },
          { id: 'cst_2', type: 'require', match_mode: 'exact', value: 'output' },
        ],
      });

      expect(result.assertions[0].id).toMatch(/^ast_[a-z0-9]+$/);
      expect(result.assertions[1].id).toMatch(/^ast_[a-z0-9]+$/);
      expect(result.assertions[0].id).not.toBe(result.assertions[1].id);
    });

    it('links assertion to constraint via constraint_id', async () => {
      const result = await validateConstraints({
        output: 'Test output',
        constraints: [
          { id: 'cst_abc123', type: 'require', match_mode: 'exact', value: 'Test' },
        ],
      });

      expect(result.assertions[0].constraint_id).toBe('cst_abc123');
    });
  });
});

describe('validateConstraintsExactOnly', () => {
  it('only validates exact match constraints', () => {
    const result = validateConstraintsExactOnly(
      'Test with $5,000 budget',
      [
        { id: 'cst_1', type: 'require', match_mode: 'exact', value: '$5,000' },
        { id: 'cst_2', type: 'require', match_mode: 'semantic', value: 'money' }, // Skipped
      ]
    );

    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0].constraint_id).toBe('cst_1');
  });

  it('is synchronous (no await needed)', () => {
    const result = validateConstraintsExactOnly(
      'Test output',
      [{ id: 'cst_1', type: 'require', match_mode: 'exact', value: 'Test' }]
    );

    expect(result.allPassed).toBe(true);
  });
});
```

##### Task 7: Write Integration Tests

Create `apps/api/src/__tests__/leaves-validate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { insertProject, createCommitV4, createLeaf, updateLeaf } from '@t3x/storage';
import { setupTestDB, testData } from './setup';

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

import { leavesRoutes } from '../routes/leaves.openapi';

describe('POST /v1/leaves/:id/validate', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testCommitHash: string;
  let leafWithOutput: string;
  let leafWithoutOutput: string;

  const app = new Hono();
  app.route('/', leavesRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Validate Test' }));
    testProjectId = project.projectId;

    // Create test commit
    const commit = await createCommitV4(mockDB, {
      project_id: testProjectId,
      branch: 'main',
      sentences: [{ id: 's_1', text: 'Budget is $5,000.' }],
      author: { type: 'human', name: 'Test' },
    });
    testCommitHash = commit.hash;

    // Create leaf WITH output
    const leaf1 = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      project_id: testProjectId,
      type: 'tweet',
      constraints: [
        { type: 'require', match_mode: 'exact', value: '$5,000' },
        { type: 'exclude', match_mode: 'exact', value: 'competitor' },
      ],
    });
    await updateLeaf(mockDB, leaf1.id, { output: 'Great deal at $5,000!' });
    leafWithOutput = leaf1.id;

    // Create leaf WITHOUT output
    const leaf2 = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      project_id: testProjectId,
      type: 'tweet',
      constraints: [
        { type: 'require', match_mode: 'exact', value: 'test' },
      ],
    });
    leafWithoutOutput = leaf2.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('validates constraints successfully', async () => {
    const res = await app.request(`/v1/leaves/${leafWithOutput}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.validation.all_passed).toBe(true);
    expect(data.data.validation.passed_count).toBe(2);
    expect(data.data.validation.failed_count).toBe(0);
    expect(data.data.leaf.assertions).toHaveLength(2);
  });

  it('saves assertions to leaf', async () => {
    const res = await app.request(`/v1/leaves/${leafWithOutput}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    expect(data.data.leaf.assertions).toBeDefined();
    expect(data.data.leaf.assertions[0].id).toMatch(/^ast_/);
    expect(data.data.leaf.assertions[0].constraint_id).toMatch(/^cst_/);
  });

  it('returns 400 when no output to validate', async () => {
    const res = await app.request(`/v1/leaves/${leafWithoutOutput}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('NO_OUTPUT');
  });

  it('returns 404 for non-existent leaf', async () => {
    const res = await app.request('/v1/leaves/leaf_nonexistent/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('LEAF_NOT_FOUND');
  });

  it('handles leaf with no constraints', async () => {
    // Create leaf with no constraints
    const leaf = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      project_id: testProjectId,
      type: 'tweet',
      constraints: [],
    });
    await updateLeaf(mockDB, leaf.id, { output: 'Some output' });

    const res = await app.request(`/v1/leaves/${leaf.id}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.validation.all_passed).toBe(true);
    expect(data.data.validation.passed_count).toBe(0);
  });
});
```

#### Deliverables Checklist

- [ ] `packages/core/src/leaf/validate-constraints.ts` created
- [ ] `packages/core/src/leaf/index.ts` exports updated
- [ ] `apps/api/src/routes/leaves.openapi.ts` route definition added
- [ ] `apps/api/src/routes/leaves.openapi.ts` handler implemented
- [ ] `packages/core/src/__tests__/leaf/validate-constraints.test.ts` created
- [ ] `apps/api/src/__tests__/leaves-validate.test.ts` created
- [ ] All tests pass (`pnpm test`)
- [ ] Build succeeds (`pnpm build`)

#### Acceptance Criteria

- [ ] `POST /v1/leaves/:id/validate` returns 200 with validation results
- [ ] REQUIRE exact match: passes when string present, fails when absent
- [ ] EXCLUDE exact match: passes when string absent, fails when present
- [ ] Matching is case-insensitive
- [ ] Assertions are saved to leaf record
- [ ] Each assertion has unique `ast_` prefixed ID
- [ ] Each assertion links to constraint via `constraint_id`
- [ ] Returns 400 if leaf has no output
- [ ] Returns 404 if leaf not found
- [ ] Summary includes `all_passed`, `passed_count`, `failed_count`
- [ ] Semantic matching returns appropriate error when embedder not configured

---

### Issue P2-3: Keyword Extraction Optimization

**Priority**: P1
**Estimated Effort**: TBD (awaiting requirements)
**Owner**: TBD
**Branch**: `feat/v4-p2-3-keyword`
**Dependencies**: None (can run in parallel with P2-1/P2-2)

#### Problem Statement

[Awaiting specific requirements from user]

Current keyword extraction in Ring 1:
- Extracts keywords based on POS tags (NOUN, PROPN, VERB, ADJ)
- Applies stop word filtering
- Extracts anchor candidates (numbers, money, dates, entities)

#### Potential Optimization Areas

1. **Stop Word Improvements**
   - Expand/refine stop word list
   - Add language-specific stop words

2. **Multi-Language Support**
   - Chinese keyword extraction (jieba integration)
   - Japanese, Korean support

3. **Domain-Specific Recognition**
   - Custom vocabulary for specific domains
   - Industry-specific term extraction

4. **Anchor Candidate Accuracy**
   - Improve number/currency detection
   - Better date parsing
   - Entity recognition improvements

5. **Deduplication/Lemmatization**
   - Better handling of plural forms
   - Verb conjugation normalization

#### Files Likely to Modify

| File | Purpose |
|------|---------|
| `packages/core/src/extractors/ringExtractor.ts` | Main extraction logic |
| `packages/core/src/extractors/types.ts` | Type definitions |
| `packages/core/configs/extractors/*.yml` | Domain-specific rules |

#### Detailed Tasks

[To be specified based on user requirements]

#### Deliverables

[To be specified]

#### Acceptance Criteria

[To be specified]

---

## Phase 3: E2E Regression Testing

### Issue P3-1: V4 E2E Regression Test Suite

**Priority**: P0
**Estimated Effort**: 2-3 hours
**Owner**: Either developer
**Branch**: `feat/v4-phase2` (after merging P2-1 and P2-2)
**Dependencies**: P2-1, P2-2 completed
**Blocked By**: P2-1, P2-2

#### Problem Statement

After completing Phase 2 features (Generate and Validate), we need to verify:
1. All previously passing tests still pass (no regressions)
2. New features work end-to-end
3. The complete user flow works from project creation to context export

#### Goals

1. Update E2E test script for V4 flows
2. Run complete acceptance checklist
3. Document any issues found
4. Verify no regressions from Phase 1

#### Background Context

**Existing Resources**:
- `docs/plans/v4-e2e-acceptance.md` - Full acceptance checklist
- `scripts/e2e-test.sh` - Current E2E script (tests V2 API, needs update)

**Target Flow**:
```
Create Project → Create Conversation → Create V4 Commit →
Create Leaf → Generate Output → Validate Constraints →
Pin Resource → View Context → Export Context
```

#### Detailed Tasks

##### Task 1: Create V4 E2E Test Script

Create `scripts/e2e-test-v4.sh`:

```bash
#!/bin/bash
#
# T3X V4 End-to-End Test Script
#
# Tests the complete V4 flow including Generate and Validate.
#
# Usage:
#   ./scripts/e2e-test-v4.sh
#   BASE_URL=http://host:port ./scripts/e2e-test-v4.sh
#

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
API="$BASE_URL/api/v1"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo " T3X V4 End-to-End Test"
echo "========================================"
echo -e "API: ${BLUE}$API${NC}"
echo ""

PASSED=0
FAILED=0
SKIPPED=0

check() {
  if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} $1"
    ((PASSED++))
  else
    echo -e "   ${RED}✗${NC} $1"
    ((FAILED++))
    return 1
  fi
}

skip() {
  echo -e "   ${YELLOW}○${NC} $1 (skipped)"
  ((SKIPPED++))
}

# ========================================
# 1. Health Check
# ========================================
echo "1. Health Check"
HEALTH=$(curl -sf "$API/health" 2>/dev/null || echo '{}')
echo "$HEALTH" | jq -e '.status == "ok"' > /dev/null 2>&1
check "API is healthy"

# ========================================
# 2. Create Project
# ========================================
echo "2. Create Project"
PROJECT=$(curl -sf -X POST "$API/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"V4 E2E Test $(date +%s)\"}" 2>/dev/null)
PROJECT_ID=$(echo "$PROJECT" | jq -r '.data.project_id')
[ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]
check "Created project: $PROJECT_ID"

# ========================================
# 3. Create Conversation
# ========================================
echo "3. Create Conversation"
CONV=$(curl -sf -X POST "$API/conversations" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"title\": \"Test Conversation\"}" 2>/dev/null)
CONV_ID=$(echo "$CONV" | jq -r '.data.conversation_id')
[ -n "$CONV_ID" ] && [ "$CONV_ID" != "null" ]
check "Created conversation: $CONV_ID"

# ========================================
# 4. Create V4 Commit
# ========================================
echo "4. Create V4 Commit"
COMMIT=$(curl -sf -X POST "$API/commits-v4" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"branch\": \"main\",
    \"message\": \"E2E test commit\",
    \"sentences\": [
      {\"id\": \"s_1\", \"text\": \"Budget is \$5,000 for the project.\"},
      {\"id\": \"s_2\", \"text\": \"Contact John Smith for details.\"},
      {\"id\": \"s_3\", \"text\": \"Deadline is January 2026.\"}
    ],
    \"author\": {\"type\": \"human\", \"name\": \"E2E Test\"}
  }" 2>/dev/null)
COMMIT_HASH=$(echo "$COMMIT" | jq -r '.data.hash')
[ -n "$COMMIT_HASH" ] && [ "$COMMIT_HASH" != "null" ]
check "Created commit: ${COMMIT_HASH:0:20}..."

# Verify V4 schema
echo "$COMMIT" | jq -e '.data.schema == "t3x/commit/v4"' > /dev/null 2>&1
check "Commit has correct schema"

echo "$COMMIT" | jq -e '.data.content.sentences | length == 3' > /dev/null 2>&1
check "Commit has 3 sentences"

# ========================================
# 5. Create Leaf with Constraints
# ========================================
echo "5. Create Leaf"
LEAF=$(curl -sf -X POST "$API/leaves" \
  -H "Content-Type: application/json" \
  -d "{
    \"commit_hash\": \"$COMMIT_HASH\",
    \"project_id\": \"$PROJECT_ID\",
    \"type\": \"tweet\",
    \"title\": \"Budget Tweet\",
    \"constraints\": [
      {\"type\": \"require\", \"match_mode\": \"exact\", \"value\": \"\$5,000\"},
      {\"type\": \"require\", \"match_mode\": \"exact\", \"value\": \"John Smith\"},
      {\"type\": \"exclude\", \"match_mode\": \"exact\", \"value\": \"competitor\"}
    ]
  }" 2>/dev/null)
LEAF_ID=$(echo "$LEAF" | jq -r '.data.id')
[ -n "$LEAF_ID" ] && [ "$LEAF_ID" != "null" ]
check "Created leaf: $LEAF_ID"

# Verify constraint IDs
echo "$LEAF" | jq -e '.data.constraints[0].id | startswith("cst_")' > /dev/null 2>&1
check "Constraint IDs have cst_ prefix"

# ========================================
# 6. Generate Leaf Output
# ========================================
echo "6. Generate Leaf Output"
GEN_RES=$(curl -sf -X POST "$API/leaves/$LEAF_ID/generate" \
  -H "Content-Type: application/json" \
  -d '{"temperature": 0.5}' 2>/dev/null || echo '{"error": {"code": "GENERATION_NOT_CONFIGURED"}}')

if echo "$GEN_RES" | jq -e '.error.code == "GENERATION_NOT_CONFIGURED"' > /dev/null 2>&1; then
  skip "Generate (ANTHROPIC_API_KEY not set)"
else
  echo "$GEN_RES" | jq -e '.data.leaf.output != null' > /dev/null 2>&1
  check "Generated output"

  echo "$GEN_RES" | jq -e '.data.leaf.generated_at != null' > /dev/null 2>&1
  check "Has generated_at timestamp"

  echo "$GEN_RES" | jq -e '.data.generation.model != null' > /dev/null 2>&1
  check "Reports model used"
fi

# ========================================
# 7. Validate Constraints
# ========================================
echo "7. Validate Constraints"

# First check if we have output to validate
LEAF_CHECK=$(curl -sf "$API/leaves/$LEAF_ID" 2>/dev/null)
HAS_OUTPUT=$(echo "$LEAF_CHECK" | jq -r '.data.output != null')

if [ "$HAS_OUTPUT" = "true" ]; then
  VAL_RES=$(curl -sf -X POST "$API/leaves/$LEAF_ID/validate" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null)

  echo "$VAL_RES" | jq -e '.data.validation.all_passed != null' > /dev/null 2>&1
  check "Validation completed"

  echo "$VAL_RES" | jq -e '.data.leaf.assertions | length > 0' > /dev/null 2>&1
  check "Assertions generated"

  echo "$VAL_RES" | jq -e '.data.leaf.assertions[0].id | startswith("ast_")' > /dev/null 2>&1
  check "Assertion IDs have ast_ prefix"
else
  skip "Validate (no output to validate)"
fi

# ========================================
# 8. Pin Conversation
# ========================================
echo "8. Pin Resources"
PIN=$(curl -sf -X POST "$API/projects/$PROJECT_ID/pins" \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"conversation\", \"ref_id\": \"$CONV_ID\"}" 2>/dev/null)
PIN_ID=$(echo "$PIN" | jq -r '.data.id')
[ -n "$PIN_ID" ] && [ "$PIN_ID" != "null" ]
check "Pinned conversation: $PIN_ID"

# Verify pin ID prefix
echo "$PIN" | jq -e '.data.id | startswith("pin_")' > /dev/null 2>&1
check "Pin ID has pin_ prefix"

# ========================================
# 9. Verify Duplicate Pin Returns 409
# ========================================
echo "9. Duplicate Pin Handling"
DUP_RES=$(curl -s -w "\n%{http_code}" -X POST "$API/projects/$PROJECT_ID/pins" \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"conversation\", \"ref_id\": \"$CONV_ID\"}" 2>/dev/null)
HTTP_CODE=$(echo "$DUP_RES" | tail -1)
BODY=$(echo "$DUP_RES" | head -n -1)

[ "$HTTP_CODE" = "409" ]
check "Duplicate pin returns 409"

echo "$BODY" | jq -e '.error.code == "DUPLICATE_PIN"' > /dev/null 2>&1
check "Error code is DUPLICATE_PIN"

# ========================================
# 10. Get Leaf by ID
# ========================================
echo "10. Get Leaf"
GET_LEAF=$(curl -sf "$API/leaves/$LEAF_ID" 2>/dev/null)
echo "$GET_LEAF" | jq -e '.data.id == "'$LEAF_ID'"' > /dev/null 2>&1
check "Can retrieve leaf by ID"

# ========================================
# 11. List Leaves by Commit
# ========================================
echo "11. List Leaves by Commit"
LIST_LEAVES=$(curl -sf "$API/commits/$COMMIT_HASH/leaves" 2>/dev/null)
echo "$LIST_LEAVES" | jq -e '.data | length >= 1' > /dev/null 2>&1
check "Can list leaves by commit"

# ========================================
# 12. Cleanup
# ========================================
echo "12. Cleanup"
curl -sf -X DELETE "$API/projects/$PROJECT_ID" > /dev/null 2>&1
check "Deleted test project"

# ========================================
# Summary
# ========================================
echo ""
echo "========================================"
TOTAL=$((PASSED + FAILED + SKIPPED))
echo -e " Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}, ${YELLOW}$SKIPPED skipped${NC} / $TOTAL total"
echo "========================================"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
```

Make it executable:
```bash
chmod +x scripts/e2e-test-v4.sh
```

##### Task 2: Run Acceptance Checklist

Go through each item in `docs/plans/v4-e2e-acceptance.md`:

**API Layer Tests**
```bash
pnpm test:storage
pnpm test --filter @t3x/api
```

**Manual Verification**
- [ ] Open WebUI, navigate to project
- [ ] Verify V4 commits display correctly
- [ ] Create a new leaf
- [ ] Click Generate (if API key configured)
- [ ] Click Validate
- [ ] Pin/Unpin resources
- [ ] Check Context panel
- [ ] Export context

##### Task 3: Document Results

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

### Unit Tests
- `pnpm test:core`: [PASS/FAIL] ([X] tests)
- `pnpm test:storage`: [PASS/FAIL] ([X] tests)
- `pnpm test --filter @t3x/api`: [PASS/FAIL] ([X] tests)

### E2E Script
- `./scripts/e2e-test-v4.sh`: [PASS/FAIL]
  - Passed: [X]
  - Failed: [X]
  - Skipped: [X]

## Manual Tests

### Commit Flow
- [ ] Create V4 commit: [PASS/FAIL]
- [ ] View commit detail: [PASS/FAIL]
- [ ] List commits: [PASS/FAIL]

### Leaf Flow
- [ ] Create leaf: [PASS/FAIL]
- [ ] Generate output: [PASS/FAIL/SKIPPED]
- [ ] Validate constraints: [PASS/FAIL]
- [ ] View assertions: [PASS/FAIL]

### Pin Flow
- [ ] Pin conversation: [PASS/FAIL]
- [ ] Pin leaf: [PASS/FAIL]
- [ ] Duplicate prevention: [PASS/FAIL]

### WebUI
- [ ] Project page loads: [PASS/FAIL]
- [ ] Canvas renders: [PASS/FAIL]
- [ ] Leaf panel works: [PASS/FAIL]
- [ ] No console errors: [PASS/FAIL]

## Issues Found

### Regressions
[List any tests that passed before but fail now]

### New Issues
[List any new bugs discovered]

### Recommendations
[Suggestions for fixes or improvements]

## Sign-off

- [ ] All critical tests pass
- [ ] No blocking regressions
- [ ] Ready for next phase
```

#### Deliverables Checklist

- [ ] `scripts/e2e-test-v4.sh` created and executable
- [ ] E2E script passes (or documents known skips)
- [ ] All unit tests pass
- [ ] Manual acceptance checklist completed
- [ ] Regression report created

#### Acceptance Criteria

- [ ] All `pnpm test` pass
- [ ] E2E script completes without failures
- [ ] No regressions from Phase 1 baseline
- [ ] Generate endpoint works (or correctly reports missing API key)
- [ ] Validate endpoint works
- [ ] WebUI renders without errors
- [ ] All ID prefixes correct (s_, cst_, ast_, leaf_, pin_)

---

## Issue Summary

| Issue | Priority | Effort | Owner | Dependencies | Status |
|-------|----------|--------|-------|--------------|--------|
| **P2-0** | P0 (Gate) | 30-45m | Either | None | Ready |
| **P2-1** | P0 | 4-6h | Dev A | P2-0 | Ready |
| **P2-2** | P0 | 3-4h | Dev B | P2-0 | Ready |
| **P2-3** | P1 | TBD | TBD | None | Needs requirements |
| **P3-1** | P0 | 2-3h | Either | P2-1, P2-2 | Ready |

## Development Timeline

```
Day 1:
  └── P2-0 (Gate) - Either developer (30-45 min)
      └── Push feat/v4-phase2, create feature branches

Day 1-3 (Parallel):
  ├── P2-1 (Generate) - Developer A
  └── P2-2 (Validate) - Developer B

Day 3-4:
  ├── P2-1 merges to feat/v4-phase2
  └── P2-2 rebases, merges to feat/v4-phase2

Day 4:
  └── P3-1 (E2E Regression) - Either developer

Day 4-5:
  └── Fix any issues found, merge to main
```

---

*Document created: 2026-01-23*
*Last updated: 2026-01-23*
