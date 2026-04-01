/**
 * triageStore — Acceptance workflow for extraction v6
 *
 * Manages extracted items that need user approval before commit.
 * After the LLM extracts knowledge, results appear as triage items.
 * The user accepts or dismisses each one before committing.
 *
 * Flow: YOps Feed -> Triage -> Review YAML -> Commit
 *
 * Persistence: triage state is debounce-saved to conversation metadata
 * so users can close the tab mid-triage and resume where they stopped.
 */

import type { TreeNode } from '@t3x-dev/core';
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
// Helpers
// ---------------------------------------------------------------------------

/** Collect all slots from a tree node and its children, prefixed by path */
function collectAllSlots(node: TreeNode, prefix: string): Record<string, string> {
  const slots: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.slots)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    slots[fullKey] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  for (const child of node.children) {
    Object.assign(slots, collectAllSlots(child, prefix ? `${prefix}.${child.key}` : child.key));
  }
  return slots;
}

/** Convert extracted trees into TriageItems for the triage phase.
 *  Each root tree becomes one triage item. Children's slots are included
 *  with dot-path keys so the full tree content is visible in triage. */
export function treesToTriageItems(trees: TreeNode[]): TriageItem[] {
  return trees.map((tree) => {
    const source: TriageSource = tree.confidence && tree.confidence >= 0.8 ? 'both' : 'llm';
    // Include root slots + all children slots
    const slots = collectAllSlots(tree, '');
    const childCount = tree.children.length;
    const slotCount = Object.keys(slots).length;
    const preview =
      childCount > 0
        ? `${childCount} subtopics, ${slotCount} total slots`
        : Object.entries(slots)
            .slice(0, 2)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
    return {
      id: tree.key,
      source,
      slots,
      preview: preview.length > 60 ? `${preview.slice(0, 60)}...` : preview,
    };
  });
}

// ---------------------------------------------------------------------------
// Debounced persistence
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { conversationId, decisions, slotToggles, manualAdditions } = useTriageStore.getState();
    if (!conversationId) return;

    import('@/store/phaseStore').then(({ usePhaseStore }) => {
      const phase = usePhaseStore.getState().phase;
      import('@/lib/api/conversations').then(({ updateConversation }) => {
        updateConversation(conversationId, {
          metadata: {
            extraction_triage: {
              phase,
              decisions,
              slotToggles,
              manualAdditions,
            },
          },
        }).catch(() => {}); // Non-critical — user re-triages on refresh if save fails
      });
    });
  }, 500);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface TriageState {
  items: TriageItem[];
  decisions: Record<string, TriageDecision>;
  slotToggles: Record<string, Record<string, boolean>>;
  manualAdditions: Array<{ targetId: string; key: string; value: string }>;
  conversationId: string | null;

  loadItems: (items: TriageItem[], conversationId?: string) => void;
  acceptItem: (id: string) => void;
  dismissItem: (id: string) => void;
  acceptAll: () => void;
  toggleSlot: (itemId: string, slotKey: string, on: boolean) => void;
  addManualSlot: (targetId: string, key: string, value: string) => void;
  getAcceptedContent: () => Array<{ id: string; slots: Record<string, string> }>;
  hydrate: (metadata: Record<string, unknown> | null, trees: TreeNode[]) => void;
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
  conversationId: null as string | null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTriageStore = create<TriageState>((set, get) => ({
  ...initialState,

  loadItems: (items, conversationId) => {
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

    set({
      items,
      decisions,
      slotToggles,
      manualAdditions: [],
      conversationId: conversationId ?? get().conversationId ?? null,
    });
  },

  acceptItem: (id) => {
    set((s) => ({
      decisions: { ...s.decisions, [id]: 'accepted' },
    }));
    debouncedSave();
  },

  dismissItem: (id) => {
    set((s) => ({
      decisions: { ...s.decisions, [id]: 'dismissed' },
    }));
    debouncedSave();
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
    debouncedSave();
  },

  toggleSlot: (itemId, slotKey, on) => {
    set((s) => ({
      slotToggles: {
        ...s.slotToggles,
        [itemId]: { ...s.slotToggles[itemId], [slotKey]: on },
      },
    }));
    debouncedSave();
  },

  addManualSlot: (targetId, key, value) => {
    set((s) => ({
      manualAdditions: [...s.manualAdditions, { targetId, key, value }],
    }));
    debouncedSave();
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

  hydrate: (metadata, trees) => {
    const saved = (metadata as Record<string, unknown> | null)?.extraction_triage as
      | {
          decisions?: Record<string, TriageDecision>;
          slotToggles?: Record<string, Record<string, boolean>>;
          manualAdditions?: Array<{ targetId: string; key: string; value: string }>;
        }
      | undefined;

    // Generate items from trees
    const items = treesToTriageItems(trees);

    if (saved?.decisions) {
      set({
        items,
        decisions: saved.decisions,
        slotToggles: saved.slotToggles ?? {},
        manualAdditions: saved.manualAdditions ?? [],
        conversationId: get().conversationId,
      });
    } else {
      // No saved state — use loadItems defaults
      get().loadItems(items, get().conversationId ?? undefined);
    }
  },

  reset: () => {
    const { conversationId } = get();
    set({ ...initialState });
    if (conversationId) {
      import('@/lib/api/conversations').then(({ updateConversation }) => {
        updateConversation(conversationId, {
          metadata: { extraction_triage: null },
        }).catch(() => {});
      });
    }
  },
}));
