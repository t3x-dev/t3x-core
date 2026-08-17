import {
  createAcceptancePolicyResource,
  type ProposalStatement,
  parseAcceptancePolicy,
} from '@t3x-dev/core';
import {
  describeProtocolObject,
  type Effect,
  parseEffect,
  parseProposalStatement,
  parseState,
  type State,
} from '@t3x-dev/transition';
import { describe, expect, it, vi } from 'vitest';
import {
  inspectTransition,
  type TransitionActorRef,
  type TransitionInspectionGraph,
  type TransitionInspectionPorts,
} from '../transition/inspect';

function state(name: string): State {
  return parseState({
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/yaml', version: '1' },
    value: { name },
  });
}

function transitionGraph(): {
  base: State;
  result: State;
  effect: Effect;
  proposal: ProposalStatement;
} {
  const base = state('before');
  const result = state('after');
  const effect = parseEffect({
    schema: 't3x/effect/v1',
    base: describeProtocolObject(base),
    result: describeProtocolObject(result),
    driver: {
      protocol: 't3x.dev/test-edit',
      protocolVersion: '1',
      specDigest: `sha256:${'a'.repeat(64)}`,
    },
    operations: [{ op: 'set', path: ['name'], value: 'after' }],
    inputs: [],
  });
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

function graph(): TransitionInspectionGraph {
  const subject = transitionGraph();
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

function policyBinding() {
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
  });
}

function ports(): TransitionInspectionPorts<{ posture: 'test' }> {
  const bound = policyBinding();
  return {
    resolveTransitionProposalGraph: vi.fn(async () => graph()),
    getTransitionPolicyBinding: vi.fn(async () => bound),
    resolveApplicableTransitionPolicy: vi.fn((input) => ({
      policy: input.refPolicyBinding.policy,
      resource: input.refPolicyBinding.resource,
    })),
    projectProposalGenerationReview: vi.fn(() => ({ posture: 'test' })),
  };
}

describe('inspectTransition', () => {
  it('projects an inspectable Transition through application ports', async () => {
    const actor: TransitionActorRef = { kind: 'human', id: 'human:maintainer' };
    const adapter = ports();

    const view = await inspectTransition(
      { projectId: 'project_1', transitionId: 'trn_00000000000000000000000000000001', actor },
      adapter
    );

    expect(adapter.resolveTransitionProposalGraph).toHaveBeenCalledWith({
      projectId: 'project_1',
      transitionId: 'trn_00000000000000000000000000000001',
    });
    expect(adapter.getTransitionPolicyBinding).toHaveBeenCalledWith({
      projectId: 'project_1',
      refName: 'main',
    });
    expect(adapter.resolveApplicableTransitionPolicy).toHaveBeenCalledWith({
      refPolicyBinding: expect.any(Object),
      requestKind: 'structured_yops',
      preparationFacts: { schema: 'test/preparation' },
    });
    expect(view.precondition.policyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(view.transition.capabilities.accept.disposition).not.toBe('not_evaluated');
    expect(view.generation).toEqual({ posture: 'test' });
  });

  it('keeps capability preview unavailable without a trusted actor or policy', async () => {
    const adapter: TransitionInspectionPorts = {
      ...ports(),
      getTransitionPolicyBinding: vi.fn(async () => null),
      projectProposalGenerationReview: vi.fn(() => null),
    };

    const view = await inspectTransition(
      { projectId: 'project_1', transitionId: 'trn_00000000000000000000000000000001' },
      adapter
    );

    expect(view.precondition.policyDigest).toBeNull();
    expect(view.transition.capabilities.accept.disposition).toBe('not_evaluated');
    expect(view).not.toHaveProperty('generation');
  });
});
