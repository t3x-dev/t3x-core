import type { Commit } from '../commit/types';
import { type CommitV2, describeCommitV2 } from './commit';

export const LEGACY_ASSURANCE_UNAVAILABLE = [
  'proposal',
  'evidence',
  'replay',
  'validation',
  'decision',
] as const;

export type CommitHistoryProjection =
  | {
      format: 'legacy_v1';
      id: string;
      schema: Commit['schema'];
      parents: string[];
      recordedAt: string;
      result: { mode: 'legacy_content'; content: Commit['content'] };
      assurance: {
        mode: 'legacy_unavailable';
        unavailable: typeof LEGACY_ASSURANCE_UNAVAILABLE;
      };
    }
  | {
      format: 'transition_v2';
      id: string;
      schema: CommitV2['schema'];
      parents: string[];
      recordedAt: string;
      result: { mode: 'state_descriptor'; descriptor: CommitV2['result'] };
      assurance: { mode: 'decision_bound'; decision: CommitV2['decision'] };
    };

export function projectLegacyCommit(commit: Commit): CommitHistoryProjection {
  return {
    format: 'legacy_v1',
    id: commit.hash,
    schema: commit.schema,
    parents: [...commit.parents],
    recordedAt: commit.committed_at,
    result: { mode: 'legacy_content', content: structuredClone(commit.content) },
    assurance: {
      mode: 'legacy_unavailable',
      unavailable: LEGACY_ASSURANCE_UNAVAILABLE,
    },
  };
}

export function projectCommitV2(commit: CommitV2, recordedAt: string): CommitHistoryProjection {
  return {
    format: 'transition_v2',
    id: describeCommitV2(commit).digest,
    schema: commit.schema,
    parents: commit.parents.map((parent) => parent.digest),
    recordedAt,
    result: { mode: 'state_descriptor', descriptor: { ...commit.result } },
    assurance: { mode: 'decision_bound', decision: { ...commit.decision } },
  };
}
