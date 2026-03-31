/**
 * YOps Commit Link Helpers
 *
 * Utility for finding uncommitted yops log entries for a conversation.
 * Used when creating a new commit to link it to its source operations.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { listCommits, listYOpsLogByConversation } from '@t3x-dev/storage';

/**
 * Find yops_log entry IDs that haven't been included in any commit yet.
 * Used when creating a new commit to link it to its source operations.
 */
export async function findUncommittedYOpsIds(
  db: AnyDB,
  conversationId: string,
  projectId: string,
): Promise<string[]> {
  const allYops = await listYOpsLogByConversation(db, conversationId);
  const allCommits = await listCommits(db, { projectId });
  const usedIds = new Set(allCommits.flatMap((c) => c.yops_log_ids));
  return allYops
    .filter((y) => !usedIds.has(y.id) && y.source !== 'commit_marker')
    .map((y) => y.id);
}
