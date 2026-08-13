import { z } from 'zod';
import {
  type ProposalGenerationPreparationV1,
  parseProposalGenerationPreparation,
} from './generationDraft';

export const PROPOSAL_GENERATION_POSTURE_REPORT_SCHEMA =
  't3x.dev/proposal-generation-posture-report/v1' as const;

export const SourceSupportAssessmentSchema = z
  .object({
    groupId: z.string().trim().min(1),
    outcome: z.enum(['supported', 'unsupported', 'indeterminate']),
    method: z.enum(['deterministic_transform', 'independent_verifier', 'human_confirmation']),
  })
  .strict();

export type SourceSupportAssessment = z.infer<typeof SourceSupportAssessmentSchema>;

export const ProposalGenerationConflictObservationSchema = z
  .object({
    groupId: z.string().trim().min(1),
    path: z.string().trim().min(1),
    kind: z.enum(['source_disagreement', 'explicit_claim_replacement']),
  })
  .strict();

export type ProposalGenerationConflictObservation = z.infer<
  typeof ProposalGenerationConflictObservationSchema
>;

export type ProposalGenerationPostureIssueCode =
  | 'PREPARATION_INVALID'
  | 'SUPPORT_ASSESSMENT_INVALID'
  | 'SUPPORT_ASSESSMENT_UNKNOWN_GROUP'
  | 'CONFLICT_OBSERVATION_INVALID'
  | 'CONFLICT_OBSERVATION_UNKNOWN_GROUP'
  | 'SOURCE_CONFLICT'
  | 'SOURCE_REPLACEMENT_NOT_ALLOWED'
  | 'SILENT_CHALLENGE'
  | 'SOURCE_ONLY_ORIGIN_NOT_ALLOWED'
  | 'SOURCE_ONLY_CHALLENGE_NOT_ALLOWED'
  | 'GUIDED_CHALLENGE_NOT_ALLOWED'
  | 'SOURCE_EVIDENCE_REQUIRED'
  | 'SOURCE_SUPPORT_REQUIRED'
  | 'SOURCE_SUPPORT_FAILED'
  | 'INFERRED_BASIS_REQUIRED';

export interface ProposalGenerationPostureIssue {
  code: ProposalGenerationPostureIssueCode;
  severity: 'error' | 'warning';
  path: string;
  message: string;
  groupId?: string;
}

export interface ProposalGenerationPostureReportV1 {
  schema: typeof PROPOSAL_GENERATION_POSTURE_REPORT_SCHEMA;
  version: 1;
  outcome: 'passed' | 'failed';
  posture: ProposalGenerationPreparationV1['profile']['id'] | 'unknown';
  counts: {
    sourceBacked: number;
    inferred: number;
    recommended: number;
    challenges: number;
  };
  issues: ProposalGenerationPostureIssue[];
}

function failedPreparation(message: string): ProposalGenerationPostureReportV1 {
  return {
    schema: PROPOSAL_GENERATION_POSTURE_REPORT_SCHEMA,
    version: 1,
    outcome: 'failed',
    posture: 'unknown',
    counts: { sourceBacked: 0, inferred: 0, recommended: 0, challenges: 0 },
    issues: [
      {
        code: 'PREPARATION_INVALID',
        severity: 'error',
        path: '$',
        message,
      },
    ],
  };
}

/**
 * Pure semantic-boundary verifier. It consumes support conclusions but never
 * calls a model, reads storage, resolves bytes, or changes the generated YOps.
 */
export function verifyProposalGenerationPosture(input: {
  preparation: unknown;
  sourceSupport?: readonly unknown[];
  conflicts?: readonly unknown[];
}): ProposalGenerationPostureReportV1 {
  let preparation: ProposalGenerationPreparationV1;
  try {
    preparation = parseProposalGenerationPreparation(input.preparation);
  } catch (error) {
    return failedPreparation(
      error instanceof Error ? error.message : 'Proposal Generation Preparation is invalid'
    );
  }

  const issues: ProposalGenerationPostureIssue[] = [];
  const support = new Map<string, SourceSupportAssessment>();
  for (const [index, candidate] of (input.sourceSupport ?? []).entries()) {
    const parsed = SourceSupportAssessmentSchema.safeParse(candidate);
    if (!parsed.success) {
      issues.push({
        code: 'SUPPORT_ASSESSMENT_INVALID',
        severity: 'error',
        path: `$.sourceSupport.${index}`,
        message: parsed.error.issues[0]?.message ?? 'Invalid source support assessment',
      });
      continue;
    }
    if (support.has(parsed.data.groupId)) {
      issues.push({
        code: 'SUPPORT_ASSESSMENT_INVALID',
        severity: 'error',
        path: `$.sourceSupport.${index}.groupId`,
        message: 'Each Change Group may have at most one source support assessment',
        groupId: parsed.data.groupId,
      });
      continue;
    }
    support.set(parsed.data.groupId, parsed.data);
  }

  const groupIds = new Set(preparation.bindings.map((binding) => binding.groupId));
  for (const groupId of support.keys()) {
    if (!groupIds.has(groupId)) {
      issues.push({
        code: 'SUPPORT_ASSESSMENT_UNKNOWN_GROUP',
        severity: 'error',
        path: '$.sourceSupport',
        message: `Source support assessment names unknown Change Group ${groupId}`,
        groupId,
      });
    }
  }

  const conflicts: ProposalGenerationConflictObservation[] = [];
  for (const [index, candidate] of (input.conflicts ?? []).entries()) {
    const parsed = ProposalGenerationConflictObservationSchema.safeParse(candidate);
    if (!parsed.success) {
      issues.push({
        code: 'CONFLICT_OBSERVATION_INVALID',
        severity: 'error',
        path: `$.conflicts.${index}`,
        message: parsed.error.issues[0]?.message ?? 'Invalid conflict observation',
      });
      continue;
    }
    if (!groupIds.has(parsed.data.groupId)) {
      issues.push({
        code: 'CONFLICT_OBSERVATION_UNKNOWN_GROUP',
        severity: 'error',
        path: `$.conflicts.${index}.groupId`,
        message: `Conflict observation names unknown Change Group ${parsed.data.groupId}`,
        groupId: parsed.data.groupId,
      });
      continue;
    }
    conflicts.push(parsed.data);
  }

  const counts = {
    sourceBacked: 0,
    inferred: 0,
    recommended: 0,
    challenges: 0,
  };
  for (const [index, binding] of preparation.bindings.entries()) {
    const path = `$.preparation.bindings.${index}`;
    if (binding.origin === 'source_backed') counts.sourceBacked += 1;
    if (binding.origin === 'inferred') counts.inferred += 1;
    if (binding.origin === 'recommended') counts.recommended += 1;
    counts.challenges += binding.challenges.length;

    if (preparation.profile.id === 'source_only' && binding.origin !== 'source_backed') {
      issues.push({
        code: 'SOURCE_ONLY_ORIGIN_NOT_ALLOWED',
        severity: 'error',
        path: `${path}.origin`,
        message: 'source_only permits only source-backed Change Groups',
        groupId: binding.groupId,
      });
    }
    if (preparation.profile.id === 'source_only' && binding.challenges.length > 0) {
      issues.push({
        code: 'SOURCE_ONLY_CHALLENGE_NOT_ALLOWED',
        severity: 'error',
        path: `${path}.challenges`,
        message: 'source_only may report conflicts but cannot generate a challenge operation',
        groupId: binding.groupId,
      });
    }
    if (preparation.profile.id === 'guided' && binding.challenges.length > 0) {
      issues.push({
        code: 'GUIDED_CHALLENGE_NOT_ALLOWED',
        severity: 'error',
        path: `${path}.challenges`,
        message: 'guided may report a risk or conflict but cannot replace an explicit claim',
        groupId: binding.groupId,
      });
    }
    if (binding.origin === 'source_backed') {
      if (binding.evidence.length === 0) {
        issues.push({
          code: 'SOURCE_EVIDENCE_REQUIRED',
          severity: 'error',
          path: `${path}.evidence`,
          message: 'Source-backed Change Groups require immutable EvidenceRef values',
          groupId: binding.groupId,
        });
      }
      const assessment = support.get(binding.groupId);
      if (assessment === undefined || assessment.outcome === 'indeterminate') {
        issues.push({
          code: 'SOURCE_SUPPORT_REQUIRED',
          severity: 'error',
          path: `${path}.evidence`,
          message:
            'Evidence integrity alone does not prove semantic support; a conclusive support assessment is required',
          groupId: binding.groupId,
        });
      } else if (assessment.outcome === 'unsupported') {
        issues.push({
          code: 'SOURCE_SUPPORT_FAILED',
          severity: 'error',
          path: `${path}.evidence`,
          message: 'The cited Source does not support the generated value',
          groupId: binding.groupId,
        });
      }
    }
    if (
      binding.origin === 'inferred' &&
      binding.evidence.length === 0 &&
      binding.basis.length === 0
    ) {
      issues.push({
        code: 'INFERRED_BASIS_REQUIRED',
        severity: 'error',
        path: `${path}.basis`,
        message: 'Inferred Change Groups require at least one explicit Evidence or Basis resource',
        groupId: binding.groupId,
      });
    }
    for (const conflict of conflicts.filter((candidate) => candidate.groupId === binding.groupId)) {
      if (conflict.kind === 'source_disagreement') {
        issues.push({
          code: 'SOURCE_CONFLICT',
          severity: 'warning',
          path: conflict.path,
          message: 'Trusted Sources disagree at this path; no input-order winner was selected',
          groupId: binding.groupId,
        });
        continue;
      }
      if (preparation.profile.id !== 'recommend') {
        issues.push({
          code: 'SOURCE_REPLACEMENT_NOT_ALLOWED',
          severity: 'error',
          path: conflict.path,
          message: `${preparation.profile.id} cannot generate an operation that replaces an explicit trusted claim`,
          groupId: binding.groupId,
        });
        continue;
      }
      if (!binding.challenges.some((challenge) => challenge.path === conflict.path)) {
        issues.push({
          code: 'SILENT_CHALLENGE',
          severity: 'error',
          path: conflict.path,
          message:
            'recommend must expose every independently observed claim replacement as a challenge',
          groupId: binding.groupId,
        });
      }
    }
  }

  return {
    schema: PROPOSAL_GENERATION_POSTURE_REPORT_SCHEMA,
    version: 1,
    outcome: issues.some((issue) => issue.severity === 'error') ? 'failed' : 'passed',
    posture: preparation.profile.id,
    counts,
    issues,
  };
}
