/**
 * Smart Diff Tests
 *
 * Tests for two-layer intelligent diff system (Issue #76 - Phase 2).
 * Layer 1: Deterministic text matching (Hungarian + Jaccard + LCS)
 * Layer 2: Semantic matching via embeddings (optional)
 */

import { describe, expect, it, vi } from 'vitest';
import { SEMANTIC_THRESHOLD, smartDiff } from '../../diff/smartDiff';
import type { EmbeddingProvider } from '../../providers/embedding';
import type { Sentence } from '../../types/commit';

// Helper to create test sentences
function createSentence(id: string, text: string): Sentence {
  return {
    id,
    text,
    confidence: 1,
    source: { type: 'turn', id: 'turn-1' },
  };
}

// Mock embedding provider that uses predefined text pairs for semantic matching
function createTextBasedMockProvider(
  semanticPairs: Array<{ source: string; target: string; similarity: number }>
): EmbeddingProvider {
  const textToIndex = new Map<string, number>();
  let nextIndex = 0;

  return {
    id: 'mock:semantic-model',
    dim: 1,
    encode: vi.fn(async (texts: string[]) => {
      return texts.map((text) => {
        if (!textToIndex.has(text)) {
          textToIndex.set(text, nextIndex++);
        }
        return [textToIndex.get(text)!];
      });
    }),
    similarity: vi.fn((vecA: number[], vecB: number[]) => {
      // Find the texts that correspond to these vectors
      const indexA = vecA[0];
      const indexB = vecB[0];

      // Find texts by their indices
      let textA = '';
      let textB = '';
      for (const [text, idx] of textToIndex) {
        if (idx === indexA) textA = text;
        if (idx === indexB) textB = text;
      }

      // Check if this pair is in our semantic pairs
      for (const pair of semanticPairs) {
        if (
          (pair.source === textA && pair.target === textB) ||
          (pair.source === textB && pair.target === textA)
        ) {
          return pair.similarity;
        }
      }

      return 0.3; // Default low similarity
    }),
  };
}

describe('smartDiff', () => {
  describe('Layer 1 only (no embeddingProvider)', () => {
    it('identifies identical sentences', async () => {
      const source = [
        createSentence('s1', 'The budget is $5000'),
        createSentence('s2', 'Meeting is on Monday'),
      ];
      const target = [
        createSentence('t1', 'The budget is $5000'),
        createSentence('t2', 'Meeting is on Monday'),
      ];

      const result = await smartDiff(source, target);

      expect(result.identical).toHaveLength(2);
      expect(result.textSimilar).toHaveLength(0);
      expect(result.semanticMatch).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(0);
      expect(result.onlyInTarget).toHaveLength(0);
    });

    it('identifies text-similar sentences with word diff', async () => {
      const source = [createSentence('s1', 'The budget is $3000')];
      const target = [createSentence('t1', 'The budget is $3500')];

      const result = await smartDiff(source, target);

      expect(result.identical).toHaveLength(0);
      expect(result.textSimilar).toHaveLength(1);
      expect(result.textSimilar[0].source.text).toBe('The budget is $3000');
      expect(result.textSimilar[0].target.text).toBe('The budget is $3500');
      expect(result.textSimilar[0].similarity).toBeGreaterThan(0.3);
      expect(result.textSimilar[0].wordDiff).toBeDefined();
    });

    it('classifies unmatched sentences as onlyIn arrays', async () => {
      const source = [
        createSentence('s1', 'This sentence only exists in source'),
        createSentence('s2', 'Another source-only sentence'),
      ];
      const target = [
        createSentence('t1', 'This is a brand new target sentence'),
        createSentence('t2', 'Completely different content here'),
      ];

      const result = await smartDiff(source, target);

      expect(result.identical).toHaveLength(0);
      expect(result.textSimilar).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(2);
      expect(result.onlyInTarget).toHaveLength(2);
    });

    it('handles mixed case: identical + similar + unmatched', async () => {
      const source = [
        createSentence('s1', 'Identical sentence'),
        createSentence('s2', 'Budget is $1000'),
        createSentence('s3', 'Removed sentence'),
      ];
      const target = [
        createSentence('t1', 'Identical sentence'),
        createSentence('t2', 'Budget is $2000'),
        createSentence('t3', 'New sentence added'),
      ];

      const result = await smartDiff(source, target);

      expect(result.identical).toHaveLength(1);
      expect(result.identical[0].text).toBe('Identical sentence');
      expect(result.textSimilar).toHaveLength(1);
      expect(result.onlyInSource).toHaveLength(1);
      expect(result.onlyInSource[0].text).toBe('Removed sentence');
      expect(result.onlyInTarget).toHaveLength(1);
      expect(result.onlyInTarget[0].text).toBe('New sentence added');
    });

    it('returns semanticMatch as empty without provider', async () => {
      const source = [createSentence('s1', 'I want to buy a car')];
      const target = [createSentence('t1', "I'd like to purchase a vehicle")];

      const result = await smartDiff(source, target);

      // Without embedding provider, these are just unmatched
      expect(result.semanticMatch).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(1);
      expect(result.onlyInTarget).toHaveLength(1);
    });
  });

  describe('Layer 1 + Layer 2 (with embeddingProvider)', () => {
    it('finds semantic matches for rephrased sentences', async () => {
      const source = [createSentence('s1', 'I want to buy a car')];
      const target = [createSentence('t1', "I'd like to purchase a vehicle")];

      // Mock provider returns high similarity for these sentences
      const mockProvider = createTextBasedMockProvider([
        {
          source: 'I want to buy a car',
          target: "I'd like to purchase a vehicle",
          similarity: 0.85, // Above SEMANTIC_THRESHOLD
        },
      ]);

      const result = await smartDiff(source, target, mockProvider);

      expect(result.semanticMatch).toHaveLength(1);
      expect(result.semanticMatch[0].source.text).toBe('I want to buy a car');
      expect(result.semanticMatch[0].target.text).toBe("I'd like to purchase a vehicle");
      expect(result.semanticMatch[0].semanticSimilarity).toBe(0.85);
      expect(result.onlyInSource).toHaveLength(0);
      expect(result.onlyInTarget).toHaveLength(0);
    });

    it('does not match when similarity below threshold', async () => {
      const source = [createSentence('s1', 'The weather is nice')];
      const target = [createSentence('t1', 'I like pizza')];

      const mockProvider = createTextBasedMockProvider([
        {
          source: 'The weather is nice',
          target: 'I like pizza',
          similarity: 0.5, // Below SEMANTIC_THRESHOLD (0.8)
        },
      ]);

      const result = await smartDiff(source, target, mockProvider);

      expect(result.semanticMatch).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(1);
      expect(result.onlyInTarget).toHaveLength(1);
    });

    it('prioritizes Layer 1 matches over Layer 2', async () => {
      const source = [
        createSentence('s1', 'The budget is $5000'), // Identical
        createSentence('s2', 'I want to buy a car'), // Semantic match candidate
      ];
      const target = [
        createSentence('t1', 'The budget is $5000'), // Identical
        createSentence('t2', "I'd like to purchase a vehicle"), // Semantic match
      ];

      const mockProvider = createTextBasedMockProvider([
        {
          source: 'I want to buy a car',
          target: "I'd like to purchase a vehicle",
          similarity: 0.85,
        },
      ]);

      const result = await smartDiff(source, target, mockProvider);

      // Identical found in Layer 1
      expect(result.identical).toHaveLength(1);
      expect(result.identical[0].text).toBe('The budget is $5000');

      // Semantic match found in Layer 2
      expect(result.semanticMatch).toHaveLength(1);
      expect(result.semanticMatch[0].source.text).toBe('I want to buy a car');
    });

    it('calls encode with unmatched sentences only', async () => {
      const source = [
        createSentence('s1', 'Identical text'),
        createSentence('s2', 'Completely unique alpha beta gamma'),
      ];
      const target = [
        createSentence('t1', 'Identical text'),
        createSentence('t2', 'Totally different delta epsilon zeta'),
      ];

      const mockProvider = createTextBasedMockProvider([]);

      await smartDiff(source, target, mockProvider);

      // Should call encode for unmatched sentences (those not matched by Layer 1)
      expect(mockProvider.encode).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles empty source array', async () => {
      const source: Sentence[] = [];
      const target = [createSentence('t1', 'New sentence')];

      const result = await smartDiff(source, target);

      expect(result.identical).toHaveLength(0);
      expect(result.textSimilar).toHaveLength(0);
      expect(result.semanticMatch).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(0);
      expect(result.onlyInTarget).toHaveLength(1);
    });

    it('handles empty target array', async () => {
      const source = [createSentence('s1', 'Old sentence')];
      const target: Sentence[] = [];

      const result = await smartDiff(source, target);

      expect(result.identical).toHaveLength(0);
      expect(result.textSimilar).toHaveLength(0);
      expect(result.semanticMatch).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(1);
      expect(result.onlyInTarget).toHaveLength(0);
    });

    it('handles both arrays empty', async () => {
      const result = await smartDiff([], []);

      expect(result.identical).toHaveLength(0);
      expect(result.textSimilar).toHaveLength(0);
      expect(result.semanticMatch).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(0);
      expect(result.onlyInTarget).toHaveLength(0);
      expect(result.stats.totalSource).toBe(0);
      expect(result.stats.totalTarget).toBe(0);
    });
  });

  describe('statistics', () => {
    it('calculates correct stats for Layer 1 only', async () => {
      const source = [
        createSentence('s1', 'Identical'),
        createSentence('s2', 'Similar text here'),
        createSentence('s3', 'Removed'),
      ];
      const target = [
        createSentence('t1', 'Identical'),
        createSentence('t2', 'Similar text there'),
        createSentence('t3', 'Added'),
      ];

      const result = await smartDiff(source, target);

      expect(result.stats.totalSource).toBe(3);
      expect(result.stats.totalTarget).toBe(3);
      expect(result.stats.identicalCount).toBe(1);
      expect(result.stats.textSimilarCount).toBe(1);
      expect(result.stats.semanticMatchCount).toBe(0);
      expect(result.stats.addedCount).toBe(1);
      expect(result.stats.removedCount).toBe(1);
    });

    it('calculates correct stats with Layer 2', async () => {
      const source = [
        createSentence('s1', 'I want to buy a car'),
        createSentence('s2', 'Alpha beta gamma delta'),
      ];
      const target = [
        createSentence('t1', "I'd like to purchase a vehicle"),
        createSentence('t2', 'Epsilon zeta eta theta'),
      ];

      const mockProvider = createTextBasedMockProvider([
        {
          source: 'I want to buy a car',
          target: "I'd like to purchase a vehicle",
          similarity: 0.85,
        },
      ]);

      const result = await smartDiff(source, target, mockProvider);

      expect(result.stats.totalSource).toBe(2);
      expect(result.stats.totalTarget).toBe(2);
      expect(result.stats.identicalCount).toBe(0);
      expect(result.stats.textSimilarCount).toBe(0);
      expect(result.stats.semanticMatchCount).toBe(1);
      expect(result.stats.addedCount).toBe(1);
      expect(result.stats.removedCount).toBe(1);
    });
  });

  describe('SEMANTIC_THRESHOLD constant', () => {
    it('has expected value of 0.8', () => {
      expect(SEMANTIC_THRESHOLD).toBe(0.8);
    });
  });
});
