/**
 * commandStore — MOCK (Person A will replace with real implementation)
 *
 * Temporary stub that satisfies the CommandStore contract.
 * execute() delegates to draftStore.applyYOps() so edits still work.
 * undo/redo are no-ops until Person A implements yopInverse.
 *
 * Person A: replace this entire file with the real commandStore implementation.
 */

import { create } from 'zustand';
import type { CommandStore, PendingSummary } from '@/types/goldStepContracts';

const EMPTY_SUMMARY: PendingSummary = { edits: 0, deletes: 0, adds: 0, total: 0 };

export const useCommandStore = create<CommandStore>((set, get) => ({
  // ── State ──
  undoStack: [],
  redoStack: [],
  pendingOps: [],
  hasPending: false,
  pendingSummary: { ...EMPTY_SUMMARY },

  // ── Actions ──

  execute(ops) {
    // Delegate to draftStore (which proxies to extractionPanelStore during migration)
    import('./draftStore').then(({ useDraftStore }) => {
      useDraftStore.getState().applyYOps(ops, 'manual');
    });

    // Track pending ops for PendingChangesBar display
    const newPending = [...get().pendingOps, ...ops];
    set({
      pendingOps: newPending,
      hasPending: newPending.length > 0,
      pendingSummary: computeSummary(newPending),
      // No undo support yet — Person A will implement with yopInverse
    });
  },

  undo() {
    // No-op until Person A implements yopInverse
    console.warn('[commandStore mock] undo not yet implemented');
  },

  redo() {
    // No-op until Person A implements yopInverse
    console.warn('[commandStore mock] redo not yet implemented');
  },

  clearPending() {
    set({
      undoStack: [],
      redoStack: [],
      pendingOps: [],
      hasPending: false,
      pendingSummary: { ...EMPTY_SUMMARY },
    });
  },
}));

/** Compute edit/delete/add counts from pending ops */
function computeSummary(ops: import('@t3x-dev/core').YOp[]): PendingSummary {
  let edits = 0;
  let deletes = 0;
  let adds = 0;

  for (const op of ops) {
    if ('set' in op) {
      // set can be either edit (existing slot) or add (new slot)
      // Without draft context we count all as edits; Person A's real
      // implementation will distinguish properly
      edits++;
    } else if ('unset' in op || 'drop' in op) {
      deletes++;
    } else if ('add' in op) {
      adds++;
    }
  }

  return { edits, deletes, adds, total: edits + deletes + adds };
}
