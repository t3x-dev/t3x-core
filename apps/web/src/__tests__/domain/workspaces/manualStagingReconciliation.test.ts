import { expect, it } from 'vitest';
import { assertStagedEditsCurrent, stageDraftOps } from '@/domain/workspaces/manualStaging';

it('keeps ungrouped edits usable after unrelated branch updates and rejects overlapping updates', () => {
  const staged = stageDraftOps({ title: 'base', status: 'draft' }, [
    { set: { path: 'title', value: 'local' } },
  ]);
  expect(() =>
    assertStagedEditsCurrent({ title: 'base', status: 'live' }, staged.items)
  ).not.toThrow();
  expect(() => assertStagedEditsCurrent({ title: 'remote', status: 'live' }, staged.items)).toThrow(
    'title'
  );
  expect(staged.items[0].card.after).toBe('local');
});
