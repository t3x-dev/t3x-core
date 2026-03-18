/**
 * Hash Utilities Tests
 *
 * Tests for text canonicalization and SHA-256 hashing.
 * Verifies deterministic hash generation.
 */

import { describe, expect, it } from 'vitest';
import { canonText, hashText, sha256 } from '../../common';

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
