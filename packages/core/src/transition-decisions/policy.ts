import { createHash } from 'node:crypto';
import {
  canonicalizeProtocolValue,
  type Digest,
  type ProtocolValue,
  type ResourceDescriptor,
  SchemaInvalidError,
} from '@t3x-dev/transition';
import { z } from 'zod';

export const ACCEPTANCE_POLICY_SCHEMA = 't3x.dev/acceptance-policy/v1' as const;
export const ACCEPTANCE_POLICY_MEDIA_TYPE = 'application/vnd.t3x.acceptance-policy+json' as const;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const nonEmptyString = z.string().min(1);
const digest = z.custom<Digest>(
  (value) => typeof value === 'string' && DIGEST_PATTERN.test(value),
  'Expected a sha256 digest'
);

const actorRefSchema = z
  .object({
    kind: z.enum(['human', 'agent', 'service']),
    id: nonEmptyString,
  })
  .strict();

const resourceDescriptorSchema = z
  .object({
    uri: nonEmptyString,
    mediaType: nonEmptyString,
    digest,
  })
  .strict();

const toolBindingSchema = z
  .object({
    name: nonEmptyString,
    version: nonEmptyString,
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

function canonicalKey(value: unknown): string {
  return canonicalizeProtocolValue(value as ProtocolValue);
}

function canonicalSet(values: readonly unknown[], context: z.RefinementCtx): void {
  const keys = values.map(canonicalKey);
  const sorted = [...keys].sort();
  if (new Set(keys).size !== keys.length || keys.some((key, index) => key !== sorted[index])) {
    context.addIssue({
      code: 'custom',
      message: 'Values must be unique and canonically ordered',
    });
  }
}

function exactSelectorSchema<T>(valueSchema: z.ZodType<T>) {
  return z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('any') }).strict(),
    z
      .object({
        mode: z.literal('one_of'),
        values: z.array(valueSchema).min(1),
      })
      .strict()
      .superRefine((value, context) => canonicalSet(value.values, context)),
  ]);
}

const actorSelectorSchema = exactSelectorSchema(actorRefSchema);
const toolSelectorSchema = exactSelectorSchema(toolBindingSchema);
const profileSelectorSchema = exactSelectorSchema(profileBindingSchema);
const resourceSelectorSchema = exactSelectorSchema(resourceDescriptorSchema);
const resourceBindingSelectorSchema = exactSelectorSchema(resourceBindingSchema);

const claimModeSchema = z.enum(['authored', 'inferred', 'stated', 'unspecified']);
const claimRequirementSchema = z
  .object({
    allowedModes: z.array(claimModeSchema).min(1),
    minimumEvidence: z.number().int().min(0),
    humanConfirmation: z.enum(['not_required', 'required']),
  })
  .strict()
  .superRefine((value, context) => canonicalSet(value.allowedModes, context));

const authorizationRuleSchema = z
  .object({
    actors: actorSelectorSchema,
  })
  .strict();

const statementTrustShape = {
  issuers: actorSelectorSchema,
  tools: toolSelectorSchema,
  environments: resourceBindingSelectorSchema,
};

export const acceptancePolicySchema = z
  .object({
    schema: z.literal(ACCEPTANCE_POLICY_SCHEMA),
    version: z.literal(1),
    authorization: z
      .object({
        decide: authorizationRuleSchema,
        override: authorizationRuleSchema,
        allowSelfApproval: z.boolean(),
      })
      .strict(),
    claims: z
      .object({
        intent: claimRequirementSchema,
        rationale: claimRequirementSchema,
      })
      .strict(),
    checks: z
      .object({
        replay: z.object(statementTrustShape).strict(),
        validation: z
          .object({
            requirement: z.enum(['optional', 'required']),
            ...statementTrustShape,
            profiles: profileSelectorSchema,
            schemas: resourceSelectorSchema,
            contexts: resourceBindingSelectorSchema,
          })
          .strict(),
        runner: z
          .object({
            requirement: z.enum(['optional', 'required']),
            issuers: actorSelectorSchema,
            tools: toolSelectorSchema,
            workflows: resourceSelectorSchema,
            environments: resourceSelectorSchema,
          })
          .strict()
          .optional(),
        humanConfirmation: z
          .object({
            issuers: actorSelectorSchema,
          })
          .strict(),
      })
      .strict(),
    override: z
      .object({
        allowClaimFailures: z.boolean(),
        allowFailedValidation: z.boolean(),
        allowMissingHumanConfirmation: z.boolean(),
        allowMissingValidation: z.boolean(),
        allowFailedRunner: z.boolean().optional(),
        allowMissingRunner: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export type AcceptancePolicy = z.infer<typeof acceptancePolicySchema>;
export type ExactSelector<T> = { mode: 'any' } | { mode: 'one_of'; values: T[] };

function policySchemaError(error: z.ZodError): never {
  const issue = error.issues[0];
  const path = issue?.path.length === 0 ? '$' : `$.${issue?.path.join('.')}`;
  throw new SchemaInvalidError(issue?.message ?? 'Invalid AcceptancePolicy', path);
}

export function parseAcceptancePolicy(value: unknown): AcceptancePolicy {
  const parsed = acceptancePolicySchema.safeParse(value);
  if (!parsed.success) policySchemaError(parsed.error);
  return parsed.data;
}

export function acceptancePolicyDigest(policy: AcceptancePolicy): Digest {
  const canonical = canonicalizeAcceptancePolicy(policy);
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

/** Canonical bytes persisted by repositories for content-addressed policy resources. */
export function canonicalizeAcceptancePolicy(policy: AcceptancePolicy): string {
  return canonicalizeProtocolValue(parseAcceptancePolicy(policy) as ProtocolValue);
}

export function createAcceptancePolicyResource(input: { policy: unknown; uri: string }): {
  policy: AcceptancePolicy;
  resource: ResourceDescriptor;
} {
  const policy = parseAcceptancePolicy(input.policy);
  if (input.uri.length === 0) {
    throw new SchemaInvalidError('Acceptance policy URI must be non-empty', '$.uri');
  }
  return {
    policy,
    resource: {
      uri: input.uri,
      mediaType: ACCEPTANCE_POLICY_MEDIA_TYPE,
      digest: acceptancePolicyDigest(policy),
    },
  };
}

/**
 * Verify that a descriptor names these exact policy bytes. This does not prove
 * the policy is applicable to a project or ref; the application must select the
 * applicable resource from trusted configuration before evaluation.
 */
export function verifyAcceptancePolicyResource(
  policy: AcceptancePolicy,
  resource: ResourceDescriptor
): ResourceDescriptor {
  const parsed = resourceDescriptorSchema.safeParse(resource);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const suffix = issue?.path.length === 0 ? '' : `.${issue?.path.join('.')}`;
    throw new SchemaInvalidError(
      issue?.message ?? 'Invalid policy resource',
      `$.policyResource${suffix}`
    );
  }
  if (parsed.data.mediaType !== ACCEPTANCE_POLICY_MEDIA_TYPE) {
    throw new SchemaInvalidError(
      `Expected ${ACCEPTANCE_POLICY_MEDIA_TYPE}`,
      '$.policyResource.mediaType'
    );
  }
  if (parsed.data.digest !== acceptancePolicyDigest(policy)) {
    throw new SchemaInvalidError(
      'Acceptance policy resource digest does not match policy content',
      '$.policyResource.digest'
    );
  }
  return parsed.data;
}

export function selectorMatches<T>(selector: ExactSelector<T>, value: T): boolean {
  if (selector.mode === 'any') return true;
  const key = canonicalKey(value);
  return selector.values.some((candidate) => canonicalKey(candidate) === key);
}
