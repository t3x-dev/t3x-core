# Leaf Implementation Plan

> Leaf = LLM wrapper that generates outputs from committed meaning while preserving original strings via constraints

**Owner**: [Programmer Name]
**Last Updated**: 2025-01-18

---

## Table of Contents

1. [What is Leaf?](#what-is-leaf)
2. [Current State](#current-state)
3. [Target Architecture](#target-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Detailed Task Checklist](#detailed-task-checklist)
6. [Technical Specifications](#technical-specifications)
7. [Success Criteria](#success-criteria)

---

## What is Leaf?

### Core Concept

**Leaf** is the output generation layer of T3X. It takes committed semantic meaning (sentences + constraints) and generates formatted outputs (tweets, articles, emails) using LLMs while **preserving critical original strings**.

```
┌─────────────────────────────────────────────────────────────────┐
│                       T3X FLOW                                  │
│                                                                 │
│   Conversation → Extract → Commit → LEAF → Output               │
│                              │         │                        │
│                              │         └─► LLM Generation       │
│                              │                    │             │
│                              └─► Constraints ────►│ Validate    │
│                                                   │             │
│                                                   ▼             │
│                                              Tweet/Article/etc  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principle: Preserve Original Strings

When generating outputs, the LLM might:
- Change "$5,000" to "five thousand dollars"
- Rephrase "30-day money-back guarantee" to "refund policy"
- Accidentally mention a competitor

**Constraints prevent this** by:
1. **REQUIRE**: Output MUST include exact/semantic match of value
2. **EXCLUDE**: Output MUST NOT include value

### Leaf Types

| Type | Category | Description |
|------|----------|-------------|
| `twitter` | output | Tweet generation (280 chars) |
| `weibo` | output | Weibo post (Chinese) |
| `wechat` | output | WeChat moments post |
| `article` | output | Long-form article |
| `email` | output | Email content |
| `slack` | output | Slack message |
| `deploy` | runner | Deploy to agent endpoint |
| `eval` | runner | Run evaluation suite |

---

## Current State

### What Exists

| Component | Status | Location |
|-----------|--------|----------|
| Leaf types defined | ✅ Done | `apps/web/src/types/nodes.ts` |
| Leaf panel (type selector) | ✅ Done | `apps/web/src/components/canvas/LeafPanel.tsx` |
| LeafNode on canvas | ✅ Done | `apps/web/src/components/canvas/CanvasNodes.tsx` |
| Embedded leaves in UnitNode | ✅ Done | `apps/web/src/components/canvas/CanvasNodes.tsx` |
| Leaf icons | ✅ Done | `LEAF_TYPES` array |
| Deploy/Eval status indicators | ✅ Done | `LeafStatusIndicator` component |
| `runs` table (for deploy/eval) | ✅ Done | `packages/storage/src/schema.ts` |

### What's Missing

| Component | Status | Priority |
|-----------|--------|----------|
| Leaf configuration page | ❌ Missing | **High** |
| LLM generation logic | ❌ Missing | **High** |
| Constraint validation | ❌ Missing | **High** |
| Leaf storage table | ❌ Missing | **High** |
| Lineage tracking | ❌ Missing | **Medium** |
| Output preview | ❌ Missing | **Medium** |
| Template system | ❌ Missing | **Low** |
| Leaf history/versions | ❌ Missing | **Low** |

---

## Target Architecture

### Data Model

```typescript
/**
 * Leaf - Generated output from a commit
 *
 * A leaf represents one generation attempt with:
 * - Source commit reference (lineage)
 * - Leaf type configuration
 * - LLM-generated output
 * - Constraint validation results
 */
interface Leaf {
  // Identity
  id: string;                    // "leaf_abc123"

  // Lineage (back to commit)
  commitHash: string;            // Source commit
  projectId: string;

  // Configuration
  type: LeafType;                // 'twitter' | 'article' | etc.
  config: LeafConfig;            // Type-specific config

  // Generation
  prompt?: string;               // Final prompt sent to LLM
  output: string;                // Generated content
  model: string;                 // "claude-3-sonnet" etc.

  // Validation
  constraintResults: ConstraintResult[];
  status: 'draft' | 'validated' | 'published' | 'failed';

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Leaf configuration per type
 */
interface LeafConfig {
  // Common
  instructions?: string;         // User instructions for LLM
  tone?: string;                 // "formal" | "casual" | "professional"
  language?: string;             // "en" | "zh" | etc.

  // Type-specific
  maxLength?: number;            // Character limit (twitter: 280)
  includeHashtags?: boolean;     // For social posts
  callToAction?: string;         // Optional CTA

  // Advanced
  temperature?: number;          // LLM temperature (0-1)
  preserveStructure?: boolean;   // Keep paragraph structure
}

/**
 * Constraint validation result
 */
interface ConstraintResult {
  constraintId: string;
  constraint: Constraint;
  passed: boolean;
  evidence?: {
    found?: string;              // What was found (for REQUIRE)
    location?: number;           // Position in output
    similarity?: number;         // For semantic match
  };
  message?: string;              // Explanation
}
```

### Storage Schema

```sql
-- New table for leaves
CREATE TABLE leaves (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(project_id),
  commit_hash TEXT NOT NULL,     -- Source commit (lineage)

  -- Type and config
  type TEXT NOT NULL,            -- 'twitter', 'article', etc.
  config_json TEXT,              -- LeafConfig as JSON

  -- Generation
  prompt TEXT,                   -- Final prompt sent to LLM
  output TEXT NOT NULL,          -- Generated content
  model TEXT,                    -- LLM model used

  -- Validation
  constraint_results_json TEXT,  -- ConstraintResult[] as JSON
  status TEXT NOT NULL DEFAULT 'draft',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leaves_project ON leaves(project_id);
CREATE INDEX idx_leaves_commit ON leaves(commit_hash);
CREATE INDEX idx_leaves_type ON leaves(type);
CREATE INDEX idx_leaves_status ON leaves(status);
```

### API Endpoints

```
POST   /api/v1/leaves              Create leaf (generates output)
GET    /api/v1/leaves/:id          Get leaf by ID
GET    /api/v1/leaves              List leaves (filter by project, commit, type)
PUT    /api/v1/leaves/:id          Update leaf config, regenerate
DELETE /api/v1/leaves/:id          Delete leaf

POST   /api/v1/leaves/:id/regenerate   Regenerate with same config
POST   /api/v1/leaves/:id/validate     Re-validate constraints
POST   /api/v1/leaves/:id/publish      Mark as published
```

---

## Implementation Phases

### Phase 1: Core Generation (Week 1)

**Goal**: Generate output from commit with basic constraint validation

```
Commit → Build Prompt → LLM → Output → Validate Constraints
```

Tasks:
1. Add `leaves` table to storage schema
2. Create leaf generation service in core
3. Implement constraint validation logic
4. Create basic API routes

### Phase 2: WebUI Integration (Week 2)

**Goal**: Configure and preview leaves in UI

Tasks:
1. Create Leaf configuration page
2. Integrate with canvas (click leaf → config page)
3. Build output preview with constraint badges
4. Add regenerate/edit flow

### Phase 3: Canvas Integration (Week 3)

**Goal**: Full canvas integration with lineage

Tasks:
1. Embedded leaves in UnitNode
2. Leaf panel improvements
3. Lineage visualization
4. Status indicators

### Phase 4: Polish & Advanced (Week 4)

**Goal**: Production-ready leaf system

Tasks:
1. Template system
2. Leaf history/versions
3. Batch generation
4. Export generated content

---

## Detailed Task Checklist

### Phase 1: Core Generation

#### 1.1 Storage Schema
- [ ] Add `leaves` table to `packages/storage/src/schema.ts`
- [ ] Add type exports for `Leaf`, `NewLeaf`
- [ ] Create queries: `createLeaf`, `getLeaf`, `listLeaves`, `updateLeaf`, `deleteLeaf`
- [ ] Add migration if needed

#### 1.2 Core Types
- [ ] Create `packages/core/src/types/leaf.ts`
  - [ ] `Leaf` interface
  - [ ] `LeafConfig` interface
  - [ ] `ConstraintResult` interface
  - [ ] `LeafType` enum (move from web)
- [ ] Export from `packages/core/src/index.ts`

#### 1.3 Constraint Validation
- [ ] Create `packages/core/src/leaf/validate-constraints.ts`
  - [ ] `validateRequireConstraint(output, constraint)` - exact match
  - [ ] `validateRequireConstraintSemantic(output, constraint)` - embedding similarity
  - [ ] `validateExcludeConstraint(output, constraint)` - exact match
  - [ ] `validateExcludeConstraintSemantic(output, constraint)` - embedding similarity
  - [ ] `validateAllConstraints(output, constraints)` - batch validate
- [ ] Add tests for constraint validation

#### 1.4 Prompt Builder
- [ ] Create `packages/core/src/leaf/build-prompt.ts`
  - [ ] `buildLeafPrompt(commit, config)` - construct prompt from sentences
  - [ ] Include constraint instructions in prompt
  - [ ] Handle different leaf types (tweet vs article)
  - [ ] Preserve original strings instruction
- [ ] Add tests for prompt building

#### 1.5 LLM Integration
- [ ] Create `packages/core/src/leaf/generate.ts`
  - [ ] `generateLeafOutput(commit, config)` - main generation function
  - [ ] Support Claude API
  - [ ] Support configurable model/temperature
  - [ ] Return generation metadata (tokens, model)
- [ ] Add LLM provider abstraction if needed

#### 1.6 API Routes
- [ ] Create `apps/api/src/routes/leaves.ts`
  - [ ] `POST /leaves` - create and generate
  - [ ] `GET /leaves/:id` - get single leaf
  - [ ] `GET /leaves` - list with filters
  - [ ] `PUT /leaves/:id` - update config
  - [ ] `DELETE /leaves/:id` - delete
  - [ ] `POST /leaves/:id/regenerate` - regenerate
  - [ ] `POST /leaves/:id/validate` - re-validate
- [ ] Add to API router
- [ ] Add OpenAPI documentation

### Phase 2: WebUI Integration

#### 2.1 Leaf Configuration Page
- [ ] Create `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx`
- [ ] Leaf config form component:
  - [ ] Type selector (read-only after creation)
  - [ ] Instructions textarea
  - [ ] Tone selector
  - [ ] Max length (for social types)
  - [ ] Language selector
  - [ ] Advanced options (temperature, etc.)
- [ ] Output preview panel:
  - [ ] Generated content display
  - [ ] Character count (for social)
  - [ ] Constraint validation badges
- [ ] Action buttons:
  - [ ] Regenerate
  - [ ] Copy to clipboard
  - [ ] Publish/Save
  - [ ] Delete

#### 2.2 Create Leaf Flow
- [ ] Create `apps/web/src/app/project/[projectId]/commit/[commitHash]/leaf/new/page.tsx`
- [ ] Step 1: Select leaf type
- [ ] Step 2: Configure options
- [ ] Step 3: Preview and generate
- [ ] Step 4: Validate and save

#### 2.3 Leaf List View
- [ ] Add leaves tab to commit detail page
- [ ] List leaves with:
  - [ ] Type icon
  - [ ] Preview snippet
  - [ ] Status badge
  - [ ] Constraint pass/fail count
  - [ ] Created date

#### 2.4 Constraint Validation UI
- [ ] Constraint result badges component
  - [ ] Green check for passed
  - [ ] Red X for failed
  - [ ] Tooltip with details
- [ ] Failed constraint details panel
  - [ ] What was expected
  - [ ] What was found (or not found)
  - [ ] Suggestion to fix

### Phase 3: Canvas Integration

#### 3.1 Embedded Leaves in UnitNode
- [ ] Update `EmbeddedLeaf` interface:
  - [ ] Add `constraintsPassed`/`constraintsFailed` counts
  - [ ] Add `outputPreview` (first N chars)
- [ ] Update Leaves section in UnitNode:
  - [ ] Show constraint pass/fail badges
  - [ ] Click to navigate to leaf page
  - [ ] Quick actions (regenerate, copy)

#### 3.2 Add Leaf from Canvas
- [ ] Update `LeafPanel.tsx` to:
  - [ ] Show which commit is selected
  - [ ] Navigate to create leaf page
  - [ ] Or create inline with defaults

#### 3.3 Leaf Node Enhancements
- [ ] Update standalone `LeafNode` component:
  - [ ] Show output preview
  - [ ] Show constraint status
  - [ ] Connect to source commit visually

#### 3.4 Lineage Visualization
- [ ] Add lineage trail component:
  - [ ] Conversation → Commit → Leaf
  - [ ] Clickable breadcrumbs
- [ ] Show lineage in leaf detail page
- [ ] Canvas edge from commit to leaf

### Phase 4: Polish & Advanced

#### 4.1 Template System
- [ ] Create template types:
  - [ ] Tweet template (280 chars, hashtags)
  - [ ] Article template (sections, headings)
  - [ ] Email template (subject, body, signature)
- [ ] Template selection in config
- [ ] Custom template editor (advanced)

#### 4.2 Leaf History
- [ ] Store generation history:
  - [ ] Previous outputs
  - [ ] Config changes
  - [ ] Regeneration count
- [ ] History view in leaf page
- [ ] Restore previous version

#### 4.3 Batch Generation
- [ ] Generate multiple leaf types at once
- [ ] Bulk regenerate with new config
- [ ] Compare outputs across types

#### 4.4 Export
- [ ] Copy formatted output
- [ ] Export as markdown
- [ ] Export with metadata (JSON)
- [ ] Direct publish integration (future)

---

## Technical Specifications

### Prompt Template

```typescript
function buildLeafPrompt(commit: CommitV3, config: LeafConfig): string {
  // 1. Extract sentences
  const sentences = commit.content.sentences
    .map(s => s.text)
    .join('\n\n');

  // 2. Get constraints
  const requires = commit.content.constraints?.filter(c => c.type === 'require') ?? [];
  const excludes = commit.content.constraints?.filter(c => c.type === 'exclude') ?? [];

  // 3. Build type-specific instructions
  const typeInstructions = getTypeInstructions(config.type, config);

  // 4. Construct prompt
  let prompt = `You are generating ${config.type} content from the following semantic meaning:\n\n`;
  prompt += `--- SOURCE CONTENT ---\n${sentences}\n--- END SOURCE ---\n\n`;

  prompt += typeInstructions;

  // 5. Add constraint instructions
  if (requires.length > 0) {
    prompt += `\n\n## REQUIRED (Must include EXACTLY):\n`;
    requires.forEach(r => {
      prompt += `- "${r.value}" (${r.match} match)\n`;
    });
    prompt += `\nIMPORTANT: These exact strings/concepts MUST appear in your output.\n`;
  }

  if (excludes.length > 0) {
    prompt += `\n\n## FORBIDDEN (Must NOT include):\n`;
    excludes.forEach(e => {
      prompt += `- "${e.value}" (${e.match} match)\n`;
    });
    prompt += `\nIMPORTANT: These strings/concepts must NOT appear in your output.\n`;
  }

  // 6. Add user instructions
  if (config.instructions) {
    prompt += `\n\n## Additional Instructions:\n${config.instructions}\n`;
  }

  // 7. Final instruction
  prompt += `\n\nGenerate the ${config.type} content now. Preserve the critical information exactly as specified.`;

  return prompt;
}

function getTypeInstructions(type: LeafType, config: LeafConfig): string {
  switch (type) {
    case 'twitter':
      return `Generate a tweet (max ${config.maxLength || 280} characters).
${config.includeHashtags ? 'Include relevant hashtags.' : 'Do not include hashtags.'}
Keep it concise and engaging.`;

    case 'article':
      return `Generate a well-structured article.
Use clear headings and paragraphs.
${config.tone ? `Tone: ${config.tone}` : ''}
Aim for readability and completeness.`;

    case 'email':
      return `Generate a professional email.
Include appropriate greeting and sign-off.
${config.tone ? `Tone: ${config.tone}` : 'Keep it professional.'}`;

    // ... other types

    default:
      return `Generate ${type} content.`;
  }
}
```

### Constraint Validation

```typescript
async function validateAllConstraints(
  output: string,
  constraints: Constraint[],
  embedder?: Embedder
): Promise<ConstraintResult[]> {
  const results: ConstraintResult[] = [];

  for (const constraint of constraints) {
    let passed: boolean;
    let evidence: ConstraintResult['evidence'];

    if (constraint.type === 'require') {
      if (constraint.match === 'exact') {
        // Exact string match
        const index = output.toLowerCase().indexOf(constraint.value.toLowerCase());
        passed = index !== -1;
        evidence = passed ? { found: constraint.value, location: index } : undefined;
      } else {
        // Semantic match using embeddings
        if (!embedder) throw new Error('Embedder required for semantic match');
        const similarity = await computeSimilarity(output, constraint.value, embedder);
        passed = similarity > SEMANTIC_THRESHOLD;
        evidence = { similarity };
      }
    } else {
      // EXCLUDE constraint
      if (constraint.match === 'exact') {
        const index = output.toLowerCase().indexOf(constraint.value.toLowerCase());
        passed = index === -1; // Passed if NOT found
        evidence = !passed ? { found: constraint.value, location: index } : undefined;
      } else {
        if (!embedder) throw new Error('Embedder required for semantic match');
        const similarity = await computeSimilarity(output, constraint.value, embedder);
        passed = similarity < EXCLUDE_THRESHOLD;
        evidence = { similarity };
      }
    }

    results.push({
      constraintId: constraint.id,
      constraint,
      passed,
      evidence,
      message: passed
        ? undefined
        : constraint.type === 'require'
          ? `Required "${constraint.value}" not found in output`
          : `Forbidden "${constraint.value}" found in output`,
    });
  }

  return results;
}

const SEMANTIC_THRESHOLD = 0.85;
const EXCLUDE_THRESHOLD = 0.7;
```

### API Route Example

```typescript
// apps/api/src/routes/leaves.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const createLeafSchema = z.object({
  commitHash: z.string(),
  type: z.enum(['twitter', 'weibo', 'wechat', 'article', 'email', 'slack']),
  config: z.object({
    instructions: z.string().optional(),
    tone: z.string().optional(),
    language: z.string().optional(),
    maxLength: z.number().optional(),
    includeHashtags: z.boolean().optional(),
    temperature: z.number().min(0).max(1).optional(),
  }).optional(),
});

export const leavesRouter = new Hono()
  .post('/', zValidator('json', createLeafSchema), async (c) => {
    const { commitHash, type, config } = c.req.valid('json');
    const db = c.get('db');

    // 1. Get commit
    const commit = await db.query.commitsV3.findFirst({
      where: eq(commitsV3.hash, commitHash),
    });
    if (!commit) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Commit not found' } }, 404);
    }

    // 2. Build prompt
    const prompt = buildLeafPrompt(commit, { type, ...config });

    // 3. Generate output
    const output = await generateWithLLM(prompt, config?.temperature);

    // 4. Validate constraints
    const constraintResults = await validateAllConstraints(
      output,
      commit.content.constraints ?? [],
      embedder
    );

    // 5. Determine status
    const allPassed = constraintResults.every(r => r.passed);
    const status = allPassed ? 'validated' : 'draft';

    // 6. Save leaf
    const leaf = await db.insert(leaves).values({
      id: generateLeafId(),
      projectId: commit.projectId,
      commitHash,
      type,
      configJson: JSON.stringify(config),
      prompt,
      output,
      model: 'claude-3-sonnet',
      constraintResultsJson: JSON.stringify(constraintResults),
      status,
    }).returning();

    return c.json({
      success: true,
      data: {
        ...leaf[0],
        config,
        constraintResults,
      },
    });
  });
```

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Can create a leaf from a commit via API
- [ ] Output is generated using LLM
- [ ] Constraints are validated (exact match at minimum)
- [ ] Leaf is stored in database with lineage

### Phase 2 Complete When:
- [ ] Can configure leaf in WebUI
- [ ] Can preview generated output
- [ ] Constraint validation results displayed
- [ ] Can regenerate with new config

### Phase 3 Complete When:
- [ ] Leaves appear in UnitNode on canvas
- [ ] Can create leaf from canvas
- [ ] Lineage is visible (commit → leaf)
- [ ] Status indicators work

### Phase 4 Complete When:
- [ ] Template system works for different types
- [ ] Can view/restore previous generations
- [ ] Can batch generate multiple types
- [ ] Export works

### Quality Criteria:
- [ ] All API routes have tests
- [ ] Constraint validation has >90% test coverage
- [ ] UI is responsive (mobile works)
- [ ] Loading states for generation
- [ ] Error handling for LLM failures

---

## File Locations Reference

| Component | File Path |
|-----------|-----------|
| Leaf types (current) | `apps/web/src/types/nodes.ts` |
| LeafPanel | `apps/web/src/components/canvas/LeafPanel.tsx` |
| CanvasNodes (LeafNode) | `apps/web/src/components/canvas/CanvasNodes.tsx` |
| Storage schema | `packages/storage/src/schema.ts` |
| Canvas store | `apps/web/src/store/canvasStore.ts` |
| API routes | `apps/api/src/routes/` |
| Core types | `packages/core/src/types/` |
| Commit design | `docs/commit-design-proposal.md` |

---

## Dependencies

### Required:
- Commit V3 working (sentences + constraints)
- LLM provider configured (Anthropic API key)
- Embedder for semantic matching (optional, can start with exact)

### Nice to have:
- Embedding storage for caching
- Queue system for async generation (for batch)

---

*Plan created January 2025. Focus: LLM wrapper with constraint preservation.*
