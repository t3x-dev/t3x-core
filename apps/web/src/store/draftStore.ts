/**
 * draftStore — MOCK (Person A will replace with real implementation)
 *
 * Temporary stub that satisfies the DraftStore contract.
 * Reads draft from extractionPanelStore as a passthrough so existing
 * functionality doesn't break during parallel development.
 *
 * Person A: replace this entire file with the real draftStore implementation.
 */

import type { SemanticContent } from '@t3x-dev/core';
import { create } from 'zustand';
import type { DraftStore } from '@/types/goldStepContracts';

export const useDraftStore = create<DraftStore>((set, get) => ({
  // ── State (passthrough from extractionPanelStore) ──
  draft: { trees: [], relations: [] } as SemanticContent,
  yopsLog: [],
  yopsHistory: [],
  removedNodes: [],
  feedYops: [],
  pipelineSteps: [],
  isExtracting: false,
  conversationId: null,
  topics: [],
  activeTopicId: null,
  triggerExtract: null,

  // ── Actions (delegate to extractionPanelStore during migration) ──
  setDraft(content) {
    set({ draft: content });
    // Sync to old store so existing consumers still work
    import('./extractionPanelStore').then(({ useExtractionPanelStore }) => {
      useExtractionPanelStore.getState().setDraft(content);
    });
  },

  applyYOps(ops, source, _turnHash) {
    // Delegate to old store (it has the real YOps engine wired up)
    import('./extractionPanelStore').then(({ useExtractionPanelStore }) => {
      useExtractionPanelStore.getState().applyYOps(ops, source);
      // Sync draft back
      const { draft } = useExtractionPanelStore.getState();
      set({ draft });
    });
  },

  resetDraft() {
    set({ draft: { trees: [], relations: [] }, yopsLog: [], yopsHistory: [], removedNodes: [] });
    import('./extractionPanelStore').then(({ useExtractionPanelStore }) => {
      useExtractionPanelStore.getState().resetDraft();
    });
  },

  hydrateYOpsLog(entries) {
    set({ yopsLog: entries });
  },

  setExtracting(value) {
    set({ isExtracting: value });
  },

  setConversationId(id) {
    set({ conversationId: id });
  },

  setTopics(topics) {
    set({ topics });
  },

  setActiveTopicId(id) {
    set({ activeTopicId: id });
  },

  addTopic(topic) {
    set({ topics: [...get().topics, topic] });
  },

  setTriggerExtract(fn) {
    set({ triggerExtract: fn });
  },
}));
