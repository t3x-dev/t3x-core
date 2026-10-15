import { describe, expect, it } from 'vitest';
import type { StructuredDiffChange } from '@/domain/diff/structuredStateDiff';
import { groupChangePreview, inlineTextDiff } from '@/domain/project/pullRequestChangePreview';

function change(
  path: string,
  kind: StructuredDiffChange['kind'],
  before: string,
  after: string
): StructuredDiffChange {
  return {
    afterValue: after,
    beforeValue: before,
    id: `${kind}:${path}`,
    kind,
    op: 'SET',
    path,
    reason: '',
    summary: '',
  };
}

describe('inlineTextDiff', () => {
  it('marks only the phrase that one side dropped', () => {
    expect(
      inlineTextDiff('目标不清、资料分散、练习缺少反馈、难以持续', '目标不清、资料分散、难以持续')
    ).toEqual([
      { kind: 'same', text: '目标不清、资料分散、' },
      { kind: 'removed', text: '练习缺少反馈、' },
      { kind: 'same', text: '难以持续' },
    ]);
  });
});

describe('groupChangePreview', () => {
  it('groups fields under their node and keeps a mixed node as changed', () => {
    expect(
      groupChangePreview([
        change('candidate/product/problem', 'modified', 'old', 'new'),
        change('candidate/product/title', 'added', '', 'Title'),
        change('candidate/legacy/note', 'removed', 'gone', ''),
        change('notes/-', 'added', '', 'item'),
      ])
    ).toEqual([
      {
        fields: [
          {
            after: 'new',
            before: 'old',
            id: 'modified:candidate/product/problem',
            key: 'problem',
            kind: 'modified',
          },
          {
            after: 'Title',
            before: '',
            id: 'added:candidate/product/title',
            key: 'title',
            kind: 'added',
          },
        ],
        kind: 'changed',
        path: 'candidate/product',
      },
      {
        fields: [
          {
            after: '',
            before: 'gone',
            id: 'removed:candidate/legacy/note',
            key: 'note',
            kind: 'removed',
          },
        ],
        kind: 'removed',
        path: 'candidate/legacy',
      },
      {
        fields: [
          {
            after: 'item',
            before: '',
            id: 'added:notes/-',
            key: 'list item',
            kind: 'added',
          },
        ],
        kind: 'added',
        path: 'notes',
      },
    ]);
  });
});
