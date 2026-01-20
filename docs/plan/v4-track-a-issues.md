# V4 Track A Issues (Storage/Core)

> **Owner**: You
> **Depends on**: Phase 0 contracts (completed)
> **Related**: `docs/specification/semantic-layer-architecture.md`

---

## Issue A1: Storage Queries - commits_v4 CRUD

**Priority**: P0 (do first)
**Estimated scope**: ~150 lines
**File**: `packages/storage/src/queries/commits-v4.ts` (new)

### Description

Implement CRUD operations for the `commits_v4` table. This is similar to existing `commits-v3.ts` but adapted for V4 schema (no constraints in content).

### Tasks

- [ ] Create `packages/storage/src/queries/commits-v4.ts`
- [ ] Implement `createCommitV4(db, input: CreateCommitV4Input): Promise<CommitV4>`
- [ ] Implement `findCommitV4ByHash(db, hash: string): Promise<CommitV4 | null>`
- [ ] Implement `findCommitsV4ByProject(db, projectId: string): Promise<CommitV4[]>`
- [ ] Implement `findCommitsV4ByBranch(db, projectId: string, branch: string): Promise<CommitV4[]>`
- [ ] Implement `updateCommitV4Position(db, hash: string, x: number, y: number): Promise<void>`
- [ ] Implement `deleteCommitV4(db, hash: string): Promise<void>`
- [ ] Export from `packages/storage/src/queries/index.ts`
- [ ] Write unit tests in `packages/storage/src/__tests__/commits-v4.test.ts`

### Implementation Notes

```typescript
// packages/storage/src/queries/commits-v4.ts

import { eq, and, desc } from 'drizzle-orm';
import { commitsV4 } from '../schema-v4';
import type { CommitV4, CreateCommitV4Input } from '@t3x/core';
import { computeCommitV4Hash } from '@t3x/core'; // Need to implement this too

export async function createCommitV4(
  db: Database,
  input: CreateCommitV4Input
): Promise<CommitV4> {
  const now = new Date().toISOString();

  // Compute hash from first-class fields only (no constraints!)
  const hash = computeCommitV4Hash({
    schema: 't3x/commit/v4',
    parents: input.parents,
    author: input.author,
    committed_at: now,
    content: { sentences: input.sentences },
  });

  const record = {
    hash,
    schema: 't3x/commit/v4',
    parents: input.parents,
    author: input.author,
    committedAt: new Date(now),
    content: { sentences: input.sentences },
    projectId: input.project_id,
    message: input.message,
    branch: input.branch,
    sourceRefs: input.source_refs,
    positionX: input.position_x,
    positionY: input.position_y,
  };

  await db.insert(commitsV4).values(record);

  return mapRecordToCommitV4(record);
}

export async function findCommitV4ByHash(
  db: Database,
  hash: string
): Promise<CommitV4 | null> {
  const records = await db
    .select()
    .from(commitsV4)
    .where(eq(commitsV4.hash, hash))
    .limit(1);

  return records[0] ? mapRecordToCommitV4(records[0]) : null;
}

// ... other functions

function mapRecordToCommitV4(record: CommitV4Record): CommitV4 {
  return {
    hash: record.hash,
    schema: 't3x/commit/v4',
    parents: record.parents,
    author: record.author,
    committed_at: record.committedAt.toISOString(),
    content: record.content,
    project_id: record.projectId ?? undefined,
    message: record.message ?? undefined,
    branch: record.branch ?? undefined,
    source_refs: record.sourceRefs ?? undefined,
    position_x: record.positionX ?? undefined,
    position_y: record.positionY ?? undefined,
  };
}
```

### Acceptance Criteria

- [ ] All CRUD functions work correctly
- [ ] Hash is computed correctly (only first-class fields)
- [ ] Unit tests pass
- [ ] Exported from `@t3x/storage`

### Dependencies

- None (can start immediately)

### Blocks

- A4 (context builder needs to read commits)

---

## Issue A2: Storage Queries - leaves CRUD

**Priority**: P0 (do first)
**Estimated scope**: ~200 lines
**File**: `packages/storage/src/queries/leaves.ts` (new)

### Description

Implement CRUD operations for the `leaves` table. Leaves own constraints and validation results.

### Tasks

- [ ] Create `packages/storage/src/queries/leaves.ts`
- [ ] Implement `createLeaf(db, input: CreateLeafInput): Promise<Leaf>`
- [ ] Implement `findLeafById(db, id: string): Promise<Leaf | null>`
- [ ] Implement `findLeavesByCommit(db, commitHash: string): Promise<Leaf[]>`
- [ ] Implement `findLeavesByProject(db, projectId: string): Promise<Leaf[]>`
- [ ] Implement `updateLeaf(db, id: string, updates: Partial<Leaf>): Promise<Leaf>`
- [ ] Implement `updateLeafOutput(db, id: string, output: string): Promise<Leaf>`
- [ ] Implement `updateLeafAssertions(db, id: string, assertions: Assertion[]): Promise<Leaf>`
- [ ] Implement `deleteLeaf(db, id: string): Promise<void>`
- [ ] Export from `packages/storage/src/queries/index.ts`
- [ ] Write unit tests

### Implementation Notes

```typescript
// packages/storage/src/queries/leaves.ts

import { eq, and } from 'drizzle-orm';
import { leaves } from '../schema-v4';
import type { Leaf, CreateLeafInput, Assertion } from '@t3x/core';
import { nanoid } from 'nanoid';

export async function createLeaf(
  db: Database,
  input: CreateLeafInput
): Promise<Leaf> {
  const id = `leaf_${nanoid(12)}`;
  const now = new Date().toISOString();

  // Generate IDs for constraints if not provided
  const constraints = (input.constraints ?? []).map(c => ({
    ...c,
    id: c.id ?? `cst_${nanoid(12)}`,
  }));

  const record = {
    id,
    commitHash: input.commit_hash,
    type: input.type,
    title: input.title,
    constraints,
    config: input.config ?? {},
    projectId: input.project_id,
    createdAt: new Date(now),
    createdBy: input.created_by,
  };

  await db.insert(leaves).values(record);

  return mapRecordToLeaf(record);
}

export async function findLeavesByCommit(
  db: Database,
  commitHash: string
): Promise<Leaf[]> {
  const records = await db
    .select()
    .from(leaves)
    .where(eq(leaves.commitHash, commitHash));

  return records.map(mapRecordToLeaf);
}

export async function updateLeafAssertions(
  db: Database,
  id: string,
  assertions: Assertion[]
): Promise<Leaf> {
  // Generate IDs for assertions if not provided
  const assertionsWithIds = assertions.map(a => ({
    ...a,
    id: a.id ?? `ast_${nanoid(12)}`,
  }));

  await db
    .update(leaves)
    .set({ assertions: assertionsWithIds })
    .where(eq(leaves.id, id));

  const updated = await findLeafById(db, id);
  if (!updated) throw new Error(`Leaf not found: ${id}`);
  return updated;
}

function mapRecordToLeaf(record: LeafRecord): Leaf {
  return {
    id: record.id,
    commit_hash: record.commitHash,
    type: record.type as LeafType,
    title: record.title ?? undefined,
    constraints: record.constraints,
    config: record.config,
    output: record.output ?? undefined,
    generated_at: record.generatedAt?.toISOString(),
    assertions: record.assertions ?? undefined,
    project_id: record.projectId,
    created_at: record.createdAt.toISOString(),
    created_by: record.createdBy ?? undefined,
  };
}
```

### Acceptance Criteria

- [ ] All CRUD functions work correctly
- [ ] IDs are generated with correct prefixes (`leaf_`, `cst_`, `ast_`)
- [ ] Constraints are properly stored and retrieved
- [ ] Unit tests pass

### Dependencies

- None (can start immediately)

### Blocks

- Track B API routes need these queries

---

## Issue A3: Storage Queries - pins CRUD

**Priority**: P0 (do first)
**Estimated scope**: ~150 lines
**File**: `packages/storage/src/queries/pins.ts` (new)

### Description

Implement CRUD operations for the `pins` table. Pins are used for source selection (commit sources + conversation context).

### Tasks

- [ ] Create `packages/storage/src/queries/pins.ts`
- [ ] Implement `createPin(db, input: CreatePinInput): Promise<Pin>`
- [ ] Implement `findPinById(db, id: string): Promise<Pin | null>`
- [ ] Implement `findPinsByProject(db, projectId: string): Promise<Pin[]>`
- [ ] Implement `findPinByRef(db, projectId: string, type: PinType, refId: string): Promise<Pin | null>`
- [ ] Implement `updatePinAssertions(db, id: string, assertionIds: string[]): Promise<Pin>`
- [ ] Implement `deletePin(db, id: string): Promise<void>`
- [ ] Implement `deletePinByRef(db, projectId: string, type: PinType, refId: string): Promise<void>`
- [ ] Export from `packages/storage/src/queries/index.ts`
- [ ] Write unit tests

### Implementation Notes

```typescript
// packages/storage/src/queries/pins.ts

import { eq, and } from 'drizzle-orm';
import { pins } from '../schema-v4';
import type { Pin, CreatePinInput, PinType } from '@t3x/core';
import { nanoid } from 'nanoid';

export async function createPin(
  db: Database,
  input: CreatePinInput
): Promise<Pin> {
  const id = `pin_${nanoid(12)}`;
  const now = new Date().toISOString();

  const record = {
    id,
    projectId: input.project_id,
    type: input.type,
    refId: input.ref_id,
    selectedAssertionIds: input.selected_assertion_ids,
    pinnedAt: new Date(now),
    pinnedBy: input.pinned_by,
  };

  await db.insert(pins).values(record);

  return mapRecordToPin(record);
}

export async function findPinByRef(
  db: Database,
  projectId: string,
  type: PinType,
  refId: string
): Promise<Pin | null> {
  const records = await db
    .select()
    .from(pins)
    .where(
      and(
        eq(pins.projectId, projectId),
        eq(pins.type, type),
        eq(pins.refId, refId)
      )
    )
    .limit(1);

  return records[0] ? mapRecordToPin(records[0]) : null;
}

export async function deletePinByRef(
  db: Database,
  projectId: string,
  type: PinType,
  refId: string
): Promise<void> {
  await db
    .delete(pins)
    .where(
      and(
        eq(pins.projectId, projectId),
        eq(pins.type, type),
        eq(pins.refId, refId)
      )
    );
}

function mapRecordToPin(record: PinRecord): Pin {
  return {
    id: record.id,
    project_id: record.projectId,
    type: record.type as PinType,
    ref_id: record.refId,
    selected_assertion_ids: record.selectedAssertionIds ?? undefined,
    pinned_at: record.pinnedAt.toISOString(),
    pinned_by: record.pinnedBy ?? undefined,
  };
}
```

### Acceptance Criteria

- [ ] All CRUD functions work correctly
- [ ] Unique constraint works (can't pin same item twice)
- [ ] `findPinByRef` and `deletePinByRef` work correctly
- [ ] Unit tests pass

### Dependencies

- None (can start immediately)

### Blocks

- Track B API routes need these queries
- A4 context builder needs to read pins

---

## Issue A4: Storage Queries - conversation_contexts CRUD

**Priority**: P1
**Estimated scope**: ~80 lines
**File**: `packages/storage/src/queries/conversation-contexts.ts` (new)

### Description

Implement CRUD operations for the `conversation_contexts` table. This stores per-conversation context configuration.

### Tasks

- [ ] Create `packages/storage/src/queries/conversation-contexts.ts`
- [ ] Implement `getConversationContext(db, conversationId: string): Promise<ConversationContext | null>`
- [ ] Implement `setConversationContext(db, conversationId: string, pinIds: string[] | null): Promise<ConversationContext>`
- [ ] Implement `deleteConversationContext(db, conversationId: string): Promise<void>`
- [ ] Export from `packages/storage/src/queries/index.ts`
- [ ] Write unit tests

### Implementation Notes

```typescript
// packages/storage/src/queries/conversation-contexts.ts

import { eq } from 'drizzle-orm';
import { conversationContexts } from '../schema-v4';
import type { ConversationContext } from '@t3x/core';

export async function getConversationContext(
  db: Database,
  conversationId: string
): Promise<ConversationContext | null> {
  const records = await db
    .select()
    .from(conversationContexts)
    .where(eq(conversationContexts.conversationId, conversationId))
    .limit(1);

  if (!records[0]) return null;

  return {
    conversation_id: records[0].conversationId,
    selected_pin_ids: records[0].selectedPinIds,
    updated_at: records[0].updatedAt.toISOString(),
  };
}

export async function setConversationContext(
  db: Database,
  conversationId: string,
  pinIds: string[] | null
): Promise<ConversationContext> {
  const now = new Date();

  // Upsert
  await db
    .insert(conversationContexts)
    .values({
      conversationId,
      selectedPinIds: pinIds,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: conversationContexts.conversationId,
      set: {
        selectedPinIds: pinIds,
        updatedAt: now,
      },
    });

  return {
    conversation_id: conversationId,
    selected_pin_ids: pinIds,
    updated_at: now.toISOString(),
  };
}
```

### Acceptance Criteria

- [ ] Get/set/delete work correctly
- [ ] Upsert logic works (insert if not exists, update if exists)
- [ ] `null` means "use all pins" (default behavior)
- [ ] Unit tests pass

### Dependencies

- None

### Blocks

- A5 context builder

---

## Issue A5: Core - computeCommitV4Hash

**Priority**: P1
**Estimated scope**: ~50 lines
**File**: `packages/core/src/storage/hash-v4.ts` (new)

### Description

Implement hash computation for CommitV4. Only first-class fields participate in hash (no constraints!).

### Tasks

- [ ] Create `packages/core/src/storage/hash-v4.ts`
- [ ] Implement `computeCommitV4Hash(commit: CommitV4FirstClass): string`
- [ ] Export from `packages/core/src/storage/index.ts`
- [ ] Export from `packages/core/src/index.ts`
- [ ] Write unit tests

### Implementation Notes

```typescript
// packages/core/src/storage/hash-v4.ts

import { canonicalize } from 'json-canonicalize';
import { sha256 } from '../common/hash';
import type { CommitV4, CommitAuthor, Sentence } from '../types/v4';

interface CommitV4FirstClass {
  schema: 't3x/commit/v4';
  parents: string[];
  author: CommitAuthor;
  committed_at: string;
  content: {
    sentences: Sentence[];
  };
}

/**
 * Compute hash for CommitV4.
 *
 * Only first-class fields participate in hash:
 * - schema, parents, author, committed_at, content.sentences
 *
 * NOT included (second-class):
 * - project_id, message, branch, source_refs, position_x, position_y
 *
 * Key difference from V3: NO constraints in content!
 */
export function computeCommitV4Hash(commit: CommitV4FirstClass): string {
  const canonical = canonicalize({
    schema: commit.schema,
    parents: commit.parents,
    author: commit.author,
    committed_at: commit.committed_at,
    content: {
      sentences: commit.content.sentences,
    },
  });

  return `sha256:${sha256(canonical)}`;
}
```

### Acceptance Criteria

- [ ] Hash only includes first-class fields
- [ ] Same input always produces same hash (deterministic)
- [ ] Different sentences produce different hashes
- [ ] Unit tests pass

### Dependencies

- None

### Blocks

- A1 (commits_v4 queries need hash computation)

---

## Issue A6: Core - Context Builder

**Priority**: P2 (do after A1-A5)
**Estimated scope**: ~200 lines
**File**: `packages/core/src/context/builder.ts` (new)

### Description

Implement the context builder that constructs LLM memory from commits + pins. This is the core of the new memory system.

### Tasks

- [ ] Create `packages/core/src/context/` directory
- [ ] Create `packages/core/src/context/builder.ts`
- [ ] Implement `buildConversationContext()`
- [ ] Implement `buildLeafContext()`
- [ ] Implement `buildMemoryFromPins()`
- [ ] Implement `estimateTokens()` (simple word-based estimation)
- [ ] Export from `packages/core/src/context/index.ts`
- [ ] Export from `packages/core/src/index.ts`
- [ ] Write unit tests

### Implementation Notes

```typescript
// packages/core/src/context/builder.ts

import type {
  CommitV4,
  Pin,
  Leaf,
  BuiltContext,
  ContextSource,
  ConversationContext,
} from '../types/v4';

interface ContextBuildInput {
  /** Current commit (HEAD) - provides base knowledge */
  currentCommit?: CommitV4;

  /** All project pins */
  projectPins: Pin[];

  /** Conversation's context config (null = use all pins) */
  contextConfig?: ConversationContext | null;

  /** Loaded conversations (for pinned conversation content) */
  conversations: Map<string, ConversationData>;

  /** Loaded leaves (for pinned leaf content) */
  leaves: Map<string, Leaf>;
}

interface ConversationData {
  id: string;
  title: string;
  turns: Array<{ role: string; content: string }>;
}

/**
 * Build context for conversation LLM.
 *
 * Context = Base (commit sentences) + Pinned items
 */
export function buildConversationContext(input: ContextBuildInput): BuiltContext {
  const sources: ContextSource[] = [];
  let text = '';

  // ═══════════════════════════════════════════════════════════════════════
  // BASE: Current commit sentences (always included, like git HEAD)
  // ═══════════════════════════════════════════════════════════════════════
  if (input.currentCommit) {
    text += '## Current Knowledge\n\n';
    for (const sentence of input.currentCommit.content.sentences) {
      text += `• ${sentence.text}\n`;
    }
    text += '\n';

    sources.push({
      type: 'commit',
      id: input.currentCommit.hash,
      title: input.currentCommit.message,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PLUS: Pinned items (filtered by context config)
  // ═══════════════════════════════════════════════════════════════════════
  const activePins = filterActivePins(input.projectPins, input.contextConfig);

  // Pinned conversations
  const convPins = activePins.filter(p => p.type === 'conversation');
  if (convPins.length > 0) {
    text += '## Recent Discussions\n\n';
    for (const pin of convPins) {
      const conv = input.conversations.get(pin.ref_id);
      if (!conv) continue;

      text += `### ${conv.title}\n\n`;
      for (const turn of conv.turns) {
        text += `**${turn.role}**: ${turn.content}\n\n`;
      }

      sources.push({
        type: 'conversation',
        id: conv.id,
        title: conv.title,
      });
    }
  }

  // Pinned leaves (output + lessons)
  const leafPins = activePins.filter(p => p.type === 'leaf');
  if (leafPins.length > 0) {
    text += '## Previous Outputs & Lessons\n\n';
    for (const pin of leafPins) {
      const leaf = input.leaves.get(pin.ref_id);
      if (!leaf) continue;

      text += `### ${leaf.type}: ${leaf.title ?? 'Untitled'}\n\n`;
      if (leaf.output) {
        text += `Output: ${leaf.output.substring(0, 200)}...\n\n`;
      }

      // Include selected assertion lessons
      const selectedIds = pin.selected_assertion_ids;
      const assertions = leaf.assertions ?? [];
      for (const assertion of assertions) {
        if (selectedIds && !selectedIds.includes(assertion.id)) continue;
        if (assertion.lesson) {
          text += `• Lesson: ${assertion.lesson}\n`;
        }
      }
      text += '\n';

      sources.push({
        type: 'leaf',
        id: leaf.id,
        title: leaf.title,
      });
    }
  }

  return {
    text,
    token_estimate: estimateTokens(text),
    sources,
  };
}

/**
 * Build context for leaf generation.
 *
 * Returns commit sentences (knowledge) - constraints are in leaf itself.
 */
export function buildLeafContext(commit: CommitV4): BuiltContext {
  let text = '## Knowledge\n\n';

  for (const sentence of commit.content.sentences) {
    text += `• ${sentence.text}\n`;
  }

  return {
    text,
    token_estimate: estimateTokens(text),
    sources: [{
      type: 'commit',
      id: commit.hash,
      title: commit.message,
    }],
  };
}

function filterActivePins(
  pins: Pin[],
  config?: ConversationContext | null
): Pin[] {
  // null config = use all pins
  if (!config || config.selected_pin_ids === null) {
    return pins;
  }

  // Empty array = no pins
  if (config.selected_pin_ids.length === 0) {
    return [];
  }

  // Filter to selected pins
  const selectedSet = new Set(config.selected_pin_ids);
  return pins.filter(p => selectedSet.has(p.id));
}

function estimateTokens(text: string): number {
  // Simple estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}
```

### Acceptance Criteria

- [ ] `buildConversationContext` correctly assembles context from commit + pins
- [ ] Context config filtering works (null = all, [] = none, [...ids] = specific)
- [ ] Leaf assertion lessons are included based on `selected_assertion_ids`
- [ ] Token estimation provides reasonable approximation
- [ ] Unit tests pass

### Dependencies

- A1, A2, A3, A4 (needs to be able to read data)

### Blocks

- Track B conversation memory API

---

## Issue A7: Export queries from @t3x/storage

**Priority**: P1 (do after A1-A4)
**Estimated scope**: ~20 lines
**File**: `packages/storage/src/queries/index.ts`

### Description

Export all new V4 queries from the queries index.

### Tasks

- [ ] Add exports for commits-v4 queries
- [ ] Add exports for leaves queries
- [ ] Add exports for pins queries
- [ ] Add exports for conversation-contexts queries
- [ ] Verify exports work with `pnpm build:storage`

### Implementation Notes

```typescript
// packages/storage/src/queries/index.ts

// ... existing exports ...

// V4 queries
export * from './commits-v4';
export * from './leaves';
export * from './pins';
export * from './conversation-contexts';
```

### Acceptance Criteria

- [ ] All V4 queries exported from `@t3x/storage`
- [ ] `pnpm build:storage` passes
- [ ] Can import: `import { createLeaf, createPin } from '@t3x/storage'`

---

## Summary: Suggested Order

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   Recommended order (can parallelize A1-A4):                            │
│                                                                         │
│   A5 (hash) ──┐                                                         │
│               ├──► A1 (commits_v4 queries)                              │
│               │                                                         │
│   A2 (leaves queries) ──────────────┐                                   │
│                                     │                                   │
│   A3 (pins queries) ────────────────┼──► A7 (export) ──► A6 (context)  │
│                                     │                                   │
│   A4 (conversation_contexts) ───────┘                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Parallel work**:
- A2, A3, A4 can be done in parallel
- A5 should be done early (A1 depends on it)
- A6 (context builder) should be last (needs all queries)

---

## GitHub Issue Creation Commands

```bash
# A1
gh issue create --title "feat(storage): implement commits_v4 CRUD queries" --label "track-a,v4" --body "See docs/plans/v4-track-a-issues.md#issue-a1-storage-queries---commits_v4-crud"

# A2
gh issue create --title "feat(storage): implement leaves CRUD queries" --label "track-a,v4" --body "See docs/plans/v4-track-a-issues.md#issue-a2-storage-queries---leaves-crud"

# A3
gh issue create --title "feat(storage): implement pins CRUD queries" --label "track-a,v4" --body "See docs/plans/v4-track-a-issues.md#issue-a3-storage-queries---pins-crud"

# A4
gh issue create --title "feat(storage): implement conversation_contexts CRUD queries" --label "track-a,v4" --body "See docs/plans/v4-track-a-issues.md#issue-a4-storage-queries---conversation_contexts-crud"

# A5
gh issue create --title "feat(core): implement computeCommitV4Hash" --label "track-a,v4" --body "See docs/plans/v4-track-a-issues.md#issue-a5-core---computecommitv4hash"

# A6
gh issue create --title "feat(core): implement context builder" --label "track-a,v4" --body "See docs/plans/v4-track-a-issues.md#issue-a6-core---context-builder"

# A7
gh issue create --title "feat(storage): export V4 queries" --label "track-a,v4" --body "See docs/plans/v4-track-a-issues.md#issue-a7-export-queries-from-t3xstorage"
```
