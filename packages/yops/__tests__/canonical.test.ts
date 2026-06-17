import { describe, expect, it } from 'vitest';
import { canonicalJson, canonicalKey, compareCodepoints, compareYValues } from '../src/canonical';

describe('compareCodepoints', () => {
  it('orders BMP strings by codepoint', () => {
    expect(compareCodepoints('a', 'b')).toBeLessThan(0);
    expect(compareCodepoints('b', 'a')).toBeGreaterThan(0);
    expect(compareCodepoints('a', 'a')).toBe(0);
  });

  it('orders non-BMP characters above BMP characters (codepoint, not UTF-16)', () => {
    // U+E000 (private use area, BMP)        → codepoint 57344
    // U+1F600 GRINNING FACE (non-BMP)       → codepoint 128512
    //   encoded as surrogate pair 😀 (high surrogate 55357)
    //
    // In UTF-16 code-unit order — JS's default — the high surrogate
    // 55357 sorts BEFORE U+E000 (57344), so '😀' < ''. Codepoint
    // order is the opposite: 57344 < 128512, so '' < '😀'.
    const bmp = '';
    const nonBmp = '\u{1F600}';

    expect(compareCodepoints(bmp, nonBmp)).toBeLessThan(0);

    // Sanity-check that JS `<` does the wrong thing on the same pair.
    expect(bmp < nonBmp).toBe(false);
    expect(nonBmp < bmp).toBe(true);
  });

  it('treats a prefix as smaller than its extension', () => {
    expect(compareCodepoints('foo', 'foobar')).toBeLessThan(0);
    expect(compareCodepoints('foobar', 'foo')).toBeGreaterThan(0);
  });
});

describe('canonicalKey', () => {
  it('sorts mapping keys by codepoint, not by UTF-16 code unit', () => {
    const bmp = '';
    const nonBmp = '\u{1F600}';
    const obj = { [nonBmp]: 1, [bmp]: 2 };

    // Codepoint order puts bmp first; UTF-16 code-unit order would put
    // nonBmp first.
    const encoded = canonicalKey(obj);
    const bmpIdx = encoded.indexOf(JSON.stringify(bmp));
    const nonBmpIdx = encoded.indexOf(JSON.stringify(nonBmp));
    expect(bmpIdx).toBeGreaterThan(-1);
    expect(nonBmpIdx).toBeGreaterThan(-1);
    expect(bmpIdx).toBeLessThan(nonBmpIdx);
  });

  it('produces equal keys for two mappings with different insertion order', () => {
    expect(canonicalKey({ a: 1, b: 2 })).toBe(canonicalKey({ b: 2, a: 1 }));
  });
});

describe('canonicalJson', () => {
  it('serializes mappings with keys sorted by Unicode codepoint', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('serializes nested JSON-compatible values into the YOPS audit form', () => {
    expect(
      canonicalJson({
        z: [true, null, 'text'],
        a: { b: 2, a: 1 },
      })
    ).toBe('{"a":{"a":1,"b":2},"z":[true,null,"text"]}');
  });
});

describe('compareYValues', () => {
  it('uses codepoint order for strings', () => {
    expect(compareYValues('', '\u{1F600}')).toBeLessThan(0);
  });

  it('keeps the spec type rank null < bool < number < string < array < mapping', () => {
    expect(compareYValues(null, false)).toBeLessThan(0);
    expect(compareYValues(false, 1)).toBeLessThan(0);
    expect(compareYValues(1, 'a')).toBeLessThan(0);
    expect(compareYValues('z', [])).toBeLessThan(0);
    expect(compareYValues([], {})).toBeLessThan(0);
  });
});
