import type {
  Delta,
  DeltaLogEntry,
  DeltaSource,
  Frame,
  FrameChange,
  SemanticContent,
} from '@t3x-dev/core';
import { create } from 'zustand';
import { createCommit, listCommits } from '@/lib/api/commits';
import { createDelta } from '@/lib/api/frames';
import type { Topic } from '@/lib/api/topics';

// Debounce helper for hover interactions — prevents rapid-fire re-renders
// when mouse sweeps across YAML rows
let hoverFrameTimer: ReturnType<typeof setTimeout> | null = null;
let hoverTurnTimer: ReturnType<typeof setTimeout> | null = null;
const HOVER_DEBOUNCE_MS = 60;

type PanelMode = 'collapsed' | 'default' | 'preview';
type ActiveView = 'graph' | 'yaml';

interface ExtractionPanelState {
  panelMode: PanelMode;
  activeView: ActiveView;
  draft: SemanticContent;
  deltaLog: DeltaLogEntry[];
  isExtracting: boolean;
  confirmedFrameIds: Record<string, boolean>;
  confirmedSlotKeys: Record<string, Record<string, boolean>>; // frameId → { slotKey: true }
  focusIntentEnabled: boolean;
  llmHighlightedFrameIds: Record<string, boolean>;
  lastDeltaChanges: FrameChange[];
  removedFrames: Frame[];

  // Compression
  isCompressing: boolean;
  compressResult: {
    summary: string;
    framesBefore: number;
    framesAfter: number;
    mergedCount: number;
    removedCount: number;
    removedFrameIds: string[];
    deltaLogId: string;
  } | null;
  showCompressBanner: boolean;

  setPanelMode: (mode: PanelMode) => void;
  setActiveView: (view: ActiveView) => void;
  togglePanel: () => void;
  applyDelta: (delta: Delta, source: DeltaSource, turnHash?: string) => void;
  setDraft: (content: SemanticContent) => void;
  resetDraft: () => void;
  setExtracting: (extracting: boolean) => void;
  confirmFrame: (frameId: string) => void;
  unconfirmFrame: (frameId: string) => void;
  confirmSlot: (frameId: string, slotKey: string) => void;
  unconfirmSlot: (frameId: string, slotKey: string) => void;
  setFocusIntent: (enabled: boolean) => void;
  setLlmHighlightedFrameIds: (ids: string[]) => void;
  hydrateDeltaLog: (entries: DeltaLogEntry[]) => void;
  conversationId: string | null;
  setConversationId: (id: string | null) => void;

  // Gate result (Step 5 — frame quality annotation)
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
    frameId: string;
    slotKey?: string;
    question: string;
    currentValue?: unknown;
  }>;
  setAdvisoryQuestions: (
    questions: Array<{
      id: string;
      type: string;
      frameId: string;
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
  hoveredFrameId: string | null; // YAML row hovered → highlight source turn
  hoveredSlotKey: string | null; // Specific slot hovered (for character-level highlight)
  hoveredTurnHash: string | null; // Chat message hovered → highlight YAML rows
  hoveredCharOffset: number | null; // Character offset within hovered turn (for slot-level reverse highlight)
  setHoveredFrameId: (id: string | null, slotKey?: string | null) => void;
  setHoveredTurn: (hash: string | null, charOffset?: number | null) => void;

  // Manual edit tracking
  manualEditedFrameIds: Set<string>;

  // Commit tracking
  lastCommitHash: string | null;
  committedFrameIds: Record<string, boolean>;
  committedFrameSnapshot: Record<string, Frame>;
  commitBranch: string;
  projectId: string | null;
  conversationTitle: string | null;
  isCommitting: boolean;
  commitError: string | null;

  // Commit actions
  selectDeltaFrames: () => Frame[];
  commitFrames: (message: string) => Promise<{ hash: string }>;
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

const emptyContent: SemanticContent = { frames: [], relations: [] };

export const useExtractionPanelStore = create<ExtractionPanelState>((set, get) => ({
  panelMode: 'collapsed',
  activeView: 'graph',
  draft: emptyContent,
  deltaLog: [],
  isExtracting: false,
  confirmedFrameIds: {},
  confirmedSlotKeys: {},
  focusIntentEnabled: false,
  llmHighlightedFrameIds: {},
  lastDeltaChanges: [],
  removedFrames: [],
  conversationId: null,
  gateIssues: {},
  driftDetected: false,
  driftInfo: null,
  driftChoices: [],
  advisoryQuestions: [],
  topics: [],
  activeTopicId: null,
  hoveredFrameId: null,
  hoveredSlotKey: null,
  hoveredTurnHash: null,
  hoveredCharOffset: null,

  // Manual edit tracking
  manualEditedFrameIds: new Set(),

  // Commit tracking defaults
  lastCommitHash: null,
  committedFrameIds: {},
  committedFrameSnapshot: {},
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

  applyDelta: (delta, source, turnHash) => {
    const { draft, deltaLog } = get();
    let frames = [...draft.frames];
    let relations = [...draft.relations];

    for (const change of delta.changes) {
      switch (change.action) {
        case 'add':
          frames.push(change.frame);
          break;
        case 'update': {
          frames = frames.map((f) => {
            if (f.id !== change.target) return f;
            const merged = { ...f.slots };
            for (const [k, v] of Object.entries(change.slots)) {
              if (v === null) delete merged[k];
              else merged[k] = v;
            }
            return { ...f, slots: merged };
          });
          break;
        }
        case 'remove': {
          const removed = frames.find((f) => f.id === change.target);
          if (removed) {
            set((s) => ({ removedFrames: [...s.removedFrames, removed] }));
          }
          frames = frames.filter((f) => f.id !== change.target);
          // Auto-clean orphaned relations (match core applyDelta behavior)
          const removedId = change.target;
          relations = relations.filter((r) => r.from !== removedId && r.to !== removedId);
          break;
        }
      }
    }

    if (delta.new_relations) {
      relations = [...relations, ...delta.new_relations];
    }
    if (delta.remove_relations) {
      relations = relations.filter(
        (r) =>
          !delta.remove_relations!.some(
            (rr) => rr.from === r.from && rr.to === r.to && rr.type === r.type
          )
      );
    }

    const entry: DeltaLogEntry = {
      id: crypto.randomUUID(),
      delta,
      source,
      created_at: new Date().toISOString(),
      turn_hash: turnHash,
    };

    set({
      draft: { frames, relations },
      deltaLog: [...deltaLog, entry],
      lastDeltaChanges: delta.changes,
    });

    // Track manual edits
    if (source === 'manual') {
      const ids = new Set(get().manualEditedFrameIds);
      for (const change of delta.changes) {
        if (change.action === 'add') ids.add(change.frame.id);
        else if (change.action === 'update') ids.add(change.target);
      }
      set({ manualEditedFrameIds: ids });
    }

    // Persist user edits to database (LLM extraction and compression are already saved by the API)
    const convId = get().conversationId;
    if (convId && source !== 'pipeline' && source !== 'compress') {
      createDelta(convId, delta, source).catch(() => {
        // Persist failed — non-critical, store has the data
      });
    }
  },

  setDraft: (content) => {
    // Extract manual-edited frame IDs from server response
    const manualIds = new Set<string>();
    for (const f of content.frames) {
      if (f.manual_edited) manualIds.add(f.id);
    }
    set({ draft: content, manualEditedFrameIds: manualIds });
  },
  resetDraft: () =>
    set({
      draft: emptyContent,
      deltaLog: [],
      removedFrames: [],
      lastDeltaChanges: [],
      confirmedFrameIds: {},
      confirmedSlotKeys: {},
      manualEditedFrameIds: new Set(),
    }),
  setExtracting: (extracting) => set({ isExtracting: extracting }),

  confirmFrame: (frameId) =>
    set((s) => ({
      confirmedFrameIds: { ...s.confirmedFrameIds, [frameId]: true },
    })),
  unconfirmFrame: (frameId) =>
    set((s) => {
      const { [frameId]: _, ...rest } = s.confirmedFrameIds;
      return { confirmedFrameIds: rest };
    }),
  confirmSlot: (frameId, slotKey) =>
    set((s) => ({
      // Confirming a slot auto-confirms the parent frame
      confirmedFrameIds: { ...s.confirmedFrameIds, [frameId]: true },
      confirmedSlotKeys: {
        ...s.confirmedSlotKeys,
        [frameId]: { ...s.confirmedSlotKeys[frameId], [slotKey]: true },
      },
    })),
  unconfirmSlot: (frameId, slotKey) =>
    set((s) => {
      const frameSlots = { ...s.confirmedSlotKeys[frameId] };
      delete frameSlots[slotKey];
      const hasRemainingSlots = Object.keys(frameSlots).length > 0;
      return {
        confirmedSlotKeys: { ...s.confirmedSlotKeys, [frameId]: frameSlots },
        // If no slots confirmed and frame wasn't explicitly confirmed, unconfirm frame too
        confirmedFrameIds: hasRemainingSlots ? s.confirmedFrameIds : s.confirmedFrameIds,
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
  setLlmHighlightedFrameIds: (ids) =>
    set({ llmHighlightedFrameIds: Object.fromEntries(ids.map((id) => [id, true])) }),
  hydrateDeltaLog: (entries) => set({ deltaLog: entries }),
  setConversationId: (id) => set({ conversationId: id }),
  setHoveredFrameId: (id, slotKey) => {
    if (hoverFrameTimer) clearTimeout(hoverFrameTimer);
    if (id === null) {
      // Clear immediately on mouse leave for snappy feel
      set({ hoveredFrameId: null, hoveredSlotKey: null });
    } else {
      hoverFrameTimer = setTimeout(() => {
        set({ hoveredFrameId: id, hoveredSlotKey: slotKey ?? null });
      }, HOVER_DEBOUNCE_MS);
    }
  },
  setHoveredTurn: (hash, charOffset) => {
    if (hoverTurnTimer) clearTimeout(hoverTurnTimer);
    if (hash === null) {
      set({ hoveredTurnHash: null, hoveredCharOffset: null });
    } else {
      hoverTurnTimer = setTimeout(() => {
        set({ hoveredTurnHash: hash, hoveredCharOffset: charOffset ?? null });
      }, HOVER_DEBOUNCE_MS);
    }
  },

  // Commit actions

  selectDeltaFrames: () => {
    const { draft, committedFrameIds, committedFrameSnapshot } = get();
    return draft.frames.filter((f) => {
      if (!committedFrameIds[f.id]) return true;
      const snap = committedFrameSnapshot[f.id];
      if (!snap) return true;
      const sortedStringify = (obj: unknown) =>
        JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
      return sortedStringify(f.slots) !== sortedStringify(snap.slots);
    });
  },

  commitFrames: async (message) => {
    const {
      draft,
      projectId,
      conversationId,
      conversationTitle,
      lastCommitHash,
      commitBranch,
      selectDeltaFrames,
    } = get();
    if (!projectId) throw new Error('No project ID');

    set({ isCommitting: true, commitError: null });
    try {
      const deltaFrames = selectDeltaFrames();
      const cleanFrames = deltaFrames.map(({ slot_sources: _, source: __, ...f }) => f);

      const result = await createCommit(
        projectId,
        {
          frames: cleanFrames,
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
      const newSnapshot: Record<string, Frame> = {};
      for (const f of draft.frames) {
        newCommittedIds[f.id] = true;
        newSnapshot[f.id] = { ...f, slots: { ...f.slots } };
      }

      // Insert commit marker into delta log (links change history to commit)
      if (conversationId) {
        const markerEntry: DeltaLogEntry = {
          id: crypto.randomUUID(),
          source: 'commit_marker',
          delta: { changes: [] },
          created_at: new Date().toISOString(),
          commit_hash: result.commit.hash,
        };
        set((s) => ({ deltaLog: [...s.deltaLog, markerEntry] }));

        // Persist the marker to DB
        createDelta(conversationId, { changes: [] }, 'commit_marker').catch(() => {});
      }

      set({
        lastCommitHash: result.commit.hash,
        committedFrameIds: newCommittedIds,
        committedFrameSnapshot: newSnapshot,
        isCommitting: false,
        panelMode: 'default',
        manualEditedFrameIds: new Set(),
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
        const frames = (head.content?.frames ?? []) as Frame[];
        if (frames.length > 0) {
          const ids: Record<string, boolean> = {};
          const snapshot: Record<string, Frame> = {};
          for (const f of frames) {
            ids[f.id] = true;
            snapshot[f.id] = f;
          }
          set({ committedFrameIds: ids, committedFrameSnapshot: snapshot });
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
      const { compressFrames } = await import('@/lib/api/frames');
      const result = await compressFrames(convId);

      if (result.delta.changes.length === 0) {
        set({ isCompressing: false });
        return;
      }

      // Apply the compress delta locally
      get().applyDelta(result.delta, 'compress');

      // Patch the client-generated ID with the server's actual delta_log_id
      // (applyDelta uses crypto.randomUUID(), but undo needs the real server ID)
      set((s) => {
        const log = [...s.deltaLog];
        const last = log[log.length - 1];
        if (last && last.source === 'compress') {
          log[log.length - 1] = { ...last, id: result.delta_log_id };
        }
        return { deltaLog: log };
      });

      set({
        isCompressing: false,
        compressResult: {
          summary: result.metadata.compress_summary,
          framesBefore: result.metadata.frames_before,
          framesAfter: result.metadata.frames_after,
          mergedCount: result.metadata.merged_count,
          removedCount: result.metadata.removed_count,
          removedFrameIds: result.metadata.removed_frame_ids,
          deltaLogId: result.delta_log_id,
        },
        showCompressBanner: true,
      });
    } catch {
      set({ isCompressing: false });
    }
  },

  undoCompression: async () => {
    const { deltaLog, conversationId } = get();
    const compressDelta = [...deltaLog].reverse().find((d) => d.source === 'compress');
    if (!compressDelta || !conversationId) return;

    try {
      const { deleteDelta, getSemanticDraft } = await import('@/lib/api/frames');
      await deleteDelta(conversationId, compressDelta.id);

      // Rebuild from server (most reliable)
      const newDraft = await getSemanticDraft(conversationId);
      const newLog = deltaLog.filter((d) => d.id !== compressDelta.id);

      set({
        draft: newDraft,
        deltaLog: newLog,
        compressResult: null,
        showCompressBanner: false,
      });
    } catch {
      // Undo failed — non-critical
    }
  },

  dismissCompressBanner: () => set({ showCompressBanner: false }),
}));
