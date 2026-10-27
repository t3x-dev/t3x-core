import { createHash } from 'node:crypto';
import { WorkspaceFullSchemaReviewSchema } from '@t3x-dev/api-client';
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
import { isSchemaOnlyWorkspaceReview } from '../workspace-schema-content';

export const PROPOSAL_POSTURE_VERIFIER_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-proposal-posture-verifier',
});
export const PROPOSAL_GENERATION_POSTURE_PROVIDER_SOURCE =
  'native:proposal-generation-posture/v1' as const;
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

const TRANSITION_REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-transition-replay',
});
const TRANSITION_REPLAY_TOOL = Object.freeze({ name: '@t3x-dev/transition/replay', version: '1' });
const ANY_CLAIM = Object.freeze({
  allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
  minimumEvidence: 0,
  humanConfirmation: 'not_required',
});

/**
 * Policy for a ref with no protection rule: any human may decide, including the
 * proposer; Replay stays load-bearing and failed validation needs an override.
 */
export const UNPROTECTED_REF_POLICY = Object.freeze(
  createAcceptancePolicyResource({
    uri: 't3x://policies/unprotected-ref/v1',
    policy: {
      schema: 't3x.dev/acceptance-policy/v1',
      version: 1,
      authorization: {
        decide: { actors: { mode: 'any' } },
        override: { actors: { mode: 'any' } },
        allowSelfApproval: true,
      },
      claims: { intent: ANY_CLAIM, rationale: ANY_CLAIM },
      checks: {
        replay: {
          issuers: { mode: 'one_of', values: [TRANSITION_REPLAY_ACTOR] },
          tools: { mode: 'one_of', values: [TRANSITION_REPLAY_TOOL] },
          environments: { mode: 'one_of', values: [{ mode: 'unspecified' }] },
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
    },
  })
) as Pick<TransitionPolicyBinding, 'policy' | 'resource'>;

const WORKSPACE_REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-workspace-replay',
});
const WORKSPACE_REPLAY_TOOL = Object.freeze({ name: '@t3x-dev/core/yops-replay', version: '1' });

/**
 * Branch rule preset: the unprotected policy, except the proposer may not
 * approve their own change. Replay trusts both the repository and the Workspace
 * replay issuers so Workspace review keeps working once the ref is bound.
 */
export const INDEPENDENT_REVIEW_REF_POLICY = Object.freeze(
  createAcceptancePolicyResource({
    uri: 't3x://policies/independent-review-ref/v1',
    policy: {
      ...structuredClone(UNPROTECTED_REF_POLICY.policy),
      authorization: {
        ...structuredClone(UNPROTECTED_REF_POLICY.policy.authorization),
        allowSelfApproval: false,
      },
      checks: {
        ...structuredClone(UNPROTECTED_REF_POLICY.policy.checks),
        replay: {
          issuers: { mode: 'one_of', values: [TRANSITION_REPLAY_ACTOR, WORKSPACE_REPLAY_ACTOR] },
          tools: { mode: 'one_of', values: [WORKSPACE_REPLAY_TOOL, TRANSITION_REPLAY_TOOL] },
          environments: { mode: 'one_of', values: [{ mode: 'unspecified' }] },
        },
      },
    },
  })
) as Pick<TransitionPolicyBinding, 'policy' | 'resource'>;

/** Per-branch rules derived from the ref policy binding; new rule kinds add keys here. */
export interface BranchRules {
  commit: {
    requireIndependentReview: boolean;
    source: 'default' | 'preset' | 'custom';
  };
}

export function branchRulesFromBinding(
  binding: Pick<TransitionPolicyBinding, 'policy' | 'resource'> | null
): BranchRules {
  return {
    commit: {
      requireIndependentReview: binding !== null && !binding.policy.authorization.allowSelfApproval,
      source:
        binding === null
          ? 'default'
          : binding.resource.digest === INDEPENDENT_REVIEW_REF_POLICY.resource.digest
            ? 'preset'
            : 'custom',
    },
  };
}

export type BranchRuleChange =
  | { action: 'keep' }
  | { action: 'unbind' }
  | { action: 'bind'; uri: string; policy: AcceptancePolicy };

/**
 * Plan the binding change for a branch rule. Custom bindings keep every other
 * rule and only flip self-approval; the preset is unbound when review is lifted.
 */
export function planBranchRuleChange(input: {
  refName: string;
  binding: Pick<TransitionPolicyBinding, 'policy' | 'resource'> | null;
  requireIndependentReview: boolean;
}): BranchRuleChange {
  const { binding, requireIndependentReview } = input;
  if (binding === null) {
    return requireIndependentReview
      ? {
          action: 'bind',
          uri: INDEPENDENT_REVIEW_REF_POLICY.resource.uri,
          policy: INDEPENDENT_REVIEW_REF_POLICY.policy,
        }
      : { action: 'keep' };
  }
  if (binding.policy.authorization.allowSelfApproval === !requireIndependentReview) {
    return { action: 'keep' };
  }
  if (
    !requireIndependentReview &&
    binding.resource.digest === INDEPENDENT_REVIEW_REF_POLICY.resource.digest
  ) {
    return { action: 'unbind' };
  }
  return {
    action: 'bind',
    uri: `t3x://policies/branch-rule/v1/${encodeURIComponent(input.refName)}`,
    policy: {
      ...structuredClone(binding.policy),
      authorization: {
        ...structuredClone(binding.policy.authorization),
        allowSelfApproval: !requireIndependentReview,
      },
    },
  };
}

/**
 * Select the ref policy an actor is governed by. Humans fall back to the
 * unprotected policy; agent and service actors still require an explicit
 * binding, and an unknown caller sees only explicit bindings.
 */
export function refPolicyForActor<T extends Pick<TransitionPolicyBinding, 'policy' | 'resource'>>(
  binding: T | null,
  actor: { kind: 'human' | 'agent' | 'service' } | undefined
): T | Pick<TransitionPolicyBinding, 'policy' | 'resource'> | null {
  if (binding !== null) return binding;
  return actor?.kind === 'human' ? UNPROTECTED_REF_POLICY : null;
}

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
  mode: 'ref_policy' | 'generation_overlay' | 'workspace_schema_overlay';
  refPolicyResource: ResourceDescriptor;
}

function preparationSchema(value: ProtocolValue | null): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value.schema;
}

function generationPreparation(input: {
  requestKind: TransitionRequestKind;
  preparationFacts: ProtocolValue | null;
}): ReturnType<typeof parseProposalGenerationPreparation> | null {
  const schema = preparationSchema(input.preparationFacts);
  if (schema === 't3x.application/workspace-generation-preparation/v1') {
    const wrapped = input.preparationFacts as { generation: ProtocolValue };
    return generationPreparation({ ...input, preparationFacts: wrapped.generation });
  }
  if (schema === 't3x.application/workspace-authoring-preparation/v1') {
    const wrapped = input.preparationFacts as {
      ledger: { actions: Array<{ generation?: { preparation: ProtocolValue } }> };
    };
    if (!Array.isArray(wrapped.ledger?.actions))
      throw new GenerationPolicyIntegrityError('Invalid authoring manifest');
    const preparations = wrapped.ledger.actions.flatMap((action) =>
      action.generation
        ? [generationPreparation({ ...input, preparationFacts: action.generation.preparation })]
        : []
    );
    return preparations[0] ?? null;
  }
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
  const facts = input.preparationFacts;
  const workspaceSchemaReview =
    input.requestKind === 'structured_yops' &&
    preparationSchema(facts) === 't3x.application/workspace-authoring-preparation/v1' &&
    facts !== null &&
    typeof facts === 'object' &&
    !Array.isArray(facts) &&
    facts.schemaReview !== undefined
      ? WorkspaceFullSchemaReviewSchema.parse(facts.schemaReview)
      : null;
  // A bound Workspace contract is load-bearing even on an unprotected ref.
  // Provider failure is absence of evidence, never a passing Schema check.
  // Keep every branch authorization, issuer/profile constraint and runner rule.
  const ref = input.refPolicyBinding;
  const effective =
    workspaceSchemaReview?.draft.status === 'bound' &&
    !isSchemaOnlyWorkspaceReview(workspaceSchemaReview)
      ? createAcceptancePolicyResource({
          uri: `t3x://policies/workspace-schema-overlay/v1/${ref.resource.digest.slice('sha256:'.length)}`,
          policy: {
            ...structuredClone(ref.policy),
            checks: {
              ...structuredClone(ref.policy.checks),
              validation: {
                ...structuredClone(ref.policy.checks.validation),
                requirement: 'required',
              },
            },
            override: { ...structuredClone(ref.policy.override), allowMissingValidation: false },
          },
        })
      : ref;
  if (preparation === null) {
    return {
      mode: effective === ref ? 'ref_policy' : 'workspace_schema_overlay',
      policy: effective.policy,
      resource: effective.resource,
      refPolicyResource: ref.resource,
    };
  }
  const bound = createAcceptancePolicyResource({
    policy: generationOverlayPolicy(effective.policy),
    uri: `t3x://policies/proposal-generation-overlay/v1/${effective.resource.digest.slice(
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
