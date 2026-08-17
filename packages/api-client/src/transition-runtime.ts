import { z } from 'zod';
import type {
  AttachTransitionStatementResult,
  CommitTransitionResult,
  DecideTransitionResult,
  InspectTransitionResult,
  ProposeTransitionResult,
  TransitionProtocolValue,
  TransitionViewV1,
  VerifyTransitionResult,
} from './types.js';

const TransitionIdSchema = z.string().regex(/^trn_[0-9a-f]{32}$/);
const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const RequestIdSchema = z.string().trim().min(1).max(200);

function isProtocolValue(value: unknown): value is TransitionProtocolValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return Number.isFinite(value) || typeof value !== 'number';
  }
  if (Array.isArray(value)) return value.every(isProtocolValue);
  if (typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).every(isProtocolValue);
}

const ProtocolValueSchema = z.custom<TransitionProtocolValue>(isProtocolValue, {
  message: 'Expected a JSON-compatible Transition protocol value',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isActorRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['human', 'agent', 'service'].includes(value.kind as string) &&
    typeof value.id === 'string' &&
    value.id.length > 0
  );
}

function isDigest(value: unknown): boolean {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isDescriptor(value: unknown, kind?: string, schema?: string): boolean {
  return (
    isRecord(value) &&
    (kind === undefined || value.kind === kind) &&
    (schema === undefined || value.schema === schema) &&
    isDigest(value.digest)
  );
}

function isClaimView(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.mode === 'unspecified') {
    return value.origin === 'not_provided' && Array.isArray(value.evidence);
  }
  return (
    typeof value.mode === 'string' &&
    ['request_source', 'inferred', 'actor_authored'].includes(value.origin as string) &&
    typeof value.value === 'string' &&
    Array.isArray(value.evidence)
  );
}

function isObservedCheck(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['observed', 'no_statement_observed'].includes(value.observation as string) &&
    Array.isArray(value.outcomes) &&
    Array.isArray(value.runs) &&
    Array.isArray(value.unsupportedProfiles)
  );
}

function isActionCapability(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['allowed', 'denied', 'not_applicable', 'not_evaluated'].includes(
      value.disposition as string
    ) &&
    Array.isArray(value.reasons) &&
    value.reasons.every(
      (reason) =>
        isRecord(reason) && typeof reason.code === 'string' && typeof reason.message === 'string'
    )
  );
}

function isStatementAudit(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDescriptor(value.statement, 'statement', 't3x/statement/v1') &&
    Array.isArray(value.subjects) &&
    value.subjects.every((subject) => isDescriptor(subject)) &&
    typeof value.predicateType === 'string' &&
    isActorRef(value.claimedActor) &&
    isActorRef(value.issuerActor)
  );
}

function isTransitionViewV1(value: unknown): value is TransitionViewV1 {
  if (
    !isRecord(value) ||
    value.schema !== 't3x.dev/transition-view/v1' ||
    value.version !== 1 ||
    value.mode !== 'transition'
  ) {
    return false;
  }

  const change = value.change;
  const claims = value.claims;
  const checks = value.checks;
  const decision = value.decision;
  const history = value.history;
  const capabilities = value.capabilities;
  const audit = value.audit;

  return (
    isRecord(change) &&
    isDescriptor(change.effect, 'effect', 't3x/effect/v1') &&
    isDescriptor(change.base, 'state', 't3x/state/v1') &&
    isDescriptor(change.result, 'state', 't3x/state/v1') &&
    isRecord(change.driver) &&
    typeof change.driver.protocol === 'string' &&
    typeof change.driver.protocolVersion === 'string' &&
    isDigest(change.driver.specDigest) &&
    Array.isArray(change.operations) &&
    change.operations.every(isProtocolValue) &&
    isRecord(claims) &&
    isDescriptor(claims.proposal, 'statement', 't3x/statement/v1') &&
    isActorRef(claims.actor) &&
    isClaimView(claims.intent) &&
    isClaimView(claims.rationale) &&
    isRecord(checks) &&
    ['verified', 'not_checked'].includes(checks.objectIntegrity as string) &&
    isRecord(checks.observationScope) &&
    ['complete', 'partial'].includes(checks.observationScope.completeness as string) &&
    isStringArray(checks.observationScope.sources) &&
    isObservedCheck(checks.replay) &&
    isObservedCheck(checks.validation) &&
    isObservedCheck(checks.runner) &&
    isRecord(checks.humanConfirmation) &&
    ['observed', 'no_statement_observed'].includes(
      checks.humanConfirmation.observation as string
    ) &&
    Array.isArray(checks.humanConfirmation.runs) &&
    isRecord(decision) &&
    (decision.observation === 'not_supplied' ||
      (decision.observation === 'supplied' &&
        isDescriptor(decision.statement, 'statement', 't3x/statement/v1') &&
        isActorRef(decision.actor) &&
        ['accepted', 'rejected', 'overridden'].includes(decision.outcome as string) &&
        isProtocolValue(decision.policy) &&
        Array.isArray(decision.considered) &&
        decision.considered.every((descriptor) =>
          isDescriptor(descriptor, 'statement', 't3x/statement/v1')
        ) &&
        isClaimView(decision.rationale) &&
        typeof decision.decidedAt === 'string')) &&
    isRecord(history) &&
    (history.observation === 'not_committed' ||
      (history.observation === 'committed' && isRecord(history.commit))) &&
    isRecord(capabilities) &&
    isActionCapability(capabilities.accept) &&
    isActionCapability(capabilities.override) &&
    isActionCapability(capabilities.reject) &&
    isActionCapability(capabilities.commit) &&
    isActionCapability(capabilities.revert) &&
    isRecord(audit) &&
    isDescriptor(audit.effect, 'effect', 't3x/effect/v1') &&
    isDescriptor(audit.proposal, 'statement', 't3x/statement/v1') &&
    Array.isArray(audit.statements) &&
    audit.statements.every(isStatementAudit) &&
    (audit.decision === undefined ||
      isDescriptor(audit.decision, 'statement', 't3x/statement/v1')) &&
    (audit.commit === undefined || isDescriptor(audit.commit, 'commit', 't3x/commit/v2'))
  );
}

const TransitionViewSchema = z.custom<TransitionViewV1>(isTransitionViewV1, {
  message: 'Expected a TransitionViewV1 projection',
});

const ActorRefSchema = z
  .object({
    kind: z.enum(['human', 'agent', 'service']),
    id: z.string().trim().min(1).max(500),
  })
  .strict();

const TransitionViewPreconditionSchema = z
  .object({
    workspace_revision: z.number().int().min(1),
    ref_name: z.string().trim().min(1).max(500),
    ref_head: DigestSchema.nullable(),
    effect_digest: DigestSchema,
    proposal_digest: DigestSchema,
    statement_digests: z.array(DigestSchema).max(1000),
    policy_digest: DigestSchema.nullable(),
    review_digest: DigestSchema.optional(),
  })
  .strict();

const TransitionStatementViewSchema = z
  .object({
    digest: DigestSchema,
    source: z.string().trim().min(1).max(500),
    issuer: ActorRefSchema,
    request_id: RequestIdSchema,
    created_at: z.string().trim().min(1).max(100),
  })
  .strict();

const TransitionControlPlaneViewSchema = z
  .object({
    transition_id: TransitionIdSchema,
    project_id: z.string().trim().min(1),
    workspace_id: z.string().trim().min(1).max(200),
    request_kind: z.enum([
      'structured_yops',
      'exact_source_import',
      'exact_source_edit',
      'exact_source_revert',
    ]),
    request_id: RequestIdSchema,
    created_at: z.string().trim().min(1).max(100),
    precondition: TransitionViewPreconditionSchema,
    transition: TransitionViewSchema,
    statements: z.array(TransitionStatementViewSchema).max(1000),
    generation: ProtocolValueSchema.optional(),
  })
  .strict();

const TransitionEnvelopeSchema = z
  .object({
    transition_id: TransitionIdSchema,
    reused: z.boolean().optional(),
    view: TransitionControlPlaneViewSchema,
  })
  .strict();

const InspectTransitionResultSchema = z
  .object({
    transition_id: TransitionIdSchema,
    view: TransitionControlPlaneViewSchema,
  })
  .strict() satisfies z.ZodType<InspectTransitionResult>;

const ProposeTransitionResultSchema =
  TransitionEnvelopeSchema.required() satisfies z.ZodType<ProposeTransitionResult>;

const VerifyTransitionResultSchema = TransitionEnvelopeSchema.extend({
  reused: z.boolean(),
  statements: z
    .array(
      z
        .object({
          transitionId: TransitionIdSchema,
          statementDigest: DigestSchema,
          source: z.string().trim().min(1).max(500),
          issuer: ActorRefSchema,
          requestId: RequestIdSchema,
          requestDigest: DigestSchema,
          createdAt: z.string().trim().min(1).max(100),
        })
        .strict()
    )
    .max(1000),
  operational_results: z
    .array(
      z
        .object({
          source: z.string().trim().min(1).max(500),
          outcome: z.enum(['no_statement', 'failed']),
          code: z.string().trim().min(1).max(200),
          message: z.string().trim().min(1).max(2000),
        })
        .strict()
    )
    .max(1000),
}).strict() satisfies z.ZodType<VerifyTransitionResult>;

const AttachTransitionStatementResultSchema =
  TransitionEnvelopeSchema.required() satisfies z.ZodType<AttachTransitionStatementResult>;

const DecideTransitionResultSchema = TransitionEnvelopeSchema.extend({
  reused: z.boolean(),
  decision_digest: DigestSchema,
  review_digest: DigestSchema,
  decision: ProtocolValueSchema,
}).strict() satisfies z.ZodType<DecideTransitionResult>;

const CommitTransitionResultSchema = z
  .object({
    transition_id: TransitionIdSchema,
    reused: z.boolean(),
    commit_digest: DigestSchema,
    commit: ProtocolValueSchema,
    transition: TransitionViewSchema,
    workspace: z.record(z.string(), z.unknown()).optional(),
  })
  .strict() satisfies z.ZodType<CommitTransitionResult>;

export const transitionResponseSchemas = {
  propose: ProposeTransitionResultSchema,
  inspect: InspectTransitionResultSchema,
  verify: VerifyTransitionResultSchema,
  attachStatement: AttachTransitionStatementResultSchema,
  decide: DecideTransitionResultSchema,
  commit: CommitTransitionResultSchema,
};
