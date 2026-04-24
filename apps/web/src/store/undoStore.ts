/**
 * Undo Store — ephemeral snapshot stack for draft editing.
 *
 * Each user editing action (tree modify / tree remove / chat add / chat
 * remove) takes a snapshot of the workspace opsLog BEFORE applying the
 * change and pushes it here. Cmd+Z / Ctrl+Z pops the latest snapshot
 * and rolls the workspace back by replaying the prior opsLog.
 *
 * Design notes:
 *  - Snapshots hold references to SourcedYOp objects; JS structural
 *    sharing keeps memory cost negligible even at 50 entries.
 *  - Stack is capped at UNDO_STACK_LIMIT; older entries drop off.
 *  - The store is passive (per v3 architecture): no I/O, no replay.
 *    The replay-and-commit happens in `hooks/shared/useUndo`.
 *  - Snapshots are session-scoped; committing or switching
 *    conversations clears the stack via `useWorkspaceStore.reset`.
 */

import type { SourcedYOp } from '@t3x-dev/core';
import { create } from 'zustand';

export const UNDO_STACK_LIMIT = 50;

export interface UndoSnapshot {
  /** Human-readable label used in the undo toast */
  label: string;
  /** Full opsLog state BEFORE the action that produced this snapshot */
  opsLog: SourcedYOp[];
  /** Unix ms */
  at: number;
}

interface UndoState {
  stack: UndoSnapshot[];
  push: (label: string, opsLog: SourcedYOp[]) => void;
  pop: () => UndoSnapshot | null;
  canUndo: () => boolean;
  clear: () => void;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  stack: [],

  push: (label, opsLog) =>
    set((state) => {
      const entry: UndoSnapshot = { label, opsLog, at: Date.now() };
      const next = [...state.stack, entry];
      if (next.length > UNDO_STACK_LIMIT) {
        next.splice(0, next.length - UNDO_STACK_LIMIT);
      }
      return { stack: next };
    }),

  pop: () => {
    const { stack } = get();
    if (stack.length === 0) return null;
    const top = stack[stack.length - 1];
    set({ stack: stack.slice(0, -1) });
    return top;
  },

  canUndo: () => get().stack.length > 0,

  clear: () => set({ stack: [] }),
}));
