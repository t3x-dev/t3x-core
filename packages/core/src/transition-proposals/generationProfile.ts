import { createHash } from 'node:crypto';
import {
  canonicalizeProtocolValue,
  type Digest,
  type ProtocolValue,
  type ResourceDescriptor,
  SchemaInvalidError,
} from '@t3x-dev/transition';
import { z } from 'zod';

export const PROPOSAL_GENERATION_PROFILE_SCHEMA = 't3x.dev/proposal-generation-profile/v1' as const;
export const PROPOSAL_GENERATION_PROFILE_MEDIA_TYPE =
  'application/vnd.t3x.proposal-generation-profile+json' as const;

export const PROPOSAL_GENERATION_POSTURES = ['source_only', 'guided', 'recommend'] as const;
export type ProposalGenerationPosture = (typeof PROPOSAL_GENERATION_POSTURES)[number];

export const proposalGenerationProfileSchema = z
  .object({
    schema: z.literal(PROPOSAL_GENERATION_PROFILE_SCHEMA),
    version: z.literal(1),
    id: z.enum(PROPOSAL_GENERATION_POSTURES),
    truthPolicy: z.enum(['evidence_only', 'approved_inference', 'open_generation']),
    sourceTreatment: z.enum(['meaning_boundary', 'preserve_and_extend', 'may_challenge']),
    missingInformation: z.enum(['leave_gap', 'infer_or_recommend', 'complete_candidate']),
    humanDecision: z.literal('required'),
    autoCommit: z.literal('never'),
  })
  .strict();

export type ProposalGenerationProfileV1 = z.infer<typeof proposalGenerationProfileSchema>;

const BUILT_IN_PROFILES = Object.freeze({
  source_only: Object.freeze({
    schema: PROPOSAL_GENERATION_PROFILE_SCHEMA,
    version: 1,
    id: 'source_only',
    truthPolicy: 'evidence_only',
    sourceTreatment: 'meaning_boundary',
    missingInformation: 'leave_gap',
    humanDecision: 'required',
    autoCommit: 'never',
  }),
  guided: Object.freeze({
    schema: PROPOSAL_GENERATION_PROFILE_SCHEMA,
    version: 1,
    id: 'guided',
    truthPolicy: 'approved_inference',
    sourceTreatment: 'preserve_and_extend',
    missingInformation: 'infer_or_recommend',
    humanDecision: 'required',
    autoCommit: 'never',
  }),
  recommend: Object.freeze({
    schema: PROPOSAL_GENERATION_PROFILE_SCHEMA,
    version: 1,
    id: 'recommend',
    truthPolicy: 'open_generation',
    sourceTreatment: 'may_challenge',
    missingInformation: 'complete_candidate',
    humanDecision: 'required',
    autoCommit: 'never',
  }),
} satisfies Record<ProposalGenerationPosture, ProposalGenerationProfileV1>);

function profileSchemaError(error: z.ZodError): never {
  const issue = error.issues[0];
  const path = issue?.path.length ? `$.${issue.path.join('.')}` : '$';
  throw new SchemaInvalidError(issue?.message ?? 'Invalid Proposal Generation Profile', path);
}

export function parseProposalGenerationProfile(value: unknown): ProposalGenerationProfileV1 {
  const parsed = proposalGenerationProfileSchema.safeParse(value);
  if (!parsed.success) profileSchemaError(parsed.error);
  return parsed.data;
}

export function proposalGenerationProfile(
  posture: ProposalGenerationPosture
): ProposalGenerationProfileV1 {
  return structuredClone(BUILT_IN_PROFILES[posture]);
}

export function canonicalizeProposalGenerationProfile(
  profile: ProposalGenerationProfileV1
): string {
  return canonicalizeProtocolValue(
    parseProposalGenerationProfile(profile) as unknown as ProtocolValue
  );
}

export function proposalGenerationProfileDigest(profile: ProposalGenerationProfileV1): Digest {
  return `sha256:${createHash('sha256')
    .update(canonicalizeProposalGenerationProfile(profile), 'utf8')
    .digest('hex')}`;
}

export function proposalGenerationProfileResource(posture: ProposalGenerationPosture): {
  profile: ProposalGenerationProfileV1;
  resource: ResourceDescriptor;
} {
  const profile = proposalGenerationProfile(posture);
  return {
    profile,
    resource: {
      uri: `t3x://proposal-generation-profiles/${posture}/v1`,
      mediaType: PROPOSAL_GENERATION_PROFILE_MEDIA_TYPE,
      digest: proposalGenerationProfileDigest(profile),
    },
  };
}

export function assertBuiltInProposalGenerationProfile(
  value: unknown
): ProposalGenerationProfileV1 {
  const profile = parseProposalGenerationProfile(value);
  const builtIn = proposalGenerationProfile(profile.id);
  if (
    canonicalizeProposalGenerationProfile(profile) !==
    canonicalizeProposalGenerationProfile(builtIn)
  ) {
    throw new SchemaInvalidError(
      `Proposal Generation Profile ${profile.id} does not match server-owned built-in content`,
      '$.profile'
    );
  }
  return profile;
}
