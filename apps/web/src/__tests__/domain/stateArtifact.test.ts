import { expect, it } from 'vitest';
import { artifactSchemaLabels, summarizeArtifactState } from '@/domain/project/stateArtifact';

it('shows actual values in ordinary nested YAML, including lists and falsy values', () => {
  const summary = summarizeArtifactState(
    'domain: demo\nversion: 1\ncontent:\n  - title: "计划"\n    done: false\n    priority: 0\n',
    'unused: true'
  );
  expect(summary.rows).toEqual([
    {
      path: [],
      fields: [
        { name: 'domain', value: 'demo' },
        { name: 'version', value: '1' },
      ],
    },
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
  expect(summarizeArtifactState('{}', '')).toEqual({
    objectType: 'State',
    rows: [],
    hasMore: false,
  });
  const summary = summarizeArtifactState(
    JSON.stringify(Array.from({ length: 100 }, (_, i) => i)),
    ''
  );
  expect(summary.rows[0].fields).toHaveLength(16);
  expect(summary.hasMore).toBe(true);
});

it('preserves field order across object groups and distinguishes paths containing separators', () => {
  const summary = summarizeArtifactState(
    JSON.stringify({
      first: null,
      'a / b': { name: '' },
      a: { b: { name: 'nested' } },
      last: false,
      list: [{ value: 0, empty: [] }, { value: 1 }],
    }),
    ''
  );
  expect(summary.rows).toEqual([
    { path: [], fields: [{ name: 'first', value: 'null' }] },
    { path: ['a / b'], fields: [{ name: 'name', value: 'Empty text' }] },
    { path: ['a', 'b'], fields: [{ name: 'name', value: 'nested' }] },
    { path: [], fields: [{ name: 'last', value: 'false' }] },
    {
      path: ['list', '[1]'],
      fields: [
        { name: 'value', value: '0' },
        { name: 'empty', value: 'Empty list' },
      ],
    },
    { path: ['list', '[2]'], fields: [{ name: 'value', value: '1' }] },
  ]);
});

it('labels only the Schema identity and version present in each binding', () => {
  expect(
    artifactSchemaLabels([
      { schemaName: 'Care Checklist', canonicalName: 't3x/care-checklist', version: '1.0.0' },
      { canonicalName: 't3x/prompt', version: 'v1' },
      { version: '2.0.0' },
      { schemaName: 'Weekly Goals' },
      { schemaName: 'Weekly Goals' },
      { schemaName: ' ', version: null },
    ])
  ).toEqual(['Care Checklist@1.0.0', 't3x/prompt@v1', '2.0.0', 'Weekly Goals']);
  expect(artifactSchemaLabels()).toEqual([]);
});
