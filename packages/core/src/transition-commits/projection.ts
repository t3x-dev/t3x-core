import { type CommitV2, describeCommitV2 } from './commit';

export interface CommitHistoryProjection {
  format: 'transition_v2';
  id: string;
  schema: CommitV2['schema'];
  parents: string[];
  recordedAt: string;
  result: { mode: 'state_descriptor'; descriptor: CommitV2['result'] };
  assurance: { mode: 'decision_bound'; decision: CommitV2['decision'] };
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
