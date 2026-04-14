/**
 * usePromoteDraft — view-facing API for the "promote / discard an
 * auto-generated draft" flow used by `PromotePreviewDialog`.
 *
 * Reads go through `@/queries/workbenchDrafts`; writes go through
 * `@/commands/drafts` (v2 §2.4). The dialog used to import the three
 * infrastructure functions directly, which violated L4→L1 boundary.
 */

import { useCallback } from 'react';
import { deleteWorkbenchDraft, promoteDraft } from '@/commands/drafts';
import { fetchWorkbenchDraft } from '@/queries/workbenchDrafts';
import type { WorkbenchDraft } from '@/types/api';

export function usePromoteDraft() {
  const loadDraft = useCallback(
    async (draftId: string): Promise<WorkbenchDraft> => fetchWorkbenchDraft(draftId),
    []
  );
  const promote = useCallback(
    async (draftId: string): Promise<WorkbenchDraft> => promoteDraft(draftId),
    []
  );
  const discard = useCallback(
    async (draftId: string): Promise<void> => deleteWorkbenchDraft(draftId),
    []
  );
  return { loadDraft, promote, discard };
}
