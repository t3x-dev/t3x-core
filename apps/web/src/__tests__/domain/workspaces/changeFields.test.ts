import { describe, expect, it } from 'vitest';
import { fieldChangeCount, fieldChangeGroups } from '@/domain/workspaces/changeFields';

function semantic(trees: unknown[], relations: unknown[] = []) {
  return { domain: 'prd', version: 1, content: { trees, relations } };
}

describe('fieldChangeGroups', () => {
  it('groups semantic slot changes by the node that owns them', () => {
    const base = semantic([
      {
        key: 'candidate',
        slots: { title: 'Care', problem: 'Old problem' },
        children: [{ key: 'requirements', slots: { priority: 'should' } }],
      },
    ]);
    const current = semantic(
      [
        {
          key: 'candidate',
          slots: { title: 'Care', problem: 'New problem' },
          children: [
            { key: 'requirements', slots: { priority: 'should' } },
            { key: 'daily_check', slots: { title: 'Daily check', priority: 'must' } },
          ],
        },
      ],
      [{ from: 'a', to: 'b' }]
    );

    const groups = fieldChangeGroups(base, current);

    expect(groups).toEqual([
      {
        id: 'candidate',
        label: 'Care',
        breadcrumb: null,
        kind: 'changed',
        fields: [{ name: 'Problem', before: 'Old problem', after: 'New problem', kind: 'changed' }],
      },
      {
        id: 'candidate/daily_check',
        label: 'Daily check',
        breadcrumb: 'Candidate',
        kind: 'added',
        fields: [
          { name: 'Title', before: undefined, after: 'Daily check', kind: 'added' },
          { name: 'Priority', before: undefined, after: 'must', kind: 'added' },
        ],
      },
      {
        id: 'relations',
        label: 'Relations',
        breadcrumb: null,
        kind: 'added',
        fields: [{ name: 'Count', before: undefined, after: 1, kind: 'added' }],
      },
    ]);
    expect(fieldChangeCount(groups)).toBe(4);
  });

  it('reports removed nodes against the base document', () => {
    const groups = fieldChangeGroups(
      semantic([{ key: 'legacy', slots: { title: 'Legacy' } }]),
      semantic([])
    );

    expect(groups).toEqual([
      {
        id: 'legacy',
        label: 'Legacy',
        breadcrumb: null,
        kind: 'removed',
        fields: [{ name: 'Title', before: 'Legacy', after: undefined, kind: 'removed' }],
      },
    ]);
  });

  it('compares other documents by top-level key, ignoring the envelope', () => {
    const groups = fieldChangeGroups(
      { domain: 'config', version: 1, retries: 2 },
      { domain: 'config', version: 2, retries: 3, timeout: 10 }
    );

    expect(groups).toEqual([
      {
        id: 'document',
        label: 'Document',
        breadcrumb: null,
        kind: 'changed',
        fields: [
          { name: 'Retries', before: 2, after: 3, kind: 'changed' },
          { name: 'Timeout', before: undefined, after: 10, kind: 'added' },
        ],
      },
    ]);
  });
});
