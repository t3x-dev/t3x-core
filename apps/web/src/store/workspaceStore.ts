import type { ExtractionFailureCode, SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { applySourcedYOps } from '@t3x-dev/core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';

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

/**
 * Captured when an Extract attempt fails AND a usable draft was already
 * staged before the attempt. Distinct from `lastError`:
 *   - `lastError` describes the most recent error and is cleared by the
 *     next extract attempt OR by Discard. It drives the centered
 *     empty-state and the ScriptEditor banner — surfaces that only make
 *     sense when there's no rendered draft tree.
 *   - `retainedDraftFailure` describes "the new attempt failed but your
 *     previous draft is still applicable". It rides alongside
 *     `hasDraft = true` so AfterPanel can label the rendered tree as a
 *     retained previous draft and surface the failure as a persistent
 *     header row, and so the Apply button tooltip can read
 *     "Apply previous draft" instead of pretending the latest attempt
 *     succeeded.
 *
 * Cleared by: a successful Extract (overwrites the draft), Discard,
 * a successful Apply (the draft has been committed), conversation
 * `reset()`, and the start of any new Extract attempt. NOT cleared by
 * an Apply failure — the previous draft is still applicable.
 */
/**
 * Web-side failure-reason taxonomy for `ExtractionFailedError`. Mirrors
 * the union declared in `@/commands/yops/errors.ts`; redeclared here so
 * the store doesn't take a structural dependency on the command-layer
 * error class. Keep in sync with that file.
 */
export type ExtractionFailureReason =
  | 'missing_source'
  | 'unverifiable_quote'
  | 'invalid_structure'
  | 'exhausted_retries'
  | 'llm_error';

export interface RetainedDraftFailure {
  /** User-facing failure message — same string we'd put on a toast. */
  message: string;
  /** ISO-8601 timestamp the failure was recorded; useful for "stale" badges. */
  at: string;
  /**
   * Web-side reason category from `ExtractionFailedError.reason`. Lets a
   * future affordance branch on the *kind* of failure (e.g. "click to
   * see the failing slot" only for `unverifiable_quote`) without
   * regex-parsing `message`. Undefined when the failure didn't come
   * from `ExtractionFailedError` (transport / unexpected throw).
   */
  reason?: ExtractionFailureReason;
  /**
   * Wire-level failure code from `ExtractionFailureCode` (e.g.
   * `unverifiable_quote`, `compile`, `draft_parse`, `transport`).
   * Independent from `reason`: `reason` is a small UI-facing taxonomy,
   * `failureCode` is the typed wire code we forwarded from the API.
   * Carrying both keeps server-side diagnostic info available without
   * recomputing on the client.
   */
  failureCode?: ExtractionFailureCode;
  /**
   * Provider id at the time of the failed attempt. Optional because
   * provider resolution is async and the catch block may run before a
   * resolved provider/model is known.
   */
  provider?: string;
  /** Model id at the time of the failed attempt. */
  model?: string;
  /** Extraction preset used for the failed attempt. */
  preset?: 'concise' | 'balanced' | 'detailed';
}

interface WorkspaceState {
  // ── Conversation state ──
  conversationId: string | null;
  turns: WorkspaceTurn[];
  opsLog: SourcedYOp[];

  // ── Derived state (populated by queries/replay) ──
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;
  /**
   * Parent commit used as the replay baseline for this conversation.
   * Null means this conversation starts from an empty baseline.
   */
  baselineCommitHash: string | null;
  /**
   * True when this conversation has applied semantic changes of its own
   * (persisted yops_log rows or an already-created commit). False with a
   * parent baseline means the visible tree is inherited, not new work.
   */
  hasConversationChanges: boolean;

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
  /**
   * Ephemeral expand-intent captured BEFORE `activeProjectId` resolves.
   * On a direct `/chat/:conversationId` load the project id is fetched
   * asynchronously from the conversation meta, so a click on the
   * collapsed Workspace strip in that window used to be silently
   * dropped (`setPanelExpanded` early-returned). Now the intent is
   * stored here; `setActiveProject` promotes it onto
   * `panelExpandedByProject[projectId]` once a project becomes
   * available, and clears it.
   *
   * NOT persisted (deliberately omitted from `partialize`) — re-running
   * the same async race after a refresh shouldn't re-fire a stale
   * click. NOT cleared by `reset()` either: the chatInit effect
   * re-fires when `resolvedProjectId` changes and re-invokes `reset`,
   * and clearing pending there would lose the click that triggered
   * the very expansion we're trying to apply.
   */
  pendingPanelExpanded: boolean | null;
  isCommitted: boolean;
  lastError: string | null;
  /**
   * Set when an Extract attempt fails on top of an already-staged draft;
   * see `RetainedDraftFailure`. Used by AfterPanel + WorkspaceTopbar
   * to disambiguate "Apply applies the new attempt" from "Apply applies
   * the previous draft because the new attempt failed".
   */
  retainedDraftFailure: RetainedDraftFailure | null;
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
    baselineCommitHash?: string | null;
    hasConversationChanges?: boolean;
  }) => void;
  setMode: (mode: WorkspaceMode) => void;
  /**
   * User-intent expansion setter. When a project is active, writes
   * directly to `panelExpandedByProject[activeProjectId]`. When no
   * project is resolved yet (cold-load race), captures the intent in
   * `pendingPanelExpanded` so it can be promoted by the next
   * `setActiveProject` call. Either way the click is no longer lost.
   */
  setPanelExpanded: (expanded: boolean) => void;
  /**
   * Direct writer used by hydrate-time auto-expand and by tests that
   * want to seed the map without going through the user-intent path.
   * Bypasses the active-project lookup so callers can target a
   * specific project explicitly.
   */
  setProjectPanelExpansion: (projectId: string, expanded: boolean) => void;
  setCommitted: (committed: boolean) => void;
  setError: (err: string | null) => void;
  /**
   * Set/clear the retained-draft failure marker. Pass `null` to clear.
   * Distinct from `setError` because the two surfaces are intentionally
   * non-overlapping: when a new Extract attempt fails on top of an
   * existing draft, we set `retainedDraftFailure` (not `lastError`)
   * so AfterPanel shows the rich "Previous draft retained — last
   * extract failed" treatment instead of the empty-state error.
   */
  setRetainedDraftFailure: (failure: RetainedDraftFailure | null) => void;
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

export const selectIsInheritedBaselineOnly = (state: WorkspaceState): boolean =>
  Boolean(
    state.baselineCommitHash &&
      !state.isCommitted &&
      !state.hasConversationChanges &&
      !state.hasDraft &&
      (state.tree.trees.length > 0 || state.tree.relations.length > 0)
  );

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
    baselineCommitHash: null,
    hasConversationChanges: false,
    mode: 'idle' as WorkspaceMode,
    isCommitted: false,
    lastError: null,
    retainedDraftFailure: null as RetainedDraftFailure | null,
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
      pendingPanelExpanded: null,
      draftsByConversation: {},

      setConversation: (id) => {
        const prev = get().conversationId;
        // Cross-conversation guard: a pending expand intent captured
        // for one conversation must not bleed into another. The guard
        // fires when `prev` is a real conversation and `id` differs
        // from it (including transitions to null — leaving conv_A IS
        // a binding event, the user has moved on, and a click captured
        // for conv_A's project shouldn't leak through /chat/new onto
        // whichever project the next chat resolves to).
        //
        // Two transitions deliberately preserve pending:
        //   1. null → conv_A: the collapsed Workspace strip can mount
        //      before useChatInit's effect lands the conversation id,
        //      so a click captured during that window must survive
        //      the first non-null setConversation.
        //   2. conv_A → conv_A (same id): chatInit re-fires its effect
        //      when resolvedProjectId changes and re-invokes
        //      setConversation with the same id; that's not a real
        //      cross-conversation move.
        if (prev !== null && id !== prev && get().pendingPanelExpanded !== null) {
          set({ conversationId: id, pendingPanelExpanded: null });
          return;
        }
        set({ conversationId: id });
      },
      setActiveProject: (activeProjectId) => {
        const pending = get().pendingPanelExpanded;
        if (activeProjectId && pending !== null) {
          // Promote the captured intent: write to the per-project map
          // and clear pending in the same set so a subsequent re-render
          // can't observe a half-applied state.
          set((s) => ({
            activeProjectId,
            panelExpandedByProject: {
              ...s.panelExpandedByProject,
              [activeProjectId]: pending,
            },
            pendingPanelExpanded: null,
          }));
          return;
        }
        set({ activeProjectId });
      },
      setTurns: (turns) => set({ turns }),
      setDerived: ({ tree, sourceIndex, opsLog, baselineCommitHash, hasConversationChanges }) =>
        set((s) => ({
          tree,
          sourceIndex,
          opsLog,
          baselineCommitHash:
            baselineCommitHash === undefined ? s.baselineCommitHash : baselineCommitHash,
          hasConversationChanges: hasConversationChanges ?? opsLog.length > 0,
        })),
      setMode: (mode) => set({ mode }),
      setPanelExpanded: (expanded) => {
        const projectId = get().activeProjectId;
        if (!projectId) {
          // No project yet — capture as pending. setActiveProject will
          // promote it once a project resolves. This used to silently
          // early-return, dropping the click on cold-loaded chat URLs
          // where the project id backfills async from conversation meta.
          set({ pendingPanelExpanded: expanded });
          return;
        }
        set((s) => ({
          panelExpandedByProject: {
            ...s.panelExpandedByProject,
            [projectId]: expanded,
          },
        }));
      },
      setProjectPanelExpansion: (projectId, expanded) => {
        set((s) => ({
          panelExpandedByProject: {
            ...s.panelExpandedByProject,
            [projectId]: expanded,
          },
        }));
      },
      setCommitted: (isCommitted) => set({ isCommitted }),
      setError: (lastError) => set({ lastError }),
      setRetainedDraftFailure: (retainedDraftFailure) => set({ retainedDraftFailure }),
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
        // A successful new draft always retires any retained-failure
        // marker — the staged tree IS the new attempt, so the AfterPanel
        // header should flip back to "Draft preview" and the Apply
        // tooltip should stop saying "previous draft".
        const baseUpdate = {
          draftOps: ops,
          draftTree: tree,
          hasDraft,
          retainedDraftFailure: null as RetainedDraftFailure | null,
        };
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
        // Discard, successful Apply, and any other "throw away the
        // proposal" path call clearDraft. Either branch invalidates a
        // retained-failure marker: if we had one, it referred to the
        // draft that's now gone.
        set({
          draftOps: [],
          draftTree: null,
          hasDraft: false,
          retainedDraftFailure: null,
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

        // Defensive scriptText derivation: a persisted snapshot with
        // ops but an empty scriptText is structurally inconsistent —
        // restoring `scriptText: ''` against `hasDraft: true` would
        // leave the editor blank while AfterPanel renders the draft
        // preview, and the committed-mirror gate in useScriptExecution
        // would not fire because hasDraft is true. Treat empty
        // scriptText as a missing mirror and reconstruct it from ops.
        //
        // When we derive scriptText, the persisted scriptDirty flag is
        // stale too: there is no actual user edit to mark, the
        // canonical YAML mirror is what's now in the editor. Restoring
        // `scriptDirty: true` against a derived script would surface
        // an overwrite-confirm prompt on the next re-extract for
        // content the user never typed. The dirty flag is preserved
        // verbatim ONLY on the preserve-real-edit branch.
        const persistedScriptIsEmpty = snapshot.scriptText.trim() === '';
        const restoredScriptText = persistedScriptIsEmpty
          ? serializeOpsToYaml(snapshot.ops)
          : snapshot.scriptText;
        const restoredScriptDirty = persistedScriptIsEmpty ? false : snapshot.scriptDirty;

        set({
          draftOps: snapshot.ops,
          draftTree: previewTree,
          hasDraft: true,
          scriptText: restoredScriptText,
          scriptDirty: restoredScriptDirty,
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
