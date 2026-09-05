import { createYOpsState } from '@t3x-dev/core';
import { type CommitV2, describeProtocolObject, type ProtocolValue } from '@t3x-dev/transition';
import { expect, it } from 'vitest';
import { createStatePresentation } from '../repository/statePresentation';
import { buildCommittedStateOverview } from './stateOverview';

function fixture(value: ProtocolValue) {
  const state = createYOpsState(value);
  const commit: CommitV2 = {
    schema: 't3x/commit/v2',
    parents: [],
    result: describeProtocolObject(state),
    decision: { kind: 'statement', schema: 't3x/statement/v1', digest: `sha256:${'a'.repeat(64)}` },
  };
  return { state, commit, commitDigest: describeProtocolObject(commit).digest };
}
it('keeps author prose separate from factual sections and does not infer modules', () => {
  const input = fixture({ modules: { invented: true }, 'a/b~c': [1, 2], tags: ['prd'] });
  const snapshot = createStatePresentation({
    description: 'My words',
    readme: '# My README',
    tags: ['renderer:rich'],
  });
  const result = buildCommittedStateOverview({
    ...input,
    presentation: { commitDigest: input.commitDigest, snapshot },
  });
  expect(result.author?.document.readme).toBe('# My README');
  expect(result.summary.kind).toBe('sections');
  expect(result.summary.items[0]).toEqual({
    key: 'a/b~c',
    pointer: '/a~1b~0c',
    type: 'array',
    childCount: 2,
  });
  expect(result.render.status).toEqual({
    state: 'loaded',
    schema: 'not-requested',
    renderer: 'fallback',
    validation: 'not-run',
  });
  expect(JSON.parse(result.render.recovery.json)).toEqual(input.state.value);
  expect(result.revision.presentationDigest).toBe(snapshot.digest);
});
it.each([
  null,
  true,
  4,
  'text',
  [],
  {},
])('supports generic roots without invented text %j', (value) => {
  const result = buildCommittedStateOverview(fixture(value));
  expect(result.author).toBeNull();
  expect(result.summary.items).toEqual([]);
  expect(result.render.model).toEqual({ value });
});
it('bounds summary density without discarding State content', () => {
  const value = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`key-${i}`, i]));
  const result = buildCommittedStateOverview(fixture(value));
  expect(result.summary).toMatchObject({ total: 101, truncated: true });
  expect(result.summary.items).toHaveLength(100);
  expect(JSON.parse(result.render.recovery.json)).toEqual(value);
});
it('rejects foreign, tampered and unavailable author revisions', () => {
  const input = fixture({ value: 1 });
  const snapshot = createStatePresentation({ description: 'Original' });
  expect(() =>
    buildCommittedStateOverview({ ...input, presentation: { commitDigest: 'wrong', snapshot } })
  ).toThrow('another commit');
  snapshot.document.description = 'Tampered';
  expect(() =>
    buildCommittedStateOverview({
      ...input,
      presentation: { commitDigest: input.commitDigest, snapshot },
    })
  ).toThrow('digest mismatch');
  expect(() =>
    buildCommittedStateOverview({ ...input, expectedPresentationDigest: snapshot.digest })
  ).toThrow('unavailable');
});
it('rejects changed State and remains deterministic for a fixed selection', () => {
  const input = fixture({ original: true });
  expect(buildCommittedStateOverview(input)).toEqual(buildCommittedStateOverview(input));
  expect(() =>
    buildCommittedStateOverview({ ...input, state: createYOpsState({ newHead: true }) })
  ).toThrow();
});
