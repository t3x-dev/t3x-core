import { z } from 'zod';
import type {
  AttachTransitionStatementResult,
  CommitTransitionResult,
  DecideTransitionResult,
  InspectTransitionResult,
  ProposeTransitionResult,
  TransitionProtocolValue,
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
    transition: ProtocolValueSchema,
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
    transition: ProtocolValueSchema,
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
