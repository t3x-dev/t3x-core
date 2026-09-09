import { createHash } from 'node:crypto';
import { createYOpsState } from '@t3x-dev/core';
import { type CommitV2, describeProtocolObject, type ProtocolValue } from '@t3x-dev/transition';
import { load } from 'js-yaml';
import { expect, it } from 'vitest';
import {
  exportCommittedState,
  StateExportFormatError,
  StateExportIntegrityError,
} from '../repository/exportState';

function fixture(value: ProtocolValue) {
  const state = createYOpsState(value);
  const commit: CommitV2 = {
    schema: 't3x/commit/v2',
    parents: [],
    decision: { kind: 'statement', schema: 't3x/statement/v1', digest: `sha256:${'a'.repeat(64)}` },
    result: describeProtocolObject(state),
  };
  return { state, commit, commitDigest: describeProtocolObject(commit).digest };
}

it.each([
  'json',
  'yaml',
])('round-trips full values and identifies deterministic %s bytes', (format) => {
  const input = fixture({
    z: ['yes', '001', '2026-09-05', null, true, 3.14],
    a: { name: '小狗 🐶', text: 'line 1\nline 2' },
  });
  const artifact = exportCommittedState({ ...input, format });
  expect(load(artifact.content)).toEqual(input.state.value);
  expect(artifact.byteDigest).toBe(
    `sha256:${createHash('sha256').update(artifact.content).digest('hex')}`
  );
  expect(artifact.byteLength).toBe(Buffer.byteLength(artifact.content));
  expect(exportCommittedState({ ...input, format })).toEqual(artifact);
  expect(artifact.scope).toBe('full-state-value');
});

it.each([
  null,
  'hello',
  3,
  false,
  [],
  { __proto__: null, empty: {} },
])('supports a generic JSON root %j', (value) => {
  const input = fixture(value);
  expect(load(exportCommittedState({ ...input, format: 'yaml' }).content)).toEqual(value);
});

it('rejects a wrong commit, changed State and caller State mismatch', () => {
  const input = fixture({ foo: 1 });
  expect(() =>
    exportCommittedState({ ...input, format: 'json', commitDigest: `sha256:${'b'.repeat(64)}` })
  ).toThrow(StateExportIntegrityError);
  expect(() =>
    exportCommittedState({ ...input, format: 'json', state: createYOpsState({ foo: 2 }) })
  ).toThrow(StateExportIntegrityError);
  expect(() =>
    exportCommittedState({
      ...input,
      format: 'json',
      expectedStateDigest: `sha256:${'b'.repeat(64)}`,
    })
  ).toThrow(StateExportIntegrityError);
});

it('does not pretend to support renderer formats', () => {
  expect(() => exportCommittedState({ ...fixture({}), format: 'pdf' })).toThrow(
    StateExportFormatError
  );
});
