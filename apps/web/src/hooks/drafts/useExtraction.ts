/**
 * useExtraction — adapter hook for LLM extraction.
 *
 * Wraps the extraction worker + LLM adapter (commands/yops/*) and re-hydrates
 * the conversation after a successful run. Components consume this hook
 * instead of reaching into @/commands directly.
 *
 * Toast lifecycle: every Extract attempt owns a single sonner slot
 * (`EXTRACTION_TOAST_ID`). The slot is dismissed at the start of every
 * attempt and rewritten by the success / error path, so a stale red
 * toast from a previous attempt cannot survive past the next one — the
 * earlier "extraction succeeded but the old red toast is still on screen
 * so it looks like it failed" failure mode.
 *
 * Refresh boundary: after the worker returns, `hydrateConversationToStore`
 * is the single source of truth for the post-extraction workspace state
 * (turns + opsLog + tree + sourceIndex + replay warnings). The success
 * toast fires only after hydrate resolves, so the user sees the new tree
 * and the confirmation in the same render.
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { ExtractionFailedError } from '@/commands/yops/errors';
import { runExtraction } from '@/commands/yops/extractionWorker';
import { callExtractionLLM } from '@/commands/yops/llmAdapter';
import { formatWorkspaceError } from '@/hooks/conversations/formatWorkspaceError';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

/**
 * Stable sonner id for every toast emitted from `handleExtract`. Using a
 * single id means success / error / info calls overwrite the same slot
 * instead of stacking, and a leading `toast.dismiss(EXTRACTION_TOAST_ID)`
 * clears any prior slot before a new attempt starts.
 */
export const EXTRACTION_TOAST_ID = 't3x-extraction';

interface UseExtractionParams {
  resolvedConversationId: string | undefined;
  selectedProvider?: string | null;
  selectedModel?: string | null;
}

export function useExtraction({
  resolvedConversationId,
  selectedProvider,
  selectedModel,
}: UseExtractionParams) {
  const isExtracting = useWorkspaceStore((s) => s.mode === 'streaming');
  const tree = useWorkspaceStore((s) => s.tree);

  const handleExtract = useCallback(
    async (sourcePinIds?: string[]) => {
      const extractConvId =
        resolvedConversationId ?? useChatStore.getState().activeConversationId ?? undefined;
      const projectId = useChatStore.getState().activeProjectId ?? undefined;
      // Already running — silent skip is correct, the user sees the
      // "Extracting…" spinner.
      if (isExtracting) return;
      // Clear any toast left over from a previous Extract attempt before
      // doing anything else: the not-ready early return, the success
      // path, and the error path all reuse the same slot, so dismissing
      // first guarantees the next emit is what the user sees.
      toast.dismiss(EXTRACTION_TOAST_ID);
      // Defense: ChatHeader gates the button on `isExtractReady` so this
      // path shouldn't be reachable from the UI. If it somehow fires
      // before the project context is loaded (race, programmatic event,
      // direct hotkey), surface a toast rather than silently no-op so
      // we don't repeat the "click twice" failure mode that motivated
      // this guard.
      if (!extractConvId || !projectId) {
        toast.message('Loading conversation context — try Extract again in a moment.', {
          id: EXTRACTION_TOAST_ID,
        });
        return;
      }

      const store = useWorkspaceStore.getState();
      store.setMode('streaming');
      store.setError(null);
      store.setLastExtractionPinIds(sourcePinIds ?? []);
      if (!store.panelExpanded) store.setPanelExpanded(true);

      try {
        const turns = useWorkspaceStore.getState().turns;
        await runExtraction({
          baseTree: tree,
          conversationId: extractConvId,
          turns,
          llm: (input) =>
            callExtractionLLM({
              conversationId: extractConvId,
              turns: input.turns,
              failingOps: input.failingOps,
              provider: selectedProvider ?? undefined,
              model: selectedModel ?? undefined,
            }),
        });

        // hydrate is the single refresh boundary on the success path:
        // turns + opsLog + tree + sourceIndex + replay warnings all come
        // from server replay. The success toast fires only after this
        // resolves so the user sees the new tree and the confirmation
        // in the same paint.
        await hydrateConversationToStore(projectId, extractConvId);
        useWorkspaceStore.getState().setMode('idle');
        toast.success('Extraction complete', { id: EXTRACTION_TOAST_ID });
      } catch (err) {
        useWorkspaceStore.getState().setMode('idle');
        if (err instanceof ExtractionFailedError) {
          const msg =
            err.reason === 'unverifiable_quote'
              ? `Extraction could not verify ${err.failingOps.length} slot(s) against the conversation. Please refine the prompt or edit manually.`
              : err.reason === 'missing_source'
                ? `Extraction returned ops without provenance. Please retry.`
                : err.reason === 'invalid_structure'
                  ? `Extraction returned ops that do not form a valid tree update. The batch was sent back to the model for retry, but all retries failed.`
                  : err.reason === 'llm_error'
                    ? err.failureCode
                      ? `Extraction failed (${err.failureCode}): ${err.message}`
                      : `LLM call failed: ${err.message}`
                    : `Extraction failed after ${err.lastAttempt} attempts.`;
          useWorkspaceStore.getState().setError(msg);
          toast.error(msg, { id: EXTRACTION_TOAST_ID });
        } else {
          const msg = formatWorkspaceError(err) || 'Extraction failed';
          useWorkspaceStore.getState().setError(msg);
          toast.error(msg, { id: EXTRACTION_TOAST_ID });
        }
      }
    },
    [resolvedConversationId, isExtracting, selectedProvider, selectedModel]
  );

  // Back-compat return shape for existing callers:
  //   handleExtract, isExtracting still required by ChatHeader
  //   draft kept for any lingering references to .tree
  //   activeTopicId: topics state is Commit 5 TBD, stubbed as null
  return { handleExtract, isExtracting, draft: tree, activeTopicId: null };
}
