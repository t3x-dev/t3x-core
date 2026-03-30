# Simplify LLM Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maximize extraction recall by simplifying the LLM's job (just extract everything) and converting 4 LLM pipeline agents to code-only, reducing LLM calls from 7 to 3 per extraction.

**Architecture:** Three changes: (1) relax the extraction prompt's verbatim quote requirement and increase token limit, (2) replace 3 LLM agents with CODE equivalents and remove 1, (3) add a new fuzzy quote validator CODE agent. The MeaningPipeline's agent interface and rollback safety remain unchanged.

**Tech Stack:** TypeScript, Vitest, @t3x-dev/core

---

## File Structure

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/extractors/yopsPrompt.ts` | Relax quote requirement, strengthen "extract everything" instruction |
| `packages/core/src/extractors/extractor.ts` | MAX_TOKENS 4096 → 8192 |
| `packages/core/src/extractors/agents/dedupCheckerAgent.ts` | Rewrite: LLM → CODE (exact key + Jaccard similarity) |
| `packages/core/src/extractors/agents/contradictionCheckerAgent.ts` | Rewrite: LLM → CODE (keyword flag, never delete) |
| `packages/core/src/extractors/agents/index.ts` | Add fuzzyQuoteValidator export, remove 3 agent exports |
| `packages/core/src/extractors/createMeaningPipeline.ts` | Remove 3 agents, add fuzzyQuoteValidator, reorder |

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/extractors/agents/fuzzyQuoteValidator.ts` | CODE agent: validate source quotes via fuzzy matching, adjust confidence |
| `packages/core/src/extractors/agents/__tests__/codeDedupChecker.test.ts` | Tests for code-based dedup |
| `packages/core/src/extractors/agents/__tests__/codeContradictionChecker.test.ts` | Tests for code-based contradiction flagging |
| `packages/core/src/extractors/agents/__tests__/fuzzyQuoteValidator.test.ts` | Tests for fuzzy quote matching |

### Files No Longer Imported (keep files, remove from pipeline)

| File | Reason |
|------|--------|
| `packages/core/src/extractors/agents/slotPolisherAgent.ts` | Removed from pipeline (unnecessary LLM beautification) |
| `packages/core/src/extractors/agents/reviewerAgent.ts` | Removed from pipeline (biggest data remover) |
| `packages/core/src/extractors/agents/topicEvolverAgent.ts` | Removed from pipeline (code uses root key directly) |

---

## Task 1: Prompt — Relax Quote Requirement + Strengthen Recall

**Files:**
- Modify: `packages/core/src/extractors/yopsPrompt.ts`

- [ ] **Step 1: Read the current prompt**

Read `packages/core/src/extractors/yopsPrompt.ts` fully.

- [ ] **Step 2: Update the system prompt**

In `buildSystemPrompt()` (line 54), replace the source requirement text:

Find:
```
- **source**: VERBATIM quote from the conversation (copy-paste, not paraphrase)
```

Replace with:
```
- **source**: key phrase from the conversation that contains this fact (a few words are enough — does NOT need to be a complete sentence)
```

- [ ] **Step 3: Add "extract everything" instruction to the rules section**

Find the Rules section (line 120):
```
### Rules
- Output ONLY valid YAML starting with "yops:"
```

Insert before it:
```
### Extraction Priority
- Extract MORE rather than less — code will clean up duplicates
- Do NOT skip a fact because you can't find a perfect quote — use the closest matching phrase
- Every list item, number, recommendation, and detail is worth capturing
- A short keyword source is better than skipping the data entirely

```

- [ ] **Step 4: Update the first extraction user prompt**

Find (line 180):
```
Extract ALL knowledge into a tree using add operations. Capture every detail the assistant provides.
```

Replace with:
```
Extract ALL knowledge into a tree using add operations.
Capture EVERY fact, number, list item, recommendation, and detail — both from user and assistant.
Do NOT skip information because you're unsure about quoting. A short keyword source is enough.
```

- [ ] **Step 5: Verify build**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/extractors/yopsPrompt.ts
git commit -m "feat(core): relax verbatim quote requirement, strengthen extraction recall"
```

---

## Task 2: Extractor — Increase MAX_TOKENS

**Files:**
- Modify: `packages/core/src/extractors/extractor.ts:26`

- [ ] **Step 1: Update MAX_TOKENS**

In `packages/core/src/extractors/extractor.ts`, line 26:

Find:
```typescript
const MAX_TOKENS = 4096;
```

Replace with:
```typescript
const MAX_TOKENS = 8192;
```

- [ ] **Step 2: Verify build**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/extractors/extractor.ts
git commit -m "feat(core): increase extraction MAX_TOKENS from 4096 to 8192"
```

---

## Task 3: Code-Based Dedup Checker (Replace LLM)

**Files:**
- Modify: `packages/core/src/extractors/agents/dedupCheckerAgent.ts`
- Create: `packages/core/src/extractors/agents/__tests__/codeDedupChecker.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/src/extractors/agents/__tests__/codeDedupChecker.test.ts
import { describe, expect, test } from 'vitest';
import type { TreeNode } from '../../../semantic/types';
import { dedupCheckerAgent } from '../dedupCheckerAgent';
import type { PipelineContext } from '../../meaningPipeline';

function makeCtx(trees: TreeNode[]): PipelineContext {
  return {
    content: { trees, relations: [] },
    turns: [],
    meta: {
      mode: 'full',
      completedAgents: [],
      agentErrors: [],
      stepSnapshots: [],
      totalUsage: { inputTokens: 0, outputTokens: 0 },
    },
    quality: { score: 50, frameCount: trees.length, maxDepth: 1, duplicateTypes: 0 },
  } as PipelineContext;
}

function tree(key: string, slots: Record<string, string>): TreeNode {
  return { key, slots, children: [] };
}

describe('code dedup checker', () => {
  test('does not run with fewer than 4 trees', () => {
    const ctx = makeCtx([tree('a', { x: '1' }), tree('b', { y: '2' })]);
    expect(dedupCheckerAgent.shouldRun(ctx)).toBe(false);
  });

  test('merges trees with identical keys', async () => {
    const ctx = makeCtx([
      tree('budget', { flights: '1000', rail: '420' }),
      tree('budget', { food: '30', activities: '200' }),
      tree('route', { cities: 'Tokyo' }),
      tree('dates', { start: 'Apr 20' }),
    ]);
    // Null provider since it's CODE-only now
    const result = await dedupCheckerAgent.run(ctx, null as any);
    const keys = result.content.trees.map((t) => t.key);
    // Two 'budget' trees should merge into one
    expect(keys.filter((k) => k === 'budget')).toHaveLength(1);
    // Merged tree should have all 4 slots
    const merged = result.content.trees.find((t) => t.key === 'budget')!;
    expect(Object.keys(merged.slots)).toContain('flights');
    expect(Object.keys(merged.slots)).toContain('food');
  });

  test('keeps trees with different keys', async () => {
    const ctx = makeCtx([
      tree('budget', { flights: '1000' }),
      tree('route', { cities: 'Tokyo' }),
      tree('food', { dish: 'ramen' }),
      tree('dates', { start: 'Apr 20' }),
    ]);
    const result = await dedupCheckerAgent.run(ctx, null as any);
    expect(result.content.trees).toHaveLength(4);
  });

  test('merges trees with >80% slot key overlap', async () => {
    const ctx = makeCtx([
      tree('trip_plan', { dest: 'Tokyo', budget: '3000', duration: '2w', style: 'backpack' }),
      tree('travel_plan', { dest: 'Tokyo', budget: '3000', duration: '2w', transport: 'rail' }),
      tree('food', { dish: 'ramen' }),
      tree('dates', { start: 'Apr 20' }),
    ]);
    const result = await dedupCheckerAgent.run(ctx, null as any);
    // trip_plan and travel_plan share 3/4 keys (75%) — below 80%, kept separate
    // Actually dest+budget+duration = 3 overlap out of 4+4-3=5 unique = 60% Jaccard
    expect(result.content.trees.length).toBe(4);
  });

  test('is CODE-only (usesLLM=false)', () => {
    expect(dedupCheckerAgent.usesLLM).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && pnpm vitest run src/extractors/agents/__tests__/codeDedupChecker.test.ts`
Expected: FAIL — `usesLLM` is `true`, merge logic is LLM-based

- [ ] **Step 3: Rewrite dedupCheckerAgent as CODE-only**

Replace the entire content of `packages/core/src/extractors/agents/dedupCheckerAgent.ts`:

```typescript
/**
 * Dedup Checker Agent — CODE
 *
 * ONE job: find and merge trees with identical keys or high slot overlap.
 * Pure code — no LLM needed. Uses exact key matching + Jaccard similarity.
 *
 * Only runs when there are 4+ trees (likely some overlap).
 */

import type { TreeNode } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

/** Jaccard similarity: |A ∩ B| / |A ∪ B| */
function jaccardKeys(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const aKeys = new Set(Object.keys(a));
  const bKeys = new Set(Object.keys(b));
  let intersection = 0;
  for (const k of bKeys) {
    if (aKeys.has(k)) intersection++;
  }
  const union = aKeys.size + bKeys.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Merge two trees: combine slots (b overwrites a on conflict), combine children */
function mergeTrees(a: TreeNode, b: TreeNode): TreeNode {
  return {
    key: a.key,
    slots: { ...a.slots, ...b.slots },
    children: [...a.children, ...b.children],
    slot_quotes: { ...a.slot_quotes, ...b.slot_quotes },
    source: a.source ?? b.source,
    confidence: Math.max(a.confidence ?? 0.5, b.confidence ?? 0.5),
  };
}

const JACCARD_MERGE_THRESHOLD = 0.8;

export const dedupCheckerAgent: MeaningAgent = {
  name: 'dedup_checker',
  description: 'Find and merge duplicate trees (code-based: exact key + Jaccard similarity)',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    return ctx.content.trees.length >= 4;
  },

  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const trees = [...ctx.content.trees];
    const merged = new Set<number>();

    for (let i = 0; i < trees.length; i++) {
      if (merged.has(i)) continue;
      for (let j = i + 1; j < trees.length; j++) {
        if (merged.has(j)) continue;

        const shouldMerge =
          trees[i].key === trees[j].key ||
          jaccardKeys(trees[i].slots, trees[j].slots) >= JACCARD_MERGE_THRESHOLD;

        if (shouldMerge) {
          trees[i] = mergeTrees(trees[i], trees[j]);
          merged.add(j);
        }
      }
    }

    if (merged.size > 0) {
      ctx.content = {
        trees: trees.filter((_, idx) => !merged.has(idx)),
        relations: ctx.content.relations,
      };
    }

    return ctx;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && pnpm vitest run src/extractors/agents/__tests__/codeDedupChecker.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Verify build**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/extractors/agents/dedupCheckerAgent.ts packages/core/src/extractors/agents/__tests__/codeDedupChecker.test.ts
git commit -m "refactor(core): replace LLM dedup checker with code-based Jaccard similarity"
```

---

## Task 4: Code-Based Contradiction Checker (Flag, Never Delete)

**Files:**
- Modify: `packages/core/src/extractors/agents/contradictionCheckerAgent.ts`
- Create: `packages/core/src/extractors/agents/__tests__/codeContradictionChecker.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/src/extractors/agents/__tests__/codeContradictionChecker.test.ts
import { describe, expect, test } from 'vitest';
import type { TreeNode } from '../../../semantic/types';
import { contradictionCheckerAgent } from '../contradictionCheckerAgent';
import type { PipelineContext } from '../../meaningPipeline';

function makeCtx(trees: TreeNode[], userMessages: string[]): PipelineContext {
  return {
    content: { trees, relations: [] },
    turns: userMessages.map((content) => ({ role: 'user' as const, content })),
    meta: {
      mode: 'full',
      completedAgents: [],
      agentErrors: [],
      stepSnapshots: [],
      totalUsage: { inputTokens: 0, outputTokens: 0 },
    },
    quality: { score: 50, frameCount: trees.length, maxDepth: 1, duplicateTypes: 0 },
  } as PipelineContext;
}

function tree(key: string, slots: Record<string, string>): TreeNode {
  return { key, slots, children: [] };
}

describe('code contradiction checker', () => {
  test('flags slots matching "avoid X" pattern', async () => {
    const ctx = makeCtx(
      [tree('route', { cities: 'Tokyo, Osaka', activities: 'temple visit' })],
      ['I want to avoid Osaka']
    );
    const result = await contradictionCheckerAgent.run(ctx, null as any);
    // cities slot contains "Osaka" which user wants to avoid
    const route = result.content.trees.find((t) => t.key === 'route')!;
    // Slot should still exist (NOT deleted)
    expect(route.slots.cities).toBeDefined();
    // But should have _conflict metadata
    expect(route.slots._conflicts).toBeDefined();
  });

  test('does NOT delete any slots or trees', async () => {
    const ctx = makeCtx(
      [tree('food', { dish: 'peanut noodles', drink: 'tea' })],
      ['I have a peanut allergy']
    );
    const result = await contradictionCheckerAgent.run(ctx, null as any);
    const food = result.content.trees.find((t) => t.key === 'food')!;
    // All slots preserved
    expect(Object.keys(food.slots)).toContain('dish');
    expect(Object.keys(food.slots)).toContain('drink');
    expect(result.content.trees).toHaveLength(1);
  });

  test('does nothing when no negative keywords found', async () => {
    const ctx = makeCtx(
      [tree('trip', { dest: 'Beijing', budget: '3000' })],
      ['I want to visit Beijing with a 3000 dollar budget']
    );
    const result = await contradictionCheckerAgent.run(ctx, null as any);
    const trip = result.content.trees.find((t) => t.key === 'trip')!;
    expect(trip.slots._conflicts).toBeUndefined();
  });

  test('is CODE-only (usesLLM=false)', () => {
    expect(contradictionCheckerAgent.usesLLM).toBe(false);
  });

  test('skips in incremental mode', () => {
    const ctx = makeCtx([], []);
    ctx.meta.mode = 'incremental';
    expect(contradictionCheckerAgent.shouldRun(ctx)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && pnpm vitest run src/extractors/agents/__tests__/codeContradictionChecker.test.ts`
Expected: FAIL — current agent is LLM-based and deletes data

- [ ] **Step 3: Rewrite contradictionCheckerAgent as CODE-only**

Replace the entire content of `packages/core/src/extractors/agents/contradictionCheckerAgent.ts`:

```typescript
/**
 * Contradiction Checker Agent — CODE
 *
 * ONE job: detect if any tree content might contradict the user's explicit statements.
 * Scans for negative keywords ("avoid", "no", "don't", "skip", "allergic", "not", "hate")
 * in user messages, then checks if matching terms appear in tree slots.
 *
 * KEY PRINCIPLE: NEVER deletes data. Only ADDS a _conflicts metadata slot
 * so the user can review in triage. The user decides what to keep.
 */

import type { TreeNode, SlotValue } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

/** Negative patterns: keyword + captured term */
const NEGATIVE_PATTERNS = [
  /\bavoid(?:ing)?\s+(.+?)(?:\.|,|$)/gi,
  /\bdon'?t\s+(?:want|like|need|go to|visit|eat|use)\s+(.+?)(?:\.|,|$)/gi,
  /\bskip(?:ping)?\s+(.+?)(?:\.|,|$)/gi,
  /\ballergic\s+(?:to\s+)?(.+?)(?:\.|,|$)/gi,
  /\bno\s+(.+?)(?:\.|,|$)/gi,
  /\bhate\s+(.+?)(?:\.|,|$)/gi,
  /\bnot\s+interested\s+in\s+(.+?)(?:\.|,|$)/gi,
];

/** Extract avoided terms from user messages */
function extractAvoidedTerms(userMessages: string[]): string[] {
  const terms: string[] = [];
  for (const msg of userMessages) {
    for (const pattern of NEGATIVE_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(msg)) !== null) {
        const term = match[1].trim().toLowerCase();
        if (term.length >= 2 && term.length <= 50) {
          terms.push(term);
        }
      }
    }
  }
  return [...new Set(terms)];
}

/** Check if a slot value contains an avoided term */
function slotContainsTerm(value: SlotValue, term: string): boolean {
  const str = typeof value === 'string' ? value.toLowerCase() : JSON.stringify(value).toLowerCase();
  return str.includes(term);
}

/** Scan a tree and its children for conflicts */
function findConflicts(
  node: TreeNode,
  avoidedTerms: string[]
): Array<{ slotKey: string; term: string; value: string }> {
  const conflicts: Array<{ slotKey: string; term: string; value: string }> = [];
  for (const [key, value] of Object.entries(node.slots)) {
    if (key === '_conflicts') continue;
    for (const term of avoidedTerms) {
      if (slotContainsTerm(value, term)) {
        conflicts.push({ slotKey: key, term, value: String(value) });
      }
    }
  }
  return conflicts;
}

export const contradictionCheckerAgent: MeaningAgent = {
  name: 'contradiction_checker',
  description: 'Flag (never delete) content that may contradict user statements',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    if (ctx.meta.mode === 'incremental') return false;
    return ctx.content.trees.length > 0 && ctx.turns.some((t) => t.role === 'user');
  },

  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const userMessages = ctx.turns
      .filter((t) => t.role === 'user')
      .map((t) => t.content);

    const avoidedTerms = extractAvoidedTerms(userMessages);
    if (avoidedTerms.length === 0) return ctx;

    // Walk all trees and flag conflicts (never delete)
    function flagTree(node: TreeNode): TreeNode {
      const conflicts = findConflicts(node, avoidedTerms);
      const flaggedChildren = node.children.map(flagTree);

      if (conflicts.length === 0 && flaggedChildren === node.children) {
        return { ...node, children: flaggedChildren };
      }

      const updatedSlots = { ...node.slots };
      if (conflicts.length > 0) {
        updatedSlots._conflicts = conflicts.map(
          (c) => `${c.slotKey} contains "${c.term}" (user wants to avoid)`
        ).join('; ');
      }

      return { ...node, slots: updatedSlots, children: flaggedChildren };
    }

    ctx.content = {
      trees: ctx.content.trees.map(flagTree),
      relations: ctx.content.relations,
    };

    return ctx;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && pnpm vitest run src/extractors/agents/__tests__/codeContradictionChecker.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Verify build**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/extractors/agents/contradictionCheckerAgent.ts packages/core/src/extractors/agents/__tests__/codeContradictionChecker.test.ts
git commit -m "refactor(core): replace LLM contradiction checker with code-based keyword flagging (never deletes)"
```

---

## Task 5: Fuzzy Quote Validator (New CODE Agent)

**Files:**
- Create: `packages/core/src/extractors/agents/fuzzyQuoteValidator.ts`
- Create: `packages/core/src/extractors/agents/__tests__/fuzzyQuoteValidator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/src/extractors/agents/__tests__/fuzzyQuoteValidator.test.ts
import { describe, expect, test } from 'vitest';
import type { TreeNode } from '../../../semantic/types';
import { fuzzyQuoteValidatorAgent } from '../fuzzyQuoteValidator';
import type { PipelineContext } from '../../meaningPipeline';

function makeCtx(trees: TreeNode[], turns: Array<{ role: string; content: string }>): PipelineContext {
  return {
    content: { trees, relations: [] },
    turns,
    meta: {
      mode: 'full',
      completedAgents: [],
      agentErrors: [],
      stepSnapshots: [],
      totalUsage: { inputTokens: 0, outputTokens: 0 },
    },
    quality: { score: 50, frameCount: trees.length, maxDepth: 1, duplicateTypes: 0 },
  } as PipelineContext;
}

describe('fuzzy quote validator', () => {
  test('keeps confidence when quote matches conversation', async () => {
    const tree: TreeNode = {
      key: 'trip',
      slots: { budget: '3000' },
      children: [],
      slot_quotes: { budget: '$3000 budget' },
      confidence: 0.9,
    };
    const ctx = makeCtx([tree], [
      { role: 'user', content: 'I have a $3000 budget for this trip' },
    ]);
    const result = await fuzzyQuoteValidatorAgent.run(ctx, null as any);
    expect(result.content.trees[0].confidence).toBe(0.9);
  });

  test('reduces confidence when quote does not match any turn', async () => {
    const tree: TreeNode = {
      key: 'trip',
      slots: { budget: '3000' },
      children: [],
      slot_quotes: { budget: 'completely made up text' },
      confidence: 0.9,
    };
    const ctx = makeCtx([tree], [
      { role: 'user', content: 'I want to visit Beijing' },
    ]);
    const result = await fuzzyQuoteValidatorAgent.run(ctx, null as any);
    expect(result.content.trees[0].confidence).toBeLessThan(0.9);
  });

  test('handles trees without slot_quotes gracefully', async () => {
    const tree: TreeNode = {
      key: 'trip',
      slots: { dest: 'Beijing' },
      children: [],
    };
    const ctx = makeCtx([tree], [
      { role: 'user', content: 'I want to visit Beijing' },
    ]);
    const result = await fuzzyQuoteValidatorAgent.run(ctx, null as any);
    // No crash, tree unchanged
    expect(result.content.trees[0].key).toBe('trip');
  });

  test('is CODE-only (usesLLM=false)', () => {
    expect(fuzzyQuoteValidatorAgent.usesLLM).toBe(false);
  });

  test('always runs when trees exist', () => {
    const ctx = makeCtx(
      [{ key: 'a', slots: {}, children: [] }],
      [{ role: 'user', content: 'hello' }]
    );
    expect(fuzzyQuoteValidatorAgent.shouldRun(ctx)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && pnpm vitest run src/extractors/agents/__tests__/fuzzyQuoteValidator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fuzzyQuoteValidator**

```typescript
// packages/core/src/extractors/agents/fuzzyQuoteValidator.ts
/**
 * Fuzzy Quote Validator Agent — CODE
 *
 * ONE job: validate that each tree's source quotes actually appear in the conversation.
 * Uses case-insensitive substring matching with token overlap fallback.
 *
 * - If quote matches a turn: keep original confidence
 * - If no match found: reduce confidence to 0.3 (low but not removed)
 *
 * Runs early in the pipeline — before dedup and other agents.
 */

import type { TreeNode } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const LOW_CONFIDENCE = 0.3;
const TOKEN_OVERLAP_THRESHOLD = 0.5;

/** Tokenize a string into lowercase words */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 2)
  );
}

/** Check if quote appears in any turn (substring or token overlap) */
function quoteMatchesTurns(quote: string, turnContents: string[]): boolean {
  const lowerQuote = quote.toLowerCase();

  // 1. Exact substring match (case-insensitive)
  for (const content of turnContents) {
    if (content.toLowerCase().includes(lowerQuote)) return true;
  }

  // 2. Token overlap fallback (for paraphrased quotes)
  const quoteTokens = tokenize(quote);
  if (quoteTokens.size < 2) return false; // Too short for token matching

  for (const content of turnContents) {
    const contentTokens = tokenize(content);
    let overlap = 0;
    for (const token of quoteTokens) {
      if (contentTokens.has(token)) overlap++;
    }
    if (overlap / quoteTokens.size >= TOKEN_OVERLAP_THRESHOLD) return true;
  }

  return false;
}

/** Validate quotes for a tree and adjust confidence */
function validateTree(node: TreeNode, turnContents: string[]): TreeNode {
  if (!node.slot_quotes || Object.keys(node.slot_quotes).length === 0) {
    // No quotes to validate — keep as is
    return {
      ...node,
      children: node.children.map((c) => validateTree(c, turnContents)),
    };
  }

  // Check each quote
  let hasUnmatched = false;
  for (const quote of Object.values(node.slot_quotes)) {
    if (typeof quote === 'string' && quote.length > 0) {
      if (!quoteMatchesTurns(quote, turnContents)) {
        hasUnmatched = true;
        break;
      }
    }
  }

  return {
    ...node,
    confidence: hasUnmatched ? LOW_CONFIDENCE : (node.confidence ?? 0.8),
    children: node.children.map((c) => validateTree(c, turnContents)),
  };
}

export const fuzzyQuoteValidatorAgent: MeaningAgent = {
  name: 'fuzzy_quote_validator',
  description: 'Validate source quotes via fuzzy matching, adjust confidence for unmatched',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    return ctx.content.trees.length > 0;
  },

  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const turnContents = ctx.turns.map((t) => t.content);

    ctx.content = {
      trees: ctx.content.trees.map((t) => validateTree(t, turnContents)),
      relations: ctx.content.relations,
    };

    return ctx;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && pnpm vitest run src/extractors/agents/__tests__/fuzzyQuoteValidator.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/extractors/agents/fuzzyQuoteValidator.ts packages/core/src/extractors/agents/__tests__/fuzzyQuoteValidator.test.ts
git commit -m "feat(core): add fuzzy quote validator CODE agent"
```

---

## Task 6: Update Pipeline — Remove 3 LLM Agents, Add Fuzzy Validator, Reorder

**Files:**
- Modify: `packages/core/src/extractors/agents/index.ts`
- Modify: `packages/core/src/extractors/createMeaningPipeline.ts`

- [ ] **Step 1: Update agents/index.ts**

Replace the entire content of `packages/core/src/extractors/agents/index.ts`:

```typescript
/**
 * Meaning Pipeline Agents — each does ONE focused job.
 *
 * Code agents: output_regulator, fuzzy_quote_validator, dedup_checker,
 *              nester, contradiction_checker, regression_checker,
 *              structural_validator, source_trace_validator
 * LLM agents: topic_namer, coverage_checker
 *
 * Order matters — see createMeaningPipeline.ts for execution order.
 */

// Code agents
export { outputRegulatorAgent } from './outputRegulatorAgent';
export { fuzzyQuoteValidatorAgent } from './fuzzyQuoteValidator';
export { dedupCheckerAgent } from './dedupCheckerAgent';
export { nesterAgent } from './nesterAgent';
export { contradictionCheckerAgent } from './contradictionCheckerAgent';
export { regressionCheckerAgent } from './regressionCheckerAgent';
export { structuralValidatorAgent } from './structuralValidatorAgent';
export { sourceTraceValidatorAgent } from './sourceTraceValidatorAgent';

// LLM agents (kept — lightweight and additive)
export { topicNamerAgent } from './topicNamerAgent';
export { coverageCheckerAgent } from './coverageCheckerAgent';

// REMOVED from pipeline (files kept for reference):
// - slotPolisherAgent (unnecessary LLM beautification)
// - reviewerAgent (biggest data remover)
// - topicEvolverAgent (code uses root key directly)
```

- [ ] **Step 2: Update createMeaningPipeline.ts**

Replace the entire content of `packages/core/src/extractors/createMeaningPipeline.ts`:

```typescript
/**
 * Factory for creating a pre-configured MeaningPipeline.
 *
 * v2: Simplified pipeline — 8 CODE agents + 2 LLM agents.
 * LLM agents removed: slot_polisher, reviewer, topic_evolver.
 * LLM agents converted to CODE: dedup_checker, contradiction_checker.
 * New CODE agent: fuzzy_quote_validator.
 */

import type { LLMProvider } from '../llm/types';
import {
  contradictionCheckerAgent,
  coverageCheckerAgent,
  dedupCheckerAgent,
  fuzzyQuoteValidatorAgent,
  nesterAgent,
  outputRegulatorAgent,
  regressionCheckerAgent,
  sourceTraceValidatorAgent,
  structuralValidatorAgent,
  topicNamerAgent,
} from './agents';
import { MeaningPipeline } from './meaningPipeline';

/**
 * Create the simplified meaning pipeline.
 *
 * Agent execution order:
 * 1.  output_regulator       (CODE) — consolidate duplicate frame types
 * 2.  fuzzy_quote_validator   (CODE) — validate source quotes, adjust confidence
 * 3.  dedup_checker           (CODE) — exact key + Jaccard similarity dedup
 * 4.  nester                  (CODE) — build nested tree from relations
 * 5.  topic_namer             (LLM)  — name root topic (first extraction only)
 * 6.  coverage_checker        (LLM)  — verify all user points captured, auto-add
 * 7.  contradiction_checker   (CODE) — flag (not delete) contradicting slots
 * 8.  regression_checker      (CODE) — detect significant content loss
 * 9.  structural_validator    (CODE) — validate structural integrity
 * 10. source_trace_validator  (CODE) — validate source references
 */
export function createMeaningPipeline(provider: LLMProvider): MeaningPipeline {
  return new MeaningPipeline(provider)
    .register(outputRegulatorAgent)
    .register(fuzzyQuoteValidatorAgent)
    .register(dedupCheckerAgent)
    .register(nesterAgent)
    .register(topicNamerAgent)
    .register(coverageCheckerAgent)
    .register(contradictionCheckerAgent)
    .register(regressionCheckerAgent)
    .register(structuralValidatorAgent)
    .register(sourceTraceValidatorAgent);
}
```

- [ ] **Step 3: Verify build**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Run all core tests**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/extractors/agents/index.ts packages/core/src/extractors/createMeaningPipeline.ts
git commit -m "refactor(core): simplify MeaningPipeline — remove 3 LLM agents, add fuzzy quote validator"
```

---

## Task 7: Integration Verification

**Files:** All modified files

- [ ] **Step 1: Build entire core package**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run all core tests**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

- [ ] **Step 3: Build dependent packages**

Run: `pnpm build:storage && pnpm build:api`
Expected: Both build successfully

- [ ] **Step 4: Run storage and API tests**

Run: `pnpm test:storage && pnpm test:api`
Expected: Tests pass (or only pre-existing failures)

- [ ] **Step 5: Type check web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Verify extraction prompt changes are correct**

Run: `cd packages/core && pnpm vitest run` to make sure no regression

- [ ] **Step 7: Commit any remaining fixes**

```bash
git add -A && git commit -m "fix(core): integration fixes for simplified extraction pipeline"
```
