/**
 * extractionStore — Semantic state + extraction lifecycle
 *
 * Split from extractionPanelStore.ts (Task 4).
 * Owns: draft content, YOps log/history, extraction status, topics.
 */

import type {
  TreeChangeBatch,
  YOpsLogEntry,
  YOpsSource,
  SemanticContent,
  TreeChange,
  TreeNode,
} from '@t3x-dev/core';
import { applyTreeChanges } from '@t3x-dev/core';
import { create } from 'zustand';
import { createYOpsEntry } from '@/lib/api/trees';
import type { Topic } from '@/lib/api/topics';

interface ExtractionState {
  // Semantic data
  draft: SemanticContent;
  yopsLog: YOpsLogEntry[];
  yopsHistory: TreeChange[][];
  removedNodes: TreeNode[];

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
  applyTreeChanges: (batch: TreeChangeBatch, source: YOpsSource, turnHash?: string) => void;
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

  applyTreeChanges: (batch, source, turnHash) => {
    const { draft, yopsLog } = get();

    // Use core applyTreeChanges to properly update the tree structure
    const newContent = applyTreeChanges(draft, batch);

    const entry: YOpsLogEntry = {
      id: crypto.randomUUID(),
      yops: batch,
      source,
      created_at: new Date().toISOString(),
      turn_hash: turnHash,
    };

    set({
      draft: newContent,
      yopsLog: [...yopsLog, entry],
      yopsHistory: [batch.changes, ...get().yopsHistory].slice(0, 3),
    });

    // Track manual edits in commitStore (cross-store write)
    if (source === 'manual') {
      import('./commitStore').then(({ useCommitStore }) => {
        const commitState = useCommitStore.getState();
        const ids = new Set(commitState.manualEditedNodeIds);
        for (const change of batch.changes) {
          if (change.action === 'add') ids.add(change.node.key);
          else if (change.action === 'update') ids.add(change.target_path);
          else if (change.action === 'remove') ids.add(change.target_path);
        }
        useCommitStore.setState({ manualEditedNodeIds: ids });
      });
    }

    // Persist user edits to database (LLM extraction and compression are already saved by the API)
    const convId = get().conversationId;
    if (convId && source !== 'pipeline' && source !== 'compress') {
      createYOpsEntry(convId, batch, source).catch(() => {
        // Persist failed — non-critical, store has the data
      });
    }
  },

  resetDraft: () => {
    set({
      draft: emptyContent,
      yopsLog: [],
      removedNodes: [],
      yopsHistory: [],
    });
    // Clear drift state in extractionUIStore
    import('./extractionUIStore').then(({ useExtractionUIStore }) => {
      useExtractionUIStore.getState().clearDrift();
    });
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
