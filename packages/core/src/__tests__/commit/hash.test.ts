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
      frames: [
        { id: 'f_001', type: 'trip_plan', slots: { destination: 'Tokyo', budget: 5000 } },
      ],
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

  it('changes when frame slot value changes', () => {
    const modified: CommitFirstClass = {
      ...baseCommit,
      content: {
        frames: [{ id: 'f_001', type: 'trip_plan', slots: { destination: 'Tokyo', budget: 7000 } }],
        relations: [],
      },
    };
    expect(computeCommitHash(baseCommit)).not.toBe(computeCommitHash(modified));
  });

  it('changes when parent changes', () => {
    const withParent: CommitFirstClass = { ...baseCommit, parents: ['sha256:abc'] };
    expect(computeCommitHash(baseCommit)).not.toBe(computeCommitHash(withParent));
  });

  it('excludes slot_sources from hash', () => {
    const withSources: CommitFirstClass = {
      ...baseCommit,
      content: {
        frames: [{
          id: 'f_001', type: 'trip_plan',
          slots: { destination: 'Tokyo', budget: 5000 },
          slot_sources: { destination: { turn: 'T1', start_char: 0, end_char: 5 } },
        }],
        relations: [],
      },
    };
    expect(computeCommitHash(baseCommit)).toBe(computeCommitHash(withSources));
  });

  it('excludes frame.source from hash', () => {
    const withSource: CommitFirstClass = {
      ...baseCommit,
      content: {
        frames: [{
          id: 'f_001', type: 'trip_plan',
          slots: { destination: 'Tokyo', budget: 5000 },
          source: 'T1',
        }],
        relations: [],
      },
    };
    expect(computeCommitHash(baseCommit)).toBe(computeCommitHash(withSource));
  });

  it('includes confidence in hash', () => {
    const withConfidence: CommitFirstClass = {
      ...baseCommit,
      content: {
        frames: [{
          id: 'f_001', type: 'trip_plan',
          slots: { destination: 'Tokyo', budget: 5000 },
          confidence: 0.9,
        }],
        relations: [],
      },
    };
    expect(computeCommitHash(baseCommit)).not.toBe(computeCommitHash(withConfidence));
  });

  it('includes relations in hash', () => {
    const withRelation: CommitFirstClass = {
      ...baseCommit,
      content: {
        ...baseCommit.content,
        relations: [{ from: 'f_001', to: 'f_002', type: 'causes' as const }],
      },
    };
    expect(computeCommitHash(baseCommit)).not.toBe(computeCommitHash(withRelation));
  });
});
