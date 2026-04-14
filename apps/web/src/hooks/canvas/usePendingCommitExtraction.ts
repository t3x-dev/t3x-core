'use client';

/**
 * usePendingCommitExtraction — owns the draft + LLM-extraction state
 * for the pending-commit workspace: draftId, semanticPoints, loading
 * and error cells, plus handleProceed (create draft + run extraction)
 * and handleReExtract (re-run on the existing draft).
 *
 * Extracted from usePendingCommitState (PR25).
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import * as api from '@/infrastructure';

interface ProceedInput {
  projectId: string;
  sourceConversationId: string | undefined;
  title: string | undefined;
  sourceCommitHash: string | null | undefined;
  pendingBranch: string | undefined;
  pendingBranchName: string | undefined;
}

export interface UsePendingCommitExtractionReturn {
  draftId: string | null;
  semanticPoints: api.SemanticPointAPI[];
  setSemanticPoints: React.Dispatch<React.SetStateAction<api.SemanticPointAPI[]>>;
  extractionLoading: boolean;
  extractionError: string | null;
  /** Create a new workbench draft and trigger LLM extraction. */
  handleProceed: (input: ProceedInput, onBeforeProceed?: () => void) => Promise<void>;
  /** Re-run LLM extraction on the existing draft. */
  handleReExtract: (projectId: string, sourceConversationId: string) => Promise<void>;
  /** Reset draft + extraction state (used when config is unlocked). */
  resetExtraction: () => void;
}

export function usePendingCommitExtraction(): UsePendingCommitExtractionReturn {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [semanticPoints, setSemanticPoints] = useState<api.SemanticPointAPI[]>([]);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const handleProceed = useCallback(
    async (input: ProceedInput, onBeforeProceed?: () => void) => {
      const { projectId, sourceConversationId, title, sourceCommitHash, pendingBranch, pendingBranchName } = input;
      if (!sourceConversationId || !projectId) return;

      onBeforeProceed?.();
      setExtractionLoading(true);
      setExtractionError(null);

      try {
        const branch =
          pendingBranch === 'branch'
            ? pendingBranchName?.trim() || `branch-${Date.now()}`
            : 'main';

        const draft = await api.createWorkbenchDraft({
          project_id: projectId,
          title: title || 'Untitled Unit',
          parent_commit_hash: sourceCommitHash || undefined,
          target_branch: branch,
        });
        setDraftId(draft.id);

        const result = await api.extractIncremental(projectId, sourceConversationId, draft.id);
        setSemanticPoints([...result.ready_points, ...result.review_points]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Extraction failed';
        setExtractionError(msg);
        toast.error(msg);
        throw err; // Let the caller decide whether to unlock config.
      } finally {
        setExtractionLoading(false);
      }
    },
    []
  );

  const handleReExtract = useCallback(
    async (projectId: string, sourceConversationId: string) => {
      if (!draftId || !projectId || !sourceConversationId) return;
      setExtractionLoading(true);
      setExtractionError(null);
      try {
        const result = await api.extractIncremental(projectId, sourceConversationId, draftId);
        setSemanticPoints([...result.ready_points, ...result.review_points]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Re-extraction failed';
        setExtractionError(msg);
        toast.error(msg);
      } finally {
        setExtractionLoading(false);
      }
    },
    [draftId]
  );

  const resetExtraction = useCallback(() => {
    setDraftId(null);
    setSemanticPoints([]);
    setExtractionError(null);
  }, []);

  return {
    draftId,
    semanticPoints,
    setSemanticPoints,
    extractionLoading,
    extractionError,
    handleProceed,
    handleReExtract,
    resetExtraction,
  };
}
