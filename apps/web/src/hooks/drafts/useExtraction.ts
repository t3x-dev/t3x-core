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
import { formatWorkspaceError } from '@/hooks/conversations/formatWorkspaceError';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

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
      // Defense: ChatHeader gates the button on `isExtractReady` so this
      // path shouldn't be reachable from the UI. If it somehow fires
      // before the project context is loaded (race, programmatic event,
      // direct hotkey), surface a toast rather than silently no-op so
      // we don't repeat the "click twice" failure mode that motivated
      // this guard.
      if (!extractConvId || !projectId) {
        toast.message('Loading conversation context — try Extract again in a moment.');
        return;
      }

      const store = useWorkspaceStore.getState();
      store.setMode('streaming');
      store.setError(null);
      store.setLastExtractionPinIds(sourcePinIds ?? []);
      if (!store.panelExpanded) store.setPanelExpanded(true);

      try {
        const turns = useWorkspaceStore.getState().turns;
        const outcome = await runExtraction({
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

        // Re-hydrate the conversation to pull newly-committed ops into the store.
        await hydrateConversationToStore(projectId, extractConvId);
        useWorkspaceStore.getState().setMode('idle');

        // Resilience surface: the worker returned `partial` because some
        // ops couldn't be verified after retries, but the verified subset
        // was committed. Surface as an info-level toast — the workspace
        // is intentionally NOT put into an error state since the user
        // does have new ops to inspect.
        if (outcome.partial) {
          const failed = outcome.partial.failingOps.length;
          const committed = outcome.committed;
          const noun = failed === 1 ? 'item' : 'items';
          toast.message(
            `Extracted ${committed} op${committed === 1 ? '' : 's'}. Skipped ${failed} ${noun} the model couldn't tie back to the conversation — you can refine the prompt or add them manually.`
          );
        }
      } catch (err) {
        useWorkspaceStore.getState().setMode('idle');

        // The workspace already had committed ops before this extract
        // attempt — a *new* attempt that fails should not blow away the
        // workspace into an error banner. Demote to an info toast so the
        // user keeps seeing their existing tree and can try again.
        const hadExistingOps = useWorkspaceStore.getState().opsLog.length > 0;

        if (err instanceof ExtractionFailedError) {
          const isUnverifiable = err.reason === 'unverifiable_quote';
          const friendly = isUnverifiable
            ? `No new facts could be tied back to the conversation this time. Try a more specific question, or add the slot manually.`
            : err.reason === 'missing_source'
              ? `Extraction returned ops without provenance. Please retry.`
              : err.reason === 'invalid_structure'
                ? `The model's proposal didn't form a valid tree update after retries. Please retry.`
                : err.reason === 'llm_error'
                  ? err.failureCode
                    ? `Extraction failed (${err.failureCode}): ${err.message}`
                    : `LLM call failed: ${err.message}`
                  : `Extraction failed after ${err.lastAttempt} attempts.`;

          if (hadExistingOps && isUnverifiable) {
            // Soft surface: workspace stays usable, no red banner.
            toast.message(friendly);
          } else {
            useWorkspaceStore.getState().setError(friendly);
            toast.error(friendly);
          }
        } else {
          const msg = formatWorkspaceError(err) || 'Extraction failed';
          if (hadExistingOps) {
            toast.error(msg);
          } else {
            useWorkspaceStore.getState().setError(msg);
            toast.error(msg);
          }
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
