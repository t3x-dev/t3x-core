/**
 * Persistent pull request lifecycle queries.
 *
 * Merge preparation/execution belongs to the API operation layer; this module
 * only owns durable PR state, readiness records, and activity.
 */

import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, lt, max, or, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type NewPullRequest,
  type NewPullRequestCheck,
  type PullRequest,
  type PullRequestActivity,
  type PullRequestCheck,
  pullRequestActivity,
  pullRequestChecks,
  pullRequests,
} from '../schema';

export type PullRequestStatus =
  | 'draft'
  | 'open'
  | 'checking'
  | 'ready'
  | 'blocked'
  | 'merged'
  | 'closed';

export type PullRequestCheckStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'warning'
  | 'blocked'
  | 'failed';

export type PullRequestCheckKind =
  | 'source_commit'
  | 'target_commit'
  | 'base_freshness'
  | 'schema_compatibility'
  | 'merge_simulation'
  | 'conflict_resolution'
  | 'output_impact'
  | 'review_requirement'
  | 'permission';

export type PullRequestActivityType =
  | 'created'
  | 'description_updated'
  | 'status_changed'
  | 'checks_reran'
  | 'commented'
  | 'base_updated'
  | 'merged'
  | 'closed';

export interface PullRequestDiffSummary {
  changed_nodes: number;
  yops_operations: number;
  output_impacts: number;
  source_refs: number;
}

export interface CreatePullRequestInput {
  projectId: string;
  title: string;
  description?: string;
  sourceBranch: string;
  targetBranch: string;
  sourceCommitHash: string;
  targetBaseCommitHash: string;
  status?: PullRequestStatus;
  authorId: string;
  authorKind?: 'human' | 'agent' | 'service';
  authorDelegatorId?: string;
  reviewOwnerId?: string;
  linkedWork?: string;
  diffSummary?: PullRequestDiffSummary;
}

export interface UpdatePullRequestInput {
  title?: string;
  description?: string;
  sourceCommitHash?: string;
  targetBaseCommitHash?: string;
  mergeDraftId?: string | null;
  mergeCommitHash?: string | null;
  status?: PullRequestStatus;
  reviewOwnerId?: string | null;
  linkedWork?: string | null;
  diffSummary?: PullRequestDiffSummary;
  mergedAt?: Date | null;
  closedAt?: Date | null;
}

export interface ReplacePullRequestCheckInput {
  kind: PullRequestCheckKind;
  status: PullRequestCheckStatus;
  title: string;
  message?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export interface AddPullRequestActivityInput {
  actorId: string;
  type: PullRequestActivityType;
  message: string;
  details?: Record<string, unknown>;
  createdAt?: Date;
}

const PULL_REQUEST_LOCK_NAMESPACE = 0x5052;

/**
 * Serialize state transitions for one pull request for the lifetime of the
 * caller's transaction. The caller must pass a transaction-scoped DB handle.
 */
export async function acquirePullRequestLock(
  db: AnyDB,
  projectId: string,
  number: number
): Promise<void> {
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(${PULL_REQUEST_LOCK_NAMESPACE}::int, hashtext(${`${projectId}:${number}`})::int)`
  );
}

export async function createPullRequest(
  db: AnyDB,
  input: CreatePullRequestInput
): Promise<PullRequest> {
  return db.transaction(async (tx) => {
    const [numberRow] = await tx
      .select({ value: max(pullRequests.number) })
      .from(pullRequests)
      .where(eq(pullRequests.projectId, input.projectId));
    const now = new Date();
    const [created] = await tx
      .insert(pullRequests)
      .values({
        pullRequestId: `pr_${randomUUID().replaceAll('-', '')}`,
        projectId: input.projectId,
        number: Number(numberRow?.value ?? 0) + 1,
        title: input.title,
        description: input.description ?? '',
        sourceBranch: input.sourceBranch,
        targetBranch: input.targetBranch,
        sourceCommitHash: input.sourceCommitHash,
        targetBaseCommitHash: input.targetBaseCommitHash,
        status: input.status ?? 'open',
        authorId: input.authorId,
        authorKind: input.authorKind ?? 'human',
        authorDelegatorId: input.authorDelegatorId ?? null,
        reviewOwnerId: input.reviewOwnerId ?? null,
        linkedWork: input.linkedWork ?? null,
        diffSummary: input.diffSummary ?? {
          changed_nodes: 0,
          yops_operations: 0,
          output_impacts: 0,
          source_refs: 0,
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  });
}

export async function findPullRequestByNumber(
  db: AnyDB,
  projectId: string,
  number: number
): Promise<PullRequest | null> {
  const [pullRequest] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.projectId, projectId), eq(pullRequests.number, number)))
    .limit(1);
  return pullRequest ?? null;
}

export async function findActivePullRequestByBranches(
  db: AnyDB,
  projectId: string,
  sourceBranch: string,
  targetBranch: string
): Promise<PullRequest | null> {
  const [pullRequest] = await db
    .select()
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.projectId, projectId),
        eq(pullRequests.sourceBranch, sourceBranch),
        eq(pullRequests.targetBranch, targetBranch),
        inArray(pullRequests.status, ['draft', 'open', 'checking', 'ready', 'blocked'])
      )
    )
    .limit(1);
  return pullRequest ?? null;
}

export async function listPullRequestsByProject(
  db: AnyDB,
  projectId: string,
  statuses?: PullRequestStatus[]
): Promise<PullRequest[]> {
  return db
    .select()
    .from(pullRequests)
    .where(
      statuses?.length
        ? and(eq(pullRequests.projectId, projectId), inArray(pullRequests.status, statuses))
        : eq(pullRequests.projectId, projectId)
    )
    .orderBy(desc(pullRequests.number));
}

export async function listPullRequestPage(
  db: AnyDB,
  projectId: string,
  input: { statuses?: PullRequestStatus[]; query?: string; before?: number; limit: number }
) {
  const project = eq(pullRequests.projectId, projectId);
  const status = input.statuses?.length ? inArray(pullRequests.status, input.statuses) : sql`true`;
  const query = input.query?.trim();
  const escaped = query?.replace(/[\\%_]/g, '\\$&');
  const numeric = query && /^#?\d+$/.test(query) ? Number(query.replace('#', '')) : undefined;
  const byNumber =
    numeric !== undefined && numeric <= 2_147_483_647
      ? eq(pullRequests.number, numeric)
      : sql`false`;
  const matching = escaped
    ? query?.startsWith('#') && numeric !== undefined
      ? byNumber
      : or(
          byNumber,
          sql`concat_ws(' ', ${pullRequests.title}, nullif(${pullRequests.description}, ''),
            ${pullRequests.sourceBranch}, ${pullRequests.targetBranch}, ${pullRequests.authorId},
            ${pullRequests.reviewOwnerId}) ilike ${`%${escaped}%`}`
        )
    : sql`true`;
  const [rows, [counts]] = await Promise.all([
    db
      .select()
      .from(pullRequests)
      .where(
        and(
          project,
          status,
          matching,
          input.before ? lt(pullRequests.number, input.before) : undefined
        )
      )
      .orderBy(desc(pullRequests.number))
      .limit(input.limit + 1),
    db
      .select({
        open: sql<number>`count(*) filter (where ${pullRequests.status} not in ('closed', 'merged'))`.mapWith(
          Number
        ),
        merged: sql<number>`count(*) filter (where ${pullRequests.status} = 'merged')`.mapWith(
          Number
        ),
        closed: sql<number>`count(*) filter (where ${pullRequests.status} = 'closed')`.mapWith(
          Number
        ),
        total: sql<number>`count(*) filter (where ${status} and ${matching})`.mapWith(Number),
      })
      .from(pullRequests)
      .where(project),
  ]);
  const items = rows.slice(0, input.limit);
  const nextBefore = rows.length > input.limit ? (items.at(-1)?.number ?? null) : null;
  const { total, ...stateCounts } = counts!;
  return { items, nextBefore, total, stateCounts };
}

export async function updatePullRequest(
  db: AnyDB,
  pullRequestId: string,
  input: UpdatePullRequestInput
): Promise<PullRequest | null> {
  const updates: Partial<NewPullRequest> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.sourceCommitHash !== undefined) updates.sourceCommitHash = input.sourceCommitHash;
  if (input.targetBaseCommitHash !== undefined)
    updates.targetBaseCommitHash = input.targetBaseCommitHash;
  if (input.mergeDraftId !== undefined) updates.mergeDraftId = input.mergeDraftId;
  if (input.mergeCommitHash !== undefined) updates.mergeCommitHash = input.mergeCommitHash;
  if (input.status !== undefined) updates.status = input.status;
  if (input.reviewOwnerId !== undefined) updates.reviewOwnerId = input.reviewOwnerId;
  if (input.linkedWork !== undefined) updates.linkedWork = input.linkedWork;
  if (input.diffSummary !== undefined) updates.diffSummary = input.diffSummary;
  if (input.mergedAt !== undefined) updates.mergedAt = input.mergedAt;
  if (input.closedAt !== undefined) updates.closedAt = input.closedAt;

  const [updated] = await db
    .update(pullRequests)
    .set(updates)
    .where(eq(pullRequests.pullRequestId, pullRequestId))
    .returning();
  return updated ?? null;
}

export async function replacePullRequestChecks(
  db: AnyDB,
  pullRequestId: string,
  checks: ReplacePullRequestCheckInput[]
): Promise<PullRequestCheck[]> {
  await db.delete(pullRequestChecks).where(eq(pullRequestChecks.pullRequestId, pullRequestId));
  if (checks.length === 0) return [];
  const rows: NewPullRequestCheck[] = checks.map((check) => ({
    checkId: `prcheck_${randomUUID().replaceAll('-', '')}`,
    pullRequestId,
    kind: check.kind,
    status: check.status,
    title: check.title,
    message: check.message ?? null,
    startedAt: check.startedAt ?? null,
    completedAt: check.completedAt ?? null,
  }));
  return db.insert(pullRequestChecks).values(rows).returning();
}

export async function listPullRequestChecks(
  db: AnyDB,
  pullRequestId: string
): Promise<PullRequestCheck[]> {
  return db
    .select()
    .from(pullRequestChecks)
    .where(eq(pullRequestChecks.pullRequestId, pullRequestId))
    .orderBy(asc(pullRequestChecks.checkId));
}

export async function addPullRequestActivity(
  db: AnyDB,
  pullRequestId: string,
  input: AddPullRequestActivityInput
): Promise<PullRequestActivity> {
  const [activity] = await db
    .insert(pullRequestActivity)
    .values({
      activityId: `pract_${randomUUID().replaceAll('-', '')}`,
      pullRequestId,
      actorId: input.actorId,
      type: input.type,
      message: input.message,
      details: input.details ?? null,
      createdAt: input.createdAt ?? new Date(),
    })
    .returning();
  return activity;
}

export async function listPullRequestActivity(
  db: AnyDB,
  pullRequestId: string
): Promise<PullRequestActivity[]> {
  return db
    .select()
    .from(pullRequestActivity)
    .where(eq(pullRequestActivity.pullRequestId, pullRequestId))
    .orderBy(asc(pullRequestActivity.createdAt));
}
