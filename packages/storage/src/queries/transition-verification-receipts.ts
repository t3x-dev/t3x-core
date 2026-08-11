import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type TransitionVerificationReceiptRecord,
  transitionVerificationReceipts,
} from '../schema-transition-commits';
import { getTransitionProposalMembership } from './transition-memberships';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export interface TransitionOperationalResultReceipt {
  source: string;
  outcome: 'no_statement' | 'failed';
  code: string;
  message: string;
}

export interface TransitionVerificationReceipt {
  transitionId: string;
  projectId: string;
  requestId: string;
  requestDigest: string;
  operationalResults: TransitionOperationalResultReceipt[];
  createdAt: string;
}

export interface RecordTransitionVerificationReceiptInput {
  transitionId: string;
  projectId: string;
  requestId: string;
  requestDigest: string;
  operationalResults: readonly TransitionOperationalResultReceipt[];
}

export class TransitionVerificationReceiptConflictError extends Error {
  readonly code = 'TRANSITION_VERIFY_REQUEST_CONFLICT';

  constructor(readonly requestId: string) {
    super(`Transition Verify request ${requestId} was already used with different facts`);
    this.name = 'TransitionVerificationReceiptConflictError';
  }
}

export class TransitionVerificationReceiptIntegrityError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'TransitionVerificationReceiptIntegrityError';
  }
}

function validOperationalResult(value: unknown): value is TransitionOperationalResultReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.source === 'string' &&
    result.source.trim().length > 0 &&
    (result.outcome === 'no_statement' || result.outcome === 'failed') &&
    typeof result.code === 'string' &&
    result.code.trim().length > 0 &&
    typeof result.message === 'string' &&
    result.message.trim().length > 0
  );
}

function resultKey(value: TransitionOperationalResultReceipt): string {
  return `${value.source}\0${value.outcome}\0${value.code}\0${value.message}`;
}

function normalizeResults(
  values: readonly TransitionOperationalResultReceipt[]
): TransitionOperationalResultReceipt[] {
  if (!values.every(validOperationalResult)) {
    throw new TypeError('Transition Verify operational results are invalid');
  }
  const results = values.map((value) => ({ ...value }));
  results.sort((left, right) => {
    const a = resultKey(left);
    const b = resultKey(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (new Set(results.map((value) => value.source)).size !== results.length) {
    throw new TypeError('Transition Verify operational result sources must be unique');
  }
  return results;
}

function receipt(row: TransitionVerificationReceiptRecord): TransitionVerificationReceipt {
  if (
    row.transitionId.trim().length === 0 ||
    row.projectId.trim().length === 0 ||
    row.requestId.trim().length === 0 ||
    !DIGEST_PATTERN.test(row.requestDigest) ||
    !Array.isArray(row.operationalResults) ||
    !row.operationalResults.every(validOperationalResult)
  ) {
    throw new TransitionVerificationReceiptIntegrityError(
      `Stored Transition Verify receipt ${row.requestId} has invalid facts`
    );
  }
  return {
    transitionId: row.transitionId,
    projectId: row.projectId,
    requestId: row.requestId,
    requestDigest: row.requestDigest,
    operationalResults: normalizeResults(row.operationalResults),
    createdAt: row.createdAt.toISOString(),
  };
}

function sameReceipt(
  stored: TransitionVerificationReceipt,
  input: RecordTransitionVerificationReceiptInput
): boolean {
  const expected = normalizeResults(input.operationalResults);
  return (
    stored.transitionId === input.transitionId &&
    stored.projectId === input.projectId &&
    stored.requestId === input.requestId &&
    stored.requestDigest === input.requestDigest &&
    stored.operationalResults.length === expected.length &&
    stored.operationalResults.every(
      (value, index) => resultKey(value) === resultKey(expected[index]!)
    )
  );
}

function assertInput(input: RecordTransitionVerificationReceiptInput): void {
  if (
    input.transitionId.trim().length === 0 ||
    input.projectId.trim().length === 0 ||
    input.requestId.trim().length === 0 ||
    !DIGEST_PATTERN.test(input.requestDigest)
  ) {
    throw new TypeError('Transition Verify receipt input is invalid');
  }
  normalizeResults(input.operationalResults);
}

export async function findTransitionVerificationReceipt(
  db: AnyDB,
  input: { projectId: string; transitionId: string; requestId: string }
): Promise<TransitionVerificationReceipt | null> {
  const [row] = await db
    .select()
    .from(transitionVerificationReceipts)
    .where(
      and(
        eq(transitionVerificationReceipts.projectId, input.projectId),
        eq(transitionVerificationReceipts.transitionId, input.transitionId),
        eq(transitionVerificationReceipts.requestId, input.requestId)
      )
    )
    .limit(1);
  return row === undefined ? null : receipt(row);
}

export async function recordTransitionVerificationReceipt(
  db: AnyDB,
  input: RecordTransitionVerificationReceiptInput
): Promise<{ receipt: TransitionVerificationReceipt; reused: boolean }> {
  assertInput(input);
  const membership = await getTransitionProposalMembership(db, input.projectId, input.transitionId);
  if (membership === null) {
    throw new TransitionVerificationReceiptIntegrityError(
      `Transition ${input.transitionId} is not a member of project ${input.projectId}`
    );
  }

  const prior = await findTransitionVerificationReceipt(db, input);
  if (prior !== null) {
    if (!sameReceipt(prior, input)) {
      throw new TransitionVerificationReceiptConflictError(input.requestId);
    }
    return { receipt: prior, reused: true };
  }

  await db
    .insert(transitionVerificationReceipts)
    .values({
      transitionId: input.transitionId,
      projectId: input.projectId,
      requestId: input.requestId,
      requestDigest: input.requestDigest,
      operationalResults: normalizeResults(input.operationalResults),
    })
    .onConflictDoNothing();

  const stored = await findTransitionVerificationReceipt(db, input);
  if (stored === null || !sameReceipt(stored, input)) {
    throw new TransitionVerificationReceiptConflictError(input.requestId);
  }
  return { receipt: stored, reused: false };
}
