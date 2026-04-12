/**
 * E2E Test: Source Mapping Accuracy
 *
 * Verifies that extraction produces a valid snapshot:
 * 1. Tree structure (key, slots, children) is preserved
 * 2. Incremental ops apply correctly to existing snapshots
 */

import { describe, expect, it, vi } from 'vitest';
import { Extractor } from '../../extractors/extractor';
import type { LLMProvider } from '../../llm/types';
import type { SemanticContent } from '../../semantic/types';

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

// ── Tests ──

describe('Source Mapping E2E', () => {
  it('extraction produces a valid snapshot with correct tree structure', async () => {
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

    const tree = result.snapshot.trees[0];
    expect(tree).toBeDefined();
    expect(tree.key).toBe('australian_beef_taste');
    expect(tree.slots.flavor).toBe('clean and pure');
    expect(tree.slots.texture).toBe('slightly leaner');
    expect(tree.slots.farming).toBe('predominantly grass-fed');
    // TreeNode no longer carries slot_quotes or source tags
    expect(tree).not.toHaveProperty('slot_quotes');
    expect(tree).not.toHaveProperty('source');
  });

  it('incremental extraction applies set ops to existing snapshot', async () => {
    const existingSnapshot: SemanticContent = {
      trees: [{
        key: 'beef_topic',
        slots: { interest: 'Australian beef taste' },
        children: [],
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
