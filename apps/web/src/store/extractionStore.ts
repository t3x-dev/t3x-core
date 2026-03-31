/**
 * extractionStore — Semantic state + extraction lifecycle
 *
 * Split from extractionPanelStore.ts (Task 4).
 * Owns: draft content, YOps log/history, extraction status, topics.
 */

import type {
  YOp,
  YOpsLogEntry,
  YOpsSource,
  SemanticContent,
  TreeNode,
} from '@t3x-dev/core';
import { applyYOps as coreApplyYOps } from '@t3x-dev/core';
import { create } from 'zustand';
import { createYOpsEntry } from '@/lib/api/trees';
import type { Topic } from '@/lib/api/topics';

interface ExtractionState {
  // Semantic data
  draft: SemanticContent;
  yopsLog: YOpsLogEntry[];
  yopsHistory: YOp[][];
  removedNodes: TreeNode[];

  /** Raw YOp objects for the current extraction's feed display */
  feedYops: unknown[];

  /** Pipeline status steps for progress display */
  pipelineSteps: Array<{ step: string; result?: string; timestamp: number }>;

  // Extraction lifecycle
  isExtracting: boolean;
  conversationId: string | null;

  // Topics
  topics: Topic[];
  activeTopicId: string | null;

  // Callable ref — set by useExtractionStream hook
  triggerExtract: null | ((opts?: { driftDecision?: { choice: string; relation?: string; new_topic?: string } }) => void);

  // Methods
  setDraft: (content: SemanticContent) => void;
  applyYOps: (ops: YOp[], source: YOpsSource, turnHash?: string) => void;
  resetDraft: () => void;
  setExtracting: (extracting: boolean) => void;
  hydrateYOpsLog: (entries: YOpsLogEntry[]) => void;
  setConversationId: (id: string | null) => void;
  setTopics: (topics: Topic[]) => void;
  setActiveTopicId: (id: string | null) => void;
  addTopic: (topic: Topic) => void;
  setTriggerExtract: (fn: null | ((opts?: { driftDecision?: { choice: string; relation?: string; new_topic?: string } }) => void)) => void;
}

const emptyContent: SemanticContent = { trees: [], relations: [] };

export const useExtractionStore = create<ExtractionState>((set, get) => ({
  draft: emptyContent,
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

  setDraft: (content) => {
    set({ draft: content });
    // Cross-store: clear manual edit tracking (matching old extractionPanelStore behavior)
    import('./commitStore').then(({ useCommitStore }) => {
      useCommitStore.setState({ manualEditedNodeIds: new Set() });
    });
  },

  applyYOps: (ops, source, turnHash) => {
    const { draft, yopsLog } = get();

    const result = coreApplyYOps(draft, ops);
    if (!result.ok) return;
    const newContent: SemanticContent = { trees: result.trees, relations: result.relations };

    const entry: YOpsLogEntry = {
      id: crypto.randomUUID(),
      yops: ops,
      source,
      created_at: new Date().toISOString(),
      turn_hash: turnHash,
    };

    set({
      draft: newContent,
      yopsLog: [...yopsLog, entry],
      yopsHistory: [ops, ...get().yopsHistory].slice(0, 3),
      removedNodes: get().removedNodes,
    });

    // Track manual edits in commitStore (cross-store write)
    if (source === 'manual') {
      import('./commitStore').then(({ useCommitStore }) => {
        const commitState = useCommitStore.getState();
        const ids = new Set(commitState.manualEditedNodeIds);
        for (const op of ops) {
          if ('add' in op) {
            const nodeKey = Object.keys(op.add.node)[0];
            if (nodeKey) ids.add(nodeKey);
          } else if ('set' in op) {
            ids.add(op.set.path.split('/')[0]);
          } else if ('drop' in op) {
            ids.add(op.drop.path.split('/')[0]);
          } else if ('unset' in op) {
            ids.add(op.unset.path.split('/')[0]);
          }
        }
        useCommitStore.setState({ manualEditedNodeIds: ids });
      });
    }

    // Persist user edits to database
    const convId = get().conversationId;
    if (convId && source !== 'pipeline' && source !== 'compress') {
      createYOpsEntry(convId, ops, source).catch(() => {});
    }
  },

  resetDraft: () => {
    const wasExtracting = get().isExtracting;
    set({
      draft: emptyContent,
      yopsLog: [],
      removedNodes: [],
      yopsHistory: [],
      // Only clear feed display if NOT mid-extraction (prevents wipe on conversation remount)
      ...(wasExtracting ? {} : { feedYops: [], pipelineSteps: [] }),
    });
    // Clear drift state in extractionUIStore
    // NOTE: phase is reset synchronously below, NOT via async import (prevents race with extraction)
    import('./extractionUIStore').then(({ useExtractionUIStore }) => {
      // Only reset phase if not currently extracting
      const isExtracting = get().isExtracting;
      if (!isExtracting) {
        useExtractionUIStore.getState().setPhase('idle');
      }
      useExtractionUIStore.getState().clearDrift();
    });
    // Clear triage state (only if not extracting)
    if (!get().isExtracting) {
      import('./triageStore').then(({ useTriageStore }) => {
        useTriageStore.getState().reset();
      });
    }
    // Clear commit-related state in commitStore (matching old extractionPanelStore behavior)
    import('./commitStore').then(({ useCommitStore }) => {
      useCommitStore.setState({
        confirmedNodeIds: {},
        confirmedSlotKeys: {},
        manualEditedNodeIds: new Set(),
      });
    });
  },

  setExtracting: (extracting) => set({ isExtracting: extracting }),

  hydrateYOpsLog: (entries) => set({ yopsLog: entries }),
  setConversationId: (id) => set({ conversationId: id }),
  setTopics: (topics) => set({ topics }),
  setActiveTopicId: (id) => set({ activeTopicId: id }),
  addTopic: (topic) => set((s) => ({ topics: [...s.topics, topic] })),
  setTriggerExtract: (fn) => set({ triggerExtract: fn }),
}));
