import {
  createAcceptancePolicyResource,
  createYOpsEffect,
  createYOpsState,
  type ProposalStatement,
  parseAcceptancePolicy,
} from '@t3x-dev/core';
import {
  describeProtocolObject,
  type Effect,
  type ProtocolValue,
  parseProposalStatement,
  type State,
} from '@t3x-dev/transition';
import { describe, expect, it, vi } from 'vitest';
import {
  attachTransitionStatementCommand,
  proposeTransitionCommand,
  TransitionApplicationRequestConflictError,
  TransitionPredicateNotAllowedError,
  type TransitionStatementRecordInput,
  verifyTransitionCommand,
} from '../transition/commands';
import type { TransitionActorRef, TransitionInspectionGraph } from '../transition/inspect';

const REQUEST_DIGEST = `sha256:${'b'.repeat(64)}` as const;

function transitionGraph(input?: { falseReplay?: boolean }): {
  base: State;
  result: State;
  effect: Effect;
  proposal: ProposalStatement;
} {
  const base = createYOpsState({ name: 'before' });
  const valid = createYOpsEffect({
    base,
    operations: [{ set: { path: 'name', value: 'after' } }],
    expectedBase: describeProtocolObject(base),
  });
  const result = input?.falseReplay
    ? createYOpsState({ name: 'not-the-replayed-result' })
    : valid.result;
  const effect = input?.falseReplay
    ? { ...valid.effect, result: describeProtocolObject(result) }
    : valid.effect;
  const proposal = parseProposalStatement({
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(effect)],
    actor: { kind: 'agent', id: 'agent:planner' },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: 'Rename the record', evidence: [] },
      rationale: { mode: 'authored', value: 'Requested in review', evidence: [] },
    },
  });
  return { base, result, effect, proposal };
}

function graph(input?: { falseReplay?: boolean }): TransitionInspectionGraph {
  const subject = transitionGraph(input);
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
      effectDigest: describeProtocolObject(subject.effect).digest,
      proposalDigest: describeProtocolObject(subject.proposal).digest,
      createdAt: '2026-08-17T00:00:00.000Z',
    },
    preparation: { canonicalJson: '{"schema":"test/preparation"}' },
    base: subject.base,
    result: subject.result,
    effect: subject.effect,
    proposal: subject.proposal,
    observations: [],
  };
}

function policyDigest() {
  return createAcceptancePolicyResource({
    uri: 't3x://project/policies/default',
    policy: parseAcceptancePolicy({
      schema: 't3x.dev/acceptance-policy/v1',
      version: 1,
      authorization: {
        decide: { actors: { mode: 'any' } },
        override: { actors: { mode: 'any' } },
        allowSelfApproval: false,
      },
      claims: {
        intent: {
          allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
          minimumEvidence: 0,
          humanConfirmation: 'not_required',
        },
        rationale: {
          allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
          minimumEvidence: 0,
          humanConfirmation: 'not_required',
        },
      },
      checks: {
        replay: {
          issuers: { mode: 'any' },
          tools: { mode: 'any' },
          environments: { mode: 'any' },
        },
        validation: {
          requirement: 'optional',
          issuers: { mode: 'any' },
          tools: { mode: 'any' },
          environments: { mode: 'any' },
          profiles: { mode: 'any' },
          schemas: { mode: 'any' },
          contexts: { mode: 'any' },
        },
        humanConfirmation: { issuers: { mode: 'any' } },
      },
      override: {
        allowClaimFailures: false,
        allowFailedValidation: true,
        allowMissingHumanConfirmation: false,
        allowMissingValidation: true,
      },
    }),
  }).digest;
}

describe('transition commands', () => {
  it('rejects reused propose request ids with different canonical digests', async () => {
    const actor: TransitionActorRef = { kind: 'human', id: 'human:maintainer' };

    await expect(
      proposeTransitionCommand({
        projectId: 'project_1',
        requestId: 'request_1',
        actor,
        request: {
          kind: 'structured_yops',
          workspaceId: 'workspace_1',
          operations: [{ op: 'set', path: ['name'], value: 'after' }],
        },
        ports: {
          canonicalTransitionRequest: () => ({
            canonicalJson: '{"operation":"test"}',
            digest: REQUEST_DIGEST,
          }),
          findTransitionProposalByRequest: vi.fn(async () => ({
            transitionId: 'trn_00000000000000000000000000000001',
            requestDigest: `sha256:${'c'.repeat(64)}`,
          })),
          buildProposal: vi.fn(),
          materializeTransitionProposal: vi.fn(),
          inspectTransition: vi.fn(),
        },
      })
    ).rejects.toBeInstanceOf(TransitionApplicationRequestConflictError);
  });

  it('records replay false statements without advancing provider facts', async () => {
    const recorded: TransitionStatementRecordInput[] = [];

    const result = await verifyTransitionCommand({
      projectId: 'project_1',
      transitionId: 'trn_00000000000000000000000000000001',
      requestId: 'request_1',
      ports: {
        canonicalTransitionRequest: () => ({
          canonicalJson: '{"operation":"verify"}',
          digest: REQUEST_DIGEST,
        }),
        findTransitionStatementsByRequest: vi.fn(async () => []),
        findTransitionVerificationReceipt: vi.fn(async () => null),
        resolveTransitionProposalGraph: vi.fn(async () => graph({ falseReplay: true })),
        recordTransitionVerification: vi.fn(async ({ statementInputs, receipt }) => {
          recorded.push(...statementInputs);
          return {
            statements: [
              {
                statementDigest: `sha256:${'d'.repeat(64)}`,
                source: 'server:replay',
                issuer: { kind: 'service', id: 'service:t3x-transition-replay' },
                requestId: receipt.requestId,
                createdAt: '2026-08-17T00:00:00.000Z',
              },
            ],
            operationalResults: receipt.operationalResults,
          };
        }),
        inspectTransition: vi.fn(async () => ({
          precondition: { policyDigest: policyDigest() },
        })),
        nowIso: () => '2026-08-17T00:00:00.000Z',
        nativeProviderContext: {},
      },
    });

    expect(result.reused).toBe(false);
    expect(recorded).toHaveLength(1);
    expect((recorded[0]!.statement.predicate as { outcome: string }).outcome).toBe('false');
    expect(result.operationalResults).toEqual([]);
  });

  it('refuses attached Statements for reserved core predicates', async () => {
    const actor: TransitionActorRef = { kind: 'human', id: 'human:maintainer' };

    await expect(
      attachTransitionStatementCommand({
        projectId: 'project_1',
        transitionId: 'trn_00000000000000000000000000000001',
        requestId: 'request_1',
        actor,
        statement: {
          predicateType: 't3x.proposal/v1',
          predicate: { value: true } as ProtocolValue,
          subjects: ['proposal'],
        },
        options: { allowedExternalPredicateTypes: ['t3x.proposal/v1'] },
        ports: {
          canonicalTransitionRequest: () => ({
            canonicalJson: '{"operation":"attach_statement"}',
            digest: REQUEST_DIGEST,
          }),
          findTransitionStatementsByRequest: vi.fn(async () => []),
          resolveTransitionProposalGraph: vi.fn(async () => graph()),
          recordTransitionStatementMembership: vi.fn(),
          inspectTransition: vi.fn(),
        },
      })
    ).rejects.toBeInstanceOf(TransitionPredicateNotAllowedError);
  });
});
