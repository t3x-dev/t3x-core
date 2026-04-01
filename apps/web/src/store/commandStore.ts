/**
 * commandStore — Command pattern with eager inverse computation
 *
 * Layer B: Depends on draftStore (Layer A) via getState().
 * Manages undo/redo stacks, pending ops, and pending summary.
 */

import type { SemanticContent, YOp } from '@t3x-dev/core';
import { findNode } from '@t3x-dev/core';
import { create } from 'zustand';
import type { InverseResult } from '@/lib/yopInverse';
import { computeInverse, isContextInverse } from '@/lib/yopInverse';
import { useDraftStore } from '@/store/draftStore';

export interface UndoEntry {
  ops: YOp[];
  inverseOps: InverseResult[];
  context?: unknown;
}

export interface PendingSummary {
  edits: number;
  deletes: number;
  adds: number;
  total: number;
}

interface CommandState {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  pendingOps: YOp[];
  hasPending: boolean;
  pendingSummary: PendingSummary;

  execute: (ops: YOp[]) => void;
  undo: () => void;
  redo: () => void;
  clearPending: () => void;
}

const emptySummary: PendingSummary = { edits: 0, deletes: 0, adds: 0, total: 0 };

function computeSummary(ops: YOp[], draftAtStart: SemanticContent): PendingSummary {
  let edits = 0;
  let deletes = 0;
  let adds = 0;

  for (const op of ops) {
    if ('set' in op) {
      const nodePath = op.set.path.includes('/')
        ? op.set.path.slice(0, op.set.path.lastIndexOf('/'))
        : '';
      const slotKey = op.set.path.includes('/')
        ? op.set.path.slice(op.set.path.lastIndexOf('/') + 1)
        : op.set.path;
      const node = nodePath ? findNode(draftAtStart.trees, nodePath) : undefined;
      if (node && slotKey in node.slots) {
        edits++;
      } else {
        adds++;
      }
    } else if ('unset' in op || 'drop' in op) {
      deletes++;
    } else if ('add' in op) {
      adds++;
    }
    // Other ops (rename, clone, move, etc.) counted as edits
    else {
      edits++;
    }
  }

  return { edits, deletes, adds, total: edits + deletes + adds };
}

export const useCommandStore = create<CommandState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  pendingOps: [],
  hasPending: false,
  pendingSummary: emptySummary,

  execute: (ops) => {
    const draft = useDraftStore.getState().draft;

    // Compute inverse for each op before applying
    const inverseOps: InverseResult[] = ops.map((op) => computeInverse(op, draft));

    // Capture context for complex ops
    let context: unknown;
    const hasContext = inverseOps.some(isContextInverse);
    if (hasContext) {
      context = inverseOps.filter(isContextInverse).map((inv) => inv._context);
    }

    // Apply ops to draft
    useDraftStore.getState().applyYOps(ops, 'manual');

    // Update command state
    const { undoStack, pendingOps } = get();
    const newPending = [...pendingOps, ...ops];

    set({
      undoStack: [...undoStack, { ops, inverseOps, context }],
      redoStack: [],
      pendingOps: newPending,
      hasPending: true,
      pendingSummary: computeSummary(newPending, draft),
    });
  },

  undo: () => {
    const { undoStack, redoStack, pendingOps } = get();
    if (undoStack.length === 0) return;

    const entry = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);

    // Apply inverse ops
    const inverseYOps = entry.inverseOps.filter((inv): inv is YOp => !isContextInverse(inv));
    if (inverseYOps.length > 0) {
      useDraftStore.getState().applyYOps(inverseYOps, 'manual');
    }

    // Remove ops from pendingOps (remove last N ops matching entry.ops length)
    const newPending = pendingOps.slice(0, pendingOps.length - entry.ops.length);

    set({
      undoStack: newUndoStack,
      redoStack: [...redoStack, entry],
      pendingOps: newPending,
      hasPending: newPending.length > 0,
      pendingSummary:
        newPending.length > 0
          ? computeSummary(newPending, useDraftStore.getState().draft)
          : emptySummary,
    });
  },

  redo: () => {
    const { undoStack, redoStack, pendingOps } = get();
    if (redoStack.length === 0) return;

    const entry = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    // Re-apply original ops
    useDraftStore.getState().applyYOps(entry.ops, 'manual');

    const newPending = [...pendingOps, ...entry.ops];

    set({
      undoStack: [...undoStack, entry],
      redoStack: newRedoStack,
      pendingOps: newPending,
      hasPending: true,
      pendingSummary: computeSummary(newPending, useDraftStore.getState().draft),
    });
  },

  clearPending: () => {
    set({
      undoStack: [],
      redoStack: [],
      pendingOps: [],
      hasPending: false,
      pendingSummary: emptySummary,
    });
  },
}));
