import { describeProtocolObject, parseProposalStatement } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
  assertTransitionDecisionMembership,
  assertTransitionReviewPrecondition,
  buildTransitionCommitCommand,
  buildTransitionDecisionCommand,
  TransitionDecisionMembershipError,
  type TransitionReviewPrecondition,
  TransitionReviewStaleError,
} from '../transition/lifecycle';
import { graph } from './support/transitionGraph';

const digest = (value: unknown) => `digest:${JSON.stringify(value)}`;

function precondition(): TransitionReviewPrecondition {
  const subject = graph();
  return {
    workspaceRevision: subject.membership.workspaceRevision,
    refName: subject.membership.refName,
    refHead: subject.membership.refHead,
    effectDigest: subject.membership.effectDigest,
    proposalDigest: subject.membership.proposalDigest,
    statementDigests: subject.observations.map(
      (observation) => observation.membership.statementDigest
    ),
    policyDigest: `sha256:${'e'.repeat(64)}`,
  };
}

describe('transition lifecycle rules', () => {
  it('normalizes Decision command facts and review digest from sorted preconditions', () => {
    const command = buildTransitionDecisionCommand({
      outcome: 'accepted',
      precondition: {
        ...precondition(),
        statementDigests: [`sha256:${'b'.repeat(64)}`, `sha256:${'a'.repeat(64)}`],
      },
      digestCanonicalRequest: digest,
    });

    expect(command.requestFacts).toMatchObject({
      operation: 'decide',
      outcome: 'accepted',
      precondition: {
        statement_digests: [`sha256:${'a'.repeat(64)}`, `sha256:${'b'.repeat(64)}`],
      },
    });
    expect(command.requestDigest).toMatch(/^digest:/);
    expect(command.reviewDigest).toMatch(/^digest:/);
  });

  it('rejects stale review facts before a Decision can be issued', () => {
    const subject = graph();

    expect(() =>
      assertTransitionReviewPrecondition({
        precondition: { ...precondition(), workspaceRevision: 999 },
        facts: {
          graph: subject,
          workspaceRevision: subject.membership.workspaceRevision,
          refHead: subject.membership.refHead,
          policyDigest: `sha256:${'e'.repeat(64)}`,
        },
      })
    ).toThrow(TransitionReviewStaleError);
  });

  it('binds Decisions to the exact Transition Proposal descriptor', () => {
    const subject = graph();
    const foreignProposal = parseProposalStatement({
      ...subject.proposal,
      predicate: {
        intent: { mode: 'unspecified' },
        rationale: { mode: 'unspecified' },
      },
    });

    expect(() =>
      assertTransitionDecisionMembership({
        decision: {
          schema: 't3x/statement/v1',
          subjects: [describeProtocolObject(foreignProposal)],
          actor: { kind: 'human', id: 'human:reviewer' },
          predicateType: 't3x.decision/v1',
          predicate: {
            outcome: 'accepted',
            rationale: { mode: 'unspecified' },
            policy: { mode: 'not_evaluated' },
            decidedAt: '2026-08-17T00:00:00.000Z',
          },
        },
        proposalDescriptor: describeProtocolObject(subject.proposal),
      })
    ).toThrow(TransitionDecisionMembershipError);
  });

  it('normalizes Commit command facts with optional workspace projection facts', () => {
    const command = buildTransitionCommitCommand({
      decisionDigest: `sha256:${'d'.repeat(64)}`,
      expectedHead: null,
      workspaceProjectionFacts: { kind: 'source_commit' },
      digestCanonicalRequest: digest,
    });

    expect(command.requestFacts).toEqual({
      operation: 'commit',
      decision_digest: `sha256:${'d'.repeat(64)}`,
      expected_head: null,
      workspace_projection: { kind: 'source_commit' },
    });
    expect(command.requestDigest).toMatch(/^digest:/);
  });
});
