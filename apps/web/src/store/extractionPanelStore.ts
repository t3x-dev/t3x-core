import type {
  TreeChangeBatch,
  YOpsLogEntry,
  YOpsSource,
  SemanticContent,
  TreeChange,
  TreeNode,
} from '@t3x-dev/core';
import { applyTreeChanges, flattenTrees } from '@t3x-dev/core';
import { create } from 'zustand';
import { createCommit, listCommits } from '@/lib/api/commits';
import { createYOpsEntry } from '@/lib/api/trees';
import type { Topic } from '@/lib/api/topics';

// Debounce helper for hover interactions — prevents rapid-fire re-renders
// when mouse sweeps across YAML rows
let hoverNodeTimer: ReturnType<typeof setTimeout> | null = null;
let hoverTurnTimer: ReturnType<typeof setTimeout> | null = null;
const HOVER_DEBOUNCE_MS = 60;

type PanelMode = 'collapsed' | 'default' | 'preview';
type ActiveView = 'graph' | 'yaml';

interface ExtractionPanelState {
  panelMode: PanelMode;
  activeView: ActiveView;
  draft: SemanticContent;
  yopsLog: YOpsLogEntry[];
  isExtracting: boolean;
  confirmedNodeIds: Record<string, boolean>;
  confirmedSlotKeys: Record<string, Record<string, boolean>>; // nodeKey → { slotKey: true }
  focusIntentEnabled: boolean;
  llmHighlightedNodeIds: Record<string, boolean>;
  yopsHistory: TreeChange[][];
  removedNodes: TreeNode[];

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

  setPanelMode: (mode: PanelMode) => void;
  setActiveView: (view: ActiveView) => void;
  togglePanel: () => void;
  applyTreeChanges: (batch: TreeChangeBatch, source: YOpsSource, turnHash?: string) => void;
  setDraft: (content: SemanticContent) => void;
  resetDraft: () => void;
  setExtracting: (extracting: boolean) => void;
  confirmNode: (treeId: string) => void;
  unconfirmNode: (treeId: string) => void;
  confirmSlot: (treeId: string, slotKey: string) => void;
  unconfirmSlot: (treeId: string, slotKey: string) => void;
  setFocusIntent: (enabled: boolean) => void;
  setLlmHighlightedNodeIds: (ids: string[]) => void;
  hydrateYOpsLog: (entries: YOpsLogEntry[]) => void;
  conversationId: string | null;
  setConversationId: (id: string | null) => void;

  // Gate result (Step 5 — node quality annotation)
  gateIssues: Record<string, { severity: 'error' | 'warning' | 'info'; description: string }[]>;
  setGateIssues: (
    issues: Record<string, { severity: 'error' | 'warning' | 'info'; description: string }[]>
  ) => void;

  // Drift detection (Step 3)
  driftDetected: boolean;
  driftInfo: { relation?: string; new_topic?: string; old_topic?: string } | null;
  driftChoices: string[];
  setDriftDetected: (
    info: { relation?: string; new_topic?: string; old_topic?: string },
    choices: string[]
  ) => void;
  clearDrift: () => void;

  // Advisory questions (Step 6)
  advisoryQuestions: Array<{
    id: string;
    type: string;
    treeId: string;
    slotKey?: string;
    question: string;
    currentValue?: unknown;
  }>;
  setAdvisoryQuestions: (
    questions: Array<{
      id: string;
      type: string;
      treeId: string;
      slotKey?: string;
      question: string;
      currentValue?: unknown;
    }>
  ) => void;

  // Topics (multi-topic conversations)
  topics: Topic[];
  activeTopicId: string | null;
  setTopics: (topics: Topic[]) => void;
  setActiveTopicId: (id: string | null) => void;
  addTopic: (topic: Topic) => void;

  // Hover linking between YAML ↔ chat messages
  hoveredNodeId: string | null; // YAML row hovered → highlight source turn
  hoveredSlotKey: string | null; // Specific slot hovered (for character-level highlight)
  hoveredTurnIndex: number | null; // Chat message hovered → highlight YAML rows (1-based turn index)
  scrollToCenter: boolean; // true when click-triggered (scroll center), false for hover (nearest)
  setHoveredNodeId: (id: string | null, slotKey?: string | null) => void;
  setHoveredTurnIndex: (index: number | null) => void;

  // Manual edit tracking
  manualEditedNodeIds: Set<string>;

  // Commit tracking
  lastCommitHash: string | null;
  committedNodeIds: Record<string, boolean>;
  committedNodeSnapshot: Record<string, TreeNode>;
  commitBranch: string;
  projectId: string | null;
  conversationTitle: string | null;
  isCommitting: boolean;
  commitError: string | null;

  // Commit actions
  selectPendingNodes: () => TreeNode[];
  commitNodes: (message: string) => Promise<{ hash: string }>;
  setCommitBranch: (branch: string) => void;
  setProjectId: (id: string | null) => void;
  setConversationTitle: (title: string | null) => void;
  initCommitState: (projectId: string) => Promise<void>;
  clearCommitError: () => void;

  // Compression actions
  startCompress: () => Promise<void>;
  undoCompression: () => Promise<void>;
  dismissCompressBanner: () => void;
}

const emptyContent: SemanticContent = { trees: [], relations: [] };

export const useExtractionPanelStore = create<ExtractionPanelState>((set, get) => ({
  panelMode: 'collapsed',
  activeView: 'graph',
  draft: emptyContent,
  yopsLog: [],
  isExtracting: false,
  confirmedNodeIds: {},
  confirmedSlotKeys: {},
  focusIntentEnabled: false,
  llmHighlightedNodeIds: {},
  yopsHistory: [],
  removedNodes: [],
  conversationId: null,
  gateIssues: {},
  driftDetected: false,
  driftInfo: null,
  driftChoices: [],
  advisoryQuestions: [],
  topics: [],
  activeTopicId: null,
  hoveredNodeId: null,
  hoveredSlotKey: null,
  hoveredTurnIndex: null,
  scrollToCenter: false,

  // Manual edit tracking
  manualEditedNodeIds: new Set(),

  // Commit tracking defaults
  lastCommitHash: null,
  committedNodeIds: {},
  committedNodeSnapshot: {},
  commitBranch: 'main',
  projectId: null,
  conversationTitle: null,
  isCommitting: false,
  commitError: null,

  isCompressing: false,
  compressResult: null,
  showCompressBanner: false,

  setPanelMode: (mode) => set({ panelMode: mode }),
  setActiveView: (view) => set({ activeView: view }),

  togglePanel: () => {
    const current = get().panelMode;
    set({ panelMode: current === 'collapsed' ? 'default' : 'collapsed' });
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

    // Track manual edits
    if (source === 'manual') {
      const ids = new Set(get().manualEditedNodeIds);
      for (const change of batch.changes) {
        if (change.action === 'add') ids.add(change.node.key);
        else if (change.action === 'update') ids.add(change.target_path);
        else if (change.action === 'remove') ids.add(change.target_path);
      }
      set({ manualEditedNodeIds: ids });
    }

    // Persist user edits to database (LLM extraction and compression are already saved by the API)
    const convId = get().conversationId;
    if (convId && source !== 'pipeline' && source !== 'compress') {
      createYOpsEntry(convId, batch, source).catch(() => {
        // Persist failed — non-critical, store has the data
      });
    }
  },

  setDraft: (content) => {
    set({ draft: content, manualEditedNodeIds: new Set() });
  },
  resetDraft: () =>
    set({
      draft: emptyContent,
      yopsLog: [],
      removedNodes: [],
      yopsHistory: [],
      confirmedNodeIds: {},
      confirmedSlotKeys: {},
      manualEditedNodeIds: new Set(),
    }),
  setExtracting: (extracting) => set({ isExtracting: extracting }),

  confirmNode: (treeId) =>
    set((s) => ({
      confirmedNodeIds: { ...s.confirmedNodeIds, [treeId]: true },
    })),
  unconfirmNode: (treeId) =>
    set((s) => {
      const { [treeId]: _, ...rest } = s.confirmedNodeIds;
      return { confirmedNodeIds: rest };
    }),
  confirmSlot: (treeId, slotKey) =>
    set((s) => ({
      // Confirming a slot auto-confirms the parent node
      confirmedNodeIds: { ...s.confirmedNodeIds, [treeId]: true },
      confirmedSlotKeys: {
        ...s.confirmedSlotKeys,
        [treeId]: { ...s.confirmedSlotKeys[treeId], [slotKey]: true },
      },
    })),
  unconfirmSlot: (treeId, slotKey) =>
    set((s) => {
      const nodeSlots = { ...s.confirmedSlotKeys[treeId] };
      delete nodeSlots[slotKey];
      const hasRemainingSlots = Object.keys(nodeSlots).length > 0;
      return {
        confirmedSlotKeys: { ...s.confirmedSlotKeys, [treeId]: nodeSlots },
        confirmedNodeIds: hasRemainingSlots ? s.confirmedNodeIds : s.confirmedNodeIds,
      };
    }),
  setFocusIntent: (enabled) => set({ focusIntentEnabled: enabled }),
  setGateIssues: (issues) => set({ gateIssues: issues }),
  setDriftDetected: (info, choices) =>
    set({ driftDetected: true, driftInfo: info, driftChoices: choices }),
  clearDrift: () => set({ driftDetected: false, driftInfo: null, driftChoices: [] }),
  setAdvisoryQuestions: (questions) => set({ advisoryQuestions: questions }),
  setTopics: (topics) => set({ topics }),
  setActiveTopicId: (id) => set({ activeTopicId: id }),
  addTopic: (topic) => set((s) => ({ topics: [...s.topics, topic] })),
  setLlmHighlightedNodeIds: (ids) =>
    set({ llmHighlightedNodeIds: Object.fromEntries(ids.map((id) => [id, true])) }),
  hydrateYOpsLog: (entries) => set({ yopsLog: entries }),
  setConversationId: (id) => set({ conversationId: id }),
  setHoveredNodeId: (id, slotKey) => {
    if (hoverNodeTimer) clearTimeout(hoverNodeTimer);
    if (id === null) {
      // Clear immediately on mouse leave for snappy feel
      set({ hoveredNodeId: null, hoveredSlotKey: null, scrollToCenter: false });
    } else {
      hoverNodeTimer = setTimeout(() => {
        set({ hoveredNodeId: id, hoveredSlotKey: slotKey ?? null });
      }, HOVER_DEBOUNCE_MS);
    }
  },
  setHoveredTurnIndex: (index) => {
    if (hoverTurnTimer) clearTimeout(hoverTurnTimer);
    if (index === null) {
      set({ hoveredTurnIndex: null });
    } else {
      hoverTurnTimer = setTimeout(() => {
        set({ hoveredTurnIndex: index });
      }, HOVER_DEBOUNCE_MS);
    }
  },

  // Commit actions

  selectPendingNodes: () => {
    const { draft, committedNodeIds, committedNodeSnapshot } = get();
    const flatNodes = flattenTrees(draft.trees);
    return draft.trees.filter((_t, i) => {
      const node = flatNodes[i];
      if (!node) return true;
      const nodeId = node.id;
      if (!committedNodeIds[nodeId]) return true;
      const snap = committedNodeSnapshot[nodeId];
      if (!snap) return true;
      return false; // committed and unchanged
    });
  },

  commitNodes: async (message) => {
    const {
      draft,
      projectId,
      conversationId,
      conversationTitle,
      lastCommitHash,
      commitBranch,
    } = get();
    if (!projectId) throw new Error('No project ID');

    set({ isCommitting: true, commitError: null });
    try {
      const result = await createCommit(
        projectId,
        {
          trees: draft.trees,
          relations: draft.relations,
        },
        {
          parents: lastCommitHash ? [lastCommitHash] : [],
          branch: commitBranch,
          message: message || undefined,
          sources: conversationId
            ? [{ type: 'conversation', id: conversationId, title: conversationTitle ?? undefined }]
            : undefined,
          provenance: { method: 'pipeline' },
        }
      );

      const newCommittedIds: Record<string, boolean> = {};
      const newSnapshot: Record<string, TreeNode> = {};
      const flat = flattenTrees(draft.trees);
      for (const f of flat) {
        newCommittedIds[f.id] = true;
      }
      for (const t of draft.trees) {
        newSnapshot[t.key] = { ...t, slots: { ...t.slots } };
      }

      // Insert commit marker into yops log (links change history to commit)
      if (conversationId) {
        const markerEntry: YOpsLogEntry = {
          id: crypto.randomUUID(),
          source: 'commit_marker',
          yops: { changes: [] },
          created_at: new Date().toISOString(),
          commit_hash: result.commit.hash,
        };
        set((s) => ({ yopsLog: [...s.yopsLog, markerEntry] }));

        // Persist the marker to DB
        createYOpsEntry(conversationId, { changes: [] }, 'commit_marker').catch(() => {});
      }

      set({
        lastCommitHash: result.commit.hash,
        committedNodeIds: newCommittedIds,
        committedNodeSnapshot: newSnapshot,
        isCommitting: false,
        panelMode: 'default',
        manualEditedNodeIds: new Set(),
      });

      return { hash: result.commit.hash };
    } catch (err) {
      set({
        isCommitting: false,
        commitError: err instanceof Error ? err.message : 'Commit failed',
      });
      throw err;
    }
  },

  setCommitBranch: (branch) => set({ commitBranch: branch }),
  setProjectId: (id) => set({ projectId: id }),
  setConversationTitle: (title) => set({ conversationTitle: title }),
  clearCommitError: () => set({ commitError: null }),

  initCommitState: async (projectId) => {
    try {
      // Try to load the latest commit
      const recentCommits = await listCommits(projectId, 'main', 1).catch(() => []);
      if (recentCommits.length > 0) {
        const head = recentCommits[0];
        set({ lastCommitHash: head.hash });
        const trees = (head.content?.trees ?? []) as TreeNode[];
        if (trees.length > 0) {
          const flat = flattenTrees(trees);
          const ids: Record<string, boolean> = {};
          const snapshot: Record<string, TreeNode> = {};
          for (const f of flat) {
            ids[f.id] = true;
          }
          for (const t of trees) {
            snapshot[t.key] = t;
          }
          set({ committedNodeIds: ids, committedNodeSnapshot: snapshot });
        }
      }
    } catch {
      // Silent fallback — treat as no prior commits
    }
  },

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
