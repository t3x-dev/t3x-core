import type { Delta, DeltaLogEntry, DeltaSource, Frame, FrameChange, SemanticContent } from '@t3x-dev/core';
import { create } from 'zustand';
import type { CommitV4Sentence } from '@/lib/api/commits';
import { createCommitV4, listCommitsV4 } from '@/lib/api/commits';
import { createDelta } from '@/lib/api/frames';
import { framesToSentences } from '@/lib/framesToSentences';

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

  // Hover linking between YAML ↔ chat messages
  hoveredFrameId: string | null;      // YAML row hovered → highlight source turn
  hoveredSlotKey: string | null;      // Specific slot hovered (for character-level highlight)
  hoveredTurnHash: string | null;     // Chat message hovered → highlight YAML rows
  setHoveredFrameId: (id: string | null, slotKey?: string | null) => void;
  setHoveredTurnHash: (hash: string | null) => void;

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
  hoveredFrameId: null,
  hoveredSlotKey: null,
  hoveredTurnHash: null,

  // Commit tracking defaults
  lastCommitHash: null,
  committedFrameIds: {},
  committedFrameSnapshot: {},
  commitBranch: 'main',
  projectId: null,
  conversationTitle: null,
  isCommitting: false,
  commitError: null,

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

    // Persist user edits to database (LLM extraction is already saved by the API)
    const convId = get().conversationId;
    if (convId && source !== 'llm_extraction') {
      createDelta(convId, delta, source).catch(() => {
        // Persist failed — non-critical, store has the data
      });
    }
  },

  setDraft: (content) => set({ draft: content }),
  resetDraft: () => set({ draft: emptyContent, deltaLog: [], removedFrames: [], lastDeltaChanges: [], confirmedFrameIds: {}, confirmedSlotKeys: {} }),
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
  setHoveredTurnHash: (hash) => {
    if (hoverTurnTimer) clearTimeout(hoverTurnTimer);
    if (hash === null) {
      set({ hoveredTurnHash: null });
    } else {
      hoverTurnTimer = setTimeout(() => {
        set({ hoveredTurnHash: hash });
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
    const { draft, projectId, conversationId, conversationTitle, lastCommitHash, commitBranch, selectDeltaFrames } = get();
    if (!projectId) throw new Error('No project ID');

    set({ isCommitting: true, commitError: null });
    try {
      const deltaFrames = selectDeltaFrames();
      const deltaContent: SemanticContent = { frames: deltaFrames, relations: [] };
      const sentences = framesToSentences(deltaContent, conversationId ?? undefined) as CommitV4Sentence[];

      const result = await createCommitV4(projectId, sentences, {
        parents: lastCommitHash ? [lastCommitHash] : [],
        inherit_parent_sentences: true,
        branch: commitBranch,
        message: message || undefined,
        source_refs: conversationId
          ? [{ type: 'conversation' as const, id: conversationId, title: conversationTitle ?? undefined }]
          : undefined,
      });

      const newCommittedIds: Record<string, boolean> = {};
      const newSnapshot: Record<string, Frame> = {};
      for (const f of draft.frames) {
        newCommittedIds[f.id] = true;
        newSnapshot[f.id] = { ...f, slots: { ...f.slots } };
      }

      set({
        lastCommitHash: result.commit.hash,
        committedFrameIds: newCommittedIds,
        committedFrameSnapshot: newSnapshot,
        isCommitting: false,
        panelMode: 'default',
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
      const commits = await listCommitsV4(projectId, 'main', 1);
      if (commits.length > 0) {
        const head = commits[0];
        set({ lastCommitHash: head.hash });
        if (head.semantic?.frames) {
          const ids: Record<string, boolean> = {};
          const snapshot: Record<string, Frame> = {};
          for (const f of head.semantic.frames) {
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
}));
