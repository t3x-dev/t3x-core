import { describe, expect, it } from 'vitest';
import {
  canonicalizeMultiValueScalar,
  canonicalizeMultiValueScalarsInRecord,
  canonicalizeYOp,
  canonicalizeYOps,
} from '../normalization';

describe('canonicalizeMultiValueScalar', () => {
  describe('positive cases (string → array)', () => {
    it('splits a comma-list scalar', () => {
      expect(canonicalizeMultiValueScalar('landscape, studio, fashion, commercial')).toEqual([
        'landscape',
        'studio',
        'fashion',
        'commercial',
      ]);
    });

    it('trims whitespace around each part', () => {
      expect(canonicalizeMultiValueScalar('a , b , c')).toEqual(['a', 'b', 'c']);
    });

    it('accepts the maximum allowed (12) parts', () => {
      const input = Array.from({ length: 12 }, (_, i) => `t${i + 1}`).join(', ');
      const out = canonicalizeMultiValueScalar(input);
      expect(Array.isArray(out) && (out as string[]).length).toBe(12);
    });

    it('accepts multi-word parts up to six words', () => {
      expect(canonicalizeMultiValueScalar('cropping power, image quality, fine textures')).toEqual([
        'cropping power',
        'image quality',
        'fine textures',
      ]);
    });
  });

  describe('negative cases (string stays scalar)', () => {
    it('rejects when no comma is present', () => {
      expect(canonicalizeMultiValueScalar('landscape')).toBe('landscape');
    });

    it('rejects prose with sentence punctuation', () => {
      expect(canonicalizeMultiValueScalar('Better for fast motion, but still has tradeoffs.')).toBe(
        'Better for fast motion, but still has tradeoffs.'
      );
    });

    it('rejects strings mentioning a year (release dates, model years)', () => {
      expect(
        canonicalizeMultiValueScalar('Released in 2022, with improved thermal management')
      ).toBe('Released in 2022, with improved thermal management');
    });

    it('rejects URLs', () => {
      expect(canonicalizeMultiValueScalar('https://example.com/a,b')).toBe(
        'https://example.com/a,b'
      );
    });

    it('rejects host-like fragments', () => {
      expect(canonicalizeMultiValueScalar('foo.bar/baz, qux')).toBe('foo.bar/baz, qux');
    });

    it('rejects ISO-like date strings', () => {
      expect(canonicalizeMultiValueScalar('2026-01-01, 2026-02-01')).toBe('2026-01-01, 2026-02-01');
    });

    it('rejects strings with month names', () => {
      expect(canonicalizeMultiValueScalar('May 1, 2026')).toBe('May 1, 2026');
    });

    it('rejects decimal numbers', () => {
      expect(canonicalizeMultiValueScalar('1.5, 2.5, 3.5')).toBe('1.5, 2.5, 3.5');
    });

    it('rejects numeric ranges', () => {
      expect(canonicalizeMultiValueScalar('100-200, 300-400')).toBe('100-200, 300-400');
    });

    it('rejects code-like tokens', () => {
      expect(canonicalizeMultiValueScalar('foo(), bar()')).toBe('foo(), bar()');
      expect(canonicalizeMultiValueScalar('a => b, c => d')).toBe('a => b, c => d');
    });

    it('rejects parts longer than 48 characters', () => {
      const longPart = 'a'.repeat(49);
      expect(canonicalizeMultiValueScalar(`${longPart}, b`)).toBe(`${longPart}, b`);
    });

    it('rejects parts with more than six words', () => {
      const sevenWords = 'one two three four five six seven';
      expect(canonicalizeMultiValueScalar(`${sevenWords}, b`)).toBe(`${sevenWords}, b`);
    });

    it('rejects when any segment is empty after trim', () => {
      expect(canonicalizeMultiValueScalar('a, , b')).toBe('a, , b');
      expect(canonicalizeMultiValueScalar('a,')).toBe('a,');
    });

    it('rejects more than 12 parts', () => {
      const input = Array.from({ length: 13 }, (_, i) => `t${i + 1}`).join(', ');
      expect(canonicalizeMultiValueScalar(input)).toBe(input);
    });
  });

  describe('non-string inputs pass through', () => {
    it('returns numbers unchanged', () => {
      expect(canonicalizeMultiValueScalar(42)).toBe(42);
    });

    it('returns booleans unchanged', () => {
      expect(canonicalizeMultiValueScalar(true)).toBe(true);
    });

    it('returns null unchanged', () => {
      expect(canonicalizeMultiValueScalar(null)).toBeNull();
    });

    it('returns arrays unchanged (idempotence guard)', () => {
      const arr = ['a', 'b', 'c'];
      expect(canonicalizeMultiValueScalar(arr)).toBe(arr);
    });

    it('returns nested objects unchanged', () => {
      const obj = { nested: 'value' };
      expect(canonicalizeMultiValueScalar(obj)).toBe(obj);
    });
  });
});

describe('canonicalizeMultiValueScalarsInRecord', () => {
  it('canonicalizes only the affected keys; non-list and non-string values pass through', () => {
    const out = canonicalizeMultiValueScalarsInRecord({
      primary_use_case: 'landscape, studio, fashion',
      resolution: '61 megapixels',
      year: 2022,
      tags: ['existing'],
    });
    expect(out).toEqual({
      primary_use_case: ['landscape', 'studio', 'fashion'],
      resolution: '61 megapixels',
      year: 2022,
      tags: ['existing'],
    });
  });
});

describe('canonicalizeYOp / canonicalizeYOps', () => {
  it('canonicalizes set.value when string fits the V1 rule', () => {
    const op = { set: { path: 'a/b', value: 'x, y, z' }, source: { type: 'human' } };
    const out = canonicalizeYOp(op);
    expect(out).toEqual({
      set: { path: 'a/b', value: ['x', 'y', 'z'] },
      source: { type: 'human' },
    });
    // Source metadata preserved.
    expect(out.source).toBe(op.source);
  });

  it('returns the same reference when nothing changes', () => {
    const op = { set: { path: 'a/b', value: 'single' } };
    expect(canonicalizeYOp(op)).toBe(op);
  });

  it('canonicalizes per-key inside populate.values', () => {
    const op = {
      populate: {
        path: 'cameras/r_series',
        values: {
          primary_use_case: 'landscape, studio, fashion',
          resolution: '61 megapixels',
        },
      },
    };
    const out = canonicalizeYOp(op);
    expect(out.populate).toEqual({
      path: 'cameras/r_series',
      values: {
        primary_use_case: ['landscape', 'studio', 'fashion'],
        resolution: '61 megapixels',
      },
    });
  });

  it('passes through ops it does not recognize (define, drop, …)', () => {
    const op = { define: { path: 'a/b' } };
    expect(canonicalizeYOp(op)).toBe(op);
  });

  it('canonicalizeYOps walks an array', () => {
    const ops = [
      { set: { path: 'a', value: 'x, y' } },
      { populate: { path: 'p', values: { tags: 'a, b, c' } } },
      { define: { path: 'c' } },
    ];
    const out = canonicalizeYOps(ops);
    expect(out[0]).toEqual({ set: { path: 'a', value: ['x', 'y'] } });
    expect(out[1]).toEqual({
      populate: { path: 'p', values: { tags: ['a', 'b', 'c'] } },
    });
    // Untouched op is referentially identical.
    expect(out[2]).toBe(ops[2]);
  });
});
