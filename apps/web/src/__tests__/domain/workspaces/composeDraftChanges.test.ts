import { describe, expect, it } from 'vitest';
import {
  composeCardsAtPath,
  composeDraftChangeCards,
  composeDraftValueAtPath,
} from '@/domain/workspaces/composeDraftChanges';

const path = 'content/trees/[key=product]';
const before = {
  key: 'product',
  slots: { title: 'Old title', priority: 'could', enabled: false },
  children: [],
};
const after = { ...before, slots: { title: 'New title', priority: 'should', enabled: false } };

describe('All draft changes projection', () => {
  it('keeps a newly added or removed node together, including its child nodes', () => {
    const node = { ...after, children: [before] };
    const cards = [
      { nodeId: 'new', path, after: node },
      { nodeId: 'removed', path: 'old', before: node },
    ];
    expect(composeDraftChangeCards(cards)).toEqual(cards);
  });

  it('exposes every changed field while preserving typed values, owner and structural order', () => {
    const cards = composeDraftChangeCards([{ nodeId: 'owner', path, before, after }]);
    expect(cards.map((card) => [card.path, card.before, card.after])).toEqual([
      [`${path}/slots/title`, 'Old title', 'New title'],
      [`${path}/slots/priority`, 'could', 'should'],
    ]);
    expect(cards.every((card) => card.nodeId === 'owner')).toBe(true);
    expect(composeDraftChangeCards([{ nodeId: 'owner', path, before, after: before }])).toEqual([]);
  });

  it('handles false, zero, null, removed fields and ordinary arrays without making arrays editable', () => {
    const cards = composeDraftChangeCards([
      {
        nodeId: 'settings',
        path: 'settings',
        before: { enabled: false, count: 0, note: null, gone: 'old', tags: ['a'] },
        after: { enabled: true, count: 1, note: '', tags: ['a', 'b'] },
      },
    ]);
    expect(cards.map(({ before, after }) => [before, after])).toEqual([
      [false, true],
      [0, 1],
      [null, ''],
      ['old', undefined],
      [['a'], ['a', 'b']],
    ]);
  });

  it('keeps named-node ordering and reports list reordering instead of losing the change', () => {
    const first = { key: 'z', slots: { priority: 1 }, children: [] };
    const second = { key: 'a', slots: { priority: 2 }, children: [] };
    const reordered = {
      nodeId: 'list',
      path: 'nodes',
      before: [first, second],
      after: [second, first],
    };
    expect(composeDraftChangeCards([reordered])).toEqual([reordered]);
    const cards = composeDraftChangeCards([
      { ...reordered, after: [first, { ...second, slots: { priority: 3 } }] },
    ]);
    expect(cards.map((card) => card.path)).toEqual(['nodes/[key=a]/slots/priority']);
  });

  it('projects the exact field from older whole-node actions, excluding untouched siblings', () => {
    const cards = [{ nodeId: 'owner', path, before, after }];
    expect(composeCardsAtPath(cards, `${path}/slots/priority`)).toEqual([
      expect.objectContaining({ nodeId: 'owner', before: 'could', after: 'should' }),
    ]);
    expect(composeCardsAtPath(cards, `${path}/slots/enabled`)).toEqual([]);
    expect(
      composeCardsAtPath([{ nodeId: 'owner', path, after }], `${path}/slots/enabled`)[0].after
    ).toBe(false);
  });

  it('reads current fields from the actual draft after a value returns to Base, including quoted keys', () => {
    const document = { content: { trees: [{ ...before, slots: { ...before.slots, 'a/b': 0 } }] } };
    expect(composeDraftValueAtPath(document, `${path}/slots/title`)).toBe('Old title');
    expect(composeDraftValueAtPath(document, `${path}/slots/"a/b"`)).toBe(0);
    expect(composeDraftValueAtPath(document, `${path}/slots/missing`)).toBeUndefined();
  });
});
