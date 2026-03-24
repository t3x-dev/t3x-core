/**
 * Constraint Suggester Tests
 *
 * Tests for LLM-based constraint suggestion:
 * - suggestConstraints: end-to-end with mock LLMProvider
 * - parseConstraintSuggestions: response parsing
 * - suggestionsToConstraints: conversion to Constraint objects
 *
 * Also tests configurable semantic thresholds (Upgrade #2 Step 3).
 */

import { describe, expect, it, vi } from 'vitest';
import { suggestConstraints, suggestionsToConstraints } from '../../leaf/constraintSuggester';
import { SEMANTIC_EXCLUDE_THRESHOLD, SEMANTIC_REQUIRE_THRESHOLD } from '../../leaf/types';
import {
  validateConstraints,
  validateExcludeSemantic,
  validateRequireSemantic,
} from '../../leaf/validate-constraints';
import type { LLMProvider } from '../../llm/types';
import type { EmbeddingProvider } from '../../providers/embedding/base';
import type { Sentence } from '../../types/v4';

// ============================================================
// Mock LLM Provider
// ============================================================

function createMockProvider(response: string): LLMProvider {
  return {
    id: 'mock-provider',
    generate: vi
      .fn()
      .mockResolvedValue({ text: response, usage: { inputTokens: 10, outputTokens: 5 } }),
    resolveConflict: vi
      .fn()
      .mockResolvedValue({ text: 'resolved', usage: { inputTokens: 0, outputTokens: 0 } }),
  };
}

const sampleSentences: Sentence[] = [
  {
    id: 's_test001',
    text: 'The user prefers budget-friendly travel options.',
    confidence: 0.9,
  },
  {
    id: 's_test002',
    text: 'The user wants to visit Japan in spring for cherry blossoms.',
    confidence: 0.95,
  },
  {
    id: 's_test003',
    text: 'The user is allergic to shellfish and cannot eat seafood.',
    confidence: 0.85,
  },
];

// ============================================================
// suggestConstraints
// ============================================================

describe('suggestConstraints', () => {
  it('returns suggestions from LLM response', async () => {
    const mockResponse = JSON.stringify([
      {
        type: 'require',
        match_mode: 'semantic',
        value: 'budget-friendly travel',
        reason: 'Core user preference for affordable travel',
        confidence: 0.95,
      },
      {
        type: 'require',
        match_mode: 'exact',
        value: 'Japan',
        reason: 'Key destination mentioned by user',
        confidence: 0.9,
      },
      {
        type: 'exclude',
        match_mode: 'semantic',
        value: 'seafood recommendations',
        reason: 'User is allergic to shellfish',
        confidence: 0.85,
      },
    ]);

    const provider = createMockProvider(mockResponse);
    const result = await suggestConstraints(provider, sampleSentences, 'tweet');

    expect(result.model).toBe('mock-provider');
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0].type).toBe('require');
    expect(result.suggestions[0].match_mode).toBe('semantic');
    expect(result.suggestions[0].value).toBe('budget-friendly travel');
    expect(result.suggestions[2].type).toBe('exclude');
    expect(provider.generate).toHaveBeenCalledOnce();
  });

  it('handles empty sentences', async () => {
    const provider = createMockProvider('[]');
    const result = await suggestConstraints(provider, [], 'email');

    expect(result.suggestions).toHaveLength(0);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('handles markdown code fences in response', async () => {
    const mockResponse =
      '```json\n[{"type":"require","match_mode":"exact","value":"Japan","reason":"dest","confidence":0.9}]\n```';
    const provider = createMockProvider(mockResponse);
    const result = await suggestConstraints(provider, sampleSentences, 'article');

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].value).toBe('Japan');
  });

  it('handles invalid LLM response gracefully', async () => {
    const provider = createMockProvider('not valid json at all');
    const result = await suggestConstraints(provider, sampleSentences, 'tweet');

    expect(result.suggestions).toHaveLength(0);
  });

  it('filters out invalid items from response', async () => {
    const mockResponse = JSON.stringify([
      { type: 'require', match_mode: 'exact', value: 'Japan', reason: 'dest', confidence: 0.9 },
      { type: 'invalid_type', match_mode: 'exact', value: 'bad', reason: 'bad', confidence: 0.5 },
      { type: 'require', match_mode: 'exact', value: '', reason: 'empty value', confidence: 0.5 },
    ]);

    const provider = createMockProvider(mockResponse);
    const result = await suggestConstraints(provider, sampleSentences, 'tweet');

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].value).toBe('Japan');
  });

  it('passes maxSuggestions option', async () => {
    const provider = createMockProvider('[]');
    await suggestConstraints(provider, sampleSentences, 'email', { maxSuggestions: 5 });

    const callArgs = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('5');
  });

  it('passes additional instructions', async () => {
    const provider = createMockProvider('[]');
    await suggestConstraints(provider, sampleSentences, 'tweet', {
      instructions: 'Focus on food-related constraints',
    });

    const callArgs = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('Focus on food-related constraints');
  });
});

// ============================================================
// suggestionsToConstraints
// ============================================================

describe('suggestionsToConstraints', () => {
  it('converts suggestions to Constraint objects with IDs', async () => {
    const suggestions = [
      {
        type: 'require' as const,
        match_mode: 'exact' as const,
        value: 'Japan',
        reason: 'dest',
        confidence: 0.9,
      },
      {
        type: 'exclude' as const,
        match_mode: 'semantic' as const,
        value: 'seafood',
        reason: 'allergy',
        confidence: 0.85,
      },
    ];

    const constraints = await suggestionsToConstraints(suggestions);

    expect(constraints).toHaveLength(2);
    expect(constraints[0].id).toMatch(/^cst_/);
    expect(constraints[0].type).toBe('require');
    expect(constraints[0].match_mode).toBe('exact');
    expect(constraints[0].value).toBe('Japan');

    expect(constraints[1].id).toMatch(/^cst_/);
    expect(constraints[1].type).toBe('exclude');
    expect(constraints[1].match_mode).toBe('semantic');
    expect(constraints[1].value).toBe('seafood');
    if (constraints[1].type === 'exclude') {
      expect(constraints[1].reason).toBe('allergy');
    }
  });

  it('handles empty array', async () => {
    const constraints = await suggestionsToConstraints([]);
    expect(constraints).toHaveLength(0);
  });
});

// ============================================================
// Configurable Semantic Thresholds
// ============================================================

describe('Configurable Semantic Thresholds', () => {
  // Mock embedder that returns predictable similarity
  function createMockEmbedder(similarity: number): EmbeddingProvider {
    // For cosine similarity to equal the target,
    // we use vectors where dot product = similarity and norms = 1
    const vec1 = [1, 0];
    const vec2 = [similarity, Math.sqrt(1 - similarity * similarity)];

    return {
      id: 'mock-embedder',
      encode: vi.fn().mockResolvedValue([vec1, vec2]),
    };
  }

  describe('validateRequireSemantic with custom threshold', () => {
    it('uses default threshold when none provided', async () => {
      const embedder = createMockEmbedder(0.83);
      // 0.83 < 0.85 default → should fail
      const result = await validateRequireSemantic('output', 'value', embedder);
      expect(result.passed).toBe(false);
      expect(result.message).toContain(`${SEMANTIC_REQUIRE_THRESHOLD}`);
    });

    it('uses custom threshold when provided', async () => {
      const embedder = createMockEmbedder(0.83);
      // 0.83 >= 0.80 custom → should pass
      const result = await validateRequireSemantic('output', 'value', embedder, 0.8);
      expect(result.passed).toBe(true);
      expect(result.message).toContain('0.8');
    });

    it('stricter custom threshold', async () => {
      const embedder = createMockEmbedder(0.88);
      // 0.88 < 0.90 custom → should fail
      const result = await validateRequireSemantic('output', 'value', embedder, 0.9);
      expect(result.passed).toBe(false);
    });
  });

  describe('validateExcludeSemantic with custom threshold', () => {
    it('uses default threshold when none provided', async () => {
      const embedder = createMockEmbedder(0.65);
      // 0.65 < 0.70 default → should pass (excluded content NOT present)
      const result = await validateExcludeSemantic('output', 'value', embedder);
      expect(result.passed).toBe(true);
      expect(result.message).toContain(`${SEMANTIC_EXCLUDE_THRESHOLD}`);
    });

    it('uses custom threshold when provided', async () => {
      const embedder = createMockEmbedder(0.65);
      // 0.65 >= 0.60 custom → should fail (excluded content IS present)
      const result = await validateExcludeSemantic('output', 'value', embedder, 0.6);
      expect(result.passed).toBe(false);
    });
  });

  describe('validateConstraints with semanticThreshold option', () => {
    it('passes custom thresholds through to semantic validation', async () => {
      const embedder = createMockEmbedder(0.82);

      // With default threshold (0.85), 0.82 would fail for require
      const defaultResult = await validateConstraints({
        output: 'test output',
        constraints: [
          {
            id: 'cst_test1',
            type: 'require',
            match_mode: 'semantic',
            value: 'test value',
          },
        ],
        embedder,
      });
      expect(defaultResult.allPassed).toBe(false);

      // With custom lower threshold (0.80), 0.82 should pass
      const customResult = await validateConstraints({
        output: 'test output',
        constraints: [
          {
            id: 'cst_test1',
            type: 'require',
            match_mode: 'semantic',
            value: 'test value',
          },
        ],
        embedder,
        semanticThreshold: { require: 0.8 },
      });
      expect(customResult.allPassed).toBe(true);
    });
  });
});
