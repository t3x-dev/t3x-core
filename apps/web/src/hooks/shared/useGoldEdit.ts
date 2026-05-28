/**
 * useGoldEdit — adapter hook for human-authored YOps edits.
 *
 * Wraps gold-edit YOps with optimistic update semantics: applies the op
 * locally via replayAppended, then commits to server via commitGoldEdit.
 *
 * On failure, rolls back the optimistic update by reverting to the pre-edit
 * opsLog and re-replaying from there.
 *
 * Invariant (see goldEditBuilder.ts): the SourcedYOp built for the
 * optimistic replay is the same value passed to the commit. Source is
 * built exactly once per edit; the persist path never re-derives it.
 */

import type { SourcedYOp, YOp } from '@t3x-dev/core';
import { useCallback } from 'react';
import { SourceValidationError, YOpsReplayError } from '@/commands/yops/errors';
import { commitGoldEdit, resolveGoldEditSource } from '@/commands/yops/goldEditBuilder';
import { replay } from '@/domain/replay';
import { useSettingsStore } from '@/store/settingsStore';
import { selectScriptDirty, useWorkspaceStore } from '@/store/workspaceStore';

function formatGoldEditError(err: unknown): string {
  if (err instanceof SourceValidationError) {
    return 'Cannot save: no session user or local workspace author available to attribute the edit.';
  }
  return err instanceof Error ? err.message : String(err);
}

interface GoldEditSnapshot {
  tree: ReturnType<typeof useWorkspaceStore.getState>['tree'];
  sourceIndex: ReturnType<typeof useWorkspaceStore.getState>['sourceIndex'];
  opsLog: SourcedYOp[];
}

function rollbackGoldEdit(snapshot: GoldEditSnapshot) {
  useWorkspaceStore.getState().setDerived(snapshot);
}

export function useGoldEdit() {
  const convId = useWorkspaceStore((s) => s.conversationId);
  const isCommitted = useWorkspaceStore((s) => s.isCommitted);
  const hasDraft = useWorkspaceStore((s) => s.hasDraft);
  const scriptDirty = useWorkspaceStore(selectScriptDirty);

  const applyEdit = useCallback(
    async (op: YOp) => {
      if (!convId) return;
      const store = useWorkspaceStore.getState();
      if (store.isCommitted) {
        const message = 'Committed conversations are read-only.';
        store.setError(message);
        throw new Error(message);
      }
      if (store.hasDraft) {
        const message = 'Apply or Discard the staged extraction before editing output.';
        store.setError(message);
        throw new Error(message);
      }
      if (selectScriptDirty(store)) {
        const message = 'Run or discard YOps changes before editing output.';
        store.setError(message);
        throw new Error(message);
      }
      // Snapshot pre-edit state for rollback
      const pre = store;
      const snapshot: GoldEditSnapshot = {
        tree: pre.tree,
        sourceIndex: pre.sourceIndex,
        opsLog: pre.opsLog,
      };
      let sourced: SourcedYOp;
      try {
        // Build the SourcedYOp once. Same value flows through optimistic
        // replay AND the server commit — no provenance drift between the
        // pre-refresh local state and the post-refresh server hydrate.
        sourced = await resolveGoldEditSource(op, {
          localAuthor: useSettingsStore.getState().localWorkspaceName,
        });
        // Optimistic: apply only the new op on top of the currently
        // displayed tree. Replaying prevOps from an empty base drops
        // inherited parent-commit content because those nodes are not
        // represented in this conversation's yops_log.
        const nextReplay = replay([sourced], pre.turns, pre.tree);
        if (nextReplay.partial) {
          throw new YOpsReplayError(
            nextReplay.partial.opIndex,
            nextReplay.partial.code,
            `replay failed at op ${nextReplay.partial.opIndex}: ${nextReplay.partial.message}`
          );
        }
        const nextSourceIndex = new Map(pre.sourceIndex);
        nextReplay.sourceIndex.forEach((source, path) => nextSourceIndex.set(path, source));
        useWorkspaceStore.getState().setDerived({
          tree: nextReplay.tree,
          sourceIndex: nextSourceIndex,
          opsLog: [...pre.opsLog, sourced],
        });
      } catch (err) {
        // Roll back to the pre-edit replay. This is harmless if the failure
        // happened before the optimistic write and required after a persist
        // failure or replay error.
        rollbackGoldEdit(snapshot);
        useWorkspaceStore.getState().setError(formatGoldEditError(err));
        throw err;
      }

      try {
        // Persist the same sourced op to the server.
        await commitGoldEdit(convId, sourced);
      } catch (err) {
        rollbackGoldEdit(snapshot);
        useWorkspaceStore.getState().setError(formatGoldEditError(err));
        throw err;
      }
    },
    [convId]
  );

  return { applyEdit, enabled: !!convId && !isCommitted && !hasDraft && !scriptDirty };
}
