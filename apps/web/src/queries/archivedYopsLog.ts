/**
 * L3 query — fetch archived (superseded) yops_log rows for a conversation.
 *
 * Plan PR 5: when a re-extract replaces applied-but-uncommitted ops, the
 * superseded rows stay in `yops_log` with `superseded_at` set. They're
 * not shown in the live workspace (replay walks active rows only), but
 * they're audit-relevant — users should be able to see what got replaced
 * and when.
 *
 * The existing `loadYOpsLog` infrastructure already supports
 * `activeOnly: boolean`. We call it with `false`, then filter out the
 * active rows client-side and keep just the archived ones.
 */

import type { YOpsLogEntry } from '@/infrastructure/trees';
import { loadYOpsLog } from '@/infrastructure/yopsLog';

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
  conversationId: string,
  topicId: string | null = null
): Promise<ArchivedYOpsRow[]> {
  const all = await loadYOpsLog(conversationId, topicId ?? undefined, {
    activeOnly: false,
  });
  const archived = all.filter(
    (row): row is ArchivedYOpsRow =>
      row.superseded_at !== null && typeof row.superseded_at === 'string'
  );
  archived.sort((a, b) => b.superseded_at.localeCompare(a.superseded_at));
  return archived;
}
