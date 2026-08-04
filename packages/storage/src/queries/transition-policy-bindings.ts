import {
  ACCEPTANCE_POLICY_MEDIA_TYPE,
  type AcceptancePolicy,
  type ApiKeyPrincipalKind,
  canonicalizeAcceptancePolicy,
  createAcceptancePolicyResource,
} from '@t3x-dev/core';
import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { transitionPolicyBindings, transitionPolicyResources } from '../schema-transition-commits';

export interface BindTransitionPolicyInput {
  projectId: string;
  refName: string;
  uri: string;
  policy: unknown;
  actor: { kind: ApiKeyPrincipalKind; id: string };
}

export interface TransitionPolicyBinding {
  projectId: string;
  refName: string;
  policy: AcceptancePolicy;
  resource: {
    uri: string;
    mediaType: 'application/vnd.t3x.acceptance-policy+json';
    digest: `sha256:${string}`;
  };
  updatedBy: { kind: ApiKeyPrincipalKind; id: string };
  updatedAt: string;
}

export class TransitionPolicyResourceConflictError extends Error {
  readonly code = 'TRANSITION_POLICY_RESOURCE_CONFLICT';

  constructor(readonly digest: string) {
    super(`AcceptancePolicy resource ${digest} has conflicting stored bytes`);
    this.name = 'TransitionPolicyResourceConflictError';
  }
}

export class TransitionPolicyBindingIntegrityError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(
    readonly projectId: string,
    readonly refName: string
  ) {
    super(`AcceptancePolicy binding ${projectId}/${refName} does not verify`);
    this.name = 'TransitionPolicyBindingIntegrityError';
  }
}

function nonEmpty(value: string, field: string): void {
  if (value.length === 0) throw new TypeError(`${field} must be non-empty`);
}

export async function bindTransitionPolicy(
  db: AnyDB,
  input: BindTransitionPolicyInput
): Promise<TransitionPolicyBinding> {
  nonEmpty(input.projectId, 'projectId');
  nonEmpty(input.refName, 'refName');
  nonEmpty(input.actor.id, 'actor.id');

  const bound = createAcceptancePolicyResource({ policy: input.policy, uri: input.uri });
  const canonicalJson = canonicalizeAcceptancePolicy(bound.policy);

  await db
    .insert(transitionPolicyResources)
    .values({ digest: bound.resource.digest, canonicalJson })
    .onConflictDoNothing();

  const [storedResource] = await db
    .select()
    .from(transitionPolicyResources)
    .where(eq(transitionPolicyResources.digest, bound.resource.digest))
    .limit(1);
  if (storedResource?.canonicalJson !== canonicalJson) {
    throw new TransitionPolicyResourceConflictError(bound.resource.digest);
  }

  const now = new Date();
  await db
    .insert(transitionPolicyBindings)
    .values({
      projectId: input.projectId,
      refName: input.refName,
      policyDigest: bound.resource.digest,
      policyUri: bound.resource.uri,
      actorKind: input.actor.kind,
      actorId: input.actor.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [transitionPolicyBindings.projectId, transitionPolicyBindings.refName],
      set: {
        policyDigest: bound.resource.digest,
        policyUri: bound.resource.uri,
        actorKind: input.actor.kind,
        actorId: input.actor.id,
        updatedAt: now,
      },
    });

  const result = await getTransitionPolicyBinding(db, input.projectId, input.refName);
  if (result === null) {
    throw new TransitionPolicyBindingIntegrityError(input.projectId, input.refName);
  }
  return result;
}

export async function getTransitionPolicyBinding(
  db: AnyDB,
  projectId: string,
  refName: string
): Promise<TransitionPolicyBinding | null> {
  const [row] = await db
    .select({
      projectId: transitionPolicyBindings.projectId,
      refName: transitionPolicyBindings.refName,
      policyDigest: transitionPolicyBindings.policyDigest,
      policyUri: transitionPolicyBindings.policyUri,
      actorKind: transitionPolicyBindings.actorKind,
      actorId: transitionPolicyBindings.actorId,
      updatedAt: transitionPolicyBindings.updatedAt,
      canonicalJson: transitionPolicyResources.canonicalJson,
    })
    .from(transitionPolicyBindings)
    .innerJoin(
      transitionPolicyResources,
      eq(transitionPolicyBindings.policyDigest, transitionPolicyResources.digest)
    )
    .where(
      and(
        eq(transitionPolicyBindings.projectId, projectId),
        eq(transitionPolicyBindings.refName, refName)
      )
    )
    .limit(1);

  if (row === undefined) return null;
  if (!['human', 'agent', 'service'].includes(row.actorKind)) {
    throw new TransitionPolicyBindingIntegrityError(projectId, refName);
  }

  try {
    const bound = createAcceptancePolicyResource({
      policy: JSON.parse(row.canonicalJson),
      uri: row.policyUri,
    });
    if (bound.resource.digest !== row.policyDigest) {
      throw new TransitionPolicyBindingIntegrityError(projectId, refName);
    }
    return {
      projectId: row.projectId,
      refName: row.refName,
      policy: bound.policy,
      resource: {
        uri: bound.resource.uri,
        mediaType: ACCEPTANCE_POLICY_MEDIA_TYPE,
        digest: bound.resource.digest,
      },
      updatedBy: { kind: row.actorKind as ApiKeyPrincipalKind, id: row.actorId },
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof TransitionPolicyBindingIntegrityError) throw error;
    throw new TransitionPolicyBindingIntegrityError(projectId, refName);
  }
}

export async function unbindTransitionPolicy(
  db: AnyDB,
  projectId: string,
  refName: string
): Promise<boolean> {
  const deleted = await db
    .delete(transitionPolicyBindings)
    .where(
      and(
        eq(transitionPolicyBindings.projectId, projectId),
        eq(transitionPolicyBindings.refName, refName)
      )
    )
    .returning({ projectId: transitionPolicyBindings.projectId });
  return deleted.length === 1;
}
