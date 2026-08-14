import { createHash } from 'node:crypto';
import {
  canonicalizeProtocolValue,
  type Digest,
  type EvidenceRef,
  type ProtocolValue,
  type ResourceDescriptor,
  SchemaInvalidError,
} from '@t3x-dev/transition';
import { z } from 'zod';
import {
  assertBuiltInProposalGenerationProfile,
  PROPOSAL_GENERATION_POSTURES,
  PROPOSAL_GENERATION_PROFILE_MEDIA_TYPE,
  type ProposalGenerationProfileV1,
  proposalGenerationProfileDigest,
} from './generationProfile';

export const PROPOSAL_GENERATION_DRAFT_SCHEMA = 't3x.dev/proposal-generation-draft/v1' as const;
export const PROPOSAL_GENERATION_PREPARATION_SCHEMA =
  't3x.dev/proposal-generation-preparation/v1' as const;
export const PROPOSAL_GENERATION_PREPARATION_MEDIA_TYPE =
  'application/vnd.t3x.proposal-generation-preparation+json' as const;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN =
  /^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])T([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;
const nonEmptyString = z.string().trim().min(1);
const digestSchema = z.custom<Digest>(
  (value) => typeof value === 'string' && DIGEST_PATTERN.test(value),
  'Expected a lowercase sha256 digest'
);
const protocolValueSchema = z.custom<ProtocolValue>((value) => {
  try {
    canonicalizeProtocolValue(value as ProtocolValue);
    return true;
  } catch {
    return false;
  }
}, 'Expected an RFC 8785-compatible value');

const resourceDescriptorSchema = z
  .object({
    uri: nonEmptyString,
    mediaType: nonEmptyString,
    digest: digestSchema,
  })
  .strict();

const stateDescriptorSchema = z
  .object({
    kind: z.literal('state'),
    schema: z.literal('t3x/state/v1'),
    digest: digestSchema,
  })
  .strict();

const actorRefSchema = z
  .object({
    kind: z.enum(['human', 'agent', 'service']),
    id: nonEmptyString,
  })
  .strict();

const locatorSchema = z
  .object({
    scheme: nonEmptyString,
    value: protocolValueSchema,
  })
  .strict();

const evidenceRefSchema: z.ZodType<EvidenceRef> = z
  .object({
    resource: resourceDescriptorSchema,
    locator: locatorSchema,
  })
  .strict();

function requireCanonicalSet(
  values: readonly unknown[],
  context: z.RefinementCtx,
  path: PropertyKey[]
): void {
  const keys = values.map((value) => canonicalizeProtocolValue(value as ProtocolValue));
  const sorted = [...keys].sort();
  if (new Set(keys).size !== keys.length || keys.some((key, index) => key !== sorted[index])) {
    context.addIssue({
      code: 'custom',
      path,
      message: 'Values must be unique and canonically ordered',
    });
  }
}

export const DraftEvidencePointerSchema = z
  .object({
    sourceIndex: z.number().int().nonnegative(),
    locator: locatorSchema,
  })
  .strict();

export const DraftBasisPointerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('source'), index: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('memory'), index: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('search_result'), index: z.number().int().nonnegative() }).strict(),
]);

const attributedDraftClaimSchema = z
  .object({
    mode: z.enum(['stated', 'inferred', 'authored']),
    value: nonEmptyString,
    evidencePointers: z.array(DraftEvidencePointerSchema).max(64),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === 'stated' && value.evidencePointers.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['evidencePointers'],
        message: 'Stated draft claims require at least one evidence pointer',
      });
    }
  });

export const ProposalGenerationDraftClaimSchema = z.union([
  z.object({ mode: z.literal('unspecified') }).strict(),
  attributedDraftClaimSchema,
]);

const draftChallengeSchema = z
  .object({
    path: nonEmptyString,
    priorValue: protocolValueSchema,
    priorEvidencePointers: z.array(DraftEvidencePointerSchema).max(64),
    reason: nonEmptyString.max(4_096),
    impactPaths: z.array(nonEmptyString).max(256),
  })
  .strict();

const proposalGenerationChangeSchema = z
  .object({
    id: nonEmptyString.max(256),
    operations: z.array(protocolValueSchema).min(1).max(1_000),
    claimedOrigin: z.enum(['source_backed', 'inferred', 'recommended']),
    evidencePointers: z.array(DraftEvidencePointerSchema).max(64),
    basisPointers: z.array(DraftBasisPointerSchema).max(64),
    assumptions: z.array(nonEmptyString.max(4_096)).max(128),
    reason: nonEmptyString.max(4_096),
    challenges: z.array(draftChallengeSchema).max(128),
  })
  .strict();

export const ProposalGenerationDraftSchema = z
  .object({
    schema: z.literal(PROPOSAL_GENERATION_DRAFT_SCHEMA),
    version: z.literal(1),
    posture: z.enum(PROPOSAL_GENERATION_POSTURES),
    intent: ProposalGenerationDraftClaimSchema,
    rationale: ProposalGenerationDraftClaimSchema,
    changes: z.array(proposalGenerationChangeSchema).min(1).max(200),
    alternatives: z.array(protocolValueSchema).max(20).optional(),
    warnings: z.array(nonEmptyString.max(4_096)).max(256),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.changes.map((change) => change.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['changes'],
        message: 'Change Group ids must be unique',
      });
    }
  });

export type DraftEvidencePointer = z.infer<typeof DraftEvidencePointerSchema>;
export type DraftBasisPointer = z.infer<typeof DraftBasisPointerSchema>;
export type ProposalGenerationDraftClaim = z.infer<typeof ProposalGenerationDraftClaimSchema>;
export type ProposalGenerationDraftV1 = z.infer<typeof ProposalGenerationDraftSchema>;

export const ProposalContextBundleSchema = z
  .object({
    schema: z.literal('t3x.dev/proposal-context-bundle/v1'),
    version: z.literal(1),
    base: stateDescriptorSchema,
    yschema: resourceDescriptorSchema,
    sources: z.array(resourceDescriptorSchema).max(256),
    memories: z.array(resourceDescriptorSchema).max(256),
    searchResults: z.array(resourceDescriptorSchema).max(256),
    userInstruction: resourceDescriptorSchema,
    prompt: resourceDescriptorSchema,
    skill: resourceDescriptorSchema.optional(),
  })
  .strict();

const preparationChallengeSchema = z
  .object({
    path: nonEmptyString,
    priorValue: protocolValueSchema,
    priorEvidence: z.array(evidenceRefSchema).max(64),
    reason: nonEmptyString.max(4_096),
    impactPaths: z.array(nonEmptyString).max(256),
  })
  .strict()
  .superRefine((value, context) => {
    requireCanonicalSet(value.priorEvidence, context, ['priorEvidence']);
    requireCanonicalSet(value.impactPaths, context, ['impactPaths']);
  });

const preparationBindingSchema = z
  .object({
    groupId: nonEmptyString.max(256),
    operationIndexes: z.array(z.number().int().nonnegative()).min(1),
    paths: z.array(nonEmptyString).min(1).max(1_000),
    origin: z.enum(['source_backed', 'inferred', 'recommended']),
    evidence: z.array(evidenceRefSchema).max(64),
    basis: z.array(resourceDescriptorSchema).max(64),
    assumptions: z.array(nonEmptyString.max(4_096)).max(128),
    reason: nonEmptyString.max(4_096),
    challenges: z.array(preparationChallengeSchema).max(128),
  })
  .strict()
  .superRefine((value, context) => {
    const sortedIndexes = [...value.operationIndexes].sort((left, right) => left - right);
    if (
      new Set(value.operationIndexes).size !== value.operationIndexes.length ||
      value.operationIndexes.some(
        (operationIndex, index) => operationIndex !== sortedIndexes[index]
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['operationIndexes'],
        message: 'Operation indexes must be unique and numerically ordered',
      });
    }
    requireCanonicalSet(value.paths, context, ['paths']);
    requireCanonicalSet(value.evidence, context, ['evidence']);
    requireCanonicalSet(value.basis, context, ['basis']);
  });

export const ProposalGenerationPreparationSchema = z
  .object({
    schema: z.literal(PROPOSAL_GENERATION_PREPARATION_SCHEMA),
    version: z.literal(1),
    profile: z.custom<ProposalGenerationProfileV1>(),
    profileResource: resourceDescriptorSchema,
    context: ProposalContextBundleSchema,
    requestedBy: actorRefSchema,
    generator: actorRefSchema,
    provider: nonEmptyString.max(256),
    model: nonEmptyString.max(512),
    run: z
      .object({
        id: nonEmptyString.max(512),
        recordedAt: z.custom<string>(
          (value) => typeof value === 'string' && TIMESTAMP_PATTERN.test(value),
          'Expected a canonical UTC timestamp with millisecond precision'
        ),
      })
      .strict(),
    operationCount: z.number().int().positive().max(200_000),
    bindings: z.array(preparationBindingSchema).min(1).max(200),
    warnings: z.array(nonEmptyString.max(4_096)).max(256),
  })
  .strict()
  .superRefine((value, context) => {
    let profile: ProposalGenerationProfileV1;
    try {
      profile = assertBuiltInProposalGenerationProfile(value.profile);
    } catch (error) {
      context.addIssue({
        code: 'custom',
        path: ['profile'],
        message: error instanceof Error ? error.message : 'Profile is not a server-owned built-in',
      });
      return;
    }
    if (
      value.profileResource.uri !== `t3x://proposal-generation-profiles/${profile.id}/v1` ||
      value.profileResource.mediaType !== PROPOSAL_GENERATION_PROFILE_MEDIA_TYPE ||
      value.profileResource.digest !== proposalGenerationProfileDigest(profile)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['profileResource'],
        message: 'Profile resource does not bind the exact built-in profile bytes',
      });
    }
    if (value.generator.kind !== 'service') {
      context.addIssue({
        code: 'custom',
        path: ['generator', 'kind'],
        message: 'Proposal generator must be a stable server-owned service actor',
      });
    }
    const ids = value.bindings.map((binding) => binding.groupId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['bindings'],
        message: 'Preparation Change Group ids must be unique',
      });
    }
    const indexes = value.bindings.flatMap((binding) => binding.operationIndexes);
    const expected = Array.from({ length: value.operationCount }, (_, index) => index);
    if (
      indexes.length !== expected.length ||
      new Set(indexes).size !== indexes.length ||
      ![...indexes]
        .sort((left, right) => left - right)
        .every((index, offset) => index === expected[offset])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['bindings'],
        message: 'Preparation bindings must cover every operation index exactly once',
      });
    }
  });

export type ProposalContextBundleV1 = z.infer<typeof ProposalContextBundleSchema>;
export type ProposalGenerationPreparationV1 = z.infer<typeof ProposalGenerationPreparationSchema>;

function schemaError(error: z.ZodError, label: string): never {
  const issue = error.issues[0];
  const path = issue?.path.length ? `$.${issue.path.join('.')}` : '$';
  throw new SchemaInvalidError(issue?.message ?? `Invalid ${label}`, path);
}

export function parseProposalGenerationDraft(value: unknown): ProposalGenerationDraftV1 {
  const parsed = ProposalGenerationDraftSchema.safeParse(value);
  if (!parsed.success) schemaError(parsed.error, 'Proposal Generation Draft');
  return parsed.data;
}

export function parseProposalGenerationPreparation(
  value: unknown
): ProposalGenerationPreparationV1 {
  const parsed = ProposalGenerationPreparationSchema.safeParse(value);
  if (!parsed.success) schemaError(parsed.error, 'Proposal Generation Preparation');
  return parsed.data;
}

export function canonicalizeProposalGenerationPreparation(
  preparation: ProposalGenerationPreparationV1
): string {
  return canonicalizeProtocolValue(
    parseProposalGenerationPreparation(preparation) as unknown as ProtocolValue
  );
}

export function proposalGenerationPreparationDigest(
  preparation: ProposalGenerationPreparationV1
): Digest {
  return `sha256:${createHash('sha256')
    .update(canonicalizeProposalGenerationPreparation(preparation), 'utf8')
    .digest('hex')}`;
}

export function proposalGenerationPreparationResource(
  preparation: ProposalGenerationPreparationV1,
  uri: string
): ResourceDescriptor {
  if (uri.trim().length === 0) {
    throw new SchemaInvalidError('Preparation resource URI must be non-empty', '$.uri');
  }
  return {
    uri,
    mediaType: PROPOSAL_GENERATION_PREPARATION_MEDIA_TYPE,
    digest: proposalGenerationPreparationDigest(preparation),
  };
}
