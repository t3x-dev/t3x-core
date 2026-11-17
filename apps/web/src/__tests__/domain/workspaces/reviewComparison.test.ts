import { describe, expect, it } from 'vitest';
import { reviewComparisonRows } from '@/domain/workspaces/reviewComparison';

describe('reviewComparisonRows', () => {
  it('aligns exact values and keeps new children beside their parent', () => {
    const rows = reviewComparisonRows(
      { group: { changed: false, removed: null }, sibling: 0 },
      { group: { changed: true, added: '' }, sibling: 0 }
    );
    expect(rows.map((row) => [row.node.path, row.kind])).toEqual([
      ['group', 'changed'],
      ['group/changed', 'changed'],
      ['group/removed', 'removed'],
      ['group/added', 'added'],
      ['sibling', 'unchanged'],
    ]);
    expect(rows[2].before?.value).toBeNull();
    expect(rows[2].after).toBeUndefined();
    expect(rows[3].after?.value).toBe('');
  });

  it('ignores object key order and preserves stable semantic tree and relation paths', () => {
    expect(
      reviewComparisonRows({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } }).every(
        (row) => row.kind === 'unchanged'
      )
    ).toBe(true);
    const content = (title: string, relations: unknown[]) => ({
      domain: 't3x.dev/semantic-content',
      content: { trees: [{ key: 'doc', slots: { title }, children: [] }], relations },
    });
    const rows = reviewComparisonRows(
      content('Old', []),
      content('New', [{ from: 'doc', to: 'ref' }])
    );
    expect(rows.find((row) => row.node.path === 'content/trees/[key=doc]/slots/title')?.kind).toBe(
      'changed'
    );
    expect(rows.find((row) => row.node.path === 'content/relations')?.kind).toBe('changed');
  });
});
