import { randomUUID } from 'node:crypto';
import {
  describeTransitionObject,
  type ProposalStatement,
  type ProtocolObject,
  parseSerializedTransitionObject,
  type State,
  sha256,
} from '@t3x-dev/core';
import { and, asc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type TransitionProposalMembershipRecord,
  type TransitionStatementMembershipRecord,
  transitionObjects,
  transitionProposalMemberships,
  transitionStatementMemberships,
} from '../schema-transition-commits';
import { persistTransitionObjects } from './transition-commits';

export const TRANSITION_REQUEST_KINDS = [
  'structured_yops',
  'exact_source_import',
  'exact_source_edit',
  'exact_source_revert',
] as const;

export type TransitionRequestKind = (typeof TRANSITION_REQUEST_KINDS)[number];
type ActorRef = ProposalStatement['actor'];

const REQUEST_DIGEST_DOMAIN = 't3x-transition-request-v1' as const;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export class TransitionMembershipNotFoundError extends Error {
  readonly code = 'TRANSITION_NOT_FOUND';

  constructor(readonly transitionId: string) {
    super(`Transition ${transitionId} was not found in this project`);
    this.name = 'TransitionMembershipNotFoundError';
  }
}

export class TransitionRequestConflictError extends Error {
  readonly code = 'TRANSITION_REQUEST_CONFLICT';

  constructor(readonly requestId: string) {
    super(`Transition request ${requestId} was already used with different facts`);
    this.name = 'TransitionRequestConflictError';
  }
}

export class TransitionStatementConflictError extends Error {
  readonly code = 'TRANSITION_STATEMENT_CONFLICT';

  constructor(readonly requestId: string) {
    super(`Transition Statement request ${requestId} conflicts with stored issuer facts`);
    this.name = 'TransitionStatementConflictError';
  }
}

export class TransitionMembershipIntegrityError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'TransitionMembershipIntegrityError';
  }
}

export function digestTransitionRequestCanonicalJson(canonicalJson: string): `sha256:${string}` {
  return `sha256:${sha256(`${REQUEST_DIGEST_DOMAIN}\0${canonicalJson}`)}`;
}

function assertActor(actor: ActorRef, field: string): void {
  if (!['human', 'agent', 'service'].includes(actor.kind) || actor.id.trim().length === 0) {
    throw new TypeError(`${field} requires a valid authenticated actor`);
  }
}

function sameActor(left: ActorRef, right: ActorRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function sameDescriptor(
  left: { kind: string; schema: string; digest: string },
  right: { kind: string; schema: string; digest: string }
): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

function comparePortable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isCorePredicateType(predicateType: string): boolean {
  return predicateType === 't3x.proposal/v1' || predicateType === 't3x.decision/v1';
}

function proposalFactsEqual(
  row: TransitionProposalMembershipRecord,
  input: CreateTransitionProposalMembershipInput
): boolean {
  return (
    row.projectId === input.projectId &&
    row.workspaceId === input.workspaceId &&
    row.workspaceRevision === input.workspaceRevision &&
    row.refName === input.refName &&
    row.refHead === input.refHead &&
    row.proposalDigest === describeTransitionObject(input.proposal).digest &&
    row.effectDigest === describeTransitionObject(input.effect).digest &&
    row.requestKind === input.requestKind &&
    row.requestCanonicalJson === input.requestCanonicalJson &&
    row.requestDigest === input.requestDigest &&
    row.actorKind === input.actor.kind &&
    row.actorId === input.actor.id &&
    row.requestId === input.requestId
  );
}

export interface CreateTransitionProposalMembershipInput {
  projectId: string;
  workspaceId: string;
  workspaceRevision: number;
  refName: string;
  refHead: string | null;
  requestKind: TransitionRequestKind;
  requestCanonicalJson: string;
  requestDigest: string;
  requestId: string;
  actor: ActorRef;
  base: State;
  result: State;
  effect: Extract<ProtocolObject, { schema: 't3x/effect/v1' }>;
  proposal: ProposalStatement;
}

export interface TransitionProposalMembership {
  transitionId: string;
  projectId: string;
  workspaceId: string;
  workspaceRevision: number;
  refName: string;
  refHead: string | null;
  proposalDigest: string;
  effectDigest: string;
  requestKind: TransitionRequestKind;
  requestCanonicalJson: string;
  requestDigest: string;
  actor: ActorRef;
  requestId: string;
  createdAt: string;
}

export interface TransitionStatementMembership {
  transitionId: string;
  statementDigest: string;
  source: string;
  issuer: ActorRef;
  requestId: string;
  requestDigest: string;
  createdAt: string;
}

export interface ResolvedTransitionProposalGraph {
  membership: TransitionProposalMembership;
  base: State;
  result: State;
  effect: Extract<ProtocolObject, { schema: 't3x/effect/v1' }>;
  proposal: ProposalStatement;
  observations: Array<{
    membership: TransitionStatementMembership;
    statement: Extract<ProtocolObject, { schema: 't3x/statement/v1' }>;
    issuerContext: { actor: ActorRef };
  }>;
}

function proposalMembership(row: TransitionProposalMembershipRecord): TransitionProposalMembership {
  if (!TRANSITION_REQUEST_KINDS.includes(row.requestKind as TransitionRequestKind)) {
    throw new TransitionMembershipIntegrityError(
      `Stored Transition ${row.transitionId} has an unsupported request kind`
    );
  }
  return {
    transitionId: row.transitionId,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    workspaceRevision: row.workspaceRevision,
    refName: row.refName,
    refHead: row.refHead,
    proposalDigest: row.proposalDigest,
    effectDigest: row.effectDigest,
    requestKind: row.requestKind as TransitionRequestKind,
    requestCanonicalJson: row.requestCanonicalJson,
    requestDigest: row.requestDigest,
    actor: { kind: row.actorKind as ActorRef['kind'], id: row.actorId },
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
  };
}

function statementMembership(
  row: TransitionStatementMembershipRecord
): TransitionStatementMembership {
  return {
    transitionId: row.transitionId,
    statementDigest: row.statementDigest,
    source: row.source,
    issuer: { kind: row.issuerKind as ActorRef['kind'], id: row.issuerId },
    requestId: row.requestId,
    requestDigest: row.requestDigest,
    createdAt: row.createdAt.toISOString(),
  };
}

function assertProposalGraph(input: CreateTransitionProposalMembershipInput): void {
  assertActor(input.actor, 'actor');
  if (!Number.isInteger(input.workspaceRevision) || input.workspaceRevision < 1) {
    throw new TypeError('workspaceRevision must be a positive integer');
  }
  if (input.requestId.trim().length === 0) throw new TypeError('requestId must be non-empty');
  if (!DIGEST_PATTERN.test(input.requestDigest)) throw new TypeError('requestDigest is invalid');
  if (digestTransitionRequestCanonicalJson(input.requestCanonicalJson) !== input.requestDigest) {
    throw new TypeError('requestDigest does not match the canonical request bytes');
  }
  const effect = describeTransitionObject(input.effect);
  const proposal = describeTransitionObject(input.proposal);
  if (
    input.proposal.predicateType !== 't3x.proposal/v1' ||
    input.proposal.subjects.length !== 1 ||
    !sameDescriptor(input.proposal.subjects[0]!, effect)
  ) {
    throw new TransitionMembershipIntegrityError('Proposal does not bind the supplied Effect');
  }
  if (!sameActor(input.proposal.actor, input.actor)) {
    throw new TransitionMembershipIntegrityError(
      'Proposal actor does not match authenticated actor'
    );
  }
  if (!sameDescriptor(input.effect.base, describeTransitionObject(input.base))) {
    throw new TransitionMembershipIntegrityError('Effect Base does not match the supplied State');
  }
  if (!sameDescriptor(input.effect.result, describeTransitionObject(input.result))) {
    throw new TransitionMembershipIntegrityError('Effect Result does not match the supplied State');
  }
  if (proposal.digest.length === 0) {
    throw new TransitionMembershipIntegrityError('Proposal identity is empty');
  }
}

export async function findTransitionProposalByRequest(
  db: AnyDB,
  input: { projectId: string; actor: ActorRef; requestId: string }
): Promise<TransitionProposalMembership | null> {
  const [row] = await db
    .select()
    .from(transitionProposalMemberships)
    .where(
      and(
        eq(transitionProposalMemberships.projectId, input.projectId),
        eq(transitionProposalMemberships.actorKind, input.actor.kind),
        eq(transitionProposalMemberships.actorId, input.actor.id),
        eq(transitionProposalMemberships.requestId, input.requestId)
      )
    )
    .limit(1);
  return row === undefined ? null : proposalMembership(row);
}

export async function createTransitionProposalMembership(
  db: AnyDB,
  input: CreateTransitionProposalMembershipInput
): Promise<{ membership: TransitionProposalMembership; reused: boolean }> {
  assertProposalGraph(input);
  const existing = await findTransitionProposalByRequest(db, input);
  if (existing !== null) {
    const row = {
      ...existing,
      createdAt: new Date(existing.createdAt),
      actorKind: existing.actor.kind,
      actorId: existing.actor.id,
    } as TransitionProposalMembershipRecord;
    if (!proposalFactsEqual(row, input)) throw new TransitionRequestConflictError(input.requestId);
    return { membership: existing, reused: true };
  }

  const transitionId = `trn_${randomUUID().replaceAll('-', '')}`;
  const values = {
    transitionId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    workspaceRevision: input.workspaceRevision,
    refName: input.refName,
    refHead: input.refHead,
    proposalDigest: describeTransitionObject(input.proposal).digest,
    effectDigest: describeTransitionObject(input.effect).digest,
    requestKind: input.requestKind,
    requestCanonicalJson: input.requestCanonicalJson,
    requestDigest: input.requestDigest,
    actorKind: input.actor.kind,
    actorId: input.actor.id,
    requestId: input.requestId,
  };
  await (
    db as unknown as {
      transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
    }
  ).transaction(async (rawTx) => {
    const tx = rawTx as AnyDB;
    await persistTransitionObjects(tx, [input.base, input.result, input.effect, input.proposal]);
    await tx.insert(transitionProposalMemberships).values(values).onConflictDoNothing();
  });

  const stored = await findTransitionProposalByRequest(db, input);
  if (stored === null) throw new TransitionMembershipIntegrityError('Proposal membership vanished');
  const storedRow = {
    ...stored,
    createdAt: new Date(stored.createdAt),
    actorKind: stored.actor.kind,
    actorId: stored.actor.id,
  } as TransitionProposalMembershipRecord;
  if (!proposalFactsEqual(storedRow, input))
    throw new TransitionRequestConflictError(input.requestId);
  return { membership: stored, reused: stored.transitionId !== transitionId };
}

export async function getTransitionProposalMembership(
  db: AnyDB,
  projectId: string,
  transitionId: string
): Promise<TransitionProposalMembership | null> {
  const [row] = await db
    .select()
    .from(transitionProposalMemberships)
    .where(
      and(
        eq(transitionProposalMemberships.projectId, projectId),
        eq(transitionProposalMemberships.transitionId, transitionId)
      )
    )
    .limit(1);
  return row === undefined ? null : proposalMembership(row);
}

async function loadObject(
  db: AnyDB,
  descriptor: { kind: string; schema: string; digest: string }
): Promise<ProtocolObject> {
  const [row] = await db
    .select()
    .from(transitionObjects)
    .where(eq(transitionObjects.digest, descriptor.digest))
    .limit(1);
  if (row === undefined) {
    throw new TransitionMembershipIntegrityError(`Object ${descriptor.digest} is missing`);
  }
  const object = parseSerializedTransitionObject(row.canonicalJson);
  const actual = describeTransitionObject(object);
  if (
    row.kind !== descriptor.kind ||
    row.schema !== descriptor.schema ||
    !sameDescriptor(actual, descriptor)
  ) {
    throw new TransitionMembershipIntegrityError(`Object ${descriptor.digest} failed verification`);
  }
  return object;
}

export async function listTransitionStatementMemberships(
  db: AnyDB,
  projectId: string,
  transitionId: string
): Promise<TransitionStatementMembership[]> {
  const membership = await getTransitionProposalMembership(db, projectId, transitionId);
  if (membership === null) throw new TransitionMembershipNotFoundError(transitionId);
  const rows = await db
    .select()
    .from(transitionStatementMemberships)
    .where(eq(transitionStatementMemberships.transitionId, transitionId))
    .orderBy(asc(transitionStatementMemberships.statementDigest));
  return rows.map(statementMembership);
}

export async function findTransitionStatementsByRequest(
  db: AnyDB,
  input: {
    projectId: string;
    transitionId: string;
    requestId: string;
    requestDigest: string;
  }
): Promise<TransitionStatementMembership[]> {
  const rows = await listTransitionStatementMemberships(db, input.projectId, input.transitionId);
  const matching = rows.filter((row) => row.requestId === input.requestId);
  if (matching.some((row) => row.requestDigest !== input.requestDigest)) {
    throw new TransitionStatementConflictError(input.requestId);
  }
  return matching;
}

export interface RecordTransitionStatementMembershipInput {
  projectId: string;
  transitionId: string;
  statement: Extract<ProtocolObject, { schema: 't3x/statement/v1' }>;
  source: string;
  issuer: ActorRef;
  requestId: string;
  requestDigest: string;
}

function statementFactsEqual(
  row: TransitionStatementMembership,
  input: RecordTransitionStatementMembershipInput
): boolean {
  return (
    row.transitionId === input.transitionId &&
    row.statementDigest === describeTransitionObject(input.statement).digest &&
    row.source === input.source &&
    sameActor(row.issuer, input.issuer) &&
    row.requestId === input.requestId &&
    row.requestDigest === input.requestDigest
  );
}

export async function recordTransitionStatementMembership(
  db: AnyDB,
  input: RecordTransitionStatementMembershipInput
): Promise<{ membership: TransitionStatementMembership; reused: boolean }> {
  const graph = await resolveTransitionProposalGraph(
    db,
    input.projectId,
    input.transitionId,
    false
  );
  assertActor(input.issuer, 'issuer');
  if (input.source.trim().length === 0 || input.requestId.trim().length === 0) {
    throw new TypeError('Statement source and requestId must be non-empty');
  }
  if (!DIGEST_PATTERN.test(input.requestDigest)) throw new TypeError('requestDigest is invalid');
  if (!sameActor(input.statement.actor, input.issuer)) {
    throw new TransitionMembershipIntegrityError(
      'Statement claimed actor does not match authenticated issuer'
    );
  }
  if (isCorePredicateType(input.statement.predicateType)) {
    throw new TransitionMembershipIntegrityError(
      'Proposal and Decision predicates cannot enter external Statement membership'
    );
  }
  const allowedSubjects = [
    describeTransitionObject(graph.effect),
    graph.effect.result,
    describeTransitionObject(graph.proposal),
  ];
  if (
    input.statement.subjects.length === 0 ||
    input.statement.subjects.some(
      (subject) => !allowedSubjects.some((allowed) => sameDescriptor(subject, allowed))
    )
  ) {
    throw new TransitionMembershipIntegrityError(
      'Statement subjects must belong to the project-scoped Transition graph'
    );
  }

  const digest = describeTransitionObject(input.statement).digest;
  const current = await listTransitionStatementMemberships(db, input.projectId, input.transitionId);
  const sameDigest = current.find((row) => row.statementDigest === digest);
  const sameRequest = current.find(
    (row) =>
      row.source === input.source &&
      sameActor(row.issuer, input.issuer) &&
      row.requestId === input.requestId
  );
  for (const existing of [sameDigest, sameRequest]) {
    if (existing !== undefined) {
      if (!statementFactsEqual(existing, input)) {
        throw new TransitionStatementConflictError(input.requestId);
      }
      return { membership: existing, reused: true };
    }
  }

  await (
    db as unknown as {
      transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
    }
  ).transaction(async (rawTx) => {
    const tx = rawTx as AnyDB;
    await persistTransitionObjects(tx, [input.statement]);
    await tx
      .insert(transitionStatementMemberships)
      .values({
        transitionId: input.transitionId,
        statementDigest: digest,
        source: input.source,
        issuerKind: input.issuer.kind,
        issuerId: input.issuer.id,
        requestId: input.requestId,
        requestDigest: input.requestDigest,
      })
      .onConflictDoNothing();
  });

  const stored = (
    await listTransitionStatementMemberships(db, input.projectId, input.transitionId)
  ).find((row) => row.statementDigest === digest);
  if (stored === undefined || !statementFactsEqual(stored, input)) {
    throw new TransitionStatementConflictError(input.requestId);
  }
  return { membership: stored, reused: false };
}

export async function resolveTransitionProposalGraph(
  db: AnyDB,
  projectId: string,
  transitionId: string,
  includeObservations = true
): Promise<ResolvedTransitionProposalGraph> {
  const membership = await getTransitionProposalMembership(db, projectId, transitionId);
  if (membership === null) throw new TransitionMembershipNotFoundError(transitionId);
  try {
    assertActor(membership.actor, 'stored actor');
  } catch {
    throw new TransitionMembershipIntegrityError('Stored Proposal actor is invalid');
  }
  if (
    membership.workspaceId.trim().length === 0 ||
    membership.refName.trim().length === 0 ||
    membership.requestId.trim().length === 0 ||
    !Number.isInteger(membership.workspaceRevision) ||
    membership.workspaceRevision < 1 ||
    !DIGEST_PATTERN.test(membership.requestDigest) ||
    digestTransitionRequestCanonicalJson(membership.requestCanonicalJson) !==
      membership.requestDigest
  ) {
    throw new TransitionMembershipIntegrityError('Stored Proposal membership facts are invalid');
  }

  const proposalObject = await loadObject(db, {
    kind: 'statement',
    schema: 't3x/statement/v1',
    digest: membership.proposalDigest,
  });
  if (
    proposalObject.schema !== 't3x/statement/v1' ||
    proposalObject.predicateType !== 't3x.proposal/v1'
  ) {
    throw new TransitionMembershipIntegrityError('Membership Proposal is not a core Proposal');
  }
  const proposal = proposalObject as ProposalStatement;
  if (!sameActor(proposal.actor, membership.actor)) {
    throw new TransitionMembershipIntegrityError('Stored Proposal actor does not match membership');
  }
  if (proposal.subjects.length !== 1 || proposal.subjects[0]!.digest !== membership.effectDigest) {
    throw new TransitionMembershipIntegrityError('Stored Proposal does not bind membership Effect');
  }

  const effectObject = await loadObject(db, proposal.subjects[0]!);
  if (effectObject.schema !== 't3x/effect/v1') {
    throw new TransitionMembershipIntegrityError('Membership Effect has the wrong schema');
  }
  const baseObject = await loadObject(db, effectObject.base);
  const resultObject = await loadObject(db, effectObject.result);
  if (baseObject.schema !== 't3x/state/v1' || resultObject.schema !== 't3x/state/v1') {
    throw new TransitionMembershipIntegrityError('Membership Effect State graph is invalid');
  }

  const observations: ResolvedTransitionProposalGraph['observations'] = [];
  if (includeObservations) {
    const memberships = await listTransitionStatementMemberships(db, projectId, transitionId);
    const allowedSubjects = [
      describeTransitionObject(effectObject),
      effectObject.result,
      describeTransitionObject(proposal),
    ];
    for (const statementRecord of memberships) {
      try {
        assertActor(statementRecord.issuer, 'stored issuer');
      } catch {
        throw new TransitionMembershipIntegrityError('Stored Statement issuer is invalid');
      }
      if (
        statementRecord.source.trim().length === 0 ||
        statementRecord.requestId.trim().length === 0 ||
        !DIGEST_PATTERN.test(statementRecord.requestDigest)
      ) {
        throw new TransitionMembershipIntegrityError(
          'Stored Statement membership facts are invalid'
        );
      }
      const object = await loadObject(db, {
        kind: 'statement',
        schema: 't3x/statement/v1',
        digest: statementRecord.statementDigest,
      });
      if (object.schema !== 't3x/statement/v1') {
        throw new TransitionMembershipIntegrityError('Observed object is not a Statement');
      }
      if (!sameActor(object.actor, statementRecord.issuer)) {
        throw new TransitionMembershipIntegrityError(
          'Stored Statement actor does not match trusted issuer membership'
        );
      }
      if (isCorePredicateType(object.predicateType)) {
        throw new TransitionMembershipIntegrityError(
          'Core predicate found in external Statement membership'
        );
      }
      if (
        object.subjects.length === 0 ||
        object.subjects.some(
          (subject) => !allowedSubjects.some((allowed) => sameDescriptor(subject, allowed))
        )
      ) {
        throw new TransitionMembershipIntegrityError(
          'Stored Statement subjects do not belong to the Transition graph'
        );
      }
      observations.push({
        membership: statementRecord,
        statement: object,
        issuerContext: { actor: statementRecord.issuer },
      });
    }
  }
  observations.sort((left, right) =>
    comparePortable(left.membership.statementDigest, right.membership.statementDigest)
  );
  return {
    membership,
    base: baseObject,
    result: resultObject,
    effect: effectObject,
    proposal,
    observations,
  };
}
