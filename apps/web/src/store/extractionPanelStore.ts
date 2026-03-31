import type {
  SemanticContent,
  TreeNode,
  YOp,
  YOpsLogEntry,
  YOpsSource,
} from '@t3x-dev/core';
import { applyYOps as coreApplyYOps, flattenTrees } from '@t3x-dev/core';
import { create } from 'zustand';
import { createCommit, listCommits } from '@/lib/api/commits';
import type { Topic } from '@/lib/api/topics';
import { createYOpsEntry } from '@/lib/api/trees';

// Debounce helper for hover interactions — prevents rapid-fire re-renders
// when mouse sweeps across YAML rows
let hoverNodeTimer: ReturnType<typeof setTimeout> | null = null;
let hoverTurnTimer: ReturnType<typeof setTimeout> | null = null;
const HOVER_DEBOUNCE_MS = 60;

type PanelMode = 'collapsed' | 'default' | 'preview';
type ActiveView = 'graph' | 'yaml';
export type ExtractionPhase = 'idle' | 'yops' | 'triage' | 'review' | 'committing';

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
  yopsHistory: YOp[][];
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

  // V6 Phase state machine
  extractionPhase: ExtractionPhase;
  pendingYOps: unknown[];
  turnsSinceLastExtract: number;

  // V6 Triage state
  acceptedNodeIds: Set<string>;
  dismissedNodeIds: Set<string>;
  nodeSourceTags: Record<string, 'user' | 'llm' | 'both'>;

  // V6 Phase transitions
  startExtraction: () => void;
  completeYOps: () => void;
  goToReview: () => void;
  goBackToTriage: () => void;
  startCommitting: () => void;
  completeCommit: () => void;
  setPendingYOps: (ops: unknown[]) => void;
  setNodeSourceTags: (tags: Record<string, 'user' | 'llm' | 'both'>) => void;

  // V6 Triage actions
  acceptNode: (key: string) => void;
  dismissNode: (key: string) => void;
  undismissNode: (key: string) => void;
  acceptAll: () => void;
  incrementTurnsSinceLastExtract: () => void;

  // V6 Extract callback
  onExtractRequested: (() => void) | null;
  setOnExtractRequested: (fn: (() => void) | null) => void;

  setPanelMode: (mode: PanelMode) => void;
  setActiveView: (view: ActiveView) => void;
  togglePanel: () => void;
  applyYOps: (ops: YOp[], source: YOpsSource, turnHash?: string) => void;
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
  hoveredFromChat: boolean; // true when hover/click originates from chat side
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
  hoveredFromChat: false,

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

  // V6 Phase state machine defaults
  extractionPhase: 'idle' as ExtractionPhase,
  pendingYOps: [],
  turnsSinceLastExtract: 0,
  acceptedNodeIds: new Set<string>(),
  dismissedNodeIds: new Set<string>(),
  nodeSourceTags: {},
  onExtractRequested: null,

  // V6 Phase transitions
  startExtraction: () =>
    set({
      // Phase stays 'idle' during extraction — switch to 'yops' only after
      // pendingYOps are set, otherwise YOpsFeed sees empty array and auto-completes
      isExtracting: true,
      pendingYOps: [],
      acceptedNodeIds: new Set(),
      dismissedNodeIds: new Set(),
      nodeSourceTags: {},
      turnsSinceLastExtract: 0,
    }),
  completeYOps: () => set({ extractionPhase: 'triage', isExtracting: false }),
  goToReview: () => set({ extractionPhase: 'review' }),
  goBackToTriage: () => set({ extractionPhase: 'triage' }),
  startCommitting: () => set({ extractionPhase: 'committing' }),
  completeCommit: () => set({ extractionPhase: 'idle' }),
  setPendingYOps: (ops) => set({ pendingYOps: ops }),
  setNodeSourceTags: (tags) => set({ nodeSourceTags: tags }),

  // V6 Triage actions
  acceptNode: (key) =>
    set((state) => {
      const accepted = new Set(state.acceptedNodeIds);
      const dismissed = new Set(state.dismissedNodeIds);
      accepted.add(key);
      dismissed.delete(key);
      return { acceptedNodeIds: accepted, dismissedNodeIds: dismissed };
    }),
  dismissNode: (key) =>
    set((state) => {
      const accepted = new Set(state.acceptedNodeIds);
      const dismissed = new Set(state.dismissedNodeIds);
      dismissed.add(key);
      accepted.delete(key);
      return { acceptedNodeIds: accepted, dismissedNodeIds: dismissed };
    }),
  undismissNode: (key) =>
    set((state) => {
      const dismissed = new Set(state.dismissedNodeIds);
      dismissed.delete(key);
      return { dismissedNodeIds: dismissed };
    }),
  acceptAll: () =>
    set((state) => {
      const accepted = new Set<string>();
      for (const tree of state.draft.trees) {
        accepted.add(tree.key);
      }
      return { acceptedNodeIds: accepted, dismissedNodeIds: new Set() };
    }),
  incrementTurnsSinceLastExtract: () =>
    set((state) => ({ turnsSinceLastExtract: state.turnsSinceLastExtract + 1 })),
  setOnExtractRequested: (fn) => set({ onExtractRequested: fn }),

  setPanelMode: (mode) => set({ panelMode: mode }),
  setActiveView: (view) => set({ activeView: view }),

  togglePanel: () => {
    const current = get().panelMode;
    set({ panelMode: current === 'collapsed' ? 'default' : 'collapsed' });
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

    // Track manual edits
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

    // Persist user edits to database
    const convId = get().conversationId;
    if (convId && source !== 'pipeline' && source !== 'compress') {
      createYOpsEntry(convId, ops, source).catch(() => {});
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
      set({
        hoveredNodeId: null,
        hoveredSlotKey: null,
        scrollToCenter: false,
        hoveredFromChat: false,
      });
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
    const { draft, projectId, conversationId, conversationTitle, lastCommitHash, commitBranch } =
      get();
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
          provenance: { method: 'llm_extraction' },
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
      // Load the latest commit on the active branch.
      // commitBranch defaults to 'main' in store state; ChatHeader.BranchSwitcher
      // updates it when the user switches. On fresh page load it will be 'main'.
      const branch = get().commitBranch || 'main';
      const recentCommits = await listCommits(projectId, branch, 1).catch(() => []);
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
