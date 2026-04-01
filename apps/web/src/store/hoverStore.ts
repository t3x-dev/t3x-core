/**
 * hoverStore — Bidirectional hover tracking for YAML ↔ Chat highlighting.
 *
 * 60ms debounce prevents rapid-fire re-renders when mouse sweeps
 * across YAML rows or chat spans.
 *
 * Contract: HoverStoreState & HoverStoreActions (goldStepContracts.ts)
 */

import { create } from 'zustand';
import type { HoverStore } from '@/types/goldStepContracts';

// Module-level timers (not useRef) so store methods work outside components
let nodeTimer: ReturnType<typeof setTimeout> | null = null;
let turnTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 60;

export const useHoverStore = create<HoverStore>((set) => ({
  // ── State ──
  hoveredNodeId: null,
  hoveredSlotKey: null,
  hoveredTurnIndex: null,
  scrollToCenter: false,
  hoveredFromChat: false,
  focusIntentEnabled: false,
  llmHighlightedNodeIds: {},

  // ── Actions ──

  setHoveredNodeId(nodeId, slotKey = null) {
    if (nodeTimer) clearTimeout(nodeTimer);
    if (nodeId === null) {
      // Delayed clear — prevents flicker when moving between adjacent rows
      nodeTimer = setTimeout(() => {
        set({ hoveredNodeId: null, hoveredSlotKey: null, hoveredFromChat: false });
      }, DEBOUNCE_MS);
    } else {
      // Immediate set — responsive feel on enter
      set({
        hoveredNodeId: nodeId,
        hoveredSlotKey: slotKey ?? null,
        scrollToCenter: true,
        hoveredFromChat: false,
      });
    }
  },

  setHoveredTurnIndex(index) {
    if (turnTimer) clearTimeout(turnTimer);
    if (index === null) {
      turnTimer = setTimeout(() => {
        set({ hoveredTurnIndex: null, hoveredFromChat: false });
      }, DEBOUNCE_MS);
    } else {
      set({
        hoveredTurnIndex: index,
        scrollToCenter: true,
        hoveredFromChat: true,
      });
    }
  },

  setFocusIntent(enabled) {
    set({ focusIntentEnabled: enabled });
  },

  setLlmHighlightedNodeIds(ids) {
    set({ llmHighlightedNodeIds: ids });
  },
}));
