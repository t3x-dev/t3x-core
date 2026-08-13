import {
  createAcceptancePolicyResource,
  type ProposalGenerationPreparationV1,
  parseAcceptancePolicy,
  proposalGenerationProfileResource,
} from '@t3x-dev/core';
import type { TransitionPolicyBinding } from '@t3x-dev/storage';
import type { ProtocolValue, ResourceDescriptor } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
  GenerationPolicyIncompatibleError,
  GenerationPolicyIntegrityError,
  PROPOSAL_POSTURE_VERIFIER_ACTOR,
  PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT,
  PROPOSAL_POSTURE_VERIFIER_TOOL,
  PROPOSAL_POSTURE_VERIFIER_WORKFLOW,
  resolveApplicableTransitionPolicy,
} from '../lib/transition-control-plane/applicable-policy';

const DIGEST = `sha256:${'a'.repeat(64)}` as const;

function resource(uri: string): ResourceDescriptor {
  return { uri, mediaType: 'application/json', digest: DIGEST };
}

function refPolicyBinding(
  input: { runner?: 'optional' | 'required'; allowSelfApproval?: boolean } = {}
) {
  const policy = parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval: input.allowSelfApproval ?? true,
    },
    claims: {
      intent: {
        allowedModes: ['stated'],
        minimumEvidence: 1,
        humanConfirmation: 'required',
      },
      rationale: {
        allowedModes: ['authored'],
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
        requirement: 'required',
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      ...(input.runner === undefined
        ? {}
        : {
            runner: {
              requirement: input.runner,
              issuers: { mode: 'any' },
              tools: { mode: 'any' },
              workflows: { mode: 'any' },
              environments: { mode: 'any' },
            },
          }),
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
      ...(input.runner === undefined ? {} : { allowFailedRunner: true, allowMissingRunner: true }),
    },
  });
  const bound = createAcceptancePolicyResource({ policy, uri: 't3x://policies/ref/main' });
  return bound satisfies Pick<TransitionPolicyBinding, 'policy' | 'resource'>;
}

function preparation(posture: 'source_only' | 'guided' | 'recommend' = 'guided') {
  const profile = proposalGenerationProfileResource(posture);
  return {
    schema: 't3x.dev/proposal-generation-preparation/v1',
    version: 1,
    profile: profile.profile,
    profileResource: profile.resource,
    context: {
      schema: 't3x.dev/proposal-context-bundle/v1',
      version: 1,
      base: { kind: 'state', schema: 't3x/state/v1', digest: DIGEST },
      yschema: resource('t3x://schemas/test'),
      sources: [resource('t3x://sources/1')],
      memories: [],
      searchResults: [],
      userInstruction: resource('t3x://instructions/1'),
      prompt: resource('t3x://prompts/generation/v1'),
    },
    requestedBy: { kind: 'human', id: 'user:reviewer' },
    generator: { kind: 'service', id: 'service:t3x-proposal-generator' },
    provider: 'test-provider',
    model: 'test-model',
    run: { id: 'run-1', recordedAt: '2026-08-13T00:00:00.000Z' },
    operationCount: 1,
    bindings: [
      {
        groupId: 'change-1',
        operationIndexes: [0],
        paths: ['$.device.name'],
        origin: 'recommended',
        evidence: [],
        basis: [],
        assumptions: [],
        reason: 'Provide a complete candidate',
        challenges: [],
      },
    ],
    warnings: [],
  } satisfies ProposalGenerationPreparationV1;
}

describe('resolveApplicableTransitionPolicy', () => {
  it('preserves the exact ref policy for ordinary Transition memberships', () => {
    const ref = refPolicyBinding();
    const applicable = resolveApplicableTransitionPolicy({
      refPolicyBinding: ref,
      requestKind: 'structured_yops',
      preparationFacts: null,
    });

    expect(applicable).toEqual({
      mode: 'ref_policy',
      policy: ref.policy,
      resource: ref.resource,
      refPolicyResource: ref.resource,
    });
  });

  it('adds an exact, required, non-overrideable posture runner without weakening ref rules', () => {
    const ref = refPolicyBinding({ allowSelfApproval: true });
    const applicable = resolveApplicableTransitionPolicy({
      refPolicyBinding: ref,
      requestKind: 'structured_yops',
      preparationFacts: preparation('guided') as unknown as ProtocolValue,
    });

    expect(applicable.mode).toBe('generation_overlay');
    expect(applicable.refPolicyResource).toEqual(ref.resource);
    expect(applicable.resource.digest).not.toBe(ref.resource.digest);
    expect(applicable.resource.uri).toContain('/guided');
    expect(applicable.policy.authorization.decide).toEqual(ref.policy.authorization.decide);
    expect(applicable.policy.authorization.override).toEqual(ref.policy.authorization.override);
    expect(applicable.policy.authorization.allowSelfApproval).toBe(false);
    expect(applicable.policy.claims).toEqual(ref.policy.claims);
    expect(applicable.policy.checks.replay).toEqual(ref.policy.checks.replay);
    expect(applicable.policy.checks.validation).toEqual(ref.policy.checks.validation);
    expect(applicable.policy.checks.humanConfirmation).toEqual(ref.policy.checks.humanConfirmation);
    expect(applicable.policy.checks.runner).toEqual({
      requirement: 'required',
      issuers: { mode: 'one_of', values: [PROPOSAL_POSTURE_VERIFIER_ACTOR] },
      tools: { mode: 'one_of', values: [PROPOSAL_POSTURE_VERIFIER_TOOL] },
      workflows: { mode: 'one_of', values: [PROPOSAL_POSTURE_VERIFIER_WORKFLOW] },
      environments: { mode: 'one_of', values: [PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT] },
    });
    expect(applicable.policy.override.allowMissingRunner).toBe(false);
    expect(applicable.policy.override.allowFailedRunner).toBe(false);
  });

  it('derives stable resources whose identity binds posture and the ref policy', () => {
    const first = resolveApplicableTransitionPolicy({
      refPolicyBinding: refPolicyBinding(),
      requestKind: 'structured_yops',
      preparationFacts: preparation('guided') as unknown as ProtocolValue,
    });
    const retry = resolveApplicableTransitionPolicy({
      refPolicyBinding: refPolicyBinding(),
      requestKind: 'structured_yops',
      preparationFacts: preparation('guided') as unknown as ProtocolValue,
    });
    const postureChange = resolveApplicableTransitionPolicy({
      refPolicyBinding: refPolicyBinding(),
      requestKind: 'structured_yops',
      preparationFacts: preparation('recommend') as unknown as ProtocolValue,
    });
    const refChange = resolveApplicableTransitionPolicy({
      refPolicyBinding: refPolicyBinding({ allowSelfApproval: false }),
      requestKind: 'structured_yops',
      preparationFacts: preparation('guided') as unknown as ProtocolValue,
    });

    expect(retry.resource).toEqual(first.resource);
    expect(postureChange.resource.digest).toBe(first.resource.digest);
    expect(postureChange.resource.uri).not.toBe(first.resource.uri);
    expect(refChange.resource.digest).toBe(first.resource.digest);
    expect(refChange.resource.uri).not.toBe(first.resource.uri);
  });

  it.each([
    'optional',
    'required',
  ] as const)('fails closed when the ref policy already has a %s runner rule', (runner) => {
    expect(() =>
      resolveApplicableTransitionPolicy({
        refPolicyBinding: refPolicyBinding({ runner }),
        requestKind: 'structured_yops',
        preparationFacts: preparation() as unknown as ProtocolValue,
      })
    ).toThrow(GenerationPolicyIncompatibleError);
  });

  it('fails closed for a malformed generation manifest', () => {
    expect(() =>
      resolveApplicableTransitionPolicy({
        refPolicyBinding: refPolicyBinding(),
        requestKind: 'structured_yops',
        preparationFacts: {
          schema: 't3x.dev/proposal-generation-preparation/v1',
          version: 1,
        },
      })
    ).toThrow(GenerationPolicyIntegrityError);
  });

  it('rejects a generation manifest attached to a non-YOps membership', () => {
    expect(() =>
      resolveApplicableTransitionPolicy({
        refPolicyBinding: refPolicyBinding(),
        requestKind: 'exact_source_import',
        preparationFacts: preparation() as unknown as ProtocolValue,
      })
    ).toThrow(GenerationPolicyIntegrityError);
  });
});
