// @vitest-environment jsdom

import type { SemanticContent, SlotDiff, TreeDiff } from '@t3x-dev/core';
import { cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DiffYAMLSplitView } from '@/components/diff/DiffYAMLSplitView';
import { DiffYAMLUnifiedView } from '@/components/diff/DiffYAMLUnifiedView';
import { buildAlignedNodes } from '@/components/diff/DiffYAMLUtils';
import { YAMLNodeRenderer } from '@/components/diff/YAMLNodeRenderer';

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
    expect(highlight(slot).highlight).toEqual([
      { type: 'unchanged', text: 'hello ' },
      { type: 'removed', text: 'world' },
      { type: 'added', text: 'friend' },
    ]);
    expect(slot.wordDiff).toBeUndefined();
  });

  it('enriches empty and legacy token arrays without changing the API payload', () => {
    for (const wordDiff of [[], [{ type: 'unchanged' as const, text: 'wrong' }]]) {
      const slot = Object.freeze({ ...changed('hello world', 'hello friend'), wordDiff });
      expect(highlight(slot).highlight?.length).toBeGreaterThan(0);
      expect(slot.wordDiff).toBe(wordDiff);
    }
  });

  it.each([
    ['same', 'same'],
    [`shared ${'a'.repeat(20_001)}`, 'shared b'],
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

  it('keeps unified logical line numbers stable under StrictMode', () => {
    const { container } = render(
      <StrictMode>
        <DiffYAMLUnifiedView
          diff={diffFor(changed('hello old', 'hello new'))}
          sourceContent={content('hello old')}
          targetContent={content('hello new')}
          activeNodeId={null}
          onSelectNode={() => {}}
          showIdentical={false}
        />
      </StrictMode>
    );
    const rows = [...container.querySelectorAll('.diff-yaml-line')];
    expect(rows.map((row) => [row.children[0].textContent, row.children[1].textContent])).toEqual([
      ['1', '1'],
      ['2', ''],
      ['', '2'],
    ]);
  });

  it('keeps the inline renderer as a combined diff, including empty API arrays', () => {
    const { container } = render(
      <YAMLNodeRenderer
        node={content('new\ntext').trees[0]}
        frameStatus="modified"
        startLine={1}
        slotDiffs={[{ ...changed('old\ntext', 'new\ntext'), wordDiff: [] }]}
      />
    );
    expect(container.querySelector('[data-review-value]')?.textContent).toBe('oldnew\ntext');
  });

  for (const [name, View] of [
    ['split', DiffYAMLSplitView],
    ['unified', DiffYAMLUnifiedView],
  ] as const) {
    it.each([
      ['Heading\n  hello\tworld\nlast', 'Heading\n  hello\tfriend\nextra\nlast'],
      ['Hello  world ', 'hello world\t'],
      ['', 'hello'],
      ['hello', ''],
      ['  \n', '\t\n'],
    ])(`${name} reconstructs exact displayed text: case %#`, (oldValue, newValue) => {
      const { container } = render(
        <View
          diff={diffFor({ ...changed(oldValue, newValue), wordDiff: [] })}
          sourceContent={content(oldValue)}
          targetContent={content(newValue)}
          activeNodeId={null}
          onSelectNode={() => {}}
          showIdentical={false}
        />
      );
      expect(
        [...container.querySelectorAll('[data-review-value]')].map((node) => node.textContent)
      ).toEqual([oldValue, newValue]);
    });

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
      expect(removed.closest('[data-review-value]')!.textContent).toContain(oldValue);
      expect(removed.closest('[data-review-value]')!.textContent).not.toContain(newValue);
      expect(added.closest('[data-review-value]')!.textContent).toContain(newValue);
      expect(added.closest('[data-review-value]')!.textContent).not.toContain(oldValue);
    });
  }
});
