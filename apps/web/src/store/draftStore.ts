// apps/web/src/store/draftStore.ts
import type { SemanticContent, TreeNode, YOp, YOpsLogEntry, YOpsSource } from '@t3x-dev/core';
import { applyYOps as coreApplyYOps } from '@t3x-dev/core';
import { create } from 'zustand';
import type { Topic } from '@/lib/api/topics';
import { createYOpsEntry } from '@/lib/api/trees';

interface DraftState {
  draft: SemanticContent;
  yopsLog: YOpsLogEntry[];
  yopsHistory: YOp[][];
  removedNodes: TreeNode[];
  feedYops: unknown[];
  pipelineSteps: Array<{ step: string; result?: string; timestamp: number }>;
  isExtracting: boolean;
  conversationId: string | null;
  topics: Topic[];
  activeTopicId: string | null;
  triggerExtract:
    | null
    | ((opts?: {
        driftDecision?: { choice: string; relation?: string; new_topic?: string };
      }) => void);
  manualEditedNodeIds: Set<string>;

  setDraft: (content: SemanticContent) => void;
  applyYOps: (ops: YOp[], source: YOpsSource, turnHash?: string) => void;
  resetDraft: () => void;
  setExtracting: (extracting: boolean) => void;
  hydrateYOpsLog: (entries: YOpsLogEntry[]) => void;
  setConversationId: (id: string | null) => void;
  setTopics: (topics: Topic[]) => void;
  setActiveTopicId: (id: string | null) => void;
  addTopic: (topic: Topic) => void;
  setTriggerExtract: (
    fn:
      | null
      | ((opts?: {
          driftDecision?: { choice: string; relation?: string; new_topic?: string };
        }) => void)
  ) => void;
}

const emptyContent: SemanticContent = { trees: [], relations: [] };

export const useDraftStore = create<DraftState>((set, get) => ({
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
  manualEditedNodeIds: new Set(),

  setDraft: (content) => {
    set({ draft: content, manualEditedNodeIds: new Set() });
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
    });

    if (source === 'manual') {
      const ids = new Set(get().manualEditedNodeIds);
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
      set({ manualEditedNodeIds: ids });
    }

    // Persist ALL ops to DB — no source filter (crash recovery)
    const convId = get().conversationId;
    if (convId) {
      createYOpsEntry(convId, ops, source)?.catch(() => {});
    }
  },

  resetDraft: () => {
    const wasExtracting = get().isExtracting;
    set({
      draft: emptyContent,
      yopsLog: [],
      removedNodes: [],
      yopsHistory: [],
      manualEditedNodeIds: new Set(),
      ...(wasExtracting ? {} : { feedYops: [], pipelineSteps: [] }),
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
