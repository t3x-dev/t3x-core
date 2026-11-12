import { expect, it } from 'vitest';
import { summarizeArtifactState } from '@/domain/project/stateArtifact';

it('shows actual values in ordinary nested YAML, including lists and falsy values', () => {
  const summary = summarizeArtifactState(
    'domain: demo\nversion: 1\ncontent:\n  - title: "计划"\n    done: false\n    priority: 0\n',
    'unused: true'
  );
  expect(summary.rows).toEqual([
    { path: [], fields: [{ name: 'domain', value: 'demo' }] },
    { path: [], fields: [{ name: 'version', value: '1' }] },
    {
      path: ['content', '[1]'],
      fields: [
        { name: 'title', value: '计划' },
        { name: 'done', value: 'false' },
        { name: 'priority', value: '0' },
      ],
    },
  ]);
});

it('bounds the summary without treating an empty document as a field', () => {
  expect(summarizeArtifactState('{}', '')).toEqual({ rows: [], hasMore: false });
  const summary = summarizeArtifactState(
    JSON.stringify(Array.from({ length: 100 }, (_, i) => i)),
    ''
  );
  expect(summary.rows).toHaveLength(16);
  expect(summary.hasMore).toBe(true);
});
