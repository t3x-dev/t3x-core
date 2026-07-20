/**
 * Persistent pull request lifecycle queries.
 *
 * Merge preparation/execution belongs to the API operation layer; this module
 * only owns durable PR state, readiness records, and activity.
 */

import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
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
  createdAt?: Date;
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
  return db.transaction(async (tx) => {
    await tx.delete(pullRequestChecks).where(eq(pullRequestChecks.pullRequestId, pullRequestId));
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
    return tx.insert(pullRequestChecks).values(rows).returning();
  });
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
