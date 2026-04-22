import { describe, expect, it } from 'vitest';
import {
  closeUnbalancedBrackets,
  stripJsonComments,
  stripTrailingCommas,
  tryParseWithRepair,
} from '../../providers/llm/jsonRepair';

describe('stripJsonComments', () => {
  it('strips // line comments outside strings', () => {
    expect(stripJsonComments('{"a":1} // trailing note')).toBe('{"a":1} ');
    expect(stripJsonComments('{\n  // comment\n  "a":1\n}')).toBe('{\n  \n  "a":1\n}');
  });

  it('strips /* block comments */ outside strings', () => {
    expect(stripJsonComments('{"a":1 /* inline */, "b":2}')).toBe('{"a":1 , "b":2}');
  });

  it('preserves // and /* inside strings', () => {
    expect(stripJsonComments('{"url":"https://example.com"}')).toBe(
      '{"url":"https://example.com"}'
    );
    expect(stripJsonComments('{"note":"/* not a comment */"}')).toBe(
      '{"note":"/* not a comment */"}'
    );
  });

  it('handles escaped quotes inside strings', () => {
    expect(stripJsonComments('{"quote":"she said \\"hi\\""}')).toBe(
      '{"quote":"she said \\"hi\\""}'
    );
  });

  it('passes through JSON without comments unchanged', () => {
    const clean = '{"a":1,"b":[1,2,3]}';
    expect(stripJsonComments(clean)).toBe(clean);
  });
});

describe('stripTrailingCommas', () => {
  it('removes trailing commas before } and ]', () => {
    expect(stripTrailingCommas('{"a":1,}')).toBe('{"a":1}');
    expect(stripTrailingCommas('[1, 2, 3,]')).toBe('[1, 2, 3]');
  });

  it('handles whitespace between comma and closing bracket', () => {
    expect(stripTrailingCommas('{\n  "a":1,\n}')).toBe('{\n  "a":1\n}');
  });

  it('leaves legitimate commas alone', () => {
    expect(stripTrailingCommas('{"a":1,"b":2}')).toBe('{"a":1,"b":2}');
  });

  it('preserves commas inside strings', () => {
    expect(stripTrailingCommas('{"list":"a, b, c"}')).toBe('{"list":"a, b, c"}');
  });

  it('handles nested trailing commas', () => {
    expect(stripTrailingCommas('{"nested":[1,2,],}')).toBe('{"nested":[1,2]}');
  });
});

describe('closeUnbalancedBrackets', () => {
  it('closes an unclosed object', () => {
    expect(closeUnbalancedBrackets('{"a":1')).toBe('{"a":1}');
  });

  it('closes an unclosed array', () => {
    expect(closeUnbalancedBrackets('[1,2,3')).toBe('[1,2,3]');
  });

  it('closes nested unclosed structures', () => {
    expect(closeUnbalancedBrackets('{"a":{"b":[1')).toBe('{"a":{"b":[1]}}');
  });

  it('closes an unclosed string before the brackets', () => {
    expect(closeUnbalancedBrackets('{"note":"truncated')).toBe('{"note":"truncated"}');
  });

  it('passes through balanced JSON unchanged', () => {
    const balanced = '{"a":[1,2,{"b":3}]}';
    expect(closeUnbalancedBrackets(balanced)).toBe(balanced);
  });

  it('ignores brackets inside strings', () => {
    expect(closeUnbalancedBrackets('{"url":"[abc"}')).toBe('{"url":"[abc"}');
  });
});

describe('tryParseWithRepair', () => {
  it('parses valid JSON without repair', () => {
    const result = tryParseWithRepair('{"a":1}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ a: 1 });
    expect(result.repairsApplied).toEqual([]);
  });

  it('repairs trailing commas', () => {
    const result = tryParseWithRepair('{"a":1, "b":2,}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ a: 1, b: 2 });
    expect(result.repairsApplied).toContain('strip-trailing-commas');
  });

  it('repairs inline comments', () => {
    const result = tryParseWithRepair('{"a":1 /* note */, "b":2}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ a: 1, b: 2 });
    expect(result.repairsApplied).toContain('strip-comments');
  });

  it('repairs truncated JSON by closing brackets', () => {
    const result = tryParseWithRepair('{"items":[{"name":"first"}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ items: [{ name: 'first' }] });
    expect(result.repairsApplied).toContain('close-brackets');
  });

  it('composes repairs — comments + trailing comma + unclosed bracket', () => {
    const result = tryParseWithRepair(`{
  // this is a note
  "items": [1, 2, 3,],
  "trailing": true,
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ items: [1, 2, 3], trailing: true });
    expect(result.repairsApplied.length).toBeGreaterThan(0);
  });

  it('returns ok:false when no repair makes it parse', () => {
    const result = tryParseWithRepair('not even close to JSON');
    expect(result.ok).toBe(false);
  });
});
