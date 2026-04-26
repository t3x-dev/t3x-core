import type { SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { applySourcedYOps } from '@t3x-dev/core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface WorkspaceTurn {
  turn_hash: string;
  content: string;
}

export type WorkspaceMode = 'idle' | 'streaming' | 'executed' | 'committing' | 'error';
export type SelectionSource = 'chat' | 'script' | 'before' | 'after' | null;

/**
 * Surfaced when initial replay applied some but not all persisted ops.
 * Distinct from `lastError` (which is for hard errors / extraction failures)
 * — replayWarning is non-fatal: the workspace still renders the partial
 * tree and points the user at the row to delete.
 */
export interface ReplayWarning {
  /** Index in the flat ops array of the first failing op. */
  opIndex: number;
  /** Engine error code, e.g. PATH_NOT_FOUND. */
  code: string;
  /** Human-readable engine message. */
  message: string;
  /** yops_log row id containing the failing op (for delete affordance). */
  rowId: string;
  /** Index of the failing op within its row's `yops` array. */
  opIndexInRow: number;
  /** Number of ops that applied successfully before the failure. */
  appliedCount: number;
}

interface WorkspaceState {
  // ── Conversation state ──
  conversationId: string | null;
  turns: WorkspaceTurn[];
  opsLog: SourcedYOp[];

  // ── Derived state (populated by queries/replay) ──
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;

  // ── UI state ──
  mode: WorkspaceMode;
  /**
   * Per-project workspace expansion preference (persisted).
   * Default for an unseen project is folded; flips to expanded once the user
   * opens it for that project, and stays that way across refresh / nav until
   * explicitly collapsed again.
   */
  panelExpandedByProject: Record<string, boolean>;
  /**
   * Project that the workspace is currently scoped to. Read by
   * `selectPanelExpanded` / `setPanelExpanded` to look up the per-project
   * preference. Null until a conversation has resolved its project_id.
   */
  activeProjectId: string | null;
  isCommitted: boolean;
  lastError: string | null;
  replayWarning: ReplayWarning | null;

  // ── Selection (ephemeral, cleared on refresh) ──
  selectedNodePath: string | null;
  selectedSlotKey: string | null;
  selectedTurnIndex: number | null;
  selectedSource: SelectionSource;
  scrollToCenter: boolean;

  // ── Extraction config ──
  extractionPreset: 'concise' | 'balanced' | 'detailed';
  lastExtractionPinIds: string[];

  // ── Script editor state ──
  scriptText: string;
  scriptDirty: boolean;

  // ── State setters (no business logic) ──
  setConversation: (id: string | null) => void;
  setActiveProject: (projectId: string | null) => void;
  setTurns: (turns: WorkspaceTurn[]) => void;
  setDerived: (input: {
    tree: SemanticContent;
    sourceIndex: Map<string, Source>;
    opsLog: SourcedYOp[];
  }) => void;
  setMode: (mode: WorkspaceMode) => void;
  /**
   * Sets expansion for the currently active project. No-op if no project is
   * active yet (so a brand-new chat without a resolved project never writes
   * a stray entry to the persisted map).
   */
  setPanelExpanded: (expanded: boolean) => void;
  setCommitted: (committed: boolean) => void;
  setError: (err: string | null) => void;
  setReplayWarning: (warning: ReplayWarning | null) => void;

  select: (
    source: SelectionSource,
    target: { nodePath?: string; slotKey?: string; turnIndex?: number }
  ) => void;
  clearSelection: () => void;

  setExtractionPreset: (preset: 'concise' | 'balanced' | 'detailed') => void;
  setLastExtractionPinIds: (ids: string[]) => void;

  setScriptText: (text: string) => void;
  setScriptDirty: (dirty: boolean) => void;

  // ── Draft (uncommitted extraction proposal) ──
  /**
   * The ops the LLM proposed in the most recent Extract that have NOT been
   * applied to `yops_log` yet. Lives entirely in client state — set by
   * `useExtraction` when calling `runExtraction({ commit: false })`,
   * consumed by `useScriptExecution` to gate Apply, and cleared by
   * `clearDraft()` on successful Apply or fresh hydration.
   */
  draftOps: SourcedYOp[];
  /**
   * Cheap dry-run preview: `applySourcedYOps(currentTree, draftOps)`. Lets
   * AfterPanel render what the result tree would look like *if* the user
   * clicked Apply, without persisting anything. Recomputed only on Extract;
   * a live preview that follows manual script edits is a follow-up.
   */
  draftTree: SemanticContent | null;
  /**
   * True iff there's an uncommitted draft to apply. Read by
   * `useScriptExecution.canRun` and AfterPanel's "Draft" badge.
   */
  hasDraft: boolean;
  setDraft: (input: { ops: SourcedYOp[]; tree: SemanticContent }) => void;
  clearDraft: () => void;

  // ── Draft persistence (per-conversation) ──
  /**
   * Persisted draft snapshots keyed by `conversationId`. Lets a refresh
   * (or accidental F5) preserve an in-flight Extract proposal — losing
   * 30s of LLM work to a stray reload was the data-loss case the
   * propose/apply flow's two-step model still left exposed.
   *
   * Shape note: we persist `ops` + `scriptText` + `scriptDirty` but NOT
   * `draftTree`. The preview tree is derived (`applySourcedYOps(currentTree, ops)`)
   * and the underlying `currentTree` may have moved on (a commit landed
   * in another tab) since the snapshot was written. Re-derive on
   * rehydration against the freshly hydrated tree so the preview can't
   * lie.
   */
  draftsByConversation: Record<string, PersistedDraft>;
  /**
   * Look up a persisted draft for `conversationId` and, if found, layer
   * it on top of the just-hydrated workspace state (sets draftOps,
   * derives draftTree against current tree, sets scriptText/scriptDirty,
   * flips hasDraft). Idempotent — a second call with the same id is
   * a no-op once the in-memory state already matches.
   *
   * Returns true iff a snapshot was applied.
   */
  restoreDraftFor: (conversationId: string) => boolean;

  reset: () => void;
}

export interface PersistedDraft {
  ops: SourcedYOp[];
  scriptText: string;
  scriptDirty: boolean;
}

const EMPTY_TREE: SemanticContent = { trees: [], relations: [] };

/**
 * Selector: derives the current workspace expansion flag from the active
 * project. Components subscribe via `useWorkspaceStore(selectPanelExpanded)`.
 */
export const selectPanelExpanded = (state: WorkspaceState): boolean =>
  state.activeProjectId ? Boolean(state.panelExpandedByProject[state.activeProjectId]) : false;

/**
 * State that gets cleared by `reset()` — i.e. conversation-scoped data only.
 * Note this object intentionally does NOT include `panelExpandedByProject` or
 * `activeProjectId`: zustand's `set` is a partial update, so any field absent
 * here is left untouched. That preserves the per-project expansion preference
 * and the workspace's project scope across a conversation switch.
 *
 * Do not add UI prefs to this object — anything listed here gets reset on
 * every `reset()` call.
 */
function conversationResetState() {
  return {
    conversationId: null,
    turns: [],
    opsLog: [],
    tree: EMPTY_TREE,
    sourceIndex: new Map<string, Source>(),
    mode: 'idle' as WorkspaceMode,
    isCommitted: false,
    lastError: null,
    replayWarning: null,
    selectedNodePath: null,
    selectedSlotKey: null,
    selectedTurnIndex: null,
    selectedSource: null as SelectionSource,
    scrollToCenter: false,
    extractionPreset: 'balanced' as const,
    lastExtractionPinIds: [],
    scriptText: '',
    scriptDirty: false,
    draftOps: [] as SourcedYOp[],
    draftTree: null as SemanticContent | null,
    hasDraft: false,
  };
}

/**
 * Soft cap on the number of persisted draft snapshots. The map is keyed by
 * conversationId; without a cap, a power user who clicks Extract on hundreds
 * of conversations and never explicitly Applies / Discards would accumulate
 * unbounded localStorage. 50 is generous (dozens of in-flight reviews) but
 * cheap to LRU-evict.
 *
 * Exported so the test pinning the cap can stay in lockstep with the value.
 */
export const DRAFT_PERSISTENCE_CAP = 50;

/**
 * Helper for the per-conversation draft persistence layer. Returns the next
 * map after writing or removing the entry for `convId`. Centralised so the
 * setDraft / clearDraft / setScriptText / setScriptDirty mirrors all use
 * the same write path — and so the LRU cap is enforced at exactly one
 * place.
 *
 * LRU semantics: every write re-inserts the entry at the end of the
 * iteration order, so the oldest (first) entry is always the
 * least-recently-touched one. When the map exceeds DRAFT_PERSISTENCE_CAP
 * we drop entries from the front until we're back under the cap. JS
 * objects preserve insertion order for non-numeric keys, which is what
 * this scheme depends on.
 */
function writeDraftSnapshot(
  map: Record<string, PersistedDraft>,
  convId: string | null,
  snapshot: PersistedDraft | null
): Record<string, PersistedDraft> {
  if (!convId) return map;
  if (snapshot === null) {
    if (!(convId in map)) return map;
    const next = { ...map };
    delete next[convId];
    return next;
  }

  // Re-insert at the end so a touched entry becomes "most recent".
  // Spread alone keeps an existing key in its original position, which
  // would defeat the LRU.
  const next: Record<string, PersistedDraft> = {};
  for (const [key, value] of Object.entries(map)) {
    if (key !== convId) next[key] = value;
  }
  next[convId] = snapshot;

  // Evict the oldest entries when over the cap.
  const keys = Object.keys(next);
  if (keys.length > DRAFT_PERSISTENCE_CAP) {
    const overflow = keys.length - DRAFT_PERSISTENCE_CAP;
    const trimmed: Record<string, PersistedDraft> = {};
    for (let i = overflow; i < keys.length; i++) {
      trimmed[keys[i]] = next[keys[i]];
    }
    return trimmed;
  }
  return next;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...conversationResetState(),
      panelExpandedByProject: {},
      activeProjectId: null,
      draftsByConversation: {},

      setConversation: (id) => set({ conversationId: id }),
      setActiveProject: (activeProjectId) => set({ activeProjectId }),
      setTurns: (turns) => set({ turns }),
      setDerived: ({ tree, sourceIndex, opsLog }) => set({ tree, sourceIndex, opsLog }),
      setMode: (mode) => set({ mode }),
      setPanelExpanded: (expanded) => {
        const projectId = get().activeProjectId;
        if (!projectId) return;
        set((s) => ({
          panelExpandedByProject: {
            ...s.panelExpandedByProject,
            [projectId]: expanded,
          },
        }));
      },
      setCommitted: (isCommitted) => set({ isCommitted }),
      setError: (lastError) => set({ lastError }),
      setReplayWarning: (replayWarning) => set({ replayWarning }),

      select: (source, { nodePath, slotKey, turnIndex }) =>
        set({
          selectedSource: source,
          selectedNodePath: nodePath ?? null,
          selectedSlotKey: slotKey ?? null,
          selectedTurnIndex: turnIndex ?? null,
          scrollToCenter: true,
        }),
      clearSelection: () =>
        set({
          selectedSource: null,
          selectedNodePath: null,
          selectedSlotKey: null,
          selectedTurnIndex: null,
          scrollToCenter: false,
        }),

      setExtractionPreset: (extractionPreset) => set({ extractionPreset }),
      setLastExtractionPinIds: (lastExtractionPinIds) => set({ lastExtractionPinIds }),

      setScriptText: (scriptText) => {
        const s = get();
        // Mirror to the persisted map only while a draft is staged. A
        // committed-mirror script (hasDraft=false) doesn't need
        // persistence — opsLog is the source of truth and re-syncs
        // from server on hydrate.
        if (s.hasDraft && s.conversationId) {
          set({
            scriptText,
            draftsByConversation: writeDraftSnapshot(s.draftsByConversation, s.conversationId, {
              ops: s.draftOps,
              scriptText,
              scriptDirty: s.scriptDirty,
            }),
          });
        } else {
          set({ scriptText });
        }
      },
      setScriptDirty: (scriptDirty) => {
        const s = get();
        if (s.hasDraft && s.conversationId) {
          set({
            scriptDirty,
            draftsByConversation: writeDraftSnapshot(s.draftsByConversation, s.conversationId, {
              ops: s.draftOps,
              scriptText: s.scriptText,
              scriptDirty,
            }),
          });
        } else {
          set({ scriptDirty });
        }
      },

      setDraft: ({ ops, tree }) => {
        const s = get();
        const hasDraft = ops.length > 0;
        const baseUpdate = { draftOps: ops, draftTree: tree, hasDraft };
        if (!s.conversationId) {
          set(baseUpdate);
          return;
        }
        const snapshot: PersistedDraft | null = hasDraft
          ? { ops, scriptText: s.scriptText, scriptDirty: s.scriptDirty }
          : null;
        set({
          ...baseUpdate,
          draftsByConversation: writeDraftSnapshot(
            s.draftsByConversation,
            s.conversationId,
            snapshot
          ),
        });
      },
      clearDraft: () => {
        const s = get();
        set({
          draftOps: [],
          draftTree: null,
          hasDraft: false,
          draftsByConversation: writeDraftSnapshot(s.draftsByConversation, s.conversationId, null),
        });
      },

      restoreDraftFor: (conversationId) => {
        const s = get();
        const snapshot = s.draftsByConversation[conversationId];
        if (!snapshot || snapshot.ops.length === 0) return false;

        // Re-derive the preview tree against the current (possibly
        // freshly-hydrated) committed tree. A stale persisted preview
        // tree could lie if a commit landed elsewhere since the
        // snapshot was written.
        const previewResult = applySourcedYOps(s.tree, snapshot.ops);
        const previewTree: SemanticContent = previewResult.ok
          ? { trees: previewResult.trees, relations: previewResult.relations }
          : s.tree;

        set({
          draftOps: snapshot.ops,
          draftTree: previewTree,
          hasDraft: true,
          scriptText: snapshot.scriptText,
          scriptDirty: snapshot.scriptDirty,
        });
        return true;
      },

      // Clears conversation-scoped data; keeps UI prefs (per-project expansion
      // map, active project, persisted draft snapshots) so navigation between
      // conversations doesn't yank the workspace shut and doesn't lose
      // pending drafts on other conversations.
      reset: () => set(conversationResetState()),
    }),
    {
      name: 't3x-workspace-ui',
      partialize: (state) => ({
        panelExpandedByProject: state.panelExpandedByProject,
        draftsByConversation: state.draftsByConversation,
      }),
      // Falls back to in-memory storage on the server / in tests where
      // localStorage is missing or its API surface isn't fully wired
      // (e.g. some jsdom configurations). Persistence only matters in the
      // browser; the fallback exists so the store is constructible everywhere.
      storage: createJSONStorage(() => {
        const ls =
          typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
        if (ls && typeof ls.setItem === 'function' && typeof ls.getItem === 'function') {
          return ls;
        }
        const memory = new Map<string, string>();
        return {
          getItem: (key) => memory.get(key) ?? null,
          setItem: (key, value) => {
            memory.set(key, value);
          },
          removeItem: (key) => {
            memory.delete(key);
          },
        };
      }),
    }
  )
);
