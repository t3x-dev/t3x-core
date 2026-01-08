/**
 * Commits Queries
 *
 * CRUD operations for commits using Drizzle ORM.
 */

import { computeCommitHash } from '@t3x/core';
import { and, desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type Commit, commits, type NewCommit } from '../schema';
import { ensureMainBranch, findBranchByName, updateBranchHead } from './branches';

export interface TurnWindow {
  startTurnHash: string;
  endTurnHash: string;
}

export interface CreateCommitInput {
  projectId: string;
  branch?: string;
  message?: string;
  turnWindow?: TurnWindow | null;
  facetSnapshot: unknown[];
  pipelineConfig?: unknown;
  draftId?: string;
  draftTextHash?: string;
  signature?: unknown;
  sourceExcerpt?: unknown;
  mustHave?: unknown[];
  mustntHave?: unknown[];
  sourceRefs?: unknown[];
  mergeParents?: string[];
  positionX?: number;
  positionY?: number;
  /** v1.1: Confirmed anchors for auditing */
  anchors?: unknown;
}

export interface ListCommitsOptions {
  projectId: string;
  branch?: string;
  limit?: number;
  offset?: number;
}

/**
 * Error thrown when commit creation fails
 */
export class CommitError extends Error {
  constructor(
    message: string,
    public code: 'BRANCH_NOT_FOUND' | 'INVALID_INPUT'
  ) {
    super(message);
    this.name = 'CommitError';
  }
}

/**
 * Insert a new commit
 */
export async function insertCommit(db: AnyDB, input: CreateCommitInput): Promise<Commit> {
  const createdAt = new Date();
  const targetBranch = input.branch ?? 'main';

  // Get the target branch - it MUST exist
  let branch = await findBranchByName(db, input.projectId, targetBranch);

  // If targeting 'main' and it doesn't exist, create it
  if (!branch && targetBranch === 'main') {
    branch = await ensureMainBranch(db, input.projectId);
  }

  if (!branch) {
    throw new CommitError(
      `Branch '${targetBranch}' does not exist in project ${input.projectId}`,
      'BRANCH_NOT_FOUND'
    );
  }

  // Determine parent hashes
  let parentHashes: string[];
  if (input.mergeParents && input.mergeParents.length > 0) {
    parentHashes = input.mergeParents;
  } else {
    parentHashes = branch.headCommitHash ? [branch.headCommitHash] : [];
  }

  const parentsJson = JSON.stringify(parentHashes);
  const turnWindowJson = input.turnWindow ? JSON.stringify(input.turnWindow) : JSON.stringify(null);
  const facetSnapshotJson = JSON.stringify(input.facetSnapshot);
  const pipelineConfigJson = input.pipelineConfig ? JSON.stringify(input.pipelineConfig) : null;
  const signatureJson = input.signature ? JSON.stringify(input.signature) : null;
  const sourceExcerptJson = input.sourceExcerpt ? JSON.stringify(input.sourceExcerpt) : null;
  const mustHaveJson = input.mustHave ? JSON.stringify(input.mustHave) : null;
  const mustntHaveJson = input.mustntHave ? JSON.stringify(input.mustntHave) : null;
  const sourceRefsJson = input.sourceRefs ? JSON.stringify(input.sourceRefs) : null;
  const anchorsJson = input.anchors ? JSON.stringify(input.anchors) : null;

  // Compute commit hash
  const commitHash = computeCommitHash({
    project_id: input.projectId,
    branch: targetBranch,
    parents_json: parentsJson,
    turn_window_json: turnWindowJson,
    facet_snapshot_json: facetSnapshotJson,
    pipeline_config_json: pipelineConfigJson,
    draft_id: input.draftId ?? null,
    draft_text_hash: input.draftTextHash ?? null,
    signature_json: signatureJson,
    created_at: createdAt.toISOString(),
  });

  const [commit] = await db
    .insert(commits)
    .values({
      commitHash,
      projectId: input.projectId,
      branch: targetBranch,
      message: input.message ?? null,
      parentsJson,
      turnWindowJson,
      facetSnapshotJson,
      pipelineConfigJson,
      draftId: input.draftId ?? null,
      draftTextHash: input.draftTextHash ?? null,
      signatureJson,
      sourceExcerptJson,
      mustHaveJson,
      mustntHaveJson,
      positionX: input.positionX ?? null,
      positionY: input.positionY ?? null,
      sourceRefsJson,
      anchorsJson,
      createdAt,
    })
    .returning();

  // Update branch head
  await updateBranchHead(db, input.projectId, targetBranch, commitHash);

  return commit;
}

/**
 * Find commit by hash
 */
export async function findCommitByHash(db: AnyDB, commitHash: string): Promise<Commit | null> {
  const [commit] = await db
    .select()
    .from(commits)
    .where(eq(commits.commitHash, commitHash))
    .limit(1);

  return commit ?? null;
}

/**
 * Find commits by project
 */
export async function findCommitsByProject(
  db: AnyDB,
  options: ListCommitsOptions
): Promise<Commit[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  if (options.branch) {
    return db
      .select()
      .from(commits)
      .where(and(eq(commits.projectId, options.projectId), eq(commits.branch, options.branch)))
      .orderBy(desc(commits.createdAt))
      .limit(limit)
      .offset(offset);
  }

  return db
    .select()
    .from(commits)
    .where(eq(commits.projectId, options.projectId))
    .orderBy(desc(commits.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get commit parents
 */
export async function findCommitParents(db: AnyDB, commitHash: string): Promise<Commit[]> {
  const commit = await findCommitByHash(db, commitHash);
  if (!commit) return [];

  const parentHashes = JSON.parse(commit.parentsJson) as string[];
  const parents: Commit[] = [];

  for (const hash of parentHashes) {
    const parent = await findCommitByHash(db, hash);
    if (parent) parents.push(parent);
  }

  return parents;
}

/**
 * Get commit history (BFS traversal)
 */
export async function findCommitHistory(
  db: AnyDB,
  commitHash: string,
  limit = 50
): Promise<Commit[]> {
  const history: Commit[] = [];
  const visited = new Set<string>();
  const queue: string[] = [commitHash];

  while (queue.length > 0 && history.length < limit) {
    const currentHash = queue.shift()!;
    if (visited.has(currentHash)) continue;
    visited.add(currentHash);

    const commit = await findCommitByHash(db, currentHash);
    if (!commit) continue;

    history.push(commit);

    const parents = JSON.parse(commit.parentsJson) as string[];
    queue.push(...parents);
  }

  return history;
}

/**
 * Update commit position
 */
export async function updateCommitPosition(
  db: AnyDB,
  commitHash: string,
  position: { x?: number; y?: number }
): Promise<Commit | null> {
  const existing = await findCommitByHash(db, commitHash);
  if (!existing) return null;

  const updateData: Partial<NewCommit> = {};
  if (position.x !== undefined) {
    updateData.positionX = position.x;
  }
  if (position.y !== undefined) {
    updateData.positionY = position.y;
  }

  const [updated] = await db
    .update(commits)
    .set(updateData)
    .where(eq(commits.commitHash, commitHash))
    .returning();

  return updated ?? null;
}

/**
 * Find common ancestor of two commits
 */
export async function findCommonAncestor(
  db: AnyDB,
  hash1: string,
  hash2: string
): Promise<Commit | null> {
  // Collect all ancestors of hash1
  const ancestors1 = new Set<string>();
  const queue1: string[] = [hash1];

  while (queue1.length > 0) {
    const h = queue1.shift()!;
    if (ancestors1.has(h)) continue;
    ancestors1.add(h);

    const commit = await findCommitByHash(db, h);
    if (commit) {
      const parents = JSON.parse(commit.parentsJson) as string[];
      queue1.push(...parents);
    }
  }

  // Find first common ancestor from hash2
  const queue2: string[] = [hash2];
  const visited2 = new Set<string>();

  while (queue2.length > 0) {
    const h = queue2.shift()!;
    if (visited2.has(h)) continue;
    visited2.add(h);

    if (ancestors1.has(h)) {
      return findCommitByHash(db, h);
    }

    const commit = await findCommitByHash(db, h);
    if (commit) {
      const parents = JSON.parse(commit.parentsJson) as string[];
      queue2.push(...parents);
    }
  }

  return null;
}
