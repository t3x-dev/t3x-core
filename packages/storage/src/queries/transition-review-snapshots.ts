import { and, desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type TransitionReviewSnapshotRecord,
  transitionReviewSnapshots,
} from '../schema-transition-commits';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REVIEW_SNAPSHOT_SCHEMA = 't3x.application/review-snapshot/v1';
const CHANGE_PROJECTION_SCHEMA = 't3x.application/change-projection/v1';

export class TransitionReviewSnapshotConflictError extends Error {
  readonly code = 'TRANSITION_REVIEW_SNAPSHOT_CONFLICT';

  constructor(readonly snapshotId: string) {
    super(`Transition ReviewSnapshot ${snapshotId} conflicts with an existing stored snapshot`);
    this.name = 'TransitionReviewSnapshotConflictError';
  }
}

export interface StoredTransitionReviewSnapshot {
  snapshotId: string;
  snapshotDigest: string;
  projectId: string;
  workspaceId: string;
  transitionId: string;
  reviewDigest: string;
  supersedesSnapshotId: string | null;
  supersedesSnapshotDigest: string | null;
  snapshot: Record<string, unknown>;
  changeProjection: Record<string, unknown>;
  createdAt: string;
}

export interface SaveTransitionReviewSnapshotInput {
  projectId: string;
  workspaceId: string;
  transitionId: string;
  snapshot: Record<string, unknown>;
  changeProjection: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`ReviewSnapshot ${key} must be a non-empty string`);
  }
  return value;
}

function requiredDigest(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!DIGEST_PATTERN.test(value)) throw new TypeError(`ReviewSnapshot ${key} is invalid`);
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`ReviewSnapshot ${key} must be a non-empty string when supplied`);
  }
  return value;
}

function assertSame(left: unknown, right: unknown, message: string): void {
  if (left !== right) throw new TypeError(message);
}

function normalizeInput(input: SaveTransitionReviewSnapshotInput): {
  snapshotId: string;
  snapshotDigest: string;
  projectId: string;
  workspaceId: string;
  transitionId: string;
  reviewDigest: string;
  supersedesSnapshotId: string | null;
  supersedesSnapshotDigest: string | null;
  snapshot: Record<string, unknown>;
  changeProjection: Record<string, unknown>;
  createdAt: Date;
} {
  const { snapshot, changeProjection } = input;
  assertSame(snapshot.schema, REVIEW_SNAPSHOT_SCHEMA, 'ReviewSnapshot schema is invalid');
  assertSame(
    changeProjection.schema,
    CHANGE_PROJECTION_SCHEMA,
    'ChangeProjection schema is invalid'
  );
  assertSame(snapshot.version, 1, 'ReviewSnapshot version is invalid');
  assertSame(changeProjection.version, 1, 'ChangeProjection version is invalid');
  assertSame(changeProjection.authoritative, false, 'ChangeProjection must be non-authoritative');

  const snapshotId = requiredString(snapshot, 'snapshotId');
  const snapshotDigest = requiredDigest(snapshot, 'snapshotDigest');
  const projectId = requiredString(snapshot, 'projectId');
  const workspaceId = requiredString(snapshot, 'workspaceId');
  const transitionId = requiredString(snapshot, 'transitionId');
  const createdAtValue = requiredString(snapshot, 'createdAt');
  const createdAt = new Date(createdAtValue);
  if (Number.isNaN(createdAt.valueOf())) throw new TypeError('ReviewSnapshot createdAt is invalid');

  assertSame(projectId, input.projectId, 'ReviewSnapshot projectId does not match input');
  assertSame(workspaceId, input.workspaceId, 'ReviewSnapshot workspaceId does not match input');
  assertSame(transitionId, input.transitionId, 'ReviewSnapshot transitionId does not match input');

  const review = snapshot.review;
  if (!isRecord(review)) throw new TypeError('ReviewSnapshot review must be an object');
  const reviewDigest = requiredDigest(review, 'digest');

  const source = changeProjection.source;
  if (!isRecord(source)) throw new TypeError('ChangeProjection source must be an object');
  assertSame(source.kind, 'review_snapshot', 'ChangeProjection source must be review_snapshot');
  assertSame(source.snapshotId, snapshotId, 'ChangeProjection source snapshotId does not match');
  assertSame(
    source.snapshotDigest,
    snapshotDigest,
    'ChangeProjection source snapshotDigest does not match'
  );
  assertSame(changeProjection.projectId, projectId, 'ChangeProjection projectId does not match');
  assertSame(
    changeProjection.workspaceId,
    workspaceId,
    'ChangeProjection workspaceId does not match'
  );
  assertSame(
    changeProjection.transitionId,
    transitionId,
    'ChangeProjection transitionId does not match'
  );

  const supersedes = snapshot.supersedes;
  const supersedesSnapshotId = isRecord(supersedes)
    ? optionalString(supersedes, 'snapshotId')
    : null;
  const supersedesSnapshotDigest = isRecord(supersedes)
    ? optionalString(supersedes, 'snapshotDigest')
    : null;
  if (supersedesSnapshotDigest !== null && !DIGEST_PATTERN.test(supersedesSnapshotDigest)) {
    throw new TypeError('ReviewSnapshot supersedes snapshotDigest is invalid');
  }
  if ((supersedesSnapshotId === null) !== (supersedesSnapshotDigest === null)) {
    throw new TypeError('ReviewSnapshot supersedes id and digest must be supplied together');
  }

  return {
    snapshotId,
    snapshotDigest,
    projectId,
    workspaceId,
    transitionId,
    reviewDigest,
    supersedesSnapshotId,
    supersedesSnapshotDigest,
    snapshot,
    changeProjection,
    createdAt,
  };
}

function stored(row: TransitionReviewSnapshotRecord): StoredTransitionReviewSnapshot {
  return {
    snapshotId: row.snapshotId,
    snapshotDigest: row.snapshotDigest,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    transitionId: row.transitionId,
    reviewDigest: row.reviewDigest,
    supersedesSnapshotId: row.supersedesSnapshotId,
    supersedesSnapshotDigest: row.supersedesSnapshotDigest,
    snapshot: row.snapshot,
    changeProjection: row.changeProjection,
    createdAt: row.createdAt.toISOString(),
  };
}

function sameStoredFacts(
  left: StoredTransitionReviewSnapshot,
  right: ReturnType<typeof normalizeInput>
): boolean {
  return (
    left.snapshotId === right.snapshotId &&
    left.snapshotDigest === right.snapshotDigest &&
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.transitionId === right.transitionId &&
    left.reviewDigest === right.reviewDigest &&
    left.supersedesSnapshotId === right.supersedesSnapshotId &&
    left.supersedesSnapshotDigest === right.supersedesSnapshotDigest &&
    left.createdAt === right.createdAt.toISOString()
  );
}

export async function getTransitionReviewSnapshot(
  db: AnyDB,
  input: { projectId: string; snapshotId: string }
): Promise<StoredTransitionReviewSnapshot | null> {
  const [row] = await db
    .select()
    .from(transitionReviewSnapshots)
    .where(
      and(
        eq(transitionReviewSnapshots.projectId, input.projectId),
        eq(transitionReviewSnapshots.snapshotId, input.snapshotId)
      )
    )
    .limit(1);
  return row === undefined ? null : stored(row);
}

export async function saveTransitionReviewSnapshot(
  db: AnyDB,
  input: SaveTransitionReviewSnapshotInput
): Promise<{ snapshot: StoredTransitionReviewSnapshot; reused: boolean }> {
  const normalized = normalizeInput(input);
  const existing = await getTransitionReviewSnapshot(db, {
    projectId: normalized.projectId,
    snapshotId: normalized.snapshotId,
  });
  if (existing !== null) {
    if (!sameStoredFacts(existing, normalized)) {
      throw new TransitionReviewSnapshotConflictError(normalized.snapshotId);
    }
    return { snapshot: existing, reused: true };
  }

  const [sameDigest] = await db
    .select({ snapshotId: transitionReviewSnapshots.snapshotId })
    .from(transitionReviewSnapshots)
    .where(eq(transitionReviewSnapshots.snapshotDigest, normalized.snapshotDigest))
    .limit(1);
  if (sameDigest !== undefined) {
    throw new TransitionReviewSnapshotConflictError(normalized.snapshotId);
  }

  await db.insert(transitionReviewSnapshots).values({
    snapshotId: normalized.snapshotId,
    snapshotDigest: normalized.snapshotDigest,
    projectId: normalized.projectId,
    workspaceId: normalized.workspaceId,
    transitionId: normalized.transitionId,
    reviewDigest: normalized.reviewDigest,
    supersedesSnapshotId: normalized.supersedesSnapshotId,
    supersedesSnapshotDigest: normalized.supersedesSnapshotDigest,
    snapshot: normalized.snapshot,
    changeProjection: normalized.changeProjection,
    createdAt: normalized.createdAt,
  });

  const inserted = await getTransitionReviewSnapshot(db, {
    projectId: normalized.projectId,
    snapshotId: normalized.snapshotId,
  });
  if (inserted === null || !sameStoredFacts(inserted, normalized)) {
    throw new TransitionReviewSnapshotConflictError(normalized.snapshotId);
  }
  return { snapshot: inserted, reused: false };
}

export async function getLatestTransitionReviewSnapshot(
  db: AnyDB,
  input: { projectId: string; workspaceId?: string; transitionId?: string }
): Promise<StoredTransitionReviewSnapshot | null> {
  const conditions = [eq(transitionReviewSnapshots.projectId, input.projectId)];
  if (input.workspaceId !== undefined) {
    conditions.push(eq(transitionReviewSnapshots.workspaceId, input.workspaceId));
  }
  if (input.transitionId !== undefined) {
    conditions.push(eq(transitionReviewSnapshots.transitionId, input.transitionId));
  }
  const [row] = await db
    .select()
    .from(transitionReviewSnapshots)
    .where(and(...conditions))
    .orderBy(desc(transitionReviewSnapshots.createdAt), desc(transitionReviewSnapshots.snapshotId))
    .limit(1);
  return row === undefined ? null : stored(row);
}

export async function listTransitionReviewSnapshots(
  db: AnyDB,
  input: { projectId: string; workspaceId?: string; transitionId?: string; limit?: number }
): Promise<StoredTransitionReviewSnapshot[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 1000));
  const conditions = [eq(transitionReviewSnapshots.projectId, input.projectId)];
  if (input.workspaceId !== undefined) {
    conditions.push(eq(transitionReviewSnapshots.workspaceId, input.workspaceId));
  }
  if (input.transitionId !== undefined) {
    conditions.push(eq(transitionReviewSnapshots.transitionId, input.transitionId));
  }
  const rows = await db
    .select()
    .from(transitionReviewSnapshots)
    .where(and(...conditions))
    .orderBy(desc(transitionReviewSnapshots.createdAt), desc(transitionReviewSnapshots.snapshotId))
    .limit(limit);
  return rows.map(stored);
}
