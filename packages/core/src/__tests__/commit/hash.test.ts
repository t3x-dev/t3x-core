import { describe, expect, it } from 'vitest';
import { computeCommitHash } from '../../commit/hash';
import type { CommitFirstClass } from '../../commit/types';
import { COMMIT_SCHEMA } from '../../commit/types';

describe('computeCommitHash', () => {
  const baseCommit: CommitFirstClass = {
    schema: COMMIT_SCHEMA,
    parents: [],
    author: { type: 'human', name: 'Test' },
    committed_at: '2026-03-15T00:00:00Z',
    content: {
      trees: [{ key: 'trip_plan', slots: { destination: 'Tokyo', budget: 5000 }, children: [] }],
      relations: [],
    },
  };

  it('produces a sha256-prefixed hash', () => {
    const hash = computeCommitHash(baseCommit);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeCommitHash(baseCommit)).toBe(computeCommitHash(baseCommit));
  });

  it('changes when tree slot value changes', () => {
    const modified: CommitFirstClass = {
      ...baseCommit,
      content: {
        trees: [{ key: 'trip_plan', slots: { destination: 'Tokyo', budget: 7000 }, children: [] }],
        relations: [],
      },
    };
    expect(computeCommitHash(baseCommit)).not.toBe(computeCommitHash(modified));
  });

  it('changes when parent changes', () => {
    const withParent: CommitFirstClass = { ...baseCommit, parents: ['sha256:abc'] };
    expect(computeCommitHash(baseCommit)).not.toBe(computeCommitHash(withParent));
  });

  it('excludes slot_quotes from hash', () => {
    const withQuotes: CommitFirstClass = {
      ...baseCommit,
      content: {
        trees: [
          {
            key: 'trip_plan',
            slots: { destination: 'Tokyo', budget: 5000 },
            children: [],
            slot_quotes: { destination: 'I want to go to Tokyo' },
          },
        ],
        relations: [],
      },
    };
    expect(computeCommitHash(baseCommit)).toBe(computeCommitHash(withQuotes));
  });

  it('excludes node source from hash', () => {
    const withSource: CommitFirstClass = {
      ...baseCommit,
      content: {
        trees: [
          {
            key: 'trip_plan',
            slots: { destination: 'Tokyo', budget: 5000 },
            children: [],
            source: 'T1',
          },
        ],
        relations: [],
      },
    };
    expect(computeCommitHash(baseCommit)).toBe(computeCommitHash(withSource));
  });

  it('includes relations in hash', () => {
    const withRelation: CommitFirstClass = {
      ...baseCommit,
      content: {
        ...baseCommit.content,
        relations: [{ from: 'trip_plan', to: 'lodging', type: 'causes' as const }],
      },
    };
    expect(computeCommitHash(baseCommit)).not.toBe(computeCommitHash(withRelation));
  });
});
