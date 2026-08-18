import { describeProtocolObject, parseProposalStatement } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
  assertTransitionDecisionMembership,
  assertTransitionReviewPrecondition,
  buildTransitionCommitCommand,
  buildTransitionDecisionCommand,
  decisionRationale,
  isGeneratedProposalPreparation,
  normalizedTransitionReviewPrecondition,
  sameTransitionPolicyResource,
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
  it('keeps Decision rationale rules closed by outcome', () => {
    const actor = { kind: 'human' as const, id: 'human:reviewer' };

    expect(
      decisionRationale({
        outcome: 'overridden',
        actor,
        rationale: '  Reviewed and accepted with documented risk.  ',
      })
    ).toEqual({
      mode: 'authored',
      value: 'Reviewed and accepted with documented risk.',
      evidence: [],
    });
    expect(
      decisionRationale({
        outcome: 'accepted',
        actor,
      })
    ).toEqual({ mode: 'unspecified' });
    expect(() =>
      decisionRationale({
        outcome: 'accepted',
        actor,
        rationale: 'accepted decisions do not carry override rationale',
      })
    ).toThrow('Only an overridden Decision accepts an authored rationale');
    expect(() =>
      decisionRationale({
        outcome: 'overridden',
        actor,
        rationale: '   ',
      })
    ).toThrow('Override requires a non-empty authored rationale');
  });

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

  it('normalizes review preconditions without mutating caller facts', () => {
    const statementDigests = [`sha256:${'b'.repeat(64)}`, `sha256:${'a'.repeat(64)}`];
    const facts = { ...precondition(), statementDigests };

    expect(normalizedTransitionReviewPrecondition(facts)).toMatchObject({
      statement_digests: [`sha256:${'a'.repeat(64)}`, `sha256:${'b'.repeat(64)}`],
    });
    expect(statementDigests).toEqual([`sha256:${'b'.repeat(64)}`, `sha256:${'a'.repeat(64)}`]);
  });

  it('rejects any stale review fact before a Decision can be issued', () => {
    const subject = graph();
    const base = precondition();
    const facts = {
      graph: subject,
      workspaceRevision: subject.membership.workspaceRevision,
      refHead: subject.membership.refHead,
      policyDigest: `sha256:${'e'.repeat(64)}`,
    };
    const staleCases: TransitionReviewPrecondition[] = [
      { ...base, workspaceRevision: 999 },
      { ...base, refName: 'feature' },
      { ...base, refHead: `sha256:${'1'.repeat(64)}` },
      { ...base, effectDigest: `sha256:${'2'.repeat(64)}` },
      { ...base, proposalDigest: `sha256:${'3'.repeat(64)}` },
      { ...base, policyDigest: `sha256:${'4'.repeat(64)}` },
      { ...base, statementDigests: [`sha256:${'5'.repeat(64)}`] },
    ];

    for (const stale of staleCases) {
      expect(() =>
        assertTransitionReviewPrecondition({
          precondition: stale,
          facts,
        })
      ).toThrow(TransitionReviewStaleError);
    }
    expect(() =>
      assertTransitionReviewPrecondition({
        precondition: base,
        facts,
      })
    ).not.toThrow();
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

  it('compares exact policy resources and recognizes generated Proposal preparation', () => {
    const resource = {
      uri: 't3x://project/policies/main',
      mediaType: 'application/vnd.t3x.acceptance-policy+json',
      digest: `sha256:${'f'.repeat(64)}`,
    } as const;

    expect(sameTransitionPolicyResource(resource, { ...resource })).toBe(true);
    expect(
      sameTransitionPolicyResource(resource, {
        ...resource,
        digest: `sha256:${'0'.repeat(64)}`,
      })
    ).toBe(false);
    expect(
      isGeneratedProposalPreparation({
        schema: 't3x.dev/proposal-generation-preparation/v1',
        posture: 'source_supported',
      })
    ).toBe(true);
    expect(isGeneratedProposalPreparation({ schema: 'test/preparation' })).toBe(false);
  });
});
