/**
 * CommitV4 Hash Tests
 *
 * Tests for V4 hash computation.
 * Key difference from V3: NO constraints in content!
 */

import { describe, expect, it } from 'vitest';
import { type CommitV4FirstClass, computeCommitV4Hash } from '../../storage/hash-v4';

describe('computeCommitV4Hash', () => {
  const baseCommit: CommitV4FirstClass = {
    schema: 't3x/commit/v4',
    parents: [],
    author: { type: 'human', name: 'Alice' },
    committed_at: '2025-01-10T00:00:00Z',
    content: {
      sentences: [],
    },
  };

  it('returns hash with sha256: prefix', () => {
    const hash = computeCommitV4Hash(baseCommit);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces deterministic hash for same input', () => {
    const hash1 = computeCommitV4Hash(baseCommit);
    const hash2 = computeCommitV4Hash(baseCommit);
    const hash3 = computeCommitV4Hash(baseCommit);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  describe('first-class fields DO affect hash', () => {
    it('different parents produce different hash', () => {
      const hash1 = computeCommitV4Hash({ ...baseCommit, parents: [] });
      const hash2 = computeCommitV4Hash({ ...baseCommit, parents: ['sha256:abc'] });

      expect(hash1).not.toBe(hash2);
    });

    it('different author produces different hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        author: { type: 'human', name: 'Alice' },
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        author: { type: 'human', name: 'Bob' },
      });

      expect(hash1).not.toBe(hash2);
    });

    it('different author type produces different hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        author: { type: 'human', name: 'Agent-1' },
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        author: { type: 'agent', name: 'Agent-1' },
      });

      expect(hash1).not.toBe(hash2);
    });

    it('different committed_at produces different hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        committed_at: '2025-01-10T00:00:00Z',
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        committed_at: '2025-01-11T00:00:00Z',
      });

      expect(hash1).not.toBe(hash2);
    });

    it('different content.sentences produces different hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        content: { sentences: [] },
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [
            {
              id: 's_abc123456789',
              text: 'Hello',
            },
          ],
        },
      });

      expect(hash1).not.toBe(hash2);
    });

    it('different sentence text produces different hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [{ id: 's_abc123456789', text: 'Hello' }],
        },
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [{ id: 's_abc123456789', text: 'World' }],
        },
      });

      expect(hash1).not.toBe(hash2);
    });

    it('different sentence id produces different hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [{ id: 's_abc123456789', text: 'Hello' }],
        },
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [{ id: 's_def987654321', text: 'Hello' }],
        },
      });

      expect(hash1).not.toBe(hash2);
    });

    it('sentence order affects hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [
            { id: 's_1', text: 'First' },
            { id: 's_2', text: 'Second' },
          ],
        },
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [
            { id: 's_2', text: 'Second' },
            { id: 's_1', text: 'First' },
          ],
        },
      });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('key difference from V3: NO constraints in hash', () => {
    it('content only contains sentences (no constraints field)', () => {
      // This test verifies the type system - V4 content has no constraints
      const commit: CommitV4FirstClass = {
        ...baseCommit,
        content: {
          sentences: [{ id: 's_1', text: 'Test' }],
          // Note: TypeScript would error if we added constraints here
        },
      };

      const hash = computeCommitV4Hash(commit);
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });

  describe('sentence optional fields', () => {
    it('sentence with confidence affects hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [{ id: 's_1', text: 'Test' }],
        },
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [{ id: 's_1', text: 'Test', confidence: 0.9 }],
        },
      });

      expect(hash1).not.toBe(hash2);
    });

    it('sentence with source_ref affects hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [{ id: 's_1', text: 'Test' }],
        },
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [
            {
              id: 's_1',
              text: 'Test',
              source_ref: {
                conversation_id: 'conv_1',
                turn_hash: 'sha256:abc',
                start_char: 0,
                end_char: 4,
              },
            },
          ],
        },
      });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('author optional fields', () => {
    it('author with id affects hash', () => {
      const hash1 = computeCommitV4Hash({
        ...baseCommit,
        author: { type: 'human' },
      });
      const hash2 = computeCommitV4Hash({
        ...baseCommit,
        author: { type: 'human', id: 'user_123' },
      });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('multiple sentences', () => {
    it('handles multiple sentences correctly', () => {
      const commit: CommitV4FirstClass = {
        ...baseCommit,
        content: {
          sentences: [
            { id: 's_1', text: 'We want to visit Tokyo.' },
            { id: 's_2', text: 'Budget is $3000.' },
            { id: 's_3', text: 'Prefer spring season.' },
          ],
        },
      };

      const hash = computeCommitV4Hash(commit);
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);

      // Verify determinism
      expect(computeCommitV4Hash(commit)).toBe(hash);
    });
  });

  describe('edge cases', () => {
    it('handles empty sentences array', () => {
      const hash = computeCommitV4Hash({
        ...baseCommit,
        content: { sentences: [] },
      });

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('handles empty parents array', () => {
      const hash = computeCommitV4Hash({
        ...baseCommit,
        parents: [],
      });

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('handles sentence with unicode text', () => {
      const hash = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [
            { id: 's_1', text: '日本語テスト' },
            { id: 's_2', text: '🎉 emoji test 🎉' },
          ],
        },
      });

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('handles sentence with long text', () => {
      const longText = 'A'.repeat(10000);
      const hash = computeCommitV4Hash({
        ...baseCommit,
        content: {
          sentences: [{ id: 's_1', text: longText }],
        },
      });

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });
});
