import { type ProposalStatement, parseSerializedTransitionObject } from '@t3x-dev/core';
import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type TransitionCommandReceiptRecord,
  transitionCommandReceipts,
  transitionObjects,
} from '../schema-transition-commits';
import { getTransitionProposalMembership } from './transition-memberships';

export const TRANSITION_COMMAND_ACTIONS = ['decide', 'commit'] as const;
export type TransitionCommandAction = (typeof TRANSITION_COMMAND_ACTIONS)[number];
export const TRANSITION_COMMAND_RESULT_KINDS = ['decision', 'commit'] as const;
export type TransitionCommandResultKind = (typeof TRANSITION_COMMAND_RESULT_KINDS)[number];
type ActorRef = ProposalStatement['actor'];

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export class TransitionCommandConflictError extends Error {
  readonly code = 'TRANSITION_COMMAND_CONFLICT';

  constructor(readonly requestId: string) {
    super(`Transition command ${requestId} was already used with different facts`);
    this.name = 'TransitionCommandConflictError';
  }
}

export class TransitionCommandIntegrityError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'TransitionCommandIntegrityError';
  }
}

export interface TransitionCommandReceipt {
  transitionId: string;
  projectId: string;
  action: TransitionCommandAction;
  actor: ActorRef;
  requestId: string;
  requestDigest: string;
  resultKind: TransitionCommandResultKind;
  resultDigest: string;
  createdAt: string;
}

export interface RecordTransitionCommandReceiptInput {
  transitionId: string;
  projectId: string;
  action: TransitionCommandAction;
  actor: ActorRef;
  requestId: string;
  requestDigest: string;
  resultKind: TransitionCommandResultKind;
  resultDigest: string;
}

function receipt(row: TransitionCommandReceiptRecord): TransitionCommandReceipt {
  if (
    !TRANSITION_COMMAND_ACTIONS.includes(row.action as TransitionCommandAction) ||
    !TRANSITION_COMMAND_RESULT_KINDS.includes(row.resultKind as TransitionCommandResultKind) ||
    !['human', 'agent', 'service'].includes(row.actorKind) ||
    !DIGEST_PATTERN.test(row.requestDigest) ||
    !DIGEST_PATTERN.test(row.resultDigest)
  ) {
    throw new TransitionCommandIntegrityError(
      `Stored Transition command ${row.requestId} has invalid trusted facts`
    );
  }
  return {
    transitionId: row.transitionId,
    projectId: row.projectId,
    action: row.action as TransitionCommandAction,
    actor: { kind: row.actorKind as ActorRef['kind'], id: row.actorId },
    requestId: row.requestId,
    requestDigest: row.requestDigest,
    resultKind: row.resultKind as TransitionCommandResultKind,
    resultDigest: row.resultDigest,
    createdAt: row.createdAt.toISOString(),
  };
}

function sameReceipt(
  stored: TransitionCommandReceipt,
  input: RecordTransitionCommandReceiptInput
): boolean {
  return (
    stored.transitionId === input.transitionId &&
    stored.projectId === input.projectId &&
    stored.action === input.action &&
    stored.actor.kind === input.actor.kind &&
    stored.actor.id === input.actor.id &&
    stored.requestId === input.requestId &&
    stored.requestDigest === input.requestDigest &&
    stored.resultKind === input.resultKind &&
    stored.resultDigest === input.resultDigest
  );
}

function assertInput(input: RecordTransitionCommandReceiptInput): void {
  if (
    input.transitionId.length === 0 ||
    input.projectId.length === 0 ||
    input.actor.id.trim().length === 0 ||
    input.requestId.trim().length === 0 ||
    !['human', 'agent', 'service'].includes(input.actor.kind) ||
    !TRANSITION_COMMAND_ACTIONS.includes(input.action) ||
    !TRANSITION_COMMAND_RESULT_KINDS.includes(input.resultKind) ||
    !DIGEST_PATTERN.test(input.requestDigest) ||
    !DIGEST_PATTERN.test(input.resultDigest)
  ) {
    throw new TypeError('Transition command receipt input is invalid');
  }
  if (
    (input.action === 'decide' && input.resultKind !== 'decision') ||
    (input.action === 'commit' && input.resultKind !== 'commit')
  ) {
    throw new TypeError('Transition command action and result kind do not match');
  }
}

export async function findTransitionCommandReceipt(
  db: AnyDB,
  input: {
    projectId: string;
    transitionId: string;
    actor: ActorRef;
    requestId: string;
  }
): Promise<TransitionCommandReceipt | null> {
  const [row] = await db
    .select()
    .from(transitionCommandReceipts)
    .where(
      and(
        eq(transitionCommandReceipts.projectId, input.projectId),
        eq(transitionCommandReceipts.transitionId, input.transitionId),
        eq(transitionCommandReceipts.actorKind, input.actor.kind),
        eq(transitionCommandReceipts.actorId, input.actor.id),
        eq(transitionCommandReceipts.requestId, input.requestId)
      )
    )
    .limit(1);
  return row === undefined ? null : receipt(row);
}

async function assertResultObject(
  db: AnyDB,
  input: RecordTransitionCommandReceiptInput
): Promise<void> {
  const [row] = await db
    .select({ canonicalJson: transitionObjects.canonicalJson })
    .from(transitionObjects)
    .where(eq(transitionObjects.digest, input.resultDigest))
    .limit(1);
  if (row === undefined) {
    throw new TransitionCommandIntegrityError(
      `Transition command result ${input.resultDigest} does not exist`
    );
  }
  const object = parseSerializedTransitionObject(row.canonicalJson);
  const valid =
    input.resultKind === 'decision'
      ? object.schema === 't3x/statement/v1' && object.predicateType === 't3x.decision/v1'
      : object.schema === 't3x/commit/v2';
  if (!valid) {
    throw new TransitionCommandIntegrityError(
      `Transition command result ${input.resultDigest} has the wrong protocol type`
    );
  }
}

/**
 * Record an idempotency result without granting Decision or Commit authority.
 * The protocol object and project membership must already exist in this same
 * transaction.
 */
export async function recordTransitionCommandReceipt(
  db: AnyDB,
  input: RecordTransitionCommandReceiptInput
): Promise<{ receipt: TransitionCommandReceipt; reused: boolean }> {
  assertInput(input);
  const membership = await getTransitionProposalMembership(db, input.projectId, input.transitionId);
  if (membership === null) {
    throw new TransitionCommandIntegrityError(
      `Transition ${input.transitionId} is not a member of project ${input.projectId}`
    );
  }

  const prior = await findTransitionCommandReceipt(db, input);
  if (prior !== null) {
    if (!sameReceipt(prior, input)) throw new TransitionCommandConflictError(input.requestId);
    return { receipt: prior, reused: true };
  }

  await assertResultObject(db, input);
  await db
    .insert(transitionCommandReceipts)
    .values({
      transitionId: input.transitionId,
      projectId: input.projectId,
      action: input.action,
      actorKind: input.actor.kind,
      actorId: input.actor.id,
      requestId: input.requestId,
      requestDigest: input.requestDigest,
      resultKind: input.resultKind,
      resultDigest: input.resultDigest,
    })
    .onConflictDoNothing();

  const stored = await findTransitionCommandReceipt(db, input);
  if (stored === null || !sameReceipt(stored, input)) {
    throw new TransitionCommandConflictError(input.requestId);
  }
  return { receipt: stored, reused: false };
}
