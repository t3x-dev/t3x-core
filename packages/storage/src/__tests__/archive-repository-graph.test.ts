import {
  type CommitV2,
  type DecisionStatement,
  describeTransitionObject,
  type Effect,
  type ProposalStatement,
  type ProtocolObject,
  type State,
  serializeTransitionObject,
} from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  type ArchiveRepositoryRecord,
  verifyArchiveRepositoryGraph,
} from '../backup/archive-repository-graph';

function fixture(outcome: 'accepted' | 'rejected' = 'accepted') {
  const base: State = {
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/test+json', version: '1' },
    value: {},
  };
  const result: State = { ...base, value: { name: 'Private project content' } };
  const effect: Effect = {
    schema: 't3x/effect/v1',
    base: describeTransitionObject(base),
    driver: {
      protocol: 't3x.dev/test',
      protocolVersion: '1',
      specDigest: `sha256:${'a'.repeat(64)}`,
    },
    operations: [],
    inputs: [],
    result: describeTransitionObject(result),
  };
  const proposal: ProposalStatement = {
    schema: 't3x/statement/v1',
    subjects: [describeTransitionObject(effect)],
    actor: { kind: 'human', id: 'user:test' },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'authored', value: 'Edit', evidence: [] },
      rationale: { mode: 'unspecified' },
    },
  };
  const decision: DecisionStatement = {
    schema: 't3x/statement/v1',
    subjects: [describeTransitionObject(proposal)],
    actor: { kind: 'human', id: 'user:test' },
    predicateType: 't3x.decision/v1',
    predicate: {
      policy: { mode: 'not_evaluated' },
      considered: [],
      outcome,
      rationale: { mode: 'unspecified' },
      decidedAt: '2026-09-04T00:00:00.000Z',
    },
  };
  const commit: CommitV2 = {
    schema: 't3x/commit/v2',
    parents: [],
    decision: describeTransitionObject(decision),
    result: effect.result,
  };
  const objects: ProtocolObject[] = [base, result, effect, proposal, decision, commit];
  const records: ArchiveRepositoryRecord[] = objects.map((value) => ({
    record: 'object',
    ...serializeTransitionObject(value),
  }));
  const digest = describeTransitionObject(commit).digest;
  records.push({ record: 'commit', digest }, { record: 'ref', name: 'main', head: digest });
  return { records, commit, objects, digest };
}

describe('archive-local repository graph verification', () => {
  it('verifies canonical records without treating the historical actor as current authority', async () => {
    await expect(verifyArchiveRepositoryGraph(fixture().records)).resolves.toEqual({
      qualification: 'structural_only',
      objectCount: 6,
      commitCount: 1,
      refCount: 1,
    });
  });
  it('accepts an explicit empty branch', async () => {
    await expect(
      verifyArchiveRepositoryGraph([{ record: 'ref', name: 'main', head: null }])
    ).resolves.toMatchObject({ commitCount: 0, refCount: 1 });
  });
  it('rejects omitted objects even when all archive entry hashes could be recomputed', async () => {
    await expect(verifyArchiveRepositoryGraph(fixture().records.slice(1))).rejects.toMatchObject({
      code: 'INCOMPLETE_GRAPH',
    });
  });
  it('requires explicit project membership for ref heads', async () => {
    await expect(
      verifyArchiveRepositoryGraph(fixture().records.filter((r) => r.record !== 'commit'))
    ).rejects.toMatchObject({ code: 'INCOMPLETE_GRAPH' });
  });
  it('checks detached commits as well as the current branch head', async () => {
    await expect(
      verifyArchiveRepositoryGraph(fixture('rejected').records.filter((r) => r.record !== 'ref'))
    ).rejects.toMatchObject({ code: 'INVALID_GRAPH' });
  });
  it('requires parent membership, not merely a parent object', async () => {
    const source = fixture();
    const child: CommitV2 = {
      ...source.commit,
      parents: [describeTransitionObject(source.commit)],
    };
    const records = source.records.filter((r) => r.record === 'object');
    await expect(
      verifyArchiveRepositoryGraph([
        ...records,
        { record: 'object', ...serializeTransitionObject(child) },
        { record: 'commit', digest: describeTransitionObject(child).digest },
      ])
    ).rejects.toMatchObject({ code: 'INCOMPLETE_GRAPH' });
  });
  it.each(['object', 'commit', 'ref'])('rejects duplicate %s records', async (kind) => {
    const { records } = fixture();
    await expect(
      verifyArchiveRepositoryGraph([...records, records.find((r) => r.record === kind)])
    ).rejects.toMatchObject({ code: 'DUPLICATE_RECORD' });
  });
  it('rejects byte identity mismatch and noncanonical serialization', async () => {
    const { records } = fixture();
    const first = records[0];
    if (first.record !== 'object') throw new Error('fixture');
    await expect(
      verifyArchiveRepositoryGraph([{ ...first, canonicalJson: `${first.canonicalJson} ` }])
    ).rejects.toMatchObject({ code: 'INVALID_RECORD' });
    await expect(
      verifyArchiveRepositoryGraph([
        { ...first, descriptor: { ...first.descriptor, digest: `sha256:${'f'.repeat(64)}` } },
      ])
    ).rejects.toMatchObject({ code: 'INVALID_RECORD' });
  });
  it.each([
    { record: 'ref', name: 'main', head: null, ownerId: 'forged-owner' },
    { record: 'credentials', apiKey: 'private-secret' },
    { record: 'ref', name: 'main\nforged-log', head: null },
    { record: 'commit', digest: 'https://untrusted.example/graph' },
  ])('rejects unknown fields and record kinds', async (record) => {
    await expect(verifyArchiveRepositoryGraph([record])).rejects.toMatchObject({
      code: 'INVALID_RECORD',
    });
  });
  it('bounds input and does not echo private protocol parser diagnostics', async () => {
    const { records } = fixture();
    const first = records[0];
    if (first.record !== 'object') throw new Error('fixture');
    await expect(
      verifyArchiveRepositoryGraph([{ ...first, canonicalJson: ' '.repeat(4 * 1024 * 1024 + 1) }])
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(
      verifyArchiveRepositoryGraph([{ ...first, canonicalJson: '{"private-secret":' }])
    ).rejects.toThrow(/^INVALID_RECORD$/);
  });
});
