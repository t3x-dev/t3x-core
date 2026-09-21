// @vitest-environment jsdom

import type { SemanticContent, SlotDiff, TreeDiff } from '@t3x-dev/core';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DiffYAMLSplitView } from '@/components/diff/DiffYAMLSplitView';
import { DiffYAMLUnifiedView } from '@/components/diff/DiffYAMLUnifiedView';
import { buildAlignedNodes } from '@/components/diff/DiffYAMLUtils';

function diffFor(slot: SlotDiff): TreeDiff {
  return {
    identical: [],
    modified: [{ path: 'note', slotDiffs: [slot] }],
    onlyInSource: [],
    onlyInTarget: [],
    relationsAdded: [],
    relationsRemoved: [],
  };
}
function content(text: string): SemanticContent {
  return { trees: [{ key: 'note', slots: { text }, children: [] }], relations: [] };
}
function changed(oldValue: string, newValue: string): SlotDiff {
  return { key: 'text', type: 'changed', oldValue, newValue };
}
function highlight(slot: SlotDiff) {
  return buildAlignedNodes(diffFor(slot))[0].slotDiffs![0];
}

afterEach(cleanup);

describe('YAML review word highlights', () => {
  it('enriches API-shaped slots without mutating them, including short strings', () => {
    const slot = Object.freeze(changed('hello world', 'hello friend'));
    expect(highlight(slot).wordDiff).toEqual([
      { type: 'unchanged', text: 'hello' },
      { type: 'removed', text: 'world' },
      { type: 'added', text: 'friend' },
    ]);
    expect(slot.wordDiff).toBeUndefined();
  });

  it('preserves supplied highlights', () => {
    const slot = { ...changed('hello world', 'hello friend'), wordDiff: [] };
    expect(highlight(slot)).toBe(slot);
  });

  it.each([
    ['', 'hello'],
    ['hello', ''],
    ['same', 'same'],
    ['cat', 'dog'],
    ['hello\nworld', 'hello\nfriend'],
    ['hello  world', 'hello friend'],
    [' hello world', 'hello friend'],
    ['hello\tworld', 'hello friend'],
    [`shared ${'a'.repeat(20_001)}`, 'shared b'],
    [`shared ${Array(501).fill('old').join(' ')}`, `shared ${Array(501).fill('new').join(' ')}`],
  ])('falls back without altering values: case %#', (oldValue, newValue) => {
    const slot = changed(oldValue, newValue);
    expect(highlight(slot)).toBe(slot);
  });

  it('leaves non-string and added/removed slots alone', () => {
    for (const slot of [
      { key: 'text', type: 'changed', oldValue: 1, newValue: 2 },
      { key: 'text', type: 'added', newValue: 'hello friend' },
      { key: 'text', type: 'removed', oldValue: 'hello world' },
    ] satisfies SlotDiff[])
      expect(highlight(slot)).toBe(slot);
  });

  for (const [name, View] of [
    ['split', DiffYAMLSplitView],
    ['unified', DiffYAMLUnifiedView],
  ] as const) {
    it(`${name} shows only the correct words on each side, with spaces intact`, () => {
      const oldValue = 'hello old world';
      const newValue = 'hello new world';
      const { container } = render(
        <View
          diff={diffFor(changed(oldValue, newValue))}
          sourceContent={content(oldValue)}
          targetContent={content(newValue)}
          activeNodeId={null}
          onSelectNode={() => {}}
          showIdentical={false}
        />
      );
      const removed = container.querySelector('[class*="bg-[var(--dy-removed-word)]"]')!;
      const added = container.querySelector('[class*="bg-[var(--dy-added-word)]"]')!;
      expect(removed.textContent?.trim()).toBe('old');
      expect(added.textContent?.trim()).toBe('new');
      expect(removed.parentElement!.textContent).toContain(oldValue);
      expect(removed.parentElement!.textContent).not.toContain(newValue);
      expect(added.parentElement!.textContent).toContain(newValue);
      expect(added.parentElement!.textContent).not.toContain(oldValue);
    });
  }
});
