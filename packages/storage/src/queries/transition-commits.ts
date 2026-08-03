import {
  COMMIT_V2_MEDIA_TYPE,
  type CommitHistoryProjection,
  type CommitV2,
  describeCommitV2,
  describeTransitionObject,
  isRepositoryDecisionAuthorization,
  isRepositoryDecisionRecord,
  type ObjectDescriptor,
  type ObjectResolver,
  overlayTransitionObjects,
  type ProtocolObject,
  parseSerializedTransitionObject,
  projectCommitV2,
  projectLegacyCommit,
  projectTransitionView,
  type RepositoryDecisionAuthorization,
  type RepositoryDecisionRecord,
  type State,
  type StatementObservation,
  serializeTransitionObject,
  type TransitionViewV1,
  type VerifiedCommitIntegrity,
  type VerifiedDecisionGraph,
  verifyCommitV2,
  verifyDecisionGraph,
} from '@t3x-dev/core';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { branches } from '../schema';
import {
  transitionCommits,
  transitionDecisionAuthorizations,
  transitionDecisionLedger,
  transitionObjects,
  transitionYOpsLogConsumptions,
} from '../schema-transition-commits';
import { yopsLog } from '../schema-trees';
import { getCommit, listCommits, SupersededYOpsLogIdsError } from './commits';
import { acquireProjectSupersedeLock } from './yops-log';

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

export class DecisionRecordConflictError extends Error {
  readonly code = 'DECISION_RECORD_CONFLICT';

  constructor(readonly decisionDigest: string) {
    super(`Decision ${decisionDigest} already has different repository audit facts`);
    this.name = 'DecisionRecordConflictError';
  }
}

export class DecisionRecordIntegrityError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(readonly decisionDigest: string) {
    super(`Stored audit facts do not verify for Decision ${decisionDigest}`);
    this.name = 'DecisionRecordIntegrityError';
  }
}

export class TransitionYOpsLogMembershipError extends Error {
  readonly code = 'YOPS_LOG_MEMBERSHIP_INVALID';

  constructor(readonly yopsLogIds: readonly string[]) {
    super(`YOps log entries do not belong to this project: ${yopsLogIds.join(', ')}`);
    this.name = 'TransitionYOpsLogMembershipError';
  }
}

export class TransitionYOpsLogAlreadyConsumedError extends Error {
  readonly code = 'YOPS_LOG_ALREADY_CONSUMED';

  constructor(readonly consumptions: readonly { yopsLogId: string; commitDigest: string }[]) {
    super(
      `YOps log entries were already consumed: ${consumptions
        .map((entry) => `${entry.yopsLogId} by ${entry.commitDigest}`)
        .join(', ')}`
    );
    this.name = 'TransitionYOpsLogAlreadyConsumedError';
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

export class TransitionParentProjectMembershipError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(readonly parentDigests: readonly string[]) {
    super(`CommitV2 parents do not belong to this project: ${parentDigests.join(', ')}`);
    this.name = 'TransitionParentProjectMembershipError';
  }
}

export class TransitionCommitGraphIntegrityError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(readonly commitDigest: string) {
    super(`CommitV2 parent cycle detected at ${commitDigest}`);
    this.name = 'TransitionCommitGraphIntegrityError';
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

export class TransitionRefHeadIntegrityError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(
    readonly projectId: string,
    readonly refName: string,
    readonly head: string
  ) {
    super(`Ref ${refName} in project ${projectId} points to an unverifiable commit ${head}`);
    this.name = 'TransitionRefHeadIntegrityError';
  }
}

export class TransitionProjectionAuthorizationInvalidError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(readonly decisionDigest: string) {
    super(`Stored authorization facts do not verify for Decision ${decisionDigest}`);
    this.name = 'TransitionProjectionAuthorizationInvalidError';
  }
}

class DatabaseTransitionObjectResolver implements ObjectResolver {
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly db: AnyDB,
    private readonly projectId?: string
  ) {}

  async get(descriptor: ObjectDescriptor): Promise<Uint8Array | undefined> {
    const [row] =
      descriptor.kind === 'commit' && this.projectId !== undefined
        ? await this.db
            .select({ canonicalJson: transitionObjects.canonicalJson })
            .from(transitionCommits)
            .innerJoin(transitionObjects, eq(transitionCommits.digest, transitionObjects.digest))
            .where(
              and(
                eq(transitionCommits.projectId, this.projectId),
                eq(transitionCommits.digest, descriptor.digest)
              )
            )
            .limit(1)
        : await this.db
            .select({ canonicalJson: transitionObjects.canonicalJson })
            .from(transitionObjects)
            .where(eq(transitionObjects.digest, descriptor.digest))
            .limit(1);
    return row === undefined ? undefined : this.encoder.encode(row.canonicalJson);
  }
}

async function verifyRepositoryCommitClosure(
  commit: CommitV2,
  resolver: ObjectResolver
): Promise<VerifiedCommitIntegrity> {
  const verified = new Map<string, VerifiedCommitIntegrity>();
  const visiting = new Set<string>();

  const visit = async (current: CommitV2): Promise<VerifiedCommitIntegrity> => {
    const digest = describeCommitV2(current).digest;
    const existing = verified.get(digest);
    if (existing !== undefined) return existing;
    if (visiting.has(digest)) {
      throw new TransitionCommitGraphIntegrityError(digest);
    }

    visiting.add(digest);
    try {
      const graph = await verifyCommitV2(current, resolver);
      for (const parent of graph.parents) await visit(parent);
      verified.set(digest, graph);
      return graph;
    } finally {
      visiting.delete(digest);
    }
  };

  return visit(commit);
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

type StoredStatementIssuer = {
  statement: { kind: 'statement'; schema: 't3x/statement/v1'; digest: string };
  actor: RepositoryDecisionAuthorization['evaluation']['actor'];
};

type StoredDecisionFacts = {
  projectId: string;
  refName: string;
  decisionDigest: string;
  policyUri: string;
  policyDigest: string;
  actorKind: string;
  actorId: string;
  outcome: string;
  observationScope: { completeness: 'complete' | 'partial'; sources: string[] };
  statementIssuers: StoredStatementIssuer[];
};

export interface RepositoryDecisionAuditEntry extends VerifiedDecisionGraph {
  projectId: string;
  refName: string;
  decisionDigest: string;
  policyResource: { uri: string; digest: string };
  actor: RepositoryDecisionRecord['evaluation']['actor'];
  outcome: RepositoryDecisionRecord['evaluation']['requestedOutcome'];
  observationScope: RepositoryDecisionRecord['observationScope'];
  observations: readonly StatementObservation[];
  recordedAt: string;
}

function sameActor(
  left: RepositoryDecisionAuthorization['evaluation']['actor'],
  right: RepositoryDecisionAuthorization['evaluation']['actor']
): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function isStoredStatementIssuerValid(issuer: StoredStatementIssuer): boolean {
  return (
    issuer.statement.kind === 'statement' &&
    issuer.statement.schema === 't3x/statement/v1' &&
    issuer.statement.digest.length > 0 &&
    ['agent', 'human', 'service'].includes(issuer.actor.kind) &&
    issuer.actor.id.length > 0
  );
}

function sameDescriptor(
  left: { kind: string; schema: string; digest: string },
  right: { kind: string; schema: string; digest: string }
): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

function statementIssuers(record: RepositoryDecisionRecord): StoredStatementIssuer[] {
  return record.observations
    .map((observation) => ({
      statement: describeTransitionObject(
        observation.statement
      ) as StoredStatementIssuer['statement'],
      actor: { ...observation.issuerContext.actor },
    }))
    .sort((left, right) =>
      left.statement.digest < right.statement.digest
        ? -1
        : left.statement.digest > right.statement.digest
          ? 1
          : 0
    );
}

function sameStatementIssuers(
  left: readonly StoredStatementIssuer[],
  right: readonly StoredStatementIssuer[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        sameDescriptor(entry.statement, right[index]!.statement) &&
        sameActor(entry.actor, right[index]!.actor)
    )
  );
}

function decisionFacts(record: RepositoryDecisionRecord): StoredDecisionFacts {
  const decisionDigest = serializeTransitionObject(record.decision).descriptor.digest;
  return {
    projectId: record.projectId,
    refName: record.refName,
    decisionDigest,
    policyUri: record.evaluation.policy.uri,
    policyDigest: record.evaluation.policy.digest,
    actorKind: record.evaluation.actor.kind,
    actorId: record.evaluation.actor.id,
    outcome: record.evaluation.requestedOutcome,
    observationScope: {
      completeness: record.observationScope.completeness,
      sources: [...record.observationScope.sources],
    },
    statementIssuers: statementIssuers(record),
  };
}

function sameDecisionFacts(left: StoredDecisionFacts, right: StoredDecisionFacts): boolean {
  return (
    left.projectId === right.projectId &&
    left.refName === right.refName &&
    left.decisionDigest === right.decisionDigest &&
    left.policyUri === right.policyUri &&
    left.policyDigest === right.policyDigest &&
    left.actorKind === right.actorKind &&
    left.actorId === right.actorId &&
    left.outcome === right.outcome &&
    sameScope(left.observationScope, right.observationScope) &&
    sameStatementIssuers(left.statementIssuers, right.statementIssuers)
  );
}

function isStoredScopeValid(scope: StoredDecisionFacts['observationScope']): boolean {
  return (
    ['complete', 'partial'].includes(scope.completeness) &&
    scope.sources.length > 0 &&
    scope.sources.every((source) => source.length > 0) &&
    new Set(scope.sources).size === scope.sources.length &&
    scope.sources.every((source, index) => index === 0 || scope.sources[index - 1]! < source)
  );
}

export async function persistTransitionObjects(
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

async function recordDecisionLedger(tx: AnyDB, record: RepositoryDecisionRecord): Promise<void> {
  const facts = decisionFacts(record);
  await persistTransitionObjects(tx, record.objects);
  await tx.insert(transitionDecisionLedger).values(facts).onConflictDoNothing();
  const [stored] = await tx
    .select()
    .from(transitionDecisionLedger)
    .where(eq(transitionDecisionLedger.decisionDigest, facts.decisionDigest))
    .limit(1);
  if (stored === undefined || !sameDecisionFacts(stored, facts)) {
    throw new DecisionRecordConflictError(facts.decisionDigest);
  }
}

/**
 * Append a trusted Decision outcome to repository audit history without
 * granting CommitV2 authority. Exact repeats are idempotent; attempts to
 * mutate or rebind the Decision digest fail closed.
 */
export async function recordRepositoryDecision(
  db: AnyDB,
  record: RepositoryDecisionRecord
): Promise<void> {
  if (!isRepositoryDecisionRecord(record)) {
    throw new TypeError('Repository Decision record was not issued by the trusted service');
  }
  await (db as unknown as TxRunner).transaction(async (rawTx) => {
    await recordDecisionLedger(rawTx as AnyDB, record);
  });
}

/**
 * Persist an accepted/overridden Decision and its separate CommitV2 authority
 * atomically. A ledger row alone is never sufficient authorization.
 */
export async function recordRepositoryDecisionAuthorization(
  db: AnyDB,
  authorization: RepositoryDecisionAuthorization
): Promise<void> {
  if (
    !isRepositoryDecisionRecord(authorization) ||
    !isRepositoryDecisionAuthorization(authorization)
  ) {
    throw new TypeError('Repository Decision authorization was not issued by the trusted service');
  }
  const facts = decisionFacts(authorization);
  await (db as unknown as TxRunner).transaction(async (rawTx) => {
    const tx = rawTx as AnyDB;
    await recordDecisionLedger(tx, authorization);
    await tx
      .insert(transitionDecisionAuthorizations)
      .values({
        projectId: facts.projectId,
        refName: facts.refName,
        decisionDigest: facts.decisionDigest,
        policyUri: facts.policyUri,
        policyDigest: facts.policyDigest,
        actorKind: facts.actorKind,
        actorId: facts.actorId,
        outcome: facts.outcome,
        observationScope: facts.observationScope,
        statementIssuers: facts.statementIssuers,
      })
      .onConflictDoNothing();
    const [stored] = await tx
      .select()
      .from(transitionDecisionAuthorizations)
      .where(
        and(
          eq(transitionDecisionAuthorizations.projectId, facts.projectId),
          eq(transitionDecisionAuthorizations.refName, facts.refName),
          eq(transitionDecisionAuthorizations.decisionDigest, facts.decisionDigest)
        )
      )
      .limit(1);
    if (stored === undefined || !sameDecisionFacts(stored, facts)) {
      throw new DecisionAuthorizationConflictError(facts.decisionDigest);
    }
  });
}

async function resolveStoredObject(
  resolver: ObjectResolver,
  descriptor: ObjectDescriptor
): Promise<ProtocolObject> {
  const bytes = await resolver.get(descriptor);
  if (bytes === undefined) {
    throw new TypeError(`Transition object ${descriptor.digest} was not found`);
  }
  const canonicalJson = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const object = parseSerializedTransitionObject(canonicalJson);
  const actual = describeTransitionObject(object);
  if (!sameDescriptor(actual, descriptor)) {
    throw new TypeError(`Transition object ${descriptor.digest} failed identity verification`);
  }
  return object;
}

function isDecisionOutcome(
  outcome: string
): outcome is RepositoryDecisionRecord['evaluation']['requestedOutcome'] {
  return ['accepted', 'overridden', 'rejected'].includes(outcome);
}

async function resolveDecisionAuditRow(
  db: AnyDB,
  row: typeof transitionDecisionLedger.$inferSelect
): Promise<RepositoryDecisionAuditEntry> {
  const decisionDigest = row.decisionDigest;
  if (
    !/^sha256:[0-9a-f]{64}$/.test(decisionDigest) ||
    row.projectId.length === 0 ||
    row.refName.length === 0 ||
    row.policyUri.length === 0 ||
    row.policyDigest.length === 0 ||
    row.actorId.length === 0 ||
    !['agent', 'human', 'service'].includes(row.actorKind) ||
    !isDecisionOutcome(row.outcome) ||
    !isStoredScopeValid(row.observationScope)
  ) {
    throw new DecisionRecordIntegrityError(decisionDigest);
  }

  const resolver = new DatabaseTransitionObjectResolver(db, row.projectId);
  const decisionObject = await resolveStoredObject(resolver, {
    kind: 'statement',
    schema: 't3x/statement/v1',
    digest: decisionDigest as ObjectDescriptor['digest'],
  });
  if (decisionObject.schema !== 't3x/statement/v1') {
    throw new DecisionRecordIntegrityError(decisionDigest);
  }
  const graph = await verifyDecisionGraph(
    decisionObject as RepositoryDecisionRecord['decision'],
    resolver
  );
  const policy = graph.decision.predicate.policy;
  if (
    policy.mode !== 'evaluated' ||
    policy.resource.uri !== row.policyUri ||
    policy.resource.digest !== row.policyDigest ||
    !sameActor(graph.decision.actor, {
      kind: row.actorKind as RepositoryDecisionRecord['evaluation']['actor']['kind'],
      id: row.actorId,
    }) ||
    graph.decision.predicate.outcome !== row.outcome
  ) {
    throw new DecisionRecordIntegrityError(decisionDigest);
  }

  const issuerByDigest = new Map<string, StoredStatementIssuer>();
  for (const issuer of row.statementIssuers) {
    if (!isStoredStatementIssuerValid(issuer) || issuerByDigest.has(issuer.statement.digest)) {
      throw new DecisionRecordIntegrityError(decisionDigest);
    }
    issuerByDigest.set(issuer.statement.digest, issuer);
  }

  const observations: StatementObservation[] = [];
  for (const descriptor of graph.decision.predicate.considered) {
    const issuer = issuerByDigest.get(descriptor.digest);
    if (issuer === undefined || !sameDescriptor(issuer.statement, descriptor)) {
      throw new DecisionRecordIntegrityError(decisionDigest);
    }
    const object = await resolveStoredObject(resolver, descriptor);
    if (object.schema !== 't3x/statement/v1') {
      throw new DecisionRecordIntegrityError(decisionDigest);
    }
    observations.push({
      statement: object as StatementObservation['statement'],
      issuerContext: { actor: { ...issuer.actor } },
    });
  }
  if (issuerByDigest.size !== observations.length) {
    throw new DecisionRecordIntegrityError(decisionDigest);
  }

  return {
    ...graph,
    projectId: row.projectId,
    refName: row.refName,
    decisionDigest,
    policyResource: { uri: row.policyUri, digest: row.policyDigest },
    actor: {
      kind: row.actorKind as RepositoryDecisionRecord['evaluation']['actor']['kind'],
      id: row.actorId,
    },
    outcome: row.outcome,
    observationScope: {
      completeness: row.observationScope.completeness,
      sources: [...row.observationScope.sources],
    },
    observations,
    recordedAt: row.recordedAt.toISOString(),
  };
}

export async function getRepositoryDecisionAudit(
  db: AnyDB,
  input: { projectId: string; refName: string; decisionDigest: string }
): Promise<RepositoryDecisionAuditEntry | null> {
  const [row] = await db
    .select()
    .from(transitionDecisionLedger)
    .where(
      and(
        eq(transitionDecisionLedger.projectId, input.projectId),
        eq(transitionDecisionLedger.refName, input.refName),
        eq(transitionDecisionLedger.decisionDigest, input.decisionDigest)
      )
    )
    .limit(1);
  return row === undefined ? null : resolveDecisionAuditRow(db, row);
}

export async function listRepositoryDecisionAudit(
  db: AnyDB,
  input: { projectId: string; refName: string; limit?: number; offset?: number }
): Promise<RepositoryDecisionAuditEntry[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 100));
  const offset = Math.max(0, input.offset ?? 0);
  const rows = await db
    .select()
    .from(transitionDecisionLedger)
    .where(
      and(
        eq(transitionDecisionLedger.projectId, input.projectId),
        eq(transitionDecisionLedger.refName, input.refName)
      )
    )
    .orderBy(
      desc(transitionDecisionLedger.recordedAt),
      desc(transitionDecisionLedger.decisionDigest)
    )
    .limit(limit)
    .offset(offset);
  return Promise.all(rows.map((row) => resolveDecisionAuditRow(db, row)));
}

/**
 * Resolve a committed Transition into the shared, non-authoritative product
 * projection. Every protocol object and every stored trust fact is verified at
 * read time; request-shaped actor, issuer, policy, or scope data is never used.
 */
export async function getTransitionViewForCommit(
  db: AnyDB,
  input: { projectId: string; refName: string; commitId: string }
): Promise<TransitionViewV1 | null> {
  const transition = await getTransitionCommit(db, input.projectId, input.commitId);
  if (transition === null) {
    const legacy = await getCommit(db, input.commitId);
    return legacy?.project_id === input.projectId && legacy.branch === input.refName
      ? projectTransitionView({ mode: 'legacy', commit: legacy })
      : null;
  }

  const resolver = new DatabaseTransitionObjectResolver(db, input.projectId);
  const verified = await verifyCommitV2(transition.commit, resolver);
  const decisionDigest = transition.commit.decision.digest;
  const [authorization] = await db
    .select()
    .from(transitionDecisionAuthorizations)
    .where(
      and(
        eq(transitionDecisionAuthorizations.projectId, input.projectId),
        eq(transitionDecisionAuthorizations.refName, input.refName),
        eq(transitionDecisionAuthorizations.decisionDigest, decisionDigest)
      )
    )
    .limit(1);
  if (authorization === undefined) {
    throw new TransitionProjectionAuthorizationInvalidError(decisionDigest);
  }

  const policy = verified.decision.predicate.policy;
  if (
    policy.mode !== 'evaluated' ||
    policy.resource.uri !== authorization.policyUri ||
    policy.resource.digest !== authorization.policyDigest ||
    !sameActor(verified.decision.actor, {
      kind: authorization.actorKind as RepositoryDecisionAuthorization['evaluation']['actor']['kind'],
      id: authorization.actorId,
    }) ||
    verified.decision.predicate.outcome !== authorization.outcome
  ) {
    throw new TransitionProjectionAuthorizationInvalidError(decisionDigest);
  }

  const issuerByDigest = new Map<string, StoredStatementIssuer>();
  for (const issuer of authorization.statementIssuers) {
    if (!isStoredStatementIssuerValid(issuer) || issuerByDigest.has(issuer.statement.digest)) {
      throw new TransitionProjectionAuthorizationInvalidError(decisionDigest);
    }
    issuerByDigest.set(issuer.statement.digest, issuer);
  }

  const observations: StatementObservation[] = [];
  for (const descriptor of verified.decision.predicate.considered) {
    const issuer = issuerByDigest.get(descriptor.digest);
    if (issuer === undefined || !sameDescriptor(issuer.statement, descriptor)) {
      throw new TransitionProjectionAuthorizationInvalidError(decisionDigest);
    }
    const object = await resolveStoredObject(resolver, descriptor);
    if (object.schema !== 't3x/statement/v1') {
      throw new TransitionProjectionAuthorizationInvalidError(decisionDigest);
    }
    observations.push({
      // parseSerializedTransitionObject already validated the closed Statement
      // envelope. The cast only bridges specialized core predicates to the
      // generic StatementObservation envelope used by the policy layer.
      statement: object as StatementObservation['statement'],
      issuerContext: { actor: { ...issuer.actor } },
    });
  }
  if (issuerByDigest.size !== observations.length) {
    throw new TransitionProjectionAuthorizationInvalidError(decisionDigest);
  }

  return projectTransitionView({
    mode: 'transition',
    effect: verified.effect,
    proposal: verified.proposal,
    observations,
    observationScope: authorization.observationScope,
    objectIntegrity: 'verified',
    decision: verified.decision,
    commit: { object: transition.commit, recordedAt: transition.recordedAt },
  });
}

export interface CreateTransitionCommitInput {
  projectId: string;
  refName: string;
  expectedHead: string | null;
  commit: CommitV2;
  /** Graph objects not already present in the repository object store. */
  objects: readonly ProtocolObject[];
  /** Application provenance rows consumed by this Transition, outside CommitV2 identity. */
  yopsLogIds?: readonly string[];
}

export interface CreatedTransitionCommit {
  commit: CommitV2;
  digest: string;
  mediaType: typeof COMMIT_V2_MEDIA_TYPE;
}

export type TransitionRefHead =
  | {
      format: 'empty';
      refName: string;
      head: null;
    }
  | {
      format: 'legacy_v1';
      refName: string;
      head: string;
    }
  | {
      format: 'transition_v2';
      refName: string;
      head: string;
      commit: CommitV2;
      recordedAt: string;
      state: State;
    };

/**
 * Resolve a repository ref into a verified Transition base.
 *
 * Legacy CommitV1 heads are reported explicitly and never promoted into a
 * synthetic CommitV2 parent. CommitV2 heads and their Result State are
 * re-hashed and integrity-verified before callers may use them as a Base.
 */
export async function getTransitionRefHead(
  db: AnyDB,
  input: { projectId: string; refName: string }
): Promise<TransitionRefHead> {
  const [ref] = await db
    .select({ head: branches.headCommitHash })
    .from(branches)
    .where(and(eq(branches.projectId, input.projectId), eq(branches.name, input.refName)))
    .limit(1);
  if (ref === undefined) {
    throw new TransitionRefNotFoundError(input.projectId, input.refName);
  }
  if (ref.head === null) {
    return { format: 'empty', refName: input.refName, head: null };
  }

  const transition = await getTransitionCommit(db, input.projectId, ref.head);
  if (transition === null) {
    const legacy = await getCommit(db, ref.head);
    if (legacy?.project_id !== input.projectId) {
      throw new TransitionRefHeadIntegrityError(input.projectId, input.refName, ref.head);
    }
    return { format: 'legacy_v1', refName: input.refName, head: ref.head };
  }

  const resolver = new DatabaseTransitionObjectResolver(db, input.projectId);
  const verified = await verifyCommitV2(transition.commit, resolver);
  const result = await resolveStoredObject(resolver, verified.effect.result);
  if (result.schema !== 't3x/state/v1') {
    throw new TransitionRefHeadIntegrityError(input.projectId, input.refName, ref.head);
  }
  return {
    format: 'transition_v2',
    refName: input.refName,
    head: ref.head,
    commit: verified.commit,
    recordedAt: transition.recordedAt,
    state: result,
  };
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
    const parentDigests = [...new Set(input.commit.parents.map((parent) => parent.digest))].sort();
    if (parentDigests.length > 0) {
      const rows = await tx
        .select({ digest: transitionCommits.digest })
        .from(transitionCommits)
        .where(
          and(
            eq(transitionCommits.projectId, input.projectId),
            inArray(transitionCommits.digest, parentDigests)
          )
        );
      const projectParents = new Set(rows.map((row) => row.digest));
      const missingParents = parentDigests.filter((digest) => !projectParents.has(digest));
      if (missingParents.length > 0) {
        throw new TransitionParentProjectMembershipError(missingParents);
      }
    }

    const yopsLogIds = [...new Set(input.yopsLogIds ?? [])].sort();
    if (yopsLogIds.length > 0) {
      await acquireProjectSupersedeLock(tx, input.projectId);
      const rows = await tx
        .select({ id: yopsLog.id, projectId: yopsLog.projectId })
        .from(yopsLog)
        .where(inArray(yopsLog.id, yopsLogIds));
      const byId = new Map(rows.map((row) => [row.id, row.projectId]));
      const invalid = yopsLogIds.filter((id) => byId.get(id) !== input.projectId);
      if (invalid.length > 0) throw new TransitionYOpsLogMembershipError(invalid);

      const superseded = await tx
        .select({ id: yopsLog.id })
        .from(yopsLog)
        .where(and(inArray(yopsLog.id, yopsLogIds), isNotNull(yopsLog.supersededAt)));
      if (superseded.length > 0) {
        throw new SupersededYOpsLogIdsError(superseded.map((row) => row.id));
      }

      const consumptions = await tx
        .select({
          yopsLogId: transitionYOpsLogConsumptions.yopsLogId,
          commitDigest: transitionYOpsLogConsumptions.commitDigest,
        })
        .from(transitionYOpsLogConsumptions)
        .where(
          and(
            eq(transitionYOpsLogConsumptions.projectId, input.projectId),
            inArray(transitionYOpsLogConsumptions.yopsLogId, yopsLogIds)
          )
        );
      if (consumptions.length > 0) {
        throw new TransitionYOpsLogAlreadyConsumedError(consumptions);
      }
    }
    // Resolve and re-hash inside the same transaction that advances the ref so
    // no mutable storage read can create a verification/CAS time-of-check gap.
    const resolver = overlayTransitionObjects(
      new DatabaseTransitionObjectResolver(tx, input.projectId),
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
    if (yopsLogIds.length > 0) {
      await tx.insert(transitionYOpsLogConsumptions).values(
        yopsLogIds.map((yopsLogId) => ({
          projectId: input.projectId,
          yopsLogId,
          commitDigest: descriptor.digest,
        }))
      );
    }

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

export interface VerifiedTransitionCommitGraph extends VerifiedCommitIntegrity {
  recordedAt: string;
}

/**
 * Resolve and verify the complete CommitV2 -> Decision -> Proposal -> Effect
 * graph from repository-owned bytes. Application commands use this instead of
 * accepting Effect operations or a target State from a client.
 */
export async function getVerifiedTransitionCommitGraph(
  db: AnyDB,
  projectId: string,
  digest: string
): Promise<VerifiedTransitionCommitGraph | null> {
  const stored = await getTransitionCommit(db, projectId, digest);
  if (stored === null) return null;
  const verified = await verifyRepositoryCommitClosure(
    stored.commit,
    new DatabaseTransitionObjectResolver(db, projectId)
  );
  return { ...verified, recordedAt: stored.recordedAt };
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
