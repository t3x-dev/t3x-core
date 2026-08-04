import {
  type ActorRef,
  canonicalizeProtocolValue,
  describeProtocolObject,
  type Effect,
  type ProposalStatement,
  type ProtocolValue,
  parseEffect,
  parseProposalStatement,
  type StringClaim,
  TransitionProtocolError,
} from '@t3x-dev/transition';
import {
  type DraftStringClaim,
  PROPOSAL_COMPILATION_REPORT_SCHEMA,
  type ProposalCompilationContext,
  type ProposalCompilationReport,
  type ProposalCompileIssue,
  type ProposalDraft,
  ProposalDraftSchema,
} from './draft';

export type ProposalCompilationResult =
  | {
      ok: true;
      proposal: ProposalStatement;
      report: ProposalCompilationReport;
    }
  | {
      ok: false;
      issues: ProposalCompileIssue[];
      draft: unknown;
    };

function compileClaim(
  claim: DraftStringClaim,
  path: '$.intent' | '$.rationale',
  issues: ProposalCompileIssue[]
): StringClaim | undefined {
  if (claim.mode === 'unspecified') return claim;

  if (claim.value === undefined) {
    issues.push({
      code: 'CLAIM_VALUE_REQUIRED',
      path: `${path}.value`,
      message: `${claim.mode} claims require an explicit value`,
    });
  }
  if (claim.evidence === undefined) {
    issues.push({
      code: 'CLAIM_EVIDENCE_REQUIRED',
      path: `${path}.evidence`,
      message: `${claim.mode} claims require an explicit evidence array`,
    });
  } else if (claim.mode === 'stated' && claim.evidence.length === 0) {
    issues.push({
      code: 'STATED_EVIDENCE_REQUIRED',
      path: `${path}.evidence`,
      message: 'Stated claims require at least one immutable EvidenceRef',
    });
  }

  if (claim.value === undefined || claim.evidence === undefined) return undefined;
  if (claim.mode === 'stated' && claim.evidence.length === 0) return undefined;
  return claim as StringClaim;
}

function createReport(
  draft: ProposalDraft,
  context: ProposalCompilationContext | undefined
): ProposalCompilationReport {
  const sourceCoverage: ProposalCompilationReport['sourceCoverage'] = {
    intent: { bound: 0, unverified: 0 },
    rationale: { bound: 0, unverified: 0 },
    unassigned: { bound: 0, unverified: 0 },
  };
  const boundEvidence = {
    intent: new Set<string>(),
    rationale: new Set<string>(),
    unassigned: new Set<string>(),
  };

  for (const claimName of ['intent', 'rationale'] as const) {
    const claim = draft[claimName];
    if (claim.mode === 'unspecified' || claim.evidence === undefined) continue;
    for (const evidence of claim.evidence) {
      boundEvidence[claimName].add(canonicalizeProtocolValue(evidence as unknown as ProtocolValue));
    }
  }
  for (const binding of draft.review.sourceBindings) {
    if (binding.status === 'bound') {
      boundEvidence[binding.claim].add(
        canonicalizeProtocolValue(binding.evidence as unknown as ProtocolValue)
      );
    } else {
      sourceCoverage[binding.claim].unverified += 1;
    }
  }
  for (const claimName of ['intent', 'rationale', 'unassigned'] as const) {
    sourceCoverage[claimName].bound = boundEvidence[claimName].size;
  }

  return {
    schema: PROPOSAL_COMPILATION_REPORT_SCHEMA,
    version: 1,
    unresolvedQuestions: [...draft.review.unresolvedQuestions],
    warnings: [...draft.review.warnings],
    sourceCoverage,
    ...(context?.legacyExtraction === undefined
      ? {}
      : {
          legacyExtraction: {
            ...context.legacyExtraction,
            items: context.legacyExtraction.items.map((item) => ({ ...item })),
          },
        }),
  };
}

/**
 * Pure application compiler. It records Claims around an already-derived
 * Effect; it does not replay, call an LLM, read storage, or decide policy.
 */
export function compileProposalDraft(input: {
  draft: unknown;
  effect: Effect;
  actor: ActorRef;
  context?: ProposalCompilationContext;
}): ProposalCompilationResult {
  const parsedDraft = ProposalDraftSchema.safeParse(input.draft);
  if (!parsedDraft.success) {
    return {
      ok: false,
      draft: input.draft,
      issues: parsedDraft.error.issues.map((issue) => ({
        code: 'DRAFT_INVALID',
        path: issue.path.length === 0 ? '$' : `$.${issue.path.join('.')}`,
        message: issue.message,
      })),
    };
  }

  const issues: ProposalCompileIssue[] = [];
  const intent = compileClaim(parsedDraft.data.intent, '$.intent', issues);
  const rationale = compileClaim(parsedDraft.data.rationale, '$.rationale', issues);
  if (issues.length > 0 || intent === undefined || rationale === undefined) {
    return { ok: false, draft: parsedDraft.data, issues };
  }

  try {
    const effect = parseEffect(input.effect);
    const proposal = parseProposalStatement({
      schema: 't3x/statement/v1',
      subjects: [describeProtocolObject(effect)],
      actor: input.actor,
      predicateType: 't3x.proposal/v1',
      predicate: { intent, rationale },
    });
    return {
      ok: true,
      proposal,
      report: createReport(parsedDraft.data, input.context),
    };
  } catch (error) {
    return {
      ok: false,
      draft: parsedDraft.data,
      issues: [
        {
          code: 'PROTOCOL_INVALID',
          path: error instanceof TransitionProtocolError ? (error.path ?? '$') : '$',
          message: error instanceof Error ? error.message : 'Protocol compilation failed',
        },
      ],
    };
  }
}
