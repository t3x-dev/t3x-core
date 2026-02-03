/**
 * Tests for Leaf Constraint Validation
 *
 * @see packages/core/src/leaf/validate-constraints.ts
 */

import { describe, expect, it, vi } from 'vitest';
import { SEMANTIC_EXCLUDE_THRESHOLD, SEMANTIC_REQUIRE_THRESHOLD } from '../../leaf/types';
import {
  generateAssertionId,
  validateConstraints,
  validateConstraintsExactOnly,
  validateExcludeExact,
  validateExcludeSemantic,
  validateRequireExact,
  validateRequireSemantic,
} from '../../leaf/validate-constraints';
import type { EmbeddingProvider } from '../../providers/embedding/base';
import type { Constraint } from '../../types/v4';

// ═══════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════

const createRequireConstraint = (
  value: string,
  matchMode: 'exact' | 'semantic' = 'exact',
  id = 'cst_test1'
): Constraint => ({
  id,
  type: 'require',
  match_mode: matchMode,
  value,
});

const createExcludeConstraint = (
  value: string,
  matchMode: 'exact' | 'semantic' = 'exact',
  id = 'cst_test2'
): Constraint => ({
  id,
  type: 'exclude',
  match_mode: matchMode,
  value,
});

/**
 * Create a mock embedder for testing semantic matching.
 * Returns vectors that produce predictable similarity scores.
 */
const createMockEmbedder = (similarity: number): EmbeddingProvider => ({
  id: 'mock:test',
  dim: 3,
  encode: vi.fn().mockResolvedValue([
    [1, 0, 0], // output vector
    [similarity, Math.sqrt(1 - similarity * similarity), 0], // value vector (produces desired similarity)
  ]),
  similarity: (a: number[], b: number[]) => {
    // Simple dot product for unit vectors
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// generateAssertionId Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('generateAssertionId', () => {
  it('generates ID with ast_ prefix', () => {
    const id = generateAssertionId();
    expect(id).toMatch(/^ast_/);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateAssertionId());
    }
    expect(ids.size).toBe(100);
  });

  it('generates ID with correct length (ast_ + 12 chars)', () => {
    const id = generateAssertionId();
    expect(id.length).toBe(4 + 12); // "ast_" (4) + nanoid(12)
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateRequireExact Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('validateRequireExact', () => {
  it('passes when required string is present', () => {
    const result = validateRequireExact('I love dark mode in my apps', 'dark mode');
    expect(result.passed).toBe(true);
    expect(result.evidence?.found).toBe('dark mode');
    expect(result.evidence?.location).toBe(7);
  });

  it('fails when required string is missing', () => {
    const result = validateRequireExact('I love light mode in my apps', 'dark mode');
    expect(result.passed).toBe(false);
    expect(result.evidence).toBeUndefined();
  });

  it('is case-insensitive', () => {
    const result1 = validateRequireExact('I love DARK MODE', 'dark mode');
    expect(result1.passed).toBe(true);

    const result2 = validateRequireExact('I love dark mode', 'DARK MODE');
    expect(result2.passed).toBe(true);

    const result3 = validateRequireExact('I love DaRk MoDe', 'dark mode');
    expect(result3.passed).toBe(true);
  });

  it('finds partial matches', () => {
    const result = validateRequireExact('The darkness of the mode is adjustable', 'dark');
    expect(result.passed).toBe(true);
    expect(result.evidence?.found).toBe('dark');
  });

  it('preserves original case in found evidence', () => {
    const result = validateRequireExact('I love DARK MODE today', 'dark mode');
    expect(result.passed).toBe(true);
    expect(result.evidence?.found).toBe('DARK MODE');
  });

  it('handles empty output', () => {
    const result = validateRequireExact('', 'dark mode');
    expect(result.passed).toBe(false);
  });

  it('handles empty value', () => {
    const result = validateRequireExact('Some text', '');
    expect(result.passed).toBe(true);
    expect(result.evidence?.location).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateExcludeExact Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('validateExcludeExact', () => {
  it('passes when excluded string is absent', () => {
    const result = validateExcludeExact('I love dark mode', 'light mode');
    expect(result.passed).toBe(true);
    expect(result.evidence).toBeUndefined();
  });

  it('fails when excluded string is present', () => {
    const result = validateExcludeExact('I love light mode in my apps', 'light mode');
    expect(result.passed).toBe(false);
    expect(result.evidence?.found).toBe('light mode');
    expect(result.evidence?.location).toBe(7);
  });

  it('is case-insensitive', () => {
    const result1 = validateExcludeExact('I love LIGHT MODE', 'light mode');
    expect(result1.passed).toBe(false);

    const result2 = validateExcludeExact('I love light mode', 'LIGHT MODE');
    expect(result2.passed).toBe(false);
  });

  it('detects partial matches as violations', () => {
    const result = validateExcludeExact('The competitor product is good', 'competitor');
    expect(result.passed).toBe(false);
  });

  it('handles empty output', () => {
    const result = validateExcludeExact('', 'forbidden');
    expect(result.passed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateRequireSemantic Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('validateRequireSemantic', () => {
  it('passes when similarity >= threshold', async () => {
    const embedder = createMockEmbedder(0.9); // Above 0.85 threshold
    const result = await validateRequireSemantic('output text', 'required value', embedder);

    expect(result.passed).toBe(true);
    expect(result.evidence?.similarity).toBeGreaterThanOrEqual(SEMANTIC_REQUIRE_THRESHOLD);
  });

  it('fails when similarity < threshold', async () => {
    const embedder = createMockEmbedder(0.7); // Below 0.85 threshold
    const result = await validateRequireSemantic('output text', 'required value', embedder);

    expect(result.passed).toBe(false);
    expect(result.evidence?.similarity).toBeLessThan(SEMANTIC_REQUIRE_THRESHOLD);
  });

  it('passes at exact threshold boundary', async () => {
    const embedder = createMockEmbedder(0.85); // Exactly at threshold
    const result = await validateRequireSemantic('output text', 'required value', embedder);

    expect(result.passed).toBe(true);
  });

  it('includes similarity score in evidence', async () => {
    const embedder = createMockEmbedder(0.75);
    const result = await validateRequireSemantic('output text', 'required value', embedder);

    expect(result.evidence?.similarity).toBeDefined();
    expect(typeof result.evidence?.similarity).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateExcludeSemantic Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('validateExcludeSemantic', () => {
  it('passes when similarity < threshold (content is different)', async () => {
    const embedder = createMockEmbedder(0.5); // Below 0.70 threshold
    const result = await validateExcludeSemantic('output text', 'excluded value', embedder);

    expect(result.passed).toBe(true);
    expect(result.evidence?.similarity).toBeLessThan(SEMANTIC_EXCLUDE_THRESHOLD);
  });

  it('fails when similarity >= threshold (content is too similar)', async () => {
    const embedder = createMockEmbedder(0.8); // Above 0.70 threshold
    const result = await validateExcludeSemantic('output text', 'excluded value', embedder);

    expect(result.passed).toBe(false);
    expect(result.evidence?.similarity).toBeGreaterThanOrEqual(SEMANTIC_EXCLUDE_THRESHOLD);
  });

  it('fails at exact threshold boundary', async () => {
    const embedder = createMockEmbedder(0.7); // Exactly at threshold
    const result = await validateExcludeSemantic('output text', 'excluded value', embedder);

    expect(result.passed).toBe(false);
  });

  it('includes similarity score in evidence', async () => {
    const embedder = createMockEmbedder(0.5);
    const result = await validateExcludeSemantic('output text', 'excluded value', embedder);

    expect(result.evidence?.similarity).toBeDefined();
    expect(typeof result.evidence?.similarity).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateConstraintsExactOnly Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('validateConstraintsExactOnly', () => {
  describe('REQUIRE exact match', () => {
    it('passes when required string is present', () => {
      const constraints = [createRequireConstraint('dark mode')];
      const result = validateConstraintsExactOnly('I prefer dark mode', constraints);

      expect(result.allPassed).toBe(true);
      expect(result.passedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('fails when required string is missing', () => {
      const constraints = [createRequireConstraint('dark mode')];
      const result = validateConstraintsExactOnly('I prefer light mode', constraints);

      expect(result.allPassed).toBe(false);
      expect(result.passedCount).toBe(0);
      expect(result.failedCount).toBe(1);
    });

    it('is case-insensitive', () => {
      const constraints = [createRequireConstraint('DARK MODE')];
      const result = validateConstraintsExactOnly('I prefer dark mode', constraints);

      expect(result.allPassed).toBe(true);
    });

    it('finds partial matches', () => {
      const constraints = [createRequireConstraint('dark')];
      const result = validateConstraintsExactOnly('The darkness is beautiful', constraints);

      expect(result.allPassed).toBe(true);
    });
  });

  describe('EXCLUDE exact match', () => {
    it('passes when excluded string is absent', () => {
      const constraints = [createExcludeConstraint('competitor')];
      const result = validateConstraintsExactOnly('Our product is great', constraints);

      expect(result.allPassed).toBe(true);
      expect(result.passedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('fails when excluded string is present', () => {
      const constraints = [createExcludeConstraint('competitor')];
      const result = validateConstraintsExactOnly('Our competitor is also good', constraints);

      expect(result.allPassed).toBe(false);
      expect(result.passedCount).toBe(0);
      expect(result.failedCount).toBe(1);
    });

    it('is case-insensitive', () => {
      const constraints = [createExcludeConstraint('COMPETITOR')];
      const result = validateConstraintsExactOnly('Our competitor is good', constraints);

      expect(result.allPassed).toBe(false);
    });
  });

  describe('multiple constraints', () => {
    it('validates all and returns correct counts', () => {
      const constraints = [
        createRequireConstraint('feature A', 'exact', 'cst_1'),
        createRequireConstraint('feature B', 'exact', 'cst_2'),
        createExcludeConstraint('bug', 'exact', 'cst_3'),
      ];
      const result = validateConstraintsExactOnly(
        'We have feature A and feature B with no issues',
        constraints
      );

      expect(result.allPassed).toBe(true);
      expect(result.passedCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.assertions).toHaveLength(3);
    });

    it('reports partial failures correctly', () => {
      const constraints = [
        createRequireConstraint('feature A', 'exact', 'cst_1'),
        createRequireConstraint('feature B', 'exact', 'cst_2'),
        createExcludeConstraint('bug', 'exact', 'cst_3'),
      ];
      const result = validateConstraintsExactOnly('We have feature A but found a bug', constraints);

      expect(result.allPassed).toBe(false);
      expect(result.passedCount).toBe(1); // Only feature A passes
      expect(result.failedCount).toBe(2); // feature B missing, bug present
    });

    it('handles empty constraints array', () => {
      const result = validateConstraintsExactOnly('Any output', []);

      expect(result.allPassed).toBe(true);
      expect(result.passedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.assertions).toHaveLength(0);
    });
  });

  describe('assertion IDs', () => {
    it('generates unique IDs with ast_ prefix', () => {
      const constraints = [
        createRequireConstraint('value1', 'exact', 'cst_1'),
        createRequireConstraint('value2', 'exact', 'cst_2'),
      ];
      const result = validateConstraintsExactOnly('value1 and value2', constraints);

      expect(result.assertions[0].id).toMatch(/^ast_/);
      expect(result.assertions[1].id).toMatch(/^ast_/);
      expect(result.assertions[0].id).not.toBe(result.assertions[1].id);
    });

    it('links assertion to constraint via constraint_id', () => {
      const constraints = [createRequireConstraint('value', 'exact', 'cst_abc123')];
      const result = validateConstraintsExactOnly('has value', constraints);

      expect(result.assertions[0].constraint_id).toBe('cst_abc123');
    });
  });

  describe('semantic matching', () => {
    it('returns error when using semantic constraints in exact-only mode', () => {
      const constraints = [createRequireConstraint('semantic value', 'semantic')];
      const result = validateConstraintsExactOnly('output text', constraints);

      expect(result.allPassed).toBe(false);
      expect(result.failedCount).toBe(1);
      expect(result.assertions[0].passed).toBe(false);
      expect(result.assertions[0].details).toContain('embedder');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateConstraints (async) Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('validateConstraints (async)', () => {
  it('handles exact constraints without embedder', async () => {
    const constraints = [createRequireConstraint('dark mode', 'exact')];
    const result = await validateConstraints({
      output: 'I prefer dark mode',
      constraints,
    });

    expect(result.allPassed).toBe(true);
    expect(result.passedCount).toBe(1);
  });

  it('returns error for semantic constraints without embedder', async () => {
    const constraints = [createRequireConstraint('semantic value', 'semantic')];
    const result = await validateConstraints({
      output: 'output text',
      constraints,
    });

    expect(result.allPassed).toBe(false);
    expect(result.assertions[0].passed).toBe(false);
    expect(result.assertions[0].details).toContain('embedder');
  });

  it('handles semantic REQUIRE constraint with embedder', async () => {
    const embedder = createMockEmbedder(0.9);
    const constraints = [createRequireConstraint('semantic value', 'semantic')];
    const result = await validateConstraints({
      output: 'output text',
      constraints,
      embedder,
    });

    expect(result.allPassed).toBe(true);
    expect(embedder.encode).toHaveBeenCalled();
  });

  it('handles semantic EXCLUDE constraint with embedder', async () => {
    const embedder = createMockEmbedder(0.5); // Below threshold = pass
    const constraints = [createExcludeConstraint('excluded value', 'semantic')];
    const result = await validateConstraints({
      output: 'output text',
      constraints,
      embedder,
    });

    expect(result.allPassed).toBe(true);
  });

  it('handles mixed exact and semantic constraints', async () => {
    const embedder = createMockEmbedder(0.9);
    const constraints = [
      createRequireConstraint('exact value', 'exact', 'cst_1'),
      createRequireConstraint('semantic value', 'semantic', 'cst_2'),
      createExcludeConstraint('forbidden', 'exact', 'cst_3'),
    ];
    const result = await validateConstraints({
      output: 'This has exact value and is good',
      constraints,
      embedder,
    });

    expect(result.passedCount).toBe(3);
    expect(result.allPassed).toBe(true);
  });

  it('correctly counts mixed pass/fail results', async () => {
    const embedder = createMockEmbedder(0.5); // Low similarity
    const constraints = [
      createRequireConstraint('present', 'exact', 'cst_1'), // Pass
      createRequireConstraint('missing', 'exact', 'cst_2'), // Fail
      createRequireConstraint('semantic', 'semantic', 'cst_3'), // Fail (low sim)
      createExcludeConstraint('absent', 'exact', 'cst_4'), // Pass
    ];
    const result = await validateConstraints({
      output: 'This text has present but not the other',
      constraints,
      embedder,
    });

    expect(result.passedCount).toBe(2);
    expect(result.failedCount).toBe(2);
    expect(result.allPassed).toBe(false);
  });

  it('generates assertions with correct structure', async () => {
    const constraints = [createRequireConstraint('test', 'exact', 'cst_test')];
    const result = await validateConstraints({
      output: 'test output',
      constraints,
    });

    const assertion = result.assertions[0];
    expect(assertion).toHaveProperty('id');
    expect(assertion).toHaveProperty('constraint_id', 'cst_test');
    expect(assertion).toHaveProperty('passed', true);
    expect(assertion).toHaveProperty('details');
    expect(assertion.id).toMatch(/^ast_/);
  });
});
