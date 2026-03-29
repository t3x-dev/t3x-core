/**
 * extractionStore — Semantic state + extraction lifecycle
 *
 * Split from extractionPanelStore.ts (Task 4).
 * Owns: draft content, YOps log/history, extraction status, topics, compression.
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

type ExtractionMode = 'standard' | 'deep';

interface ExtractionState {
  // Semantic data
  draft: SemanticContent;
  yopsLog: YOpsLogEntry[];
  yopsHistory: TreeChange[][];
  removedNodes: TreeNode[];

  // Extraction lifecycle
  isExtracting: boolean;
  extractionMode: ExtractionMode;
  conversationId: string | null;

  // Topics
  topics: Topic[];
  activeTopicId: string | null;

  // Compression
  isCompressing: boolean;
  compressResult: {
    summary: string;
    treesBefore: number;
    treesAfter: number;
    mergedCount: number;
    removedCount: number;
    removedNodeIds: string[];
    yopsLogId: string;
  } | null;
  showCompressBanner: boolean;

  // Callable ref — set by useExtractionStream hook
  triggerExtract: null | ((opts?: { driftDecision?: string }) => void);

  // Methods
  setDraft: (content: SemanticContent) => void;
  applyTreeChanges: (batch: TreeChangeBatch, source: YOpsSource, turnHash?: string) => void;
  resetDraft: () => void;
  setExtracting: (extracting: boolean) => void;
  setExtractionMode: (mode: ExtractionMode) => void;
  hydrateYOpsLog: (entries: YOpsLogEntry[]) => void;
  setConversationId: (id: string | null) => void;
  setTopics: (topics: Topic[]) => void;
  setActiveTopicId: (id: string | null) => void;
  addTopic: (topic: Topic) => void;
  startCompress: () => Promise<void>;
  undoCompression: () => Promise<void>;
  dismissCompressBanner: () => void;
  setTriggerExtract: (fn: null | ((opts?: { driftDecision?: string }) => void)) => void;
}

const emptyContent: SemanticContent = { trees: [], relations: [] };

export const useExtractionStore = create<ExtractionState>((set, get) => ({
  draft: emptyContent,
  yopsLog: [],
  yopsHistory: [],
  removedNodes: [],
  isExtracting: false,
  extractionMode: 'standard',
  conversationId: null,
  topics: [],
  activeTopicId: null,
  isCompressing: false,
  compressResult: null,
  showCompressBanner: false,
  triggerExtract: null,

  setDraft: (content) => {
    set({ draft: content });
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
  },

  setExtracting: (extracting) => set({ isExtracting: extracting }),

  setExtractionMode: (mode) => {
    set({ extractionMode: mode });
    const convId = get().conversationId;
    if (convId) {
      import('@/lib/api').then(({ updateConversation }) => {
        // metadata_json support is being added to the API — cast to bypass current type
        (updateConversation as (id: string, updates: Record<string, unknown>) => Promise<unknown>)(
          convId,
          { metadata_json: JSON.stringify({ extraction_mode: mode }) }
        ).catch(() => {}); // Non-critical
      });
    }
  },

  hydrateYOpsLog: (entries) => set({ yopsLog: entries }),
  setConversationId: (id) => set({ conversationId: id }),
  setTopics: (topics) => set({ topics }),
  setActiveTopicId: (id) => set({ activeTopicId: id }),
  addTopic: (topic) => set((s) => ({ topics: [...s.topics, topic] })),
  setTriggerExtract: (fn) => set({ triggerExtract: fn }),

  startCompress: async () => {
    const convId = get().conversationId;
    if (!convId) return;

    set({ isCompressing: true });
    try {
      const { compressNodes } = await import('@/lib/api/trees');
      const result = await compressNodes(convId);

      if (!result.snapshot || result.snapshot.trees.length === 0) {
        set({ isCompressing: false });
        return;
      }

      // Apply the compressed snapshot directly
      get().setDraft(result.snapshot);

      // Patch the client-generated ID with the server's actual yops_log_id
      set((s) => {
        const log = [...s.yopsLog];
        const last = log[log.length - 1];
        if (last && last.source === 'compress') {
          log[log.length - 1] = { ...last, id: result.yops_log_id };
        }
        return { yopsLog: log };
      });

      set({
        isCompressing: false,
        compressResult: {
          summary: result.metadata.compress_summary,
          treesBefore: result.metadata.trees_before,
          treesAfter: result.metadata.trees_after,
          mergedCount: result.metadata.merged_count,
          removedCount: result.metadata.removed_count,
          removedNodeIds: result.metadata.removed_tree_ids,
          yopsLogId: result.yops_log_id,
        },
        showCompressBanner: true,
      });
    } catch {
      set({ isCompressing: false });
    }
  },

  undoCompression: async () => {
    const { yopsLog, conversationId } = get();
    const compressEntry = [...yopsLog].reverse().find((d) => d.source === 'compress');
    if (!compressEntry || !conversationId) return;

    try {
      const { deleteYOpsEntry, getSemanticDraft } = await import('@/lib/api/trees');
      await deleteYOpsEntry(conversationId, compressEntry.id);

      // Rebuild from server (most reliable)
      const newDraft = await getSemanticDraft(conversationId);
      const newLog = yopsLog.filter((d) => d.id !== compressEntry.id);

      set({
        draft: newDraft,
        yopsLog: newLog,
        compressResult: null,
        showCompressBanner: false,
      });
    } catch {
      // Undo failed — non-critical
    }
  },

  dismissCompressBanner: () => set({ showCompressBanner: false }),
}));
