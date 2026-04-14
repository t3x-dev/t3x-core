import { describe, expect, test } from 'vitest';
import { deriveSourceTags } from '@/domain/format/sourceTag';
import type { YOp } from '@t3x-dev/core';

describe('deriveSourceTags', () => {
  const messages = [
    { role: 'user' as const },
    { role: 'assistant' as const },
    { role: 'user' as const },
    { role: 'assistant' as const },
  ];

  test('returns empty record for empty delta', () => {
    expect(deriveSourceTags([], messages)).toEqual({});
  });

  test('returns empty record for any ops (provenance tracking pending reimplementation)', () => {
    const delta: YOp[] = [
      { populate: { path: 'budget', values: { amount: '$3000' } } },
      { set: { path: 'route.details', value: 'Shinkansen' } },
      { drop: { path: 'old_node' } },
    ];
    expect(deriveSourceTags(delta, messages)).toEqual({});
  });
});
