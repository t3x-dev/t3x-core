/**
 * useExtraction — adapter hook for LLM extraction (propose-only model).
 *
 * Wraps the extraction worker + LLM adapter (commands/yops/*). Calls
 * `runExtraction({ commit: false })` so the worker validates + repairs the
 * proposal but does NOT write to `yops_log`. The proposal lands in
 * `workspaceStore.draftOps` + `draftTree` + `scriptText`; the user reviews
 * (and optionally edits) in the script editor and clicks Apply to commit
 * via `useScriptExecution`. This is the long-term "Extract = propose,
 * Apply = persist" model from the workspace UX RFC.
 *
 * Toast lifecycle: every Extract attempt owns a single sonner slot
 * (`EXTRACTION_TOAST_ID`). The slot is dismissed at the start of every
 * attempt and rewritten by the success / error path, so a stale red
 * toast from a previous attempt cannot survive past the next one — the
 * earlier "extraction succeeded but the old red toast is still on screen
 * so it looks like it failed" failure mode.
 *
 * No hydration on the success path: nothing has been committed yet, so
 * server state is unchanged. The success toast fires after the local
 * draft is in place so the user sees the proposal and the confirmation
 * in the same render.
 */

import type { SemanticContent } from '@t3x-dev/core';
import { applySourcedYOps } from '@t3x-dev/core';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { ExtractionFailedError } from '@/commands/yops/errors';
import { runExtraction } from '@/commands/yops/extractionWorker';
import { callExtractionLLM } from '@/commands/yops/llmAdapter';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';
import { formatWorkspaceError } from '@/hooks/conversations/formatWorkspaceError';
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
      // Pre-sync the workspace's activeProjectId before flipping the panel.
      // ConversationPage mirrors chatStore → workspaceStore via useEffect, so
      // there's a window where chatStore.activeProjectId is ready (Extract is
      // enabled) but workspaceStore.activeProjectId hasn't caught up yet —
      // setPanelExpanded would no-op against the unsynced workspace state.
      // Extract is an explicit user action, so we close the window inline.
      if (store.activeProjectId !== projectId) store.setActiveProject(projectId);
      store.setMode('streaming');
      store.setError(null);
      store.setLastExtractionPinIds(sourcePinIds ?? []);
      // Auto-expand on Extract — explicit user action, they want to see results.
      store.setPanelExpanded(true);

      try {
        const turns = useWorkspaceStore.getState().turns;
        const result = await runExtraction({
          baseTree: tree,
          conversationId: extractConvId,
          turns,
          commit: false,
          llm: (input) =>
            callExtractionLLM({
              conversationId: extractConvId,
              turns: input.turns,
              failingOps: input.failingOps,
              provider: selectedProvider ?? undefined,
              model: selectedModel ?? undefined,
            }),
        });

        // Propose-only success path: the worker returned validated/repaired
        // ops without committing. Stage them as a draft for the user to
        // review and Apply.
        //
        // Dry-run preview: apply the ops to a snapshot of the current tree
        // so AfterPanel can render what the result would look like. This
        // is in-memory only; nothing is persisted until Apply.
        // applySourcedYOps is pure — we just discard the failure case
        // (the worker already validated; if it somehow fails here it's a
        // post-validation bug worth surfacing through the existing error
        // path instead of crashing extraction).
        const previewResult = applySourcedYOps(tree, result.ops);
        // YOpsResult exposes trees + relations directly. On failure, fall
        // back to the current tree — the worker already validated, so any
        // failure here is a post-validation surprise; the script editor
        // still surfaces the proposal and the user can choose to Apply
        // (which will hit the same engine and report the real error).
        const previewTree: SemanticContent = previewResult.ok
          ? { trees: previewResult.trees, relations: previewResult.relations }
          : tree;
        const store = useWorkspaceStore.getState();
        store.setDraft({ ops: result.ops, tree: previewTree });
        store.setScriptText(serializeOpsToYaml(result.ops));
        // The script is the canonical proposal — not "dirty" in the
        // user-edited sense. Apply is gated on `scriptDirty || hasDraft`
        // (see useScriptExecution), so this still enables the button.
        store.setScriptDirty(false);
        store.setMode('idle');
        toast.success(
          `Extracted ${result.ops.length} op${result.ops.length === 1 ? '' : 's'} — review and click Apply`,
          { id: EXTRACTION_TOAST_ID }
        );
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
