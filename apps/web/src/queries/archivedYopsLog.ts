/**
 * L3 query — fetch archived (superseded) yops_log rows for a conversation.
 *
 * Rows enter `superseded_at` state via explicit Replace
 * (active_dirty Apply with `replaceActiveScript`) or Repair
 * (`repairYopsLogId`). The re-extract path no longer supersedes.
 * Superseded rows stay in `yops_log` and are not part of the live
 * workspace (replay walks active rows only) but they're audit-relevant
 * — users should be able to see what got replaced and when.
 *
 * This query uses the project-scoped Source/Evidence boundary. Legacy
 * conversation CRUD is no longer the historical-read authority.
 */

import type { YOpsLogEntry } from '@t3x-dev/core';
import { getLegacyYOpsEvidence } from '@/infrastructure/sourceEvidence';

export interface ArchivedYOpsRow extends YOpsLogEntry {
  /** Always non-null on archived rows — narrowed by the filter below. */
  superseded_at: string;
}

/**
 * Fetch archived (superseded) rows for a conversation. Returns rows
 * sorted by `superseded_at` descending (most recently archived first)
 * so the UI shows fresh history at the top.
 *
 * On a backend without superseded_at, this returns []. The caller
 * shouldn't conflate "no archived rows" with "feature not available."
 */
export async function fetchArchivedYopsLog(
  projectId: string,
  conversationId: string,
  topicId: string | null = null
): Promise<ArchivedYOpsRow[]> {
  const evidence = await getLegacyYOpsEvidence(projectId, conversationId, {
    topicId: topicId ?? undefined,
    archivedOnly: true,
    order: 'desc',
    limit: 200,
  });
  return evidence.items.flatMap((item): ArchivedYOpsRow[] => {
    const supersededAt = item.lifecycle.superseded_at;
    if (supersededAt === null) return [];
    return [
      {
        id: item.id,
        conversation_id: item.conversation_id,
        project_id: item.project_id,
        source: item.source as YOpsLogEntry['source'],
        turn_hash: item.turn_hash ?? undefined,
        yops: item.yops,
        created_at: item.created_at,
        metadata: item.metadata as Record<string, unknown> | null,
        superseded_at: supersededAt,
        is_committed: item.lifecycle.status === 'committed',
        committed_by: item.lifecycle.committed_by,
      },
    ];
  });
}
