import { createHash } from 'node:crypto';
import {
  type AcceptancePolicy,
  createAcceptancePolicyResource,
  PROPOSAL_GENERATION_PREPARATION_SCHEMA,
  parseProposalGenerationPreparation,
} from '@t3x-dev/core';
import type { TransitionPolicyBinding, TransitionRequestKind } from '@t3x-dev/storage';
import {
  canonicalizeProtocolValue,
  type ProtocolValue,
  type ResourceDescriptor,
} from '@t3x-dev/transition';

export const PROPOSAL_POSTURE_VERIFIER_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-proposal-posture-verifier',
});
export const PROPOSAL_POSTURE_VERIFIER_TOOL = Object.freeze({
  name: '@t3x-dev/core/proposal-generation-posture',
  version: '1',
});

function canonicalResource(
  uri: string,
  mediaType: string,
  value: ProtocolValue
): ResourceDescriptor {
  const canonical = canonicalizeProtocolValue(value);
  return {
    uri,
    mediaType,
    digest: `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`,
  };
}

export const PROPOSAL_POSTURE_VERIFIER_WORKFLOW = Object.freeze(
  canonicalResource(
    't3x://runner-workflows/proposal-generation-posture/v1',
    'application/vnd.t3x.runner-workflow+json',
    {
      schema: 't3x.dev/runner-workflow/v1',
      version: 1,
      name: 'proposal-generation-posture',
      inputManifestSchema: PROPOSAL_GENERATION_PREPARATION_SCHEMA,
      verifier: PROPOSAL_POSTURE_VERIFIER_TOOL,
    }
  )
);

export const PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT = Object.freeze(
  canonicalResource(
    't3x://runner-environments/native-proposal-posture/v1',
    'application/vnd.t3x.runner-environment+json',
    {
      schema: 't3x.dev/runner-environment/v1',
      version: 1,
      runtime: 't3x-native',
      network: 'not_required',
    }
  )
);

export class GenerationPolicyIncompatibleError extends Error {
  readonly code = 'GENERATION_POLICY_INCOMPATIBLE';

  constructor(message: string) {
    super(message);
    this.name = 'GenerationPolicyIncompatibleError';
  }
}

export class GenerationPolicyIntegrityError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'GenerationPolicyIntegrityError';
  }
}

export class GenerationHumanDecisionRequiredError extends Error {
  readonly code = 'GENERATION_HUMAN_DECISION_REQUIRED';

  constructor() {
    super('Generated Proposals require a human Decision');
    this.name = 'GenerationHumanDecisionRequiredError';
  }
}

export interface ApplicableTransitionPolicy {
  policy: AcceptancePolicy;
  resource: ResourceDescriptor;
  mode: 'ref_policy' | 'generation_overlay';
  refPolicyResource: ResourceDescriptor;
}

function preparationSchema(value: ProtocolValue | null): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value.schema;
}

function generationPreparation(input: {
  requestKind: TransitionRequestKind;
  preparationFacts: ProtocolValue | null;
}) {
  const schema = preparationSchema(input.preparationFacts);
  if (schema !== PROPOSAL_GENERATION_PREPARATION_SCHEMA) return null;
  if (input.requestKind !== 'structured_yops') {
    throw new GenerationPolicyIntegrityError(
      'Proposal Generation preparation facts require a structured_yops request membership'
    );
  }
  try {
    return parseProposalGenerationPreparation(input.preparationFacts);
  } catch (error) {
    throw new GenerationPolicyIntegrityError(
      error instanceof Error ? error.message : 'Proposal Generation preparation facts are invalid'
    );
  }
}

/** Enforce the server-owned profile's Alpha human-decision boundary. */
export function assertGenerationDecisionActor(input: {
  actor: { kind: 'human' | 'agent' | 'service'; id: string };
  requestKind: TransitionRequestKind;
  preparationFacts: ProtocolValue | null;
}): void {
  if (generationPreparation(input) !== null && input.actor.kind !== 'human') {
    throw new GenerationHumanDecisionRequiredError();
  }
}

function generationOverlayPolicy(refPolicy: AcceptancePolicy): AcceptancePolicy {
  if (refPolicy.checks.runner !== undefined) {
    throw new GenerationPolicyIncompatibleError(
      'AcceptancePolicy v1 cannot require the Proposal posture verifier together with an existing runner rule'
    );
  }
  return {
    ...structuredClone(refPolicy),
    authorization: {
      ...structuredClone(refPolicy.authorization),
      allowSelfApproval: false,
    },
    checks: {
      ...structuredClone(refPolicy.checks),
      runner: {
        requirement: 'required',
        issuers: { mode: 'one_of', values: [PROPOSAL_POSTURE_VERIFIER_ACTOR] },
        tools: { mode: 'one_of', values: [PROPOSAL_POSTURE_VERIFIER_TOOL] },
        workflows: { mode: 'one_of', values: [PROPOSAL_POSTURE_VERIFIER_WORKFLOW] },
        environments: { mode: 'one_of', values: [PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT] },
      },
    },
    override: {
      ...structuredClone(refPolicy.override),
      allowFailedRunner: false,
      allowMissingRunner: false,
    },
  };
}

/** Select the exact server-owned policy applicable to one immutable Transition membership. */
export function resolveApplicableTransitionPolicy(input: {
  refPolicyBinding: Pick<TransitionPolicyBinding, 'policy' | 'resource'>;
  requestKind: TransitionRequestKind;
  preparationFacts: ProtocolValue | null;
}): ApplicableTransitionPolicy {
  const preparation = generationPreparation(input);
  if (preparation === null) {
    return {
      mode: 'ref_policy',
      policy: input.refPolicyBinding.policy,
      resource: input.refPolicyBinding.resource,
      refPolicyResource: input.refPolicyBinding.resource,
    };
  }
  const bound = createAcceptancePolicyResource({
    policy: generationOverlayPolicy(input.refPolicyBinding.policy),
    uri: `t3x://policies/proposal-generation-overlay/v1/${input.refPolicyBinding.resource.digest.slice(
      'sha256:'.length
    )}/${preparation.profile.id}`,
  });
  return {
    mode: 'generation_overlay',
    policy: bound.policy,
    resource: bound.resource,
    refPolicyResource: input.refPolicyBinding.resource,
  };
}
