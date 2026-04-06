/**
 * E2E Test: Source Mapping Accuracy
 *
 * Verifies that extraction produces correct source mapping:
 * 1. slot_quotes are populated from tree-format metadata (--- JSON section)
 * 2. Slot quotes contain VERBATIM text from the conversation
 * 3. source_map tags are propagated to tree nodes
 *
 * Note: After migration to @t3x-dev/yops, source/from metadata is no longer
 * carried in individual ops. Source mapping comes from the tree-format metadata
 * section (slot_quotes + source_map in the --- JSON block).
 */

import { describe, expect, it, vi } from 'vitest';
import { Extractor } from '../../extractors/extractor';
import type { LLMProvider } from '../../llm/types';
import type { SemanticContent, TreeNode } from '../../semantic/types';

// ── Test Data ──

const USER_MESSAGE = "i want to know the australian beef's taste";

const ASSISTANT_MESSAGE = `Australian beef is known for several distinctive taste characteristics:

**Flavor Profile:**
- **Clean, pure taste** - Often attributed to Australia's grass-fed cattle and clean environment
- **Rich, beefy flavor** - Well-developed taste from cattle raised on open pastures
- **Less gamey** than some other beef varieties
- **Slightly leaner** taste compared to heavily grain-fed beef

**Key Factors Affecting Taste:**
- **Grass-Fed vs Grain-Fed**: Most Australian beef is grass-fed, giving it a more natural, earthy flavor
- Grain-fed Australian beef (like Wagyu) tends to be richer and more marbled

**Popular Australian Beef Types:**
- Wagyu - exceptionally tender with buttery flavor
- Angus - robust beef taste
- Grass-fed varieties - clean, natural flavor`;

// ── Mock Provider ──

function mockProvider(response: string): LLMProvider {
  return {
    id: 'test',
    generate: vi.fn(async () => ({
      text: response,
      usage: { inputTokens: 100, outputTokens: 200 },
    })),
    resolveConflict: vi.fn(async () => ''),
  };
}

// ── Helpers ──

function collectSlotQuotes(tree: TreeNode, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  if (tree.slot_quotes) {
    for (const [k, v] of Object.entries(tree.slot_quotes)) {
      result[prefix ? `${prefix}.${k}` : k] = v;
    }
  }
  for (const child of tree.children) {
    const childPrefix = prefix ? `${prefix}.${child.key}` : child.key;
    Object.assign(result, collectSlotQuotes(child, childPrefix));
  }
  return result;
}

function collectSources(tree: TreeNode, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  const path = prefix ? `${prefix}/${tree.key}` : tree.key;
  if (tree.source) {
    result[path] = tree.source;
  }
  for (const child of tree.children) {
    Object.assign(result, collectSources(child, path));
  }
  return result;
}

// ── Tests ──

describe('Source Mapping E2E', () => {
  it('extraction tags assistant content with T2, not T1', async () => {
    // Tree format extraction — source_map comes from --- JSON metadata
    const extractorOutput = `australian_beef_taste:
  flavor: clean and pure
  texture: slightly leaner
  farming: predominantly grass-fed
---
{
  "slot_quotes": {
    "flavor": "Clean, pure taste",
    "texture": "Slightly leaner taste compared to heavily grain-fed beef",
    "farming": "Most Australian beef is grass-fed"
  },
  "source_map": {
    "australian_beef_taste": "T2"
  }
}`;

    const provider = mockProvider(extractorOutput);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [
        { role: 'user', content: USER_MESSAGE, turn_hash: 'sha256:user1' },
        { role: 'assistant', content: ASSISTANT_MESSAGE, turn_hash: 'sha256:asst1' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 1. Verify source tags — should be T2 (assistant), not T1 (user)
    const tree = result.snapshot.trees[0];
    expect(tree).toBeDefined();

    const sources = collectSources(tree);
    for (const [path, source] of Object.entries(sources)) {
      expect(source).toBe('T2');
    }
  });

  it('slot_quotes contain text that exists in the conversation', async () => {
    const extractorOutput = `beef_taste:
  flavor: clean and pure
  farming: grass-fed
  wagyu_flavor: buttery
---
{
  "slot_quotes": {
    "flavor": "Clean, pure taste",
    "farming": "Most Australian beef is grass-fed",
    "wagyu_flavor": "Wagyu - exceptionally tender with buttery flavor"
  },
  "source_map": {
    "beef_taste": "T2"
  }
}`;

    const provider = mockProvider(extractorOutput);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [
        { role: 'user', content: USER_MESSAGE, turn_hash: 'sha256:user1' },
        { role: 'assistant', content: ASSISTANT_MESSAGE, turn_hash: 'sha256:asst1' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 2. Verify slot_quotes are searchable in the assistant's message
    const tree = result.snapshot.trees[0];
    const quotes = collectSlotQuotes(tree);

    expect(Object.keys(quotes).length).toBeGreaterThan(0);

    const lowerAssistant = ASSISTANT_MESSAGE.toLowerCase();
    for (const [slotPath, quote] of Object.entries(quotes)) {
      const found = lowerAssistant.includes(quote.toLowerCase());
      expect(found, `Quote "${quote}" for slot "${slotPath}" not found in assistant message`).toBe(true);
    }
  });

  it('slot_quotes are NOT paraphrases — they are verbatim', async () => {
    const extractorOutput = `beef:
  type: grass-fed
---
{
  "slot_quotes": {
    "type": "Most Australian beef is grass-fed, giving it a more natural, earthy flavor"
  },
  "source_map": {
    "beef": "T2"
  }
}`;

    const provider = mockProvider(extractorOutput);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [
        { role: 'user', content: USER_MESSAGE, turn_hash: 'sha256:user1' },
        { role: 'assistant', content: ASSISTANT_MESSAGE, turn_hash: 'sha256:asst1' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const tree = result.snapshot.trees[0];
    const quotes = collectSlotQuotes(tree);

    // Each quote should be a substring of the actual conversation
    for (const [, quote] of Object.entries(quotes)) {
      // Must be at least 5 chars (not too short to be meaningless)
      expect(quote.length).toBeGreaterThanOrEqual(5);
      // Must be findable in the original text
      expect(
        ASSISTANT_MESSAGE.toLowerCase().includes(quote.toLowerCase()),
        `Quote "${quote}" is not verbatim from the conversation`
      ).toBe(true);
    }
  });

  it('incremental extraction applies set ops to existing snapshot', async () => {
    const existingSnapshot: SemanticContent = {
      trees: [{
        key: 'beef_topic',
        slots: { interest: 'Australian beef taste' },
        children: [],
        source: 'T1',
        slot_quotes: { interest: "i want to know the australian beef's taste" },
      }],
      relations: [],
    };

    // Incremental: add a child node
    const extractorOutput = `yops:
  - define:
      path: beef_topic/cooking_tips
  - populate:
      path: beef_topic/cooking_tips
      values:
        method: medium-rare grilling
        rest_time: 5 minutes`;

    const provider = mockProvider(extractorOutput);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [
        { role: 'user', content: USER_MESSAGE, turn_hash: 'sha256:user1' },
        { role: 'assistant', content: ASSISTANT_MESSAGE, turn_hash: 'sha256:asst1' },
        { role: 'user', content: 'how should I cook it?', turn_hash: 'sha256:user2' },
        { role: 'assistant', content: 'For Australian beef, best served medium-rare on the grill. Let it rest for about 5 minutes after cooking.', turn_hash: 'sha256:asst2' },
      ],
      snapshot: existingSnapshot,
      processedTurnCount: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The new child should exist with correct slots
    const root = result.snapshot.trees[0];
    const cookingChild = root.children.find(c => c.key === 'cooking_tips');
    expect(cookingChild).toBeDefined();
    expect(cookingChild!.slots.method).toBe('medium-rare grilling');
    expect(cookingChild!.slots.rest_time).toBe('5 minutes');
  });

  it('extraction result has snapshot without lint scores', async () => {
    const extractorOutput = `beef:
  taste: clean
---
{
  "slot_quotes": {
    "taste": "Clean, pure taste"
  },
  "source_map": {
    "beef": "T2"
  }
}`;

    const provider = mockProvider(extractorOutput);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [
        { role: 'user', content: USER_MESSAGE, turn_hash: 'sha256:user1' },
        { role: 'assistant', content: ASSISTANT_MESSAGE, turn_hash: 'sha256:asst1' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Pipeline produces tree without lint scores
    expect(result.snapshot.trees.length).toBeGreaterThan(0);
    expect(result.snapshot.trees[0].key).toBe('beef');
  });
});
