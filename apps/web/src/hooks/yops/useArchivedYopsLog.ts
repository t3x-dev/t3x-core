/**
 * useArchivedYopsLog — React hook wrapping the `fetchArchivedYopsLog`
 * query for the YOps Workbench archived view (plan PR 5).
 *
 * Components can't import queries directly (v2 §1 table — L4 → L3 ban
 * via Biome's noRestrictedImports). This thin hook is the bridge.
 *
 * Re-fetches whenever `conversationId` or `topicId` changes. Debounce
 * / caching are NOT in scope — archived rows aren't reactive (they
 * only change when the user re-extracts), and a re-mount triggering
 * one fetch is acceptable.
 */

import { useEffect, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { type ArchivedYOpsRow, fetchArchivedYopsLog } from '@/queries/archivedYopsLog';

// Re-export so the L4 (component) layer can read the row shape via the
// hook module without crossing into queries directly. The Biome rule
// forbids any (including type-only) import from `@/queries/`.
export type { ArchivedYOpsRow };
export type ArchivedYOpsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseArchivedYopsLogResult {
  status: ArchivedYOpsStatus;
  rows: ArchivedYOpsRow[];
  error: string | null;
}

const IDLE: UseArchivedYopsLogResult = { status: 'idle', rows: [], error: null };

export function useArchivedYopsLog(
  conversationId: string | null,
  topicId: string | null = null
): UseArchivedYopsLogResult {
  const [state, setState] = useState<UseArchivedYopsLogResult>(IDLE);

  useEffect(() => {
    if (!conversationId) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', rows: [], error: null });
    fetchArchivedYopsLog(conversationId, topicId)
      .then((rows) => {
        if (cancelled) return;
        setState({ status: 'ready', rows, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = formatUserFacingError(err, 'Failed to load archived ops.');
        setState({ status: 'error', rows: [], error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, topicId]);

  return state;
}
