import {
  describeProtocolObject,
  type ProposalStatement,
  parseProposalStatement,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import { createYOpsEffect, createYOpsState } from '../../transition-adapters';
import { buildHumanConfirmationStatement } from '../../transition-statements';
import fixtures from '../__fixtures__/proposal-drafts-v1.json';
import { compileProposalDraft } from '../compiler';

function testEffect() {
  return createYOpsEffect({
    base: createYOpsState({ replicas: 2 }),
    operations: [{ set: { path: 'replicas', value: 4 } }],
  }).effect;
}

function expectProposal(result: ReturnType<typeof compileProposalDraft>): ProposalStatement {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected Proposal compilation to succeed');
  return parseProposalStatement(result.proposal);
}

describe('ProposalDraft compiler', () => {
  it('round-trips stated, inferred, authored, and unspecified Claim modes', () => {
    const effect = testEffect();
    const firstResult = compileProposalDraft({
      draft: fixtures.statedAndInferred,
      effect,
      actor: { kind: 'agent', id: 'agent:planner' },
    });
    const first = expectProposal(firstResult);
    const second = expectProposal(
      compileProposalDraft({
        draft: fixtures.authoredAndUnspecified,
        effect,
        actor: { kind: 'human', id: 'user:operator' },
      })
    );

    expect(first.predicate.intent.mode).toBe('stated');
    expect(first.predicate.rationale.mode).toBe('inferred');
    expect(second.predicate.intent.mode).toBe('unspecified');
    expect(second.predicate.rationale.mode).toBe('authored');
    expect(first.subjects).toEqual([describeProtocolObject(effect)]);
    if (firstResult.ok) {
      expect(firstResult.report.sourceCoverage.intent.bound).toBe(1);
    }
  });

  it('retains an incomplete draft and creates no partial Statement', () => {
    const result = compileProposalDraft({
      draft: fixtures.missingStatedEvidence,
      effect: testEffect(),
      actor: { kind: 'agent', id: 'agent:planner' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.draft).toEqual(fixtures.missingStatedEvidence);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'CLAIM_EVIDENCE_REQUIRED',
        path: '$.intent.evidence',
      })
    );
    expect(result).not.toHaveProperty('proposal');
  });

  it('rejects malformed evidence descriptors before protocol compilation', () => {
    const result = compileProposalDraft({
      draft: {
        ...fixtures.statedAndInferred,
        intent: {
          ...fixtures.statedAndInferred.intent,
          evidence: [
            {
              ...fixtures.statedAndInferred.intent.evidence[0],
              resource: {
                ...fixtures.statedAndInferred.intent.evidence[0].resource,
                digest: 'sha256:not-a-digest',
              },
            },
          ],
        },
      },
      effect: testEffect(),
      actor: { kind: 'agent', id: 'agent:planner' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'DRAFT_INVALID',
        path: '$.intent.evidence.0.resource.digest',
      })
    );
  });

  it('rejects provider-owned actor and generic operation classification fields', () => {
    const draft = {
      ...fixtures.authoredAndUnspecified,
      actor: { kind: 'agent', id: 'agent:impersonated' },
      operationKind: 'update',
    };
    const result = compileProposalDraft({
      draft,
      effect: testEffect(),
      actor: { kind: 'service', id: 'service:authenticated' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.every((issue) => issue.code === 'DRAFT_INVALID')).toBe(true);
  });

  it('keeps draft-only review context outside Proposal identity', () => {
    const effect = testEffect();
    const first = compileProposalDraft({
      draft: fixtures.authoredAndUnspecified,
      effect,
      actor: { kind: 'human', id: 'user:operator' },
    });
    const second = compileProposalDraft({
      draft: {
        ...fixtures.authoredAndUnspecified,
        review: {
          ...fixtures.authoredAndUnspecified.review,
          unresolvedQuestions: ['Should this be temporary?'],
          warnings: ['No rollback window supplied'],
          calibration: { confidence: 0.75 },
        },
      },
      effect,
      actor: { kind: 'human', id: 'user:operator' },
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(describeProtocolObject(first.proposal)).toEqual(describeProtocolObject(second.proposal));
    expect(first.report).not.toEqual(second.report);
  });

  it('records only the trusted actor supplied at the compiler boundary', () => {
    const proposal = expectProposal(
      compileProposalDraft({
        draft: fixtures.authoredAndUnspecified,
        effect: testEffect(),
        actor: { kind: 'service', id: 'service:authenticated' },
      })
    );
    expect(proposal.actor).toEqual({ kind: 'service', id: 'service:authenticated' });
  });

  it('attaches confirmation without rewriting the original Proposal', () => {
    const proposal = expectProposal(
      compileProposalDraft({
        draft: fixtures.statedAndInferred,
        effect: testEffect(),
        actor: { kind: 'agent', id: 'agent:planner' },
      })
    );
    const before = describeProtocolObject(proposal);
    const confirmation = buildHumanConfirmationStatement({
      proposal,
      actor: { kind: 'human', id: 'user:reviewer' },
      predicate: { confirms: ['intent'] },
    });

    expect(confirmation.subjects).toEqual([before]);
    expect(describeProtocolObject(proposal)).toEqual(before);
  });
});
