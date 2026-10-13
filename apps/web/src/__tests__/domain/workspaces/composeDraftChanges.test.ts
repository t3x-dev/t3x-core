import { describe, expect, it } from 'vitest';
import {
  composeCardsAtPath,
  composeDraftValueAtPath,
} from '@/domain/workspaces/composeDraftChanges';

const path = 'content/trees/[key=product]';
const before = {
  key: 'product',
  slots: { title: 'Old title', priority: 'could', enabled: false },
  children: [],
};
const after = { ...before, slots: { title: 'New title', priority: 'should', enabled: false } };

describe('Draft field path projection', () => {
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
