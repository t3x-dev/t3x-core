import {
  canonicalizeProtocolValue,
  type EvidenceRef,
  type ProtocolValue,
  type ResourceDescriptor,
} from '@t3x-dev/transition';
import { spec, type YOp, YOpSchema } from '@t3x-dev/yops';
import type { ProposalDraft } from './draft';
import {
  type DraftBasisPointer,
  type DraftEvidencePointer,
  ProposalContextBundleSchema,
  type ProposalContextBundleV1,
  type ProposalGenerationDraftClaim,
  ProposalGenerationDraftSchema,
  type ProposalGenerationDraftV1,
  ProposalGenerationPreparationSchema,
  type ProposalGenerationPreparationV1,
} from './generationDraft';
import {
  assertBuiltInProposalGenerationProfile,
  type ProposalGenerationProfileV1,
  proposalGenerationProfileResource,
} from './generationProfile';

export type ProposalGenerationCompileIssueCode =
  | 'DRAFT_INVALID'
  | 'PROFILE_INVALID'
  | 'POSTURE_MISMATCH'
  | 'CONTEXT_INVALID'
  | 'ACTOR_INVALID'
  | 'EVIDENCE_BINDING_INVALID'
  | 'EVIDENCE_BINDING_MISSING'
  | 'BASIS_POINTER_INVALID'
  | 'OPERATION_INVALID'
  | 'PREPARATION_INVALID';

export interface ProposalGenerationCompileIssue {
  code: ProposalGenerationCompileIssueCode;
  path: string;
  message: string;
}

export interface VerifiedDraftEvidenceBinding {
  pointer: DraftEvidencePointer;
  evidence: EvidenceRef;
}

export type ProposalGenerationCompilationResult =
  | {
      ok: true;
      operations: ProtocolValue[];
      proposalDraft: ProposalDraft;
      preparation: ProposalGenerationPreparationV1;
    }
  | {
      ok: false;
      draft: unknown;
      issues: ProposalGenerationCompileIssue[];
    };

function canonicalKey(value: unknown): string {
  return canonicalizeProtocolValue(value as ProtocolValue);
}

function compareCanonical(left: unknown, right: unknown): number {
  const leftKey = canonicalKey(left);
  const rightKey = canonicalKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function pointerKey(pointer: DraftEvidencePointer): string {
  return canonicalKey(pointer);
}

function sameResource(left: ResourceDescriptor, right: ResourceDescriptor): boolean {
  return (
    left.uri === right.uri && left.mediaType === right.mediaType && left.digest === right.digest
  );
}

function collectZodIssues(
  code: ProposalGenerationCompileIssueCode,
  error: { issues: Array<{ path: PropertyKey[]; message: string }> }
): ProposalGenerationCompileIssue[] {
  return error.issues.map((issue) => ({
    code,
    path: issue.path.length === 0 ? '$' : `$.${issue.path.map(String).join('.')}`,
    message: issue.message,
  }));
}

function verifiedEvidenceMap(
  context: ProposalContextBundleV1,
  bindings: readonly VerifiedDraftEvidenceBinding[],
  issues: ProposalGenerationCompileIssue[]
): Map<string, EvidenceRef> {
  const result = new Map<string, EvidenceRef>();
  for (const [index, binding] of bindings.entries()) {
    const source = context.sources[binding.pointer.sourceIndex];
    const path = `$.evidenceBindings.${index}`;
    if (source === undefined) {
      issues.push({
        code: 'EVIDENCE_BINDING_INVALID',
        path: `${path}.pointer.sourceIndex`,
        message: 'Evidence pointer does not name a Source in the exact Context Bundle',
      });
      continue;
    }
    if (
      !sameResource(binding.evidence.resource, source) ||
      canonicalKey(binding.evidence.locator) !== canonicalKey(binding.pointer.locator)
    ) {
      issues.push({
        code: 'EVIDENCE_BINDING_INVALID',
        path,
        message:
          'Verified EvidenceRef does not bind the exact Source and locator named by the pointer',
      });
      continue;
    }
    const key = pointerKey(binding.pointer);
    const prior = result.get(key);
    if (prior !== undefined && canonicalKey(prior) !== canonicalKey(binding.evidence)) {
      issues.push({
        code: 'EVIDENCE_BINDING_INVALID',
        path,
        message: 'One evidence pointer cannot resolve to multiple EvidenceRef values',
      });
      continue;
    }
    result.set(key, structuredClone(binding.evidence));
  }
  return result;
}

function resolveEvidence(
  pointers: readonly DraftEvidencePointer[],
  evidence: ReadonlyMap<string, EvidenceRef>,
  path: string,
  issues: ProposalGenerationCompileIssue[]
): EvidenceRef[] {
  const resolved: EvidenceRef[] = [];
  for (const [index, pointer] of pointers.entries()) {
    const value = evidence.get(pointerKey(pointer));
    if (value === undefined) {
      issues.push({
        code: 'EVIDENCE_BINDING_MISSING',
        path: `${path}.${index}`,
        message: 'Draft evidence pointer has no server-verified EvidenceRef binding',
      });
      continue;
    }
    resolved.push(structuredClone(value));
  }
  const unique = new Map(resolved.map((value) => [canonicalKey(value), value]));
  return [...unique.values()].sort(compareCanonical);
}

function resolveBasis(
  pointers: readonly DraftBasisPointer[],
  context: ProposalContextBundleV1,
  path: string,
  issues: ProposalGenerationCompileIssue[]
): ResourceDescriptor[] {
  const resolved: ResourceDescriptor[] = [];
  for (const [index, pointer] of pointers.entries()) {
    const collection =
      pointer.kind === 'source'
        ? context.sources
        : pointer.kind === 'memory'
          ? context.memories
          : context.searchResults;
    const resource = collection[pointer.index];
    if (resource === undefined) {
      issues.push({
        code: 'BASIS_POINTER_INVALID',
        path: `${path}.${index}`,
        message: `Basis pointer does not name a ${pointer.kind} resource in the exact Context Bundle`,
      });
      continue;
    }
    resolved.push(structuredClone(resource));
  }
  const unique = new Map(resolved.map((value) => [canonicalKey(value), value]));
  return [...unique.values()].sort(compareCanonical);
}

function canonicalOperation(
  operation: ProtocolValue,
  path: string,
  issues: ProposalGenerationCompileIssue[]
): { operation: ProtocolValue; parsed: YOp } | null {
  if (
    operation !== null &&
    typeof operation === 'object' &&
    !Array.isArray(operation) &&
    Reflect.ownKeys(operation).includes('source')
  ) {
    issues.push({
      code: 'OPERATION_INVALID',
      path: `${path}.source`,
      message: 'Generated Effect operations cannot carry source metadata',
    });
    return null;
  }
  const parsed = YOpSchema.safeParse(operation);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        code: 'OPERATION_INVALID',
        path: `${path}${issue.path.length ? `.${issue.path.join('.')}` : ''}`,
        message: issue.message,
      });
    }
    return null;
  }
  return {
    operation: JSON.parse(canonicalizeProtocolValue(parsed.data as ProtocolValue)) as ProtocolValue,
    parsed: parsed.data as YOp,
  };
}

/** Derive relevant YOps paths from the native specification rather than model-authored metadata. */
export function generationOperationPaths(operation: YOp): string[] {
  const operationName = Object.keys(operation)[0];
  const operationSpec = operationName === undefined ? undefined : spec.operations[operationName];
  const payload =
    operationName === undefined
      ? undefined
      : (operation as unknown as Record<string, Record<string, unknown>>)[operationName];
  if (operationSpec === undefined || payload === undefined) return [];
  const fields = Object.values(operationSpec.path_fields).filter(
    (field): field is string => typeof field === 'string'
  );
  const paths = fields.flatMap((field) => {
    const value = payload[field];
    return typeof value === 'string' ? [value.length === 0 ? '$' : value] : [];
  });
  return [...new Set(paths)].sort();
}

function compileClaim(
  claim: ProposalGenerationDraftClaim,
  evidence: ReadonlyMap<string, EvidenceRef>,
  path: '$.intent' | '$.rationale',
  issues: ProposalGenerationCompileIssue[]
): ProposalDraft['intent'] {
  if (claim.mode === 'unspecified') return { mode: 'unspecified' };
  return {
    mode: claim.mode,
    value: claim.value,
    evidence: resolveEvidence(claim.evidencePointers, evidence, `${path}.evidencePointers`, issues),
  };
}

export function compileProposalGenerationDraft(input: {
  draft: unknown;
  profile: unknown;
  context: unknown;
  requestedBy: { kind: 'human' | 'agent' | 'service'; id: string };
  generator: { kind: 'service'; id: string };
  provider: string;
  model: string;
  run: { id: string; recordedAt: string };
  evidenceBindings: readonly VerifiedDraftEvidenceBinding[];
}): ProposalGenerationCompilationResult {
  const issues: ProposalGenerationCompileIssue[] = [];
  const parsedDraft = ProposalGenerationDraftSchema.safeParse(input.draft);
  if (!parsedDraft.success) {
    return {
      ok: false,
      draft: input.draft,
      issues: collectZodIssues('DRAFT_INVALID', parsedDraft.error),
    };
  }
  let profile: ProposalGenerationProfileV1;
  try {
    profile = assertBuiltInProposalGenerationProfile(input.profile);
  } catch (error) {
    return {
      ok: false,
      draft: parsedDraft.data,
      issues: [
        {
          code: 'PROFILE_INVALID',
          path: '$.profile',
          message: error instanceof Error ? error.message : 'Invalid generation profile',
        },
      ],
    };
  }
  if (parsedDraft.data.posture !== profile.id) {
    issues.push({
      code: 'POSTURE_MISMATCH',
      path: '$.draft.posture',
      message: `Draft posture ${parsedDraft.data.posture} does not match profile ${profile.id}`,
    });
  }
  const parsedContext = ProposalContextBundleSchema.safeParse(input.context);
  if (!parsedContext.success) {
    issues.push(...collectZodIssues('CONTEXT_INVALID', parsedContext.error));
  }
  if (input.requestedBy.id.trim().length === 0 || input.generator.id.trim().length === 0) {
    issues.push({
      code: 'ACTOR_INVALID',
      path: '$.actors',
      message: 'Requester and generator actor ids must be non-empty',
    });
  }
  if (!parsedContext.success || issues.length > 0) {
    return { ok: false, draft: parsedDraft.data, issues };
  }

  const draft: ProposalGenerationDraftV1 = parsedDraft.data;
  const context: ProposalContextBundleV1 = parsedContext.data;
  const evidenceMap = verifiedEvidenceMap(context, input.evidenceBindings, issues);
  const operations: ProtocolValue[] = [];
  const bindings: ProposalGenerationPreparationV1['bindings'] = [];

  for (const [changeIndex, change] of draft.changes.entries()) {
    const operationIndexes: number[] = [];
    const paths = new Set<string>();
    for (const [localIndex, operation] of change.operations.entries()) {
      const compiled = canonicalOperation(
        operation,
        `$.draft.changes.${changeIndex}.operations.${localIndex}`,
        issues
      );
      if (compiled === null) continue;
      operationIndexes.push(operations.length);
      operations.push(compiled.operation);
      for (const path of generationOperationPaths(compiled.parsed)) paths.add(path);
    }
    const changeEvidence = resolveEvidence(
      change.evidencePointers,
      evidenceMap,
      `$.draft.changes.${changeIndex}.evidencePointers`,
      issues
    );
    const basis = resolveBasis(
      change.basisPointers,
      context,
      `$.draft.changes.${changeIndex}.basisPointers`,
      issues
    );
    const challenges = change.challenges.map((challenge, challengeIndex) => ({
      path: challenge.path,
      priorValue: structuredClone(challenge.priorValue),
      priorEvidence: resolveEvidence(
        challenge.priorEvidencePointers,
        evidenceMap,
        `$.draft.changes.${changeIndex}.challenges.${challengeIndex}.priorEvidencePointers`,
        issues
      ),
      reason: challenge.reason,
      impactPaths: [...new Set(challenge.impactPaths)].sort(),
    }));
    bindings.push({
      groupId: change.id,
      operationIndexes,
      paths: [...paths].sort(),
      origin: change.claimedOrigin,
      evidence: changeEvidence,
      basis,
      assumptions: [...change.assumptions],
      reason: change.reason,
      challenges,
    });
  }

  const intent = compileClaim(draft.intent, evidenceMap, '$.intent', issues);
  const rationale = compileClaim(draft.rationale, evidenceMap, '$.rationale', issues);
  if (issues.length > 0) return { ok: false, draft, issues };

  const profileBinding = proposalGenerationProfileResource(profile.id);
  const preparationCandidate = {
    schema: 't3x.dev/proposal-generation-preparation/v1' as const,
    version: 1 as const,
    profile: profileBinding.profile,
    profileResource: profileBinding.resource,
    context,
    requestedBy: structuredClone(input.requestedBy),
    generator: structuredClone(input.generator),
    provider: input.provider,
    model: input.model,
    run: structuredClone(input.run),
    operationCount: operations.length,
    bindings,
    warnings: [...draft.warnings],
  };
  const preparation = ProposalGenerationPreparationSchema.safeParse(preparationCandidate);
  if (!preparation.success) {
    return {
      ok: false,
      draft,
      issues: collectZodIssues('PREPARATION_INVALID', preparation.error),
    };
  }

  const sourceBindings: ProposalDraft['review']['sourceBindings'] = bindings.flatMap((binding) =>
    binding.evidence.map((evidence) => ({
      status: 'bound' as const,
      claim: 'unassigned' as const,
      evidence: structuredClone(evidence),
      operationIndexes: [...binding.operationIndexes],
      paths: [...binding.paths],
    }))
  );
  return {
    ok: true,
    operations,
    proposalDraft: {
      schema: 't3x/proposal-draft',
      version: 1,
      intent,
      rationale,
      review: {
        unresolvedQuestions: [],
        warnings: [...draft.warnings],
        sourceBindings,
      },
    },
    preparation: preparation.data,
  };
}
