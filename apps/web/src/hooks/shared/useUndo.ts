'use client';

/**
 * useUndo — Cmd+Z / Ctrl+Z rollback for draft editing.
 *
 * `useUndoTracker` is the recording side: edit hooks call
 * `trackAction(label)` immediately before applying their change so a
 * snapshot of the current opsLog gets pushed onto the undo stack.
 *
 * `useUndo` is the playback side: exposes `undo()` + `canUndo`, and
 * optionally binds a window-level keyboard listener for Cmd+Z /
 * Ctrl+Z. Rollback replays the snapshot opsLog through `replay` from
 * domain/ and writes the result back to the workspace store, so the
 * tree + sourceIndex stay consistent.
 *
 * The undo itself is NOT a YOp — it's a rollback of draft state,
 * which lives entirely in the workspace store until commit. Once
 * a commit lands the underlying ops become part of yops_log and are
 * no longer reachable from the stack.
 */

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { replay } from '@/domain/replay';
import { useUndoStore } from '@/store/undoStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function useUndoTracker() {
  const push = useUndoStore((s) => s.push);

  /** Snapshot the current opsLog under the given label. Call before a user edit. */
  const trackAction = useCallback(
    (label: string) => {
      const { opsLog } = useWorkspaceStore.getState();
      push(label, opsLog);
    },
    [push]
  );

  return { trackAction };
}

export interface UseUndoOptions {
  /** If true, binds a window-level Cmd+Z / Ctrl+Z keydown handler. */
  bindKeyboard?: boolean;
}

export function useUndo(options: UseUndoOptions = {}) {
  const pop = useUndoStore((s) => s.pop);
  const clearStack = useUndoStore((s) => s.clear);
  const stackSize = useUndoStore((s) => s.stack.length);
  const conversationId = useWorkspaceStore((s) => s.conversationId);
  const prevConvRef = useRef<string | null>(null);

  // Clear the stack when the active conversation changes — undoing into a
  // different conversation's state would corrupt the workspace store.
  useEffect(() => {
    if (prevConvRef.current !== null && prevConvRef.current !== conversationId) {
      clearStack();
    }
    prevConvRef.current = conversationId;
  }, [conversationId, clearStack]);

  const undo = useCallback(() => {
    const snapshot = pop();
    if (!snapshot) {
      toast.message('Nothing to undo');
      return false;
    }
    const store = useWorkspaceStore.getState();
    const { tree, sourceIndex } = replay(snapshot.opsLog, store.turns);
    store.setDerived({ tree, sourceIndex, opsLog: snapshot.opsLog });
    toast.success(`Undid: ${snapshot.label}`);
    return true;
  }, [pop]);

  useEffect(() => {
    if (!options.bindKeyboard) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Skip if the user is typing in an input, textarea, or contenteditable.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }

      const isUndo =
        (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z';
      if (!isUndo) return;
      e.preventDefault();
      undo();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options.bindKeyboard, undo]);

  return { undo, canUndo: stackSize > 0 };
}
