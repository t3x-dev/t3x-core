import {
  COMMIT_V2_MEDIA_TYPE,
  type CommitHistoryProjection,
  type CommitV2,
  describeCommitV2,
  isRepositoryDecisionAuthorization,
  type ObjectDescriptor,
  type ObjectResolver,
  overlayTransitionObjects,
  type ProtocolObject,
  parseSerializedTransitionObject,
  projectCommitV2,
  projectLegacyCommit,
  type RepositoryDecisionAuthorization,
  serializeTransitionObject,
  verifyCommitV2,
} from '@t3x-dev/core';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { branches } from '../schema';
import {
  transitionCommits,
  transitionDecisionAuthorizations,
  transitionObjects,
} from '../schema-transition-commits';
import { getCommit, listCommits } from './commits';

type TxRunner = { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };

export class DecisionNotAuthorizedError extends Error {
  readonly code = 'DECISION_NOT_AUTHORIZED';

  constructor(readonly decisionDigest: string) {
    super(`Decision ${decisionDigest} has no trusted authorization for this project and ref`);
    this.name = 'DecisionNotAuthorizedError';
  }
}

export class DecisionAuthorizationConflictError extends Error {
  readonly code = 'DECISION_AUTHORIZATION_CONFLICT';

  constructor(readonly decisionDigest: string) {
    super(`Decision ${decisionDigest} already has different repository authorization facts`);
    this.name = 'DecisionAuthorizationConflictError';
  }
}

export class TransitionHeadConflictError extends Error {
  readonly code = 'STALE_BASE';

  constructor(
    readonly expectedHead: string | null,
    readonly actualHead: string | null
  ) {
    super(`Expected ref head ${expectedHead ?? '<empty>'}, found ${actualHead ?? '<empty>'}`);
    this.name = 'TransitionHeadConflictError';
  }
}

export class TransitionParentHeadMismatchError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(
    readonly expectedHead: string | null,
    readonly firstParent: string | null
  ) {
    super(
      `CommitV2 first parent ${firstParent ?? '<none>'} does not match expected ref head ${expectedHead ?? '<empty>'}`
    );
    this.name = 'TransitionParentHeadMismatchError';
  }
}

export class TransitionRefNotFoundError extends Error {
  readonly code = 'REF_NOT_FOUND';

  constructor(
    readonly projectId: string,
    readonly refName: string
  ) {
    super(`Ref ${refName} was not found in project ${projectId}`);
    this.name = 'TransitionRefNotFoundError';
  }
}

class DatabaseTransitionObjectResolver implements ObjectResolver {
  private readonly encoder = new TextEncoder();

  constructor(private readonly db: AnyDB) {}

  async get(descriptor: ObjectDescriptor): Promise<Uint8Array | undefined> {
    const [row] = await this.db
      .select({ canonicalJson: transitionObjects.canonicalJson })
      .from(transitionObjects)
      .where(eq(transitionObjects.digest, descriptor.digest))
      .limit(1);
    return row === undefined ? undefined : this.encoder.encode(row.canonicalJson);
  }
}

function sameScope(
  left: { completeness: 'complete' | 'partial'; sources: string[] },
  right: { completeness: 'complete' | 'partial'; sources: string[] }
): boolean {
  return (
    left.completeness === right.completeness &&
    left.sources.length === right.sources.length &&
    left.sources.every((source, index) => source === right.sources[index])
  );
}

async function persistTransitionObjects(
  db: AnyDB,
  objects: readonly ProtocolObject[]
): Promise<void> {
  const byDigest = new Map(
    objects.map((object) => {
      const serialized = serializeTransitionObject(object);
      return [serialized.descriptor.digest, serialized] as const;
    })
  );
  const ordered = [...byDigest.values()].sort((left, right) =>
    left.descriptor.digest < right.descriptor.digest
      ? -1
      : left.descriptor.digest > right.descriptor.digest
        ? 1
        : 0
  );

  for (const serialized of ordered) {
    await db
      .insert(transitionObjects)
      .values({
        digest: serialized.descriptor.digest,
        kind: serialized.descriptor.kind,
        schema: serialized.descriptor.schema,
        canonicalJson: serialized.canonicalJson,
      })
      .onConflictDoNothing();
    const [stored] = await db
      .select()
      .from(transitionObjects)
      .where(eq(transitionObjects.digest, serialized.descriptor.digest))
      .limit(1);
    if (
      stored === undefined ||
      stored.kind !== serialized.descriptor.kind ||
      stored.schema !== serialized.descriptor.schema ||
      stored.canonicalJson !== serialized.canonicalJson
    ) {
      throw new TypeError(`Immutable protocol object collision at ${serialized.descriptor.digest}`);
    }
  }
}

/** Persist a trusted process-local issuance capability as an append-only server fact. */
export async function recordRepositoryDecisionAuthorization(
  db: AnyDB,
  authorization: RepositoryDecisionAuthorization
): Promise<void> {
  if (!isRepositoryDecisionAuthorization(authorization)) {
    throw new TypeError('Repository Decision authorization was not issued by the trusted service');
  }
  const decisionDigest = serializeTransitionObject(authorization.decision).descriptor.digest;
  const scope = {
    completeness: authorization.observationScope.completeness,
    sources: [...authorization.observationScope.sources],
  };
  const run = async (tx: AnyDB) => {
    await persistTransitionObjects(tx, authorization.objects);
    await tx
      .insert(transitionDecisionAuthorizations)
      .values({
        projectId: authorization.projectId,
        refName: authorization.refName,
        decisionDigest,
        policyUri: authorization.evaluation.policy.uri,
        policyDigest: authorization.evaluation.policy.digest,
        actorKind: authorization.evaluation.actor.kind,
        actorId: authorization.evaluation.actor.id,
        outcome: authorization.evaluation.requestedOutcome,
        observationScope: scope,
      })
      .onConflictDoNothing();
    const [stored] = await tx
      .select()
      .from(transitionDecisionAuthorizations)
      .where(
        and(
          eq(transitionDecisionAuthorizations.projectId, authorization.projectId),
          eq(transitionDecisionAuthorizations.refName, authorization.refName),
          eq(transitionDecisionAuthorizations.decisionDigest, decisionDigest)
        )
      )
      .limit(1);
    if (
      stored === undefined ||
      stored.policyUri !== authorization.evaluation.policy.uri ||
      stored.policyDigest !== authorization.evaluation.policy.digest ||
      stored.actorKind !== authorization.evaluation.actor.kind ||
      stored.actorId !== authorization.evaluation.actor.id ||
      stored.outcome !== authorization.evaluation.requestedOutcome ||
      !sameScope(stored.observationScope, scope)
    ) {
      throw new DecisionAuthorizationConflictError(decisionDigest);
    }
  };

  await (db as unknown as TxRunner).transaction(async (tx) => run(tx as AnyDB));
}

export interface CreateTransitionCommitInput {
  projectId: string;
  refName: string;
  expectedHead: string | null;
  commit: CommitV2;
  /** Graph objects not already present in the repository object store. */
  objects: readonly ProtocolObject[];
}

export interface CreatedTransitionCommit {
  commit: CommitV2;
  digest: string;
  mediaType: typeof COMMIT_V2_MEDIA_TYPE;
}

/**
 * Verify and persist CommitV2, then advance its ref with an atomic expected-head CAS.
 * No policy, actor, issuer, scope, or authorization flag is accepted from the caller.
 */
export async function createTransitionCommit(
  db: AnyDB,
  input: CreateTransitionCommitInput
): Promise<CreatedTransitionCommit> {
  const firstParent = input.commit.parents[0]?.digest ?? null;
  if (firstParent !== input.expectedHead) {
    throw new TransitionParentHeadMismatchError(input.expectedHead, firstParent);
  }

  const result = await (db as unknown as TxRunner).transaction(async (rawTx) => {
    const tx = rawTx as AnyDB;
    // Resolve and re-hash inside the same transaction that advances the ref so
    // no mutable storage read can create a verification/CAS time-of-check gap.
    const resolver = overlayTransitionObjects(
      new DatabaseTransitionObjectResolver(tx),
      input.objects
    );
    const verified = await verifyCommitV2(input.commit, resolver);
    const descriptor = describeCommitV2(verified.commit);
    const [authorization] = await tx
      .select({ decisionDigest: transitionDecisionAuthorizations.decisionDigest })
      .from(transitionDecisionAuthorizations)
      .where(
        and(
          eq(transitionDecisionAuthorizations.projectId, input.projectId),
          eq(transitionDecisionAuthorizations.refName, input.refName),
          eq(transitionDecisionAuthorizations.decisionDigest, verified.commit.decision.digest)
        )
      )
      .limit(1);
    if (authorization === undefined) {
      throw new DecisionNotAuthorizedError(verified.commit.decision.digest);
    }

    await persistTransitionObjects(tx, [...input.objects, verified.commit]);
    await tx
      .insert(transitionCommits)
      .values({
        projectId: input.projectId,
        digest: descriptor.digest,
        mediaType: COMMIT_V2_MEDIA_TYPE,
      })
      .onConflictDoNothing();

    const headCondition =
      input.expectedHead === null
        ? isNull(branches.headCommitHash)
        : eq(branches.headCommitHash, input.expectedHead);
    const [updated] = await tx
      .update(branches)
      .set({ headCommitHash: descriptor.digest, updatedAt: new Date() })
      .where(
        and(
          eq(branches.projectId, input.projectId),
          eq(branches.name, input.refName),
          headCondition
        )
      )
      .returning({ head: branches.headCommitHash });
    if (updated === undefined) {
      const [actual] = await tx
        .select({ head: branches.headCommitHash })
        .from(branches)
        .where(and(eq(branches.projectId, input.projectId), eq(branches.name, input.refName)))
        .limit(1);
      if (actual === undefined) {
        throw new TransitionRefNotFoundError(input.projectId, input.refName);
      }
      throw new TransitionHeadConflictError(input.expectedHead, actual.head);
    }
    return { commit: verified.commit, digest: descriptor.digest, mediaType: COMMIT_V2_MEDIA_TYPE };
  });
  return result as CreatedTransitionCommit;
}

export async function getTransitionCommit(
  db: AnyDB,
  projectId: string,
  digest: string
): Promise<{ commit: CommitV2; recordedAt: string } | null> {
  const [row] = await db
    .select({
      canonicalJson: transitionObjects.canonicalJson,
      mediaType: transitionCommits.mediaType,
      createdAt: transitionCommits.createdAt,
    })
    .from(transitionCommits)
    .innerJoin(transitionObjects, eq(transitionCommits.digest, transitionObjects.digest))
    .where(and(eq(transitionCommits.projectId, projectId), eq(transitionCommits.digest, digest)))
    .limit(1);
  if (row === undefined) return null;
  if (row.mediaType !== COMMIT_V2_MEDIA_TYPE) {
    throw new TypeError(`Unsupported CommitV2 media type ${row.mediaType}`);
  }
  const object = parseSerializedTransitionObject(row.canonicalJson);
  if (object.schema !== 't3x/commit/v2') {
    throw new TypeError(`Stored Transition commit ${digest} is not CommitV2`);
  }
  if (describeCommitV2(object).digest !== digest) {
    throw new TypeError(`Stored Transition commit ${digest} failed identity verification`);
  }
  return { commit: object, recordedAt: row.createdAt.toISOString() };
}

export async function listTransitionCommits(
  db: AnyDB,
  projectId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<Array<{ commit: CommitV2; recordedAt: string }>> {
  const rows = await db
    .select({ digest: transitionCommits.digest })
    .from(transitionCommits)
    .where(eq(transitionCommits.projectId, projectId))
    .orderBy(desc(transitionCommits.createdAt), desc(transitionCommits.digest))
    .limit(options.limit ?? 100)
    .offset(options.offset ?? 0);
  const commits = await Promise.all(
    rows.map((row) => getTransitionCommit(db, projectId, row.digest))
  );
  return commits.filter(
    (entry): entry is { commit: CommitV2; recordedAt: string } => entry !== null
  );
}

export async function getCommitHistoryEntry(
  db: AnyDB,
  projectId: string,
  id: string
): Promise<CommitHistoryProjection | null> {
  const transition = await getTransitionCommit(db, projectId, id);
  if (transition !== null) return projectCommitV2(transition.commit, transition.recordedAt);
  const legacy = await getCommit(db, id);
  return legacy?.project_id === projectId ? projectLegacyCommit(legacy) : null;
}

export async function listCommitHistory(
  db: AnyDB,
  projectId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<CommitHistoryProjection[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const fetch = limit + offset;
  const [legacy, transition] = await Promise.all([
    listCommits(db, { projectId, limit: fetch, offset: 0 }),
    listTransitionCommits(db, projectId, { limit: fetch, offset: 0 }),
  ]);
  return [
    ...legacy.map(projectLegacyCommit),
    ...transition.map((entry) => projectCommitV2(entry.commit, entry.recordedAt)),
  ]
    .sort((left, right) =>
      left.recordedAt > right.recordedAt
        ? -1
        : left.recordedAt < right.recordedAt
          ? 1
          : left.id < right.id
            ? -1
            : left.id > right.id
              ? 1
              : 0
    )
    .slice(offset, offset + limit);
}
