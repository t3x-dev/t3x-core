import { describe, expect, it } from 'vitest';
import { composeTextDiff } from '@/domain/composePresentation';

describe('precise Compose text differences', () => {
  it('highlights both changed numbers without highlighting the intervening sentence', () => {
    const before = 'Below 18 degrees Celsius.; Alert at 18 degrees Celsius.';
    const after = 'Below 16 degrees Celsius.; Alert at 16 degrees Celsius.';
    const parts = composeTextDiff(before, after);
    expect(parts.filter((p) => p.kind === 'removed').map((p) => p.text)).toEqual(['18', '18']);
    expect(parts.filter((p) => p.kind === 'added').map((p) => p.text)).toEqual(['16', '16']);
    expect(
      parts
        .filter((p) => p.kind !== 'added')
        .map((p) => p.text)
        .join('')
    ).toBe(before);
    expect(
      parts
        .filter((p) => p.kind !== 'removed')
        .map((p) => p.text)
        .join('')
    ).toBe(after);
  });
  it.each([
    ['低于20度，持续5分钟', '低于18度，持续3分钟'],
    ['', 'new'],
    ['old', ''],
    ['same', 'same'],
  ])('preserves both sides exactly', (before, after) => {
    const parts = composeTextDiff(before, after);
    expect(
      parts
        .filter((p) => p.kind !== 'added')
        .map((p) => p.text)
        .join('')
    ).toBe(before);
    expect(
      parts
        .filter((p) => p.kind !== 'removed')
        .map((p) => p.text)
        .join('')
    ).toBe(after);
  });
});
