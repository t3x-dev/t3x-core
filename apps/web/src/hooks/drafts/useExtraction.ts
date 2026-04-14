/**
 * useExtraction — adapter hook for LLM extraction.
 *
 * Wraps the extraction worker + LLM adapter (commands/yops/*) and re-hydrates
 * the conversation after a successful run. Components consume this hook
 * instead of reaching into @/commands directly.
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { ExtractionFailedError } from '@/commands/yops/errors';
import { runExtraction } from '@/commands/yops/extractionWorker';
import { callExtractionLLM } from '@/commands/yops/llmAdapter';
import { hydrateConversationToStore } from '@/hooks/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface UseExtractionParams {
  resolvedConversationId: string | undefined;
}

export function useExtraction({ resolvedConversationId }: UseExtractionParams) {
  const isExtracting = useWorkspaceStore((s) => s.mode === 'streaming');
  const tree = useWorkspaceStore((s) => s.tree);

  const handleExtract = useCallback(
    async (sourcePinIds?: string[]) => {
      const extractConvId =
        resolvedConversationId ?? useChatStore.getState().activeConversationId ?? undefined;
      const projectId = useChatStore.getState().activeProjectId ?? undefined;
      if (!extractConvId || !projectId || isExtracting) return;

      const store = useWorkspaceStore.getState();
      store.setMode('streaming');
      store.setError(null);
      store.setLastExtractionPinIds(sourcePinIds ?? []);
      if (!store.panelExpanded) store.setPanelExpanded(true);

      try {
        const turns = useWorkspaceStore.getState().turns;
        await runExtraction({
          conversationId: extractConvId,
          turns,
          llm: (input) =>
            callExtractionLLM({
              conversationId: extractConvId,
              turns: input.turns,
              failingOps: input.failingOps,
            }),
        });

        // Re-hydrate the conversation to pull newly-committed ops into the store.
        await hydrateConversationToStore(projectId, extractConvId);
        useWorkspaceStore.getState().setMode('idle');
      } catch (err) {
        useWorkspaceStore.getState().setMode('idle');
        if (err instanceof ExtractionFailedError) {
          const msg =
            err.reason === 'unverifiable_quote'
              ? `Extraction could not verify ${err.failingOps.length} slot(s) against the conversation. Please refine the prompt or edit manually.`
              : err.reason === 'missing_source'
                ? `Extraction returned ops without provenance. Please retry.`
                : err.reason === 'llm_error'
                  ? `LLM call failed: ${err.message}`
                  : `Extraction failed after ${err.lastAttempt} attempts.`;
          useWorkspaceStore.getState().setError(msg);
          toast.error(msg);
        } else {
          const msg = err instanceof Error ? err.message : 'Extraction failed';
          useWorkspaceStore.getState().setError(msg);
          toast.error(msg);
        }
      }
    },
    [resolvedConversationId, isExtracting]
  );

  // Back-compat return shape for existing callers:
  //   handleExtract, isExtracting still required by ChatHeader
  //   draft kept for any lingering references to .tree
  //   activeTopicId: topics state is Commit 5 TBD, stubbed as null
  return { handleExtract, isExtracting, draft: tree, activeTopicId: null };
}
