/**
 * triageStore — Acceptance workflow for extraction v6
 *
 * Manages extracted items that need user approval before commit.
 * After the LLM extracts knowledge, results appear as triage items.
 * The user accepts or dismisses each one before committing.
 *
 * Flow: YOps Feed -> Triage -> Review YAML -> Commit
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TriageSource = 'user' | 'llm' | 'both';
export type TriageDecision = 'pending' | 'accepted' | 'dismissed';

export interface TriageItem {
  id: string;
  source: TriageSource;
  slots: Record<string, string>;
  preview: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface TriageState {
  items: TriageItem[];
  decisions: Record<string, TriageDecision>;
  slotToggles: Record<string, Record<string, boolean>>;
  manualAdditions: Array<{ targetId: string; key: string; value: string }>;

  loadItems: (items: TriageItem[]) => void;
  acceptItem: (id: string) => void;
  dismissItem: (id: string) => void;
  acceptAll: () => void;
  toggleSlot: (itemId: string, slotKey: string, on: boolean) => void;
  addManualSlot: (targetId: string, key: string, value: string) => void;
  getAcceptedContent: () => Array<{ id: string; slots: Record<string, string> }>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState = {
  items: [] as TriageItem[],
  decisions: {} as Record<string, TriageDecision>,
  slotToggles: {} as Record<string, Record<string, boolean>>,
  manualAdditions: [] as Array<{ targetId: string; key: string; value: string }>,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTriageStore = create<TriageState>((set, get) => ({
  ...initialState,

  loadItems: (items) => {
    const decisions: Record<string, TriageDecision> = {};
    const slotToggles: Record<string, Record<string, boolean>> = {};

    for (const item of items) {
      // Auto-accept user and both sources; LLM items stay pending
      decisions[item.id] = item.source === 'llm' ? 'pending' : 'accepted';

      // Initialize all slot toggles to on
      const toggles: Record<string, boolean> = {};
      for (const key of Object.keys(item.slots)) {
        toggles[key] = true;
      }
      slotToggles[item.id] = toggles;
    }

    set({ items, decisions, slotToggles, manualAdditions: [] });
  },

  acceptItem: (id) => {
    set((s) => ({
      decisions: { ...s.decisions, [id]: 'accepted' },
    }));
  },

  dismissItem: (id) => {
    set((s) => ({
      decisions: { ...s.decisions, [id]: 'dismissed' },
    }));
  },

  acceptAll: () => {
    set((s) => {
      const updated = { ...s.decisions };
      for (const [id, decision] of Object.entries(updated)) {
        if (decision === 'pending') {
          updated[id] = 'accepted';
        }
      }
      return { decisions: updated };
    });
  },

  toggleSlot: (itemId, slotKey, on) => {
    set((s) => ({
      slotToggles: {
        ...s.slotToggles,
        [itemId]: { ...s.slotToggles[itemId], [slotKey]: on },
      },
    }));
  },

  addManualSlot: (targetId, key, value) => {
    set((s) => ({
      manualAdditions: [...s.manualAdditions, { targetId, key, value }],
    }));
  },

  getAcceptedContent: () => {
    const { items, decisions, slotToggles, manualAdditions } = get();
    const result: Array<{ id: string; slots: Record<string, string> }> = [];

    for (const item of items) {
      if (decisions[item.id] !== 'accepted') continue;

      // Build slots: keep only toggled-on slots
      const slots: Record<string, string> = {};
      const toggles = slotToggles[item.id] ?? {};

      for (const [key, value] of Object.entries(item.slots)) {
        if (toggles[key] !== false) {
          slots[key] = value;
        }
      }

      // Merge manual additions (last write wins for duplicate keys)
      for (const addition of manualAdditions) {
        if (addition.targetId === item.id) {
          slots[addition.key] = addition.value;
        }
      }

      // Only include item if it has at least one slot
      if (Object.keys(slots).length > 0) {
        result.push({ id: item.id, slots });
      }
    }

    return result;
  },

  reset: () => {
    set({ ...initialState });
  },
}));
