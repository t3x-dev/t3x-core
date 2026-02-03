/**
 * Hash Utilities Tests
 *
 * Tests for text canonicalization and SHA-256 hashing.
 * Verifies deterministic hash generation.
 */

import { describe, expect, it } from 'vitest';
import { canonText, computeCommitV3Hash, hashText, sha256 } from '../../common';
import type { CommitV3 } from '../../types';

describe('canonText', () => {
  it('normalizes to lowercase', () => {
    expect(canonText('HELLO WORLD')).toBe('hello world');
  });

  it('trims whitespace', () => {
    expect(canonText('  hello  ')).toBe('hello');
  });

  it('collapses multiple spaces', () => {
    expect(canonText('hello    world')).toBe('hello world');
  });

  it('normalizes unicode (NFKC)', () => {
    // ﬁ (ligature) → fi
    expect(canonText('ﬁle')).toBe('file');
  });

  it('handles empty string', () => {
    expect(canonText('')).toBe('');
  });

  it('handles only whitespace', () => {
    expect(canonText('   ')).toBe('');
  });

  it('normalizes newlines and tabs', () => {
    expect(canonText('hello\n\tworld')).toBe('hello world');
  });
});

describe('sha256', () => {
  it('hashes string correctly', () => {
    const hash = sha256('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('hashes object via JSON canonicalization', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 };

    // Same object, different key order → same hash
    expect(sha256(obj1)).toBe(sha256(obj2));
  });

  it('produces different hashes for different objects', () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };

    expect(sha256(obj1)).not.toBe(sha256(obj2));
  });

  it('handles nested objects', () => {
    const nested = { outer: { inner: 'value' } };
    const hash = sha256(nested);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles arrays', () => {
    const arr = [1, 2, 3];
    const hash = sha256(arr);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('hashText', () => {
  it('canonicalizes before hashing', () => {
    // These should produce the same hash due to canonicalization
    expect(hashText('Hello World')).toBe(hashText('hello world'));
    expect(hashText('  hello  world  ')).toBe(hashText('hello world'));
  });

  it('produces deterministic hashes', () => {
    const text = 'Test message for hashing';
    const hash1 = hashText(text);
    const hash2 = hashText(text);

    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different text', () => {
    expect(hashText('hello')).not.toBe(hashText('world'));
  });
});

describe('Hash Determinism', () => {
  it('same input always produces same hash (strings)', () => {
    const inputs = [
      'The quick brown fox',
      'jumps over the lazy dog',
      '日本語テスト',
      '🎉 emoji test 🎉',
    ];

    for (const input of inputs) {
      const hash1 = hashText(input);
      const hash2 = hashText(input);
      const hash3 = hashText(input);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    }
  });

  it('same input always produces same hash (objects)', () => {
    const obj = {
      project_id: 'proj_123',
      content: 'Test content',
      metadata: { tags: ['a', 'b'] },
    };

    const hash1 = sha256(obj);
    const hash2 = sha256(obj);
    const hash3 = sha256(obj);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });
});

describe('computeCommitV3Hash', () => {
  const baseCommit: Omit<CommitV3, 'hash'> = {
    schema: 'commit/v3',
    parents: [],
    author: { name: 'Alice' },
    committed_at: '2025-01-10T00:00:00Z',
    content: {
      sentences: [],
      constraints: [],
    },
  };

  it('returns hash with sha256: prefix', () => {
    const hash = computeCommitV3Hash(baseCommit);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces deterministic hash for same input', () => {
    const hash1 = computeCommitV3Hash(baseCommit);
    const hash2 = computeCommitV3Hash(baseCommit);
    const hash3 = computeCommitV3Hash(baseCommit);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  describe('second-class fields do NOT affect hash', () => {
    it('ignores message field', () => {
      const hash1 = computeCommitV3Hash({ ...baseCommit, message: 'msg1' });
      const hash2 = computeCommitV3Hash({ ...baseCommit, message: 'msg2' });
      const hash3 = computeCommitV3Hash({ ...baseCommit, message: undefined });

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('ignores project_id field', () => {
      const hash1 = computeCommitV3Hash({ ...baseCommit, project_id: 'proj_1' });
      const hash2 = computeCommitV3Hash({ ...baseCommit, project_id: 'proj_2' });
      const hash3 = computeCommitV3Hash({ ...baseCommit, project_id: undefined });

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('ignores branch field', () => {
      const hash1 = computeCommitV3Hash({ ...baseCommit, branch: 'main' });
      const hash2 = computeCommitV3Hash({ ...baseCommit, branch: 'feature' });
      const hash3 = computeCommitV3Hash({ ...baseCommit, branch: undefined });

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe('first-class fields DO affect hash', () => {
    it('different parents produce different hash', () => {
      const hash1 = computeCommitV3Hash({ ...baseCommit, parents: [] });
      const hash2 = computeCommitV3Hash({ ...baseCommit, parents: ['sha256:abc'] });

      expect(hash1).not.toBe(hash2);
    });

    it('different author produces different hash', () => {
      const hash1 = computeCommitV3Hash({ ...baseCommit, author: { name: 'Alice' } });
      const hash2 = computeCommitV3Hash({ ...baseCommit, author: { name: 'Bob' } });

      expect(hash1).not.toBe(hash2);
    });

    it('different committed_at produces different hash', () => {
      const hash1 = computeCommitV3Hash({ ...baseCommit, committed_at: '2025-01-10T00:00:00Z' });
      const hash2 = computeCommitV3Hash({ ...baseCommit, committed_at: '2025-01-11T00:00:00Z' });

      expect(hash1).not.toBe(hash2);
    });

    it('different content.sentences produces different hash', () => {
      const hash1 = computeCommitV3Hash({
        ...baseCommit,
        content: { sentences: [], constraints: [] },
      });
      const hash2 = computeCommitV3Hash({
        ...baseCommit,
        content: {
          sentences: [
            {
              id: 's1',
              text: 'Hello',
              source: { turn_hash: 'sha256:abc', start_char: 0, end_char: 5 },
            },
          ],
          constraints: [],
        },
      });

      expect(hash1).not.toBe(hash2);
    });

    it('different content.constraints produces different hash', () => {
      const hash1 = computeCommitV3Hash({
        ...baseCommit,
        content: { sentences: [], constraints: [] },
      });
      const hash2 = computeCommitV3Hash({
        ...baseCommit,
        content: {
          sentences: [],
          constraints: [
            {
              type: 'require',
              id: 'c1',
              value: 'test',
              match: 'exact',
            },
          ],
        },
      });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('constraints normalization', () => {
    it('undefined constraints equals empty array', () => {
      const withUndefined = computeCommitV3Hash({
        ...baseCommit,
        content: { sentences: [], constraints: undefined },
      });
      const withEmpty = computeCommitV3Hash({
        ...baseCommit,
        content: { sentences: [], constraints: [] },
      });

      expect(withUndefined).toBe(withEmpty);
    });
  });

  describe('author optional fields normalization', () => {
    it('author with undefined optional fields equals author without them', () => {
      const hash1 = computeCommitV3Hash({
        ...baseCommit,
        author: { name: 'Alice' },
      });
      const hash2 = computeCommitV3Hash({
        ...baseCommit,
        author: { name: 'Alice', identity: undefined, verification: undefined },
      });

      expect(hash1).toBe(hash2);
    });
  });
});
