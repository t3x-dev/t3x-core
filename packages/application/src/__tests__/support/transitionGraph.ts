import { createYOpsEffect, createYOpsState, type ProposalStatement } from '@t3x-dev/core';
import {
  describeProtocolObject,
  parseProposalStatement,
  parseStatement,
} from '@t3x-dev/transition';
import type { TransitionInspectionGraph } from '../../transition/inspect';

export function graph(): TransitionInspectionGraph {
  const base = createYOpsState({ name: 'before' });
  const { effect, result } = createYOpsEffect({
    base,
    operations: [{ set: { path: 'name', value: 'after' } }],
    expectedBase: describeProtocolObject(base),
  });
  const proposal: ProposalStatement = parseProposalStatement({
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(effect)],
    actor: { kind: 'agent', id: 'agent:planner' },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: 'Rename the record', evidence: [] },
      rationale: { mode: 'authored', value: 'Requested in review', evidence: [] },
    },
  });
  const observation = parseStatement({
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(effect)],
    actor: { kind: 'service', id: 'service:t3x-transition-replay' },
    predicateType: 't3x.dev/replay-verification/v1',
    predicate: {
      outcome: 'verified',
      result: describeProtocolObject(result),
      tool: { name: '@t3x-dev/transition/replay', version: '1' },
      run: {
        id: 'transition:trn_00000000000000000000000000000001:verify:request_1:replay',
        recordedAt: '2026-08-17T00:00:00.000Z',
      },
      environment: { mode: 'unspecified' },
    },
  });

  return {
    membership: {
      transitionId: 'trn_00000000000000000000000000000001',
      projectId: 'project_1',
      workspaceId: 'workspace_1',
      workspaceRevision: 7,
      refName: 'main',
      refHead: null,
      requestKind: 'structured_yops',
      requestId: 'request_1',
      requestCanonicalJson: '{"kind":"structured_yops"}',
      effectDigest: describeProtocolObject(effect).digest,
      proposalDigest: describeProtocolObject(proposal).digest,
      createdAt: '2026-08-17T00:00:00.000Z',
    },
    preparation: { canonicalJson: '{"schema":"test/preparation"}' },
    base,
    result,
    effect,
    proposal,
    observations: [
      {
        membership: {
          statementDigest: describeProtocolObject(observation).digest,
          source: 'server:replay',
          issuer: { kind: 'service', id: 'service:t3x-transition-replay' },
          requestId: 'request_1',
          createdAt: '2026-08-17T00:00:00.000Z',
        },
        statement: observation,
        issuerContext: { actor: { kind: 'service', id: 'service:t3x-transition-replay' } },
      },
    ],
  };
}
