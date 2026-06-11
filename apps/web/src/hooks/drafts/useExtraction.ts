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

import type { HumanSource, SemanticContent, SourcedYOp } from '@t3x-dev/core';
import { applySourcedYOps } from '@t3x-dev/core';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { ExtractionFailedError } from '@/commands/yops/errors';
import { runExtraction } from '@/commands/yops/extractionWorker';
import { callExtractionLLM } from '@/commands/yops/llmAdapter';
import {
  markOpsFromSourceTextDrafts,
  type SourceTextDraftsByTurn,
} from '@/domain/sourceTextDrafts';
import { formatWorkspaceError } from '@/hooks/conversations/formatWorkspaceError';
import { useChatStore } from '@/store/chatStore';
import { resolveLocalWorkspaceName, useSettingsStore } from '@/store/settingsStore';
import { selectEffectiveTurns, selectScriptDirty, useWorkspaceStore } from '@/store/workspaceStore';
import { EXTRACTION_TOAST_ID } from './extractionToast';

/**
 * Stable sonner id for every toast emitted from `handleExtract`. Using a
 * single id means success / error / info calls overwrite the same slot
 * instead of stacking, and a leading `toast.dismiss(EXTRACTION_TOAST_ID)`
 * clears any prior slot before a new attempt starts.
 */
export { EXTRACTION_TOAST_ID } from './extractionToast';

interface UseExtractionParams {
  resolvedConversationId: string | undefined;
  selectedProvider?: string | null;
  selectedModel?: string | null;
  /**
   * Confirm callback invoked before Extract overwrites a dirty manual edit
   * in the script editor (`scriptDirty === true`). Returning `false`
   * cancels the extraction. Default: `window.confirm` with a fixed prompt.
   * Tests inject their own to avoid a blocking dialog.
   */
  confirmOverwrite?: () => boolean;
}

const DEFAULT_OVERWRITE_PROMPT =
  'You have unsaved edits in the script editor. Re-running Extract will overwrite them. Continue?';

function defaultConfirmOverwrite(): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(DEFAULT_OVERWRITE_PROMPT);
}

function inlineHumanSource(): HumanSource {
  const author = resolveLocalWorkspaceName(useSettingsStore.getState().localWorkspaceName);
  return {
    type: 'human',
    author,
    at: new Date().toISOString(),
    surface: 'inline',
  };
}

function markInlineSourceDraftVariants(
  variants: Partial<Record<'concise' | 'balanced' | 'detailed', SourcedYOp[]>> | undefined,
  sourceTextDrafts: SourceTextDraftsByTurn,
  source: HumanSource
) {
  if (!variants) return variants;
  return Object.fromEntries(
    Object.entries(variants).map(([preset, ops]) => [
      preset,
      ops ? markOpsFromSourceTextDrafts(ops, sourceTextDrafts, source) : ops,
    ])
  ) as typeof variants;
}

export function useExtraction({
  resolvedConversationId,
  selectedProvider,
  selectedModel,
  confirmOverwrite = defaultConfirmOverwrite,
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
      if (!selectedProvider || !selectedModel) {
        toast.message('Select a model before extracting.', { id: EXTRACTION_TOAST_ID });
        return;
      }

      const store = useWorkspaceStore.getState();
      if (store.isCommitted) {
        toast.message('Committed conversations are read-only.', { id: EXTRACTION_TOAST_ID });
        return;
      }
      if (store.hasDraft) {
        toast.message('Apply or discard the staged draft before extracting again.', {
          id: EXTRACTION_TOAST_ID,
        });
        return;
      }
      // Don't silently nuke a dirty manual edit in the script editor.
      // Re-extracting with `scriptDirty=true` would overwrite the user's
      // YAML with the new LLM proposal, so require explicit consent once
      // we know there is no staged draft blocking extraction outright.
      if (selectScriptDirty(store) && !confirmOverwrite()) {
        return;
      }
      if (selectEffectiveTurns(store).length === 0) {
        toast.message('No saved conversation turns to extract.', { id: EXTRACTION_TOAST_ID });
        return;
      }
      // Pre-sync the workspace's activeProjectId + conversationId before
      // doing anything that depends on them. ConversationPage mirrors
      // chatStore → workspaceStore via useEffect, and hydrate eventually
      // calls setConversation, but there's a window where chatStore is
      // ready (Extract is enabled) and workspaceStore hasn't caught up.
      // Two consequences if we don't pre-sync:
      //   (a) setPanelExpanded would no-op against the unsynced map;
      //   (b) setDraft would write to draftsByConversation under a
      //       null/stale conversationId, breaking F5 protection.
      // Extract is an explicit user action — close both windows inline.
      if (store.activeProjectId !== projectId) store.setActiveProject(projectId);
      if (store.conversationId !== extractConvId) store.setConversation(extractConvId);
      store.setMode('streaming');
      store.setError(null);
      // Clear any prior retained-failure marker too — a new attempt is now
      // allowed only when no draft is staged, so a stale marker would be
      // misleading during and after the fresh extraction.
      store.setRetainedDraftFailure(null);
      store.setLastExtractionPinIds(sourcePinIds ?? []);
      // Auto-expand on Extract — explicit user action, they want to see results.
      store.setPanelExpanded(true);

      // Honour the dirty-edit overwrite confirm BEFORE the LLM call.
      // The user explicitly accepted "throw away my edits" via the
      // confirm at the top of this handler. Clear the override so the
      // editor falls back to the canonical mirror via selectScriptText
      // (prior draftOps if any → opsLog → ''). The success branch
      // replaces draftOps entirely and the editor follows automatically;
      // the failure branch keeps the prior canonical mirror visible.
      // Either way, the editor and AfterPanel can't disagree.
      store.clearEditorOverride();

      // Read the extraction preset at the moment of Extract — the
      // dropdown in ChatHeader updates `workspaceStore.extractionPreset`
      // and we forward it to the API so the LLM prompt actually varies
      // by Concise / Balanced / Detailed. Before this wiring, the
      // preset was UI-only: the dropdown changed the store but every
      // extraction hit the same prompt.
      const extractionPreset = useWorkspaceStore.getState().extractionPreset;

      try {
        const extractionState = useWorkspaceStore.getState();
        const turns = selectEffectiveTurns(extractionState);
        const sourceTextDrafts = extractionState.sourceTextDrafts;
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
              preset: extractionPreset,
              ...(sourcePinIds !== undefined ? { selectedPinIds: sourcePinIds } : {}),
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
        const hasSourceTextDrafts = Object.keys(sourceTextDrafts).length > 0;
        const inlineSource = hasSourceTextDrafts ? inlineHumanSource() : null;
        const stagedOps =
          inlineSource !== null
            ? markOpsFromSourceTextDrafts(result.ops, sourceTextDrafts, inlineSource)
            : result.ops;
        const stagedVariants =
          inlineSource !== null
            ? markInlineSourceDraftVariants(result.variants, sourceTextDrafts, inlineSource)
            : result.variants;

        const previewResult = applySourcedYOps(tree, stagedOps);
        // YOpsResult exposes trees + relations directly. On failure, fall
        // back to the current tree — the worker already validated, so any
        // failure here is a post-validation surprise; the script editor
        // still surfaces the proposal and the user can choose to Apply
        // (which will hit the same engine and report the real error).
        const previewTree: SemanticContent = previewResult.ok
          ? { trees: previewResult.trees, relations: previewResult.relations }
          : tree;
        const store = useWorkspaceStore.getState();
        // setDraft writes the new draft AND clears any retainedDraftFailure
        // marker — see workspaceStore. clearDraft is no longer called
        // pre-flight, so reaching here is the FIRST point at which the
        // previous draft (if any) is replaced. A failed attempt above
        // would have skipped this branch entirely and the previous
        // draft survives untouched.
        // Forward the per-preset variants alongside the active ops so
        // the chip in ChatHeader can swap density without a re-extract.
        // `result.variants` is undefined when the pipeline didn't
        // request a preset (legacy callers) — setDraft tolerates that.
        //
        // setDraft is the single public action that mutates draft
        // proposal state — it now writes scriptText (canonical YAML
        // mirror) and scriptDirty (false) atomically. Callers no
        // longer follow up with setScriptText / setScriptDirty: that
        // triplet was the drift surface PR #952's P1 exposed
        // (extractionWorker swapped ops without rewriting scriptText).
        store.setDraft({ ops: stagedOps, tree: previewTree, variants: stagedVariants });
        store.setMode('idle');
        toast.success(
          `Extracted ${stagedOps.length} op${stagedOps.length === 1 ? '' : 's'} — review and click Apply`,
          { id: EXTRACTION_TOAST_ID }
        );
      } catch (err) {
        useWorkspaceStore.getState().setMode('idle');
        const isExtractionFailed = err instanceof ExtractionFailedError;
        const msg = isExtractionFailed
          ? err.reason === 'unverifiable_quote'
            ? `Extraction could not verify ${err.failingOps.length} slot(s) against the conversation. Please refine the prompt or edit manually.`
            : err.reason === 'missing_source'
              ? `Extraction returned ops without provenance. Please retry.`
              : err.reason === 'invalid_structure'
                ? `Extraction returned ops that do not form a valid tree update. The batch was sent back to the model for retry, but all retries failed.`
                : err.reason === 'llm_error'
                  ? err.failureCode
                    ? `Extraction failed (${err.failureCode}): ${err.message}`
                    : `LLM call failed: ${err.message}`
                  : `Extraction failed after ${err.lastAttempt} attempts.`
          : formatWorkspaceError(err) || 'Extraction failed';

        useWorkspaceStore.getState().setError(msg);
        toast.error(msg, { id: EXTRACTION_TOAST_ID });
      }
    },
    [resolvedConversationId, isExtracting, selectedProvider, selectedModel, confirmOverwrite, tree]
  );

  // Back-compat return shape for existing callers:
  //   handleExtract, isExtracting still required by ChatHeader
  //   draft kept for any lingering references to .tree
  //   activeTopicId: topics state is Commit 5 TBD, stubbed as null
  return { handleExtract, isExtracting, draft: tree, activeTopicId: null };
}
