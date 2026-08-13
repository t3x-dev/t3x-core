import { parseProposalGenerationPreparation, parseRunnerValidationStatement } from '@t3x-dev/core';
import { canonicalizeProtocolValue, type ProtocolValue, type Statement } from '@t3x-dev/transition';
import { PROPOSAL_POSTURE_VERIFIER_TOOL } from './transition-control-plane/applicable-policy';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parts(path: string): string[] {
  if (path === '$' || path === '') return [];
  return path
    .replace(/^\$\.?/, '')
    .split(/[/.]/)
    .filter(Boolean);
}

function valueAt(root: ProtocolValue, path: string): ProtocolValue | undefined {
  let cursor: ProtocolValue | undefined = root;
  for (const part of parts(path)) {
    if (Array.isArray(cursor)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part] as ProtocolValue | undefined;
  }
  return cursor;
}

function sameValue(left: ProtocolValue | undefined, right: ProtocolValue | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalizeProtocolValue(left) === canonicalizeProtocolValue(right);
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
      priorValue: ProtocolValue;
      priorEvidence: unknown[];
      priorEvidenceAvailability: 'trusted' | 'unavailable';
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
  statements: readonly Statement[];
}): ProposalGenerationReviewProjection | null {
  if (
    !isRecord(input.preparationFacts) ||
    input.preparationFacts.schema !== 't3x.dev/proposal-generation-preparation/v1'
  ) {
    return null;
  }
  const preparation = parseProposalGenerationPreparation(input.preparationFacts);
  const runner = input.statements.flatMap((statement) => {
    if (statement.predicateType !== 't3x.dev/runner-validation/v1') return [];
    const parsed = parseRunnerValidationStatement(statement);
    return parsed.predicate.tool.name === PROPOSAL_POSTURE_VERIFIER_TOOL.name &&
      parsed.predicate.tool.version === PROPOSAL_POSTURE_VERIFIER_TOOL.version
      ? [parsed.predicate]
      : [];
  })[0];
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
          const before = valueAt(input.base, path);
          const after = valueAt(input.result, path);
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
        challenges: binding.challenges.map((challenge) => ({
          path: challenge.path,
          priorValue: structuredClone(challenge.priorValue),
          priorEvidence: structuredClone(challenge.priorEvidence),
          priorEvidenceAvailability:
            challenge.priorEvidence.length > 0 ? ('trusted' as const) : ('unavailable' as const),
          reason: challenge.reason,
          impactPaths: [...challenge.impactPaths],
        })),
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
      status: runner?.outcome ?? 'pending',
      findings: runner === undefined ? [] : structuredClone(runner.findings),
    },
  };
}
