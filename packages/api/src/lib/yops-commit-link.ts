/**
 * YOps Commit Link Helpers
 *
 * Utility for finding uncommitted yops log entries for a conversation.
 * Used when creating a new commit to link it to its source operations.
 */

import type { AnyDB } from '@t3x-dev/storage';
import {
  findCommitHashesByYOpsLogIds,
  listActiveYOpsLogByConversation,
  SupersededYOpsLogIdsError,
  TransitionYOpsLogAlreadyConsumedError,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { errorJson } from './errors';

/**
 * Find yops_log entry IDs that should land in the next commit:
 * **active** (non-superseded) entries that aren't already referenced
 * by an existing commit.
 *
 * Reads from the active slice — never the full log. Without this
 * filter a re-extract that produced a fresh suggestion (and marked
 * the prior LLM batch superseded) would still see the prior batch
 * as a commit candidate. The commit would freeze those replaced
 * entries into `commits.yops_log_ids`, and on the next extract
 * `replayCommittedBaseline` would resurrect the replaced facts as
 * permanent baseline.
 *
 * Concurrency note: this read is point-in-time. A re-extract landing
 * between this call and the eventual commit could supersede or consume
 * an id we returned. Both CommitV1 and CommitV2 writers defend against
 * those races inside their write transactions.
 */
export async function findUncommittedYOpsIds(
  db: AnyDB,
  conversationId: string,
  projectId: string
): Promise<string[]> {
  const activeYops = await listActiveYOpsLogByConversation(db, conversationId);
  const activeIds = activeYops.map((entry) => entry.id);
  const committedBy = await findCommitHashesByYOpsLogIds(db, projectId, activeIds);
  return activeIds.filter((id) => !committedBy.has(id));
}

/**
 * Map `SupersededYOpsLogIdsError` (thrown by `createCommit` when a
 * concurrent re-extract superseded one of the input ids) to a 409
 * `YOPS_LOG_SUPERSEDED` response with the offending ids in `details`.
 * Returns `null` for any other error so the caller can keep its
 * existing fallback (typically `COMMIT_FAILED` → 500).
 *
 * Surfaced as a typed retryable conflict — clients that hit this
 * should re-fetch the active draft id set (e.g. via
 * `findUncommittedYOpsIds`) and retry the commit.
 */
export function mapSupersededError(c: Context, err: unknown): ReturnType<typeof errorJson> | null {
  if (err instanceof SupersededYOpsLogIdsError) {
    return errorJson(c, 'YOPS_LOG_SUPERSEDED', err.message, 409, {
      superseded_ids: err.supersededIds,
    });
  }
  if (err instanceof TransitionYOpsLogAlreadyConsumedError) {
    return errorJson(c, 'YOPS_LOG_ALREADY_COMMITTED', err.message, 409, {
      consumptions: err.consumptions,
    });
  }
  return null;
}
