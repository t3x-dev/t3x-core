/**
 * editingStore — Which slot is being edited right now
 *
 * Invariant: editing and adding are mutually exclusive.
 * startEdit() clears adding, startAdding() clears editing.
 */

import { create } from 'zustand';

interface EditingState {
  editing: { nodeId: string; slotKey: string } | null;
  adding: { nodeId: string } | null;

  startEdit: (nodeId: string, slotKey: string) => void;
  stopEdit: () => void;
  startAdding: (nodeId: string) => void;
  stopAdding: () => void;
}

export const useEditingStore = create<EditingState>((set) => ({
  editing: null,
  adding: null,

  startEdit: (nodeId, slotKey) => set({ editing: { nodeId, slotKey }, adding: null }),

  stopEdit: () => set({ editing: null }),

  startAdding: (nodeId) => set({ adding: { nodeId }, editing: null }),

  stopAdding: () => set({ adding: null }),
}));
