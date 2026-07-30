import {
  type CanonicalTimestamp,
  canonicalizeProtocolValue,
  type Digest,
  type EffectDescriptor,
  type ExternalStatement,
  type ProtocolValue,
  parseStatement,
  type ResourceDescriptor,
  SchemaInvalidError,
  type StateDescriptor,
  type StatementDescriptor,
} from '@t3x-dev/transition';
import { z } from 'zod';

export const REPLAY_VERIFICATION_PREDICATE_TYPE = 't3x.dev/replay-verification/v1' as const;
export const YSCHEMA_VALIDATION_PREDICATE_TYPE = 't3x.dev/yschema-validation/v1' as const;
export const HUMAN_CONFIRMATION_PREDICATE_TYPE = 't3x.dev/human-confirmation/v1' as const;

export const YSCHEMA_PROFILE_ID = 't3x.dev/yschema/native' as const;
export const YSCHEMA_PROFILE_VERSION = '0.1' as const;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN =
  /^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])T([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;

const nonEmptyString = z.string().min(1);
const digest = z.custom<Digest>(
  (value) => typeof value === 'string' && DIGEST_PATTERN.test(value),
  'Expected a sha256 digest'
);
const canonicalTimestamp = z.custom<CanonicalTimestamp>(
  (value) => typeof value === 'string' && TIMESTAMP_PATTERN.test(value),
  'Expected a canonical UTC timestamp with millisecond precision'
);

const resourceDescriptorSchema = z
  .object({
    uri: nonEmptyString,
    mediaType: nonEmptyString,
    digest,
  })
  .strict();

const stateDescriptorSchema = z
  .object({
    kind: z.literal('state'),
    schema: z.literal('t3x/state/v1'),
    digest,
  })
  .strict();

const toolBindingSchema = z
  .object({
    name: nonEmptyString,
    version: nonEmptyString,
  })
  .strict();

const runBindingSchema = z
  .object({
    id: nonEmptyString,
    recordedAt: canonicalTimestamp,
  })
  .strict();

const profileBindingSchema = z
  .object({
    id: nonEmptyString,
    version: nonEmptyString,
  })
  .strict();

const resourceBindingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('unspecified') }).strict(),
  z
    .object({
      mode: z.literal('bound'),
      resource: resourceDescriptorSchema,
    })
    .strict(),
]);

const protocolValueSchema = z.custom<ProtocolValue>((value) => {
  try {
    canonicalizeProtocolValue(value as ProtocolValue);
    return true;
  } catch {
    return false;
  }
}, 'Expected an RFC 8785-compatible protocol value');

const validationErrorCodeSchema = z.enum([
  'INVALID_KEY',
  'INVALID_PATH',
  'INVALID_TYPE',
  'INVALID_ENUM',
  'INVALID_CONST',
  'INVALID_RANGE',
  'INVALID_LENGTH',
  'INVALID_PATTERN',
  'INVALID_REPEATED_ITEM_KEY',
  'INVALID_RELATION_TYPE',
  'INVALID_RELATION_ENDPOINT',
  'BROKEN_RELATION_ENDPOINT',
  'RELATION_ENDPOINT_MISMATCH',
  'SELF_RELATION',
  'DUPLICATE_RELATION',
  'RELATION_CYCLE',
  'UNEXPECTED_NODE',
  'UNEXPECTED_SLOT',
  'INVALID_SCHEMA',
]);

const validationGapCodeSchema = z.enum([
  'REQUIRED_NODE_MISSING',
  'REQUIRED_SLOT_MISSING',
  'REQUIRED_EVIDENCE_MISSING',
  'DEFAULT_REQUIRES_APPROVAL',
  'USER_CHOICE_REQUIRED',
  'USER_INPUT_REQUIRED',
]);

const validationErrorSchema = z
  .object({
    code: validationErrorCodeSchema,
    path: nonEmptyString,
    message: nonEmptyString,
    details: z.record(z.string(), protocolValueSchema).optional(),
  })
  .strict();

const validationGapSchema = z
  .object({
    code: validationGapCodeSchema,
    path: nonEmptyString,
    message: nonEmptyString,
    gapQuestion: nonEmptyString.optional(),
    fixIds: z.array(nonEmptyString).optional(),
    details: z.record(z.string(), protocolValueSchema).optional(),
  })
  .strict();

const fixChoiceSchema = z
  .object({
    label: nonEmptyString,
    value: protocolValueSchema.optional(),
    ops: z.array(protocolValueSchema),
  })
  .strict();

const fixProposalSchema = z
  .object({
    id: nonEmptyString,
    code: nonEmptyString,
    path: nonEmptyString,
    title: nonEmptyString,
    description: nonEmptyString.optional(),
    applyMode: z.enum(['automatic_after_review', 'requires_user_choice', 'requires_user_input']),
    ops: z.array(protocolValueSchema).optional(),
    choices: z.array(fixChoiceSchema).optional(),
  })
  .strict();

const runMetadataShape = {
  tool: toolBindingSchema,
  run: runBindingSchema,
  environment: resourceBindingSchema,
};

const replayVerifiedSchema = z
  .object({
    ...runMetadataShape,
    outcome: z.literal('verified'),
    result: stateDescriptorSchema,
  })
  .strict();

const replayFalseSchema = z
  .object({
    ...runMetadataShape,
    outcome: z.literal('false'),
    reason: nonEmptyString,
  })
  .strict();

const replayUnsupportedSchema = z
  .object({
    ...runMetadataShape,
    outcome: z.literal('unsupported'),
    reason: nonEmptyString,
  })
  .strict();

export const replayVerificationPredicateSchema = z.discriminatedUnion('outcome', [
  replayVerifiedSchema,
  replayFalseSchema,
  replayUnsupportedSchema,
]);

const yschemaMetadataShape = {
  ...runMetadataShape,
  schemaResource: resourceDescriptorSchema,
  profile: profileBindingSchema,
  context: resourceBindingSchema,
};

function validateYSchemaFlags(
  value: { valid: boolean; ready: boolean; errors: unknown[]; gaps: unknown[] },
  context: z.RefinementCtx
): void {
  const expectedValid = value.errors.length === 0;
  const expectedReady = expectedValid && value.gaps.length === 0;
  if (value.valid !== expectedValid) {
    context.addIssue({
      code: 'custom',
      message: 'YSchema valid must equal errors.length === 0',
      path: ['valid'],
    });
  }
  if (value.ready !== expectedReady) {
    context.addIssue({
      code: 'custom',
      message: 'YSchema ready must equal valid && gaps.length === 0',
      path: ['ready'],
    });
  }
}

const yschemaPassedSchema = z
  .object({
    ...yschemaMetadataShape,
    outcome: z.literal('passed'),
    valid: z.literal(true),
    ready: z.literal(true),
    errors: z.array(validationErrorSchema),
    gaps: z.array(validationGapSchema),
    fixes: z.array(fixProposalSchema),
  })
  .strict()
  .superRefine(validateYSchemaFlags);

const yschemaFailedSchema = z
  .object({
    ...yschemaMetadataShape,
    outcome: z.literal('failed'),
    valid: z.boolean(),
    ready: z.boolean(),
    errors: z.array(validationErrorSchema),
    gaps: z.array(validationGapSchema),
    fixes: z.array(fixProposalSchema),
  })
  .strict()
  .superRefine((value, context) => {
    validateYSchemaFlags(value, context);
    if (value.valid && value.ready) {
      context.addIssue({
        code: 'custom',
        message: 'A failed YSchema run cannot be both valid and ready',
        path: ['outcome'],
      });
    }
  });

const yschemaUnsupportedSchema = z
  .object({
    ...yschemaMetadataShape,
    outcome: z.literal('unsupported'),
    reason: nonEmptyString,
  })
  .strict();

export const yschemaValidationPredicateSchema = z.union([
  yschemaPassedSchema,
  yschemaFailedSchema,
  yschemaUnsupportedSchema,
]);

const CONFIRMABLE_CLAIMS = ['intent', 'rationale', 'evidence'] as const;
const humanConfirmationPredicateSchema = z
  .object({
    confirms: z.array(z.enum(CONFIRMABLE_CLAIMS)).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const ranks = value.confirms.map((claim) => CONFIRMABLE_CLAIMS.indexOf(claim));
    if (
      new Set(ranks).size !== ranks.length ||
      ranks.some((rank, index) => rank !== [...ranks].sort()[index])
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Confirmed claims must be unique and canonically ordered',
        path: ['confirms'],
      });
    }
  });

export type ToolBinding = z.infer<typeof toolBindingSchema>;
export type RunBinding = z.infer<typeof runBindingSchema>;
export type ProfileBinding = z.infer<typeof profileBindingSchema>;
export type ResourceBinding = z.infer<typeof resourceBindingSchema>;
export type ReplayVerificationPredicate = z.infer<typeof replayVerificationPredicateSchema>;
export type YSchemaValidationPredicate = z.infer<typeof yschemaValidationPredicateSchema>;
export type YSchemaValidationError = z.infer<typeof validationErrorSchema>;
export type YSchemaValidationGap = z.infer<typeof validationGapSchema>;
export type YSchemaFixProposal = z.infer<typeof fixProposalSchema>;
export type HumanConfirmationPredicate = z.infer<typeof humanConfirmationPredicateSchema>;

export type ReplayVerificationStatement = ExternalStatement<
  typeof REPLAY_VERIFICATION_PREDICATE_TYPE,
  ReplayVerificationPredicate
> & { subjects: [EffectDescriptor] };

export type YSchemaValidationStatement = ExternalStatement<
  typeof YSCHEMA_VALIDATION_PREDICATE_TYPE,
  YSchemaValidationPredicate
> & { subjects: [StateDescriptor] };

export type HumanConfirmationStatement = ExternalStatement<
  typeof HUMAN_CONFIRMATION_PREDICATE_TYPE,
  HumanConfirmationPredicate
> & { actor: { kind: 'human'; id: string }; subjects: [StatementDescriptor] };

function schemaError(error: z.ZodError, path: string): never {
  const issue = error.issues[0];
  const suffix = issue?.path.length === 0 ? '' : `.${issue?.path.join('.')}`;
  throw new SchemaInvalidError(issue?.message ?? 'Invalid Statement profile', `${path}${suffix}`);
}

function parsePredicate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) schemaError(parsed.error, '$.predicate');
  return parsed.data;
}

function assertSingleSubject(
  subjects: readonly { kind: string }[],
  kind: 'effect' | 'state' | 'statement'
): void {
  if (subjects.length !== 1 || subjects[0]?.kind !== kind) {
    throw new SchemaInvalidError(`Expected exactly one ${kind} subject`, '$.subjects');
  }
}

export function parseReplayVerificationStatement(value: unknown): ReplayVerificationStatement {
  const statement = parseStatement(value);
  if (statement.predicateType !== REPLAY_VERIFICATION_PREDICATE_TYPE) {
    throw new SchemaInvalidError(
      `Expected ${REPLAY_VERIFICATION_PREDICATE_TYPE}`,
      '$.predicateType'
    );
  }
  assertSingleSubject(statement.subjects, 'effect');
  return {
    ...statement,
    subjects: statement.subjects as [EffectDescriptor],
    predicate: parsePredicate(replayVerificationPredicateSchema, statement.predicate),
  } as ReplayVerificationStatement;
}

export function parseYSchemaValidationStatement(value: unknown): YSchemaValidationStatement {
  const statement = parseStatement(value);
  if (statement.predicateType !== YSCHEMA_VALIDATION_PREDICATE_TYPE) {
    throw new SchemaInvalidError(
      `Expected ${YSCHEMA_VALIDATION_PREDICATE_TYPE}`,
      '$.predicateType'
    );
  }
  assertSingleSubject(statement.subjects, 'state');
  return {
    ...statement,
    subjects: statement.subjects as [StateDescriptor],
    predicate: parsePredicate(yschemaValidationPredicateSchema, statement.predicate),
  } as YSchemaValidationStatement;
}

export function parseHumanConfirmationStatement(value: unknown): HumanConfirmationStatement {
  const statement = parseStatement(value);
  if (statement.predicateType !== HUMAN_CONFIRMATION_PREDICATE_TYPE) {
    throw new SchemaInvalidError(
      `Expected ${HUMAN_CONFIRMATION_PREDICATE_TYPE}`,
      '$.predicateType'
    );
  }
  assertSingleSubject(statement.subjects, 'statement');
  if (statement.actor.kind !== 'human') {
    throw new SchemaInvalidError('Human confirmation requires a human actor', '$.actor.kind');
  }
  return {
    ...statement,
    subjects: statement.subjects as [StatementDescriptor],
    predicate: parsePredicate(humanConfirmationPredicateSchema, statement.predicate),
  } as HumanConfirmationStatement;
}

export type { ResourceDescriptor };
