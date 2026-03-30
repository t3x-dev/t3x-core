import { describe, expect, test } from 'vitest';
import { deriveSourceTags } from '@/lib/sourceTag';
import type { YOp } from '@t3x-dev/core';

describe('deriveSourceTags', () => {
  const messages = [
    { role: 'user' as const },
    { role: 'assistant' as const },
    { role: 'user' as const },
    { role: 'assistant' as const },
  ];

  test('add op from user turn → user tag', () => {
    const delta: YOp[] = [
      { add: { parent: '', node: { key: 'budget' }, source: { budget: '$3000' }, from: 'T1' } },
    ];
    expect(deriveSourceTags(delta, messages).budget).toBe('user');
  });

  test('add op from assistant turn → llm tag', () => {
    const delta: YOp[] = [
      { add: { parent: '', node: { key: 'tips' }, source: { tip: 'use Suica' }, from: 'T2' } },
    ];
    expect(deriveSourceTags(delta, messages).tips).toBe('llm');
  });

  test('set ops from both → both tag', () => {
    const delta: YOp[] = [
      { add: { parent: '', node: { key: 'route' }, source: { cities: 'Tokyo' }, from: 'T1' } },
      { set: { path: 'route.details', value: 'Shinkansen', source: 'take Shinkansen', from: 'T2' } },
    ];
    expect(deriveSourceTags(delta, messages).route).toBe('both');
  });

  test('multiple nodes get independent tags', () => {
    const delta: YOp[] = [
      { add: { parent: '', node: { key: 'a' }, source: {}, from: 'T1' } },
      { add: { parent: '', node: { key: 'b' }, source: {}, from: 'T2' } },
    ];
    const tags = deriveSourceTags(delta, messages);
    expect(tags.a).toBe('user');
    expect(tags.b).toBe('llm');
  });

  test('set op path extracts root node key', () => {
    const delta: YOp[] = [
      { set: { path: 'budget.flights', value: 1000, source: '$1000 flights', from: 'T3' } },
    ];
    expect(deriveSourceTags(delta, messages).budget).toBe('user');
  });

  test('ops without from field are ignored', () => {
    const delta: YOp[] = [{ drop: { path: 'old_node' } }];
    expect(Object.keys(deriveSourceTags(delta, messages))).toHaveLength(0);
  });

  test('returns empty record for empty delta', () => {
    expect(deriveSourceTags([], messages)).toEqual({});
  });
});
