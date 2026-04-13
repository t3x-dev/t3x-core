/**
 * useExtractToDraft — view-facing API for the "select text in a leaf
 * output → append as a node to an editing draft" flow.
 *
 * LeafExtractToDraft used to dynamic-import @/infrastructure for the
 * getWorkbenchDraft + updateWorkbenchDraft pair and reach @/queries
 * directly for list loading. Components/** can't import @/queries or
 * @/commands per v2 §1; this hook is the authorised wrapper.
 */

import { useCallback } from 'react';
import { updateWorkbenchDraft } from '@/commands/drafts';
import { fetchWorkbenchDraft, fetchWorkbenchDrafts } from '@/queries/workbenchDrafts';
import type { DraftNode, WorkbenchDraft } from '@/types/api';

export function useExtractToDraft() {
  const loadEditingDrafts = useCallback(
    async (projectId: string): Promise<WorkbenchDraft[]> =>
      fetchWorkbenchDrafts(projectId, 'editing'),
    []
  );

  /**
   * Read the target draft, append a single node at the end, and PATCH
   * with the draft's revision so the server can detect conflicts.
   */
  const appendNode = useCallback(
    async (draftId: string, node: Omit<DraftNode, 'position'>): Promise<WorkbenchDraft> => {
      const draft = await fetchWorkbenchDraft(draftId);
      return updateWorkbenchDraft(draftId, {
        nodes: [...draft.nodes, { ...node, position: draft.nodes.length } as DraftNode],
        if_revision: draft.revision,
      });
    },
    []
  );

  return { loadEditingDrafts, appendNode };
}
