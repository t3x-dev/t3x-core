import {
  generationValueAtPath,
  PROPOSAL_GENERATION_PREPARATION_MEDIA_TYPE,
  parseProposalGenerationPreparation,
  parseRunnerValidationStatement,
  proposalGenerationPreparationDigest,
} from '@t3x-dev/core';
import { canonicalizeProtocolValue, type ProtocolValue, type Statement } from '@t3x-dev/transition';
import {
  PROPOSAL_GENERATION_POSTURE_PROVIDER_SOURCE,
  PROPOSAL_POSTURE_VERIFIER_ACTOR,
  PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT,
  PROPOSAL_POSTURE_VERIFIER_TOOL,
  PROPOSAL_POSTURE_VERIFIER_WORKFLOW,
} from './transition-control-plane/applicable-policy';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameValue(left: ProtocolValue | undefined, right: ProtocolValue | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalizeProtocolValue(left) === canonicalizeProtocolValue(right);
}

function samePortable(left: unknown, right: unknown): boolean {
  return (
    canonicalizeProtocolValue(left as ProtocolValue) ===
    canonicalizeProtocolValue(right as ProtocolValue)
  );
}

type TrustedStatementObservation = {
  statement: Statement;
  source: string;
  issuer: Statement['actor'];
};

function exactPostureRunner(
  observation: TrustedStatementObservation,
  preparation: ReturnType<typeof parseProposalGenerationPreparation>
) {
  if (
    observation.source !== PROPOSAL_GENERATION_POSTURE_PROVIDER_SOURCE ||
    !samePortable(observation.issuer, PROPOSAL_POSTURE_VERIFIER_ACTOR) ||
    !samePortable(observation.statement.actor, PROPOSAL_POSTURE_VERIFIER_ACTOR) ||
    observation.statement.predicateType !== 't3x.dev/runner-validation/v1'
  ) {
    return null;
  }
  try {
    const parsed = parseRunnerValidationStatement(observation.statement);
    return samePortable(parsed.predicate.tool, PROPOSAL_POSTURE_VERIFIER_TOOL) &&
      samePortable(parsed.predicate.workflow, PROPOSAL_POSTURE_VERIFIER_WORKFLOW) &&
      samePortable(parsed.predicate.environment, PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT) &&
      parsed.predicate.inputManifest.mediaType === PROPOSAL_GENERATION_PREPARATION_MEDIA_TYPE &&
      parsed.predicate.inputManifest.digest === proposalGenerationPreparationDigest(preparation)
      ? parsed.predicate
      : null;
  } catch {
    return null;
  }
}

export interface ProposalGenerationReviewProjection {
  posture: 'source_only' | 'guided' | 'recommend';
  profileResource: { uri: string; mediaType: string; digest: string };
  requestedBy: { kind: 'human' | 'agent' | 'service'; id: string };
  generator: { kind: 'human' | 'agent' | 'service'; id: string };
  provider: string;
  model: string;
  run: { id: string; recordedAt: string };
  counts: { sourceBacked: number; inferred: number; recommended: number; challenges: number };
  groups: Array<{
    id: string;
    origin: 'source_backed' | 'inferred' | 'recommended';
    operationIndexes: number[];
    operations: ProtocolValue[];
    paths: string[];
    values: Array<{
      path: string;
      before: { availability: 'available'; value: ProtocolValue } | { availability: 'unavailable' };
      after: { availability: 'available'; value: ProtocolValue } | { availability: 'unavailable' };
      changed: boolean;
    }>;
    evidence: unknown[];
    basis: unknown[];
    assumptions: string[];
    reason: string;
    challenges: Array<{
      path: string;
      before: { availability: 'available'; value: ProtocolValue } | { availability: 'unavailable' };
      after: { availability: 'available'; value: ProtocolValue } | { availability: 'unavailable' };
      priorEvidence: unknown[];
      priorEvidenceAvailability: 'unavailable';
      reason: string;
      impactPaths: string[];
    }>;
  }>;
  warnings: string[];
  verification: {
    status: 'pending' | 'passed' | 'failed';
    findings: Array<{
      severity: 'error' | 'warning' | 'info';
      code: string;
      message: string;
      path?: string;
    }>;
  };
}

export function projectProposalGenerationReview(input: {
  preparationFacts: ProtocolValue | null;
  operations: ProtocolValue[];
  base: ProtocolValue;
  result: ProtocolValue;
  observations: readonly TrustedStatementObservation[];
}): ProposalGenerationReviewProjection | null {
  if (
    !isRecord(input.preparationFacts) ||
    input.preparationFacts.schema !== 't3x.dev/proposal-generation-preparation/v1'
  ) {
    return null;
  }
  const preparation = parseProposalGenerationPreparation(input.preparationFacts);
  const runners = input.observations.flatMap((observation) => {
    const runner = exactPostureRunner(observation, preparation);
    return runner === null ? [] : [runner];
  });
  const runnerOutcomes = new Set(runners.map((runner) => runner.outcome));
  const verificationStatus =
    runnerOutcomes.size === 0
      ? ('pending' as const)
      : runnerOutcomes.has('failed')
        ? ('failed' as const)
        : ('passed' as const);
  const verificationFindings = runners.flatMap((runner) => structuredClone(runner.findings));
  if (runnerOutcomes.has('passed') && runnerOutcomes.has('failed')) {
    verificationFindings.push({
      severity: 'error',
      code: 'RUNNER_CONFLICT',
      message: 'Conflicting trusted proposal posture verification Statements were observed.',
      path: '$.statements',
    });
  }
  const counts = { sourceBacked: 0, inferred: 0, recommended: 0, challenges: 0 };
  const groups: ProposalGenerationReviewProjection['groups'] = preparation.bindings.map(
    (binding) => {
      if (binding.origin === 'source_backed') counts.sourceBacked += 1;
      if (binding.origin === 'inferred') counts.inferred += 1;
      if (binding.origin === 'recommended') counts.recommended += 1;
      counts.challenges += binding.challenges.length;
      return {
        id: binding.groupId,
        origin: binding.origin,
        operationIndexes: [...binding.operationIndexes],
        operations: binding.operationIndexes.map((index) =>
          structuredClone(input.operations[index]!)
        ),
        paths: [...binding.paths],
        values: binding.paths.map((path) => {
          const before = generationValueAtPath(input.base, path);
          const after = generationValueAtPath(input.result, path);
          return {
            path,
            before:
              before === undefined
                ? ({ availability: 'unavailable' } as const)
                : ({ availability: 'available', value: structuredClone(before) } as const),
            after:
              after === undefined
                ? ({ availability: 'unavailable' } as const)
                : ({ availability: 'available', value: structuredClone(after) } as const),
            changed: !sameValue(before, after),
          };
        }),
        evidence: structuredClone(binding.evidence),
        basis: structuredClone(binding.basis),
        assumptions: [...binding.assumptions],
        reason: binding.reason,
        challenges: binding.challenges.map((challenge) => {
          const before = generationValueAtPath(input.base, challenge.path);
          const after = generationValueAtPath(input.result, challenge.path);
          return {
            path: challenge.path,
            before:
              before === undefined
                ? ({ availability: 'unavailable' } as const)
                : ({ availability: 'available', value: structuredClone(before) } as const),
            after:
              after === undefined
                ? ({ availability: 'unavailable' } as const)
                : ({ availability: 'available', value: structuredClone(after) } as const),
            priorEvidence: [],
            priorEvidenceAvailability: 'unavailable' as const,
            reason: challenge.reason,
            impactPaths: [...challenge.impactPaths],
          };
        }),
      };
    }
  );
  return {
    posture: preparation.profile.id,
    profileResource: structuredClone(preparation.profileResource),
    requestedBy: structuredClone(preparation.requestedBy),
    generator: structuredClone(preparation.generator),
    provider: preparation.provider,
    model: preparation.model,
    run: structuredClone(preparation.run),
    counts,
    groups,
    warnings: [...preparation.warnings],
    verification: {
      status: verificationStatus,
      findings: verificationFindings,
    },
  };
}
