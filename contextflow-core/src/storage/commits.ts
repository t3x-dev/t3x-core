/**
 * Commits V2 CRUD operations (with hash chain)
 */

import { getDb } from '../db';
import type {
  CommitV2Record,
  CreateCommitV2Input,
  ListCommitsV2Options,
} from './types';
import { computeCommitHash, isoNow } from './utils';
import { getBranch, updateBranchHead, ensureMainBranch } from './branches';

/**
 * Error thrown when commit creation fails due to invalid input
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

export function createCommitV2(input: CreateCommitV2Input): CommitV2Record {
  const db = getDb();
  const created_at = isoNow();

  // Determine target branch
  const targetBranch = input.branch ?? 'main';

  // Get the target branch - it MUST exist
  let branch = getBranch(input.project_id, targetBranch);

  // If targeting 'main' and it doesn't exist, create it
  if (!branch && targetBranch === 'main') {
    branch = ensureMainBranch(input.project_id);
  }

  // Branch must exist at this point
  if (!branch) {
    throw new CommitError(
      `Branch '${targetBranch}' does not exist in project ${input.project_id}`,
      'BRANCH_NOT_FOUND'
    );
  }

  // Determine parent hashes
  // For merge commits: use explicit merge_parents
  // For regular commits: use branch head
  let parent_hashes: string[];
  if (input.merge_parents && input.merge_parents.length > 0) {
    // Merge commit: use provided parent hashes
    parent_hashes = input.merge_parents;
  } else {
    // Regular commit: use branch head as parent
    parent_hashes = [];
    if (branch.head_commit_hash) {
      parent_hashes.push(branch.head_commit_hash);
    }
  }

  const parents_json = JSON.stringify(parent_hashes);
  // For merge commits, turn_window may be null/undefined
  const turn_window_json = input.turn_window ? JSON.stringify(input.turn_window) : JSON.stringify(null);
  const facet_snapshot_json = JSON.stringify(input.facet_snapshot);
  const pipeline_config_json = input.pipeline_config
    ? JSON.stringify(input.pipeline_config)
    : null;
  const signature_json = input.signature
    ? JSON.stringify(input.signature)
    : null;
  const source_excerpt_json = input.source_excerpt
    ? JSON.stringify(input.source_excerpt)
    : null;
  const must_have_json = input.must_have
    ? JSON.stringify(input.must_have)
    : null;
  const mustnt_have_json = input.mustnt_have
    ? JSON.stringify(input.mustnt_have)
    : null;

  // Compute commit hash
  const commit_hash = computeCommitHash({
    project_id: input.project_id,
    branch: targetBranch,
    parents_json,
    turn_window_json,
    facet_snapshot_json,
    pipeline_config_json,
    draft_id: input.draft_id ?? null,
    draft_text_hash: input.draft_text_hash ?? null,
    signature_json,
    created_at,
  });

  const position_x = input.position_x ?? null;
  const position_y = input.position_y ?? null;

  db.prepare(
    `INSERT INTO commits_v2
     (commit_hash, project_id, branch, message, parents_json, turn_window_json,
      facet_snapshot_json, pipeline_config_json, draft_id, draft_text_hash, signature_json,
      source_excerpt_json, must_have_json, mustnt_have_json, position_x, position_y, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    commit_hash,
    input.project_id,
    targetBranch,
    input.message ?? null,
    parents_json,
    turn_window_json,
    facet_snapshot_json,
    pipeline_config_json,
    input.draft_id ?? null,
    input.draft_text_hash ?? null,
    signature_json,
    source_excerpt_json,
    must_have_json,
    mustnt_have_json,
    position_x,
    position_y,
    created_at
  );

  // Update branch head
  updateBranchHead(input.project_id, targetBranch, commit_hash);

  return {
    commit_hash,
    project_id: input.project_id,
    branch: targetBranch,
    message: input.message ?? null,
    parents_json,
    turn_window_json,
    facet_snapshot_json,
    pipeline_config_json,
    draft_id: input.draft_id ?? null,
    draft_text_hash: input.draft_text_hash ?? null,
    signature_json,
    source_excerpt_json,
    must_have_json,
    mustnt_have_json,
    position_x,
    position_y,
    created_at,
  };
}

export function getCommitV2(commit_hash: string): CommitV2Record | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM commits_v2 WHERE commit_hash = ?`)
    .get(commit_hash) as CommitV2Record | undefined;
  return row ?? null;
}

export function listCommitsV2(options: ListCommitsV2Options): CommitV2Record[] {
  const db = getDb();
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  if (options.branch) {
    return db
      .prepare(
        `SELECT * FROM commits_v2
         WHERE project_id = ? AND branch = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(options.project_id, options.branch, limit, offset) as CommitV2Record[];
  }

  return db
    .prepare(
      `SELECT * FROM commits_v2
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(options.project_id, limit, offset) as CommitV2Record[];
}

export function getCommitParents(commit_hash: string): CommitV2Record[] {
  const commit = getCommitV2(commit_hash);
  if (!commit) return [];

  const parent_hashes = JSON.parse(commit.parents_json) as string[];
  return parent_hashes
    .map((h) => getCommitV2(h))
    .filter((c): c is CommitV2Record => c !== null);
}

export function getCommitHistory(
  commit_hash: string,
  limit = 50
): CommitV2Record[] {
  const history: CommitV2Record[] = [];
  const visited = new Set<string>();
  const queue: string[] = [commit_hash];

  while (queue.length > 0 && history.length < limit) {
    const current_hash = queue.shift()!;
    if (visited.has(current_hash)) continue;
    visited.add(current_hash);

    const commit = getCommitV2(current_hash);
    if (!commit) continue;

    history.push(commit);

    const parents = JSON.parse(commit.parents_json) as string[];
    queue.push(...parents);
  }

  return history;
}

export function updateCommitPosition(
  commit_hash: string,
  position: { x?: number; y?: number }
): CommitV2Record | null {
  const db = getDb();
  const existing = getCommitV2(commit_hash);
  if (!existing) return null;

  const position_x = position.x !== undefined ? position.x : existing.position_x;
  const position_y = position.y !== undefined ? position.y : existing.position_y;

  db.prepare(
    `UPDATE commits_v2 SET position_x = ?, position_y = ? WHERE commit_hash = ?`
  ).run(position_x, position_y, commit_hash);

  return getCommitV2(commit_hash);
}

export function findCommonAncestor(
  hash1: string,
  hash2: string
): CommitV2Record | null {
  const ancestors1 = new Set<string>();
  const queue1: string[] = [hash1];

  // Collect all ancestors of hash1
  while (queue1.length > 0) {
    const h = queue1.shift()!;
    if (ancestors1.has(h)) continue;
    ancestors1.add(h);

    const commit = getCommitV2(h);
    if (commit) {
      const parents = JSON.parse(commit.parents_json) as string[];
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
      return getCommitV2(h);
    }

    const commit = getCommitV2(h);
    if (commit) {
      const parents = JSON.parse(commit.parents_json) as string[];
      queue2.push(...parents);
    }
  }

  return null;
}
