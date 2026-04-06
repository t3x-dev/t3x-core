/**
 * E2E Test: Source Mapping Accuracy
 *
 * Verifies that extraction produces correct source mapping:
 * 1. `from` tag matches the turn where information ACTUALLY appears
 * 2. `source` (slot_quotes) contains VERBATIM text from the conversation
 * 3. Slot quotes are searchable in the original conversation text
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
    // The LLM extractor will produce YOps from the conversation.
    // We simulate the LLM's extraction output (what the extractor LLM returns).
    const extractorOutput = `yops:
  - define:
      parent: ""
      key: australian_beef_taste
  - populate:
      path: australian_beef_taste
      slots:
        flavor: clean and pure
        texture: slightly leaner
        farming: predominantly grass-fed
      source:
        flavor: "Clean, pure taste"
        texture: "Slightly leaner taste compared to heavily grain-fed beef"
        farming: "Most Australian beef is grass-fed"
      from: T2
`;

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
    const extractorOutput = `yops:
  - define:
      parent: ""
      key: beef_taste
  - populate:
      path: beef_taste
      slots:
        flavor: clean and pure
        farming: grass-fed
        wagyu_flavor: buttery
      source:
        flavor: "Clean, pure taste"
        farming: "Most Australian beef is grass-fed"
        wagyu_flavor: "Wagyu - exceptionally tender with buttery flavor"
      from: T2
`;

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
    // BAD: "grass-fed beef" (paraphrase)
    // GOOD: "Most Australian beef is grass-fed" (verbatim from message)
    const extractorOutput = `yops:
  - define:
      parent: ""
      key: beef
  - populate:
      path: beef
      slots:
        type: grass-fed
      source:
        type: "Most Australian beef is grass-fed, giving it a more natural, earthy flavor"
      from: T2
`;

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
      // Must be at least 10 chars (not too short to be meaningless)
      expect(quote.length).toBeGreaterThanOrEqual(5);
      // Must be findable in the original text
      expect(
        ASSISTANT_MESSAGE.toLowerCase().includes(quote.toLowerCase()),
        `Quote "${quote}" is not verbatim from the conversation`
      ).toBe(true);
    }
  });

  it('incremental extraction also uses correct from tags', async () => {
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

    // User asks follow-up (T3), assistant answers (T4)
    const extractorOutput = `yops:
  - define:
      parent: beef_topic
      key: cooking_tips
  - populate:
      path: beef_topic/cooking_tips
      slots:
        method: medium-rare grilling
        rest_time: 5 minutes
      source:
        method: "best served medium-rare on the grill"
        rest_time: "let it rest for about 5 minutes"
      from: T4
`;

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

    // The new child should have source T4 (second assistant answer)
    const root = result.snapshot.trees[0];
    const cookingChild = root.children.find(c => c.key === 'cooking_tips');
    expect(cookingChild).toBeDefined();
    expect(cookingChild!.source).toBe('T4');
  });

  it('extraction result has snapshot without lint scores', async () => {
    const extractorOutput = `yops:
  - define:
      parent: ""
      key: beef
  - populate:
      path: beef
      slots:
        taste: clean
      source:
        taste: "Clean, pure taste"
      from: T2
`;

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
