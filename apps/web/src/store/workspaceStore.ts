import type { ExtractionFailureCode, SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { applySourcedYOps } from '@t3x-dev/core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { reconcileOpOrigins, type YOpsOpOrigin, type YOpsRowMeta } from '@/domain/yops/rowMeta';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';

export interface WorkspaceTurn {
  turn_hash: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
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
  rowsById: Record<string, YOpsRowMeta>;
  opOrigins: YOpsOpOrigin[];

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
  /**
   * Cached preset variants from the most recent Extract. The pipeline
   * computes all three presets in one LLM round (see core
   * `buildPresetVariants`), the API ships them in `ExtractionOutcome.variants`,
   * and we keep them here so the chip can swap the displayed proposal
   * without a re-extract. Memory-only: not persisted to localStorage —
   * after a refresh the variants are gone, but the active draft survives,
   * and the next Extract repopulates them. Sparse on purpose: a partial
   * outcome may carry only a subset, and a non-preset extraction carries
   * none. Keys: 'concise' | 'balanced' | 'detailed'.
   */
  draftVariants: Partial<Record<'concise' | 'balanced' | 'detailed', SourcedYOp[]>> | null;

  // ── Script editor state ──
  /**
   * The user's manual override of the canonical YAML mirror.
   *
   * - `null`: no override. The editor renders `serializeOpsToYaml(draftOps)`,
   *   read via the `selectScriptText` selector. `selectScriptDirty` returns
   *   false because there is nothing to preserve.
   * - `string`: the user typed in the editor. The selector returns this
   *   verbatim and `selectScriptDirty` returns true. Apply parses this
   *   string. Subsequent preset chip clicks will NOT swap `draftOps` — the
   *   override is treated as the source of truth until the user explicitly
   *   reverts (Discard, successful Apply, or `clearEditorOverride()`).
   *
   * This replaces the previous `scriptText` + `scriptDirty` field pair. The
   * pair could drift (one updated without the other) — see PRs #952/#953/#955
   * for the bug class. Routing all reads through selectors of this single
   * nullable field makes drift impossible: there is nothing to keep in sync.
   */
  editorOverride: string | null;

  // ── State setters (no business logic) ──
  setConversation: (id: string | null) => void;
  setActiveProject: (projectId: string | null) => void;
  setTurns: (turns: WorkspaceTurn[]) => void;
  setDerived: (input: {
    tree: SemanticContent;
    sourceIndex: Map<string, Source>;
    opsLog: SourcedYOp[];
    rowsById?: Record<string, YOpsRowMeta>;
    opOrigins?: YOpsOpOrigin[];
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

  /**
   * The user typed in the editor. Sets `editorOverride` to the typed text;
   * `selectScriptDirty` flips to true; preset-swap is then guarded.
   * Clearing back to the canonical mirror is `clearEditorOverride()`.
   */
  setEditorOverride: (text: string) => void;
  /** Revert to the canonical YAML mirror of `draftOps`. */
  clearEditorOverride: () => void;

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
  setDraft: (input: {
    ops: SourcedYOp[];
    tree: SemanticContent;
    variants?: Partial<Record<'concise' | 'balanced' | 'detailed', SourcedYOp[]>>;
  }) => void;
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
  /**
   * Manual override of the canonical YAML mirror. `null` (or absent) means
   * the user hadn't typed anything — restore from canonical. A string means
   * the user had a manual edit in flight; restore preserves it verbatim.
   */
  editorOverride: string | null;
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
 * The text the editor renders and Apply parses. Always defined.
 *
 * Resolution order:
 *   1. `editorOverride` — the user typed something. Wins over everything.
 *   2. `serializeOpsToYaml(draftOps)` — a draft is staged; show the canonical
 *      YAML mirror so the editor agrees with AfterPanel's preview.
 *   3. `serializeOpsToYaml(opsLog)` — no draft; show the committed ledger
 *      so the editor isn't blank when there's applied history. This
 *      replaces the `useScriptExecution` committed-mirror useEffect that
 *      previously kept `scriptText` in sync via setScriptText / setDirty
 *      writes — derivation makes the effect unnecessary.
 *   4. `''` — empty conversation, no draft, no committed ops.
 *
 * Consumers must read via this selector — never `state.scriptText`
 * (no longer a field). The boundary test enforces no direct write to
 * a `scriptText` field exists in this file.
 */
export const selectScriptText = (state: WorkspaceState): string => {
  if (state.editorOverride !== null) return state.editorOverride;
  if (state.draftOps.length > 0) return serializeOpsToYaml(state.draftOps);
  if (state.opsLog.length > 0) return serializeOpsToYaml(state.opsLog);
  return '';
};

/**
 * True when the user has typed an override that diverges from the canonical
 * YAML mirror. Equivalent to `editorOverride !== null`. By construction, when
 * `selectScriptDirty` is false, `selectScriptText === serializeOpsToYaml(draftOps)`
 * — drift is structurally impossible.
 */
export const selectScriptDirty = (state: WorkspaceState): boolean => state.editorOverride !== null;

export const selectActiveUncommittedRowCount = (state: WorkspaceState): number => {
  const referencedRowIds = new Set<string>();
  let hasUnknownOrigin = false;
  for (const origin of state.opOrigins) {
    if (!origin.rowId || !state.rowsById[origin.rowId]) {
      hasUnknownOrigin = true;
    } else {
      referencedRowIds.add(origin.rowId);
    }
  }

  let activeRows = 0;
  for (const rowId of referencedRowIds) {
    const row = state.rowsById[rowId];
    if (!row.isCommitted && !row.supersededAt) activeRows++;
  }

  return activeRows + (hasUnknownOrigin ? 1 : 0);
};

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
    rowsById: {},
    opOrigins: [],
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
    editorOverride: null as string | null,
    draftOps: [] as SourcedYOp[],
    draftTree: null as SemanticContent | null,
    hasDraft: false,
    draftVariants: null as Partial<
      Record<'concise' | 'balanced' | 'detailed', SourcedYOp[]>
    > | null,
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
/**
 * Single private writer for the draft-proposal mirror state.
 *
 * Six fields describe the same logical thing — the user's current
 * uncommitted proposal — but are read by different surfaces:
 *
 *   draftOps              → AfterPanel render
 *   draftTree             → AfterPanel preview
 *   draftVariants         → chip swap (cached preset variants)
 *   scriptText            → Apply commits THIS
 *   scriptDirty           → "is the editor source of truth?"
 *   draftsByConversation  → refresh restore
 *
 * Any caller that writes one without the others can put AfterPanel and
 * Apply out of sync (PR #952's P1 was exactly this). To make drift
 * impossible-by-construction rather than convention-by-review, ALL
 * proposal mutations route through this function. The boundary test
 * (`workspaceStore-proposal-boundary.test.ts`) AST-scans this file and
 * fails CI if any of those six fields is written outside the whitelist.
 *
 * Whitelist for the structural fields (draftOps / draftTree /
 * draftVariants): only this function, `clearDraft`, `restoreDraftFor`,
 * and `conversationResetState`. `setScriptText` / `setScriptDirty` are
 * allowed to touch their own field plus the snapshot, but NOT the
 * structural triple. The boundary test enforces per-field, not per-
 * function.
 *
 * Returns a Partial<WorkspaceState> rather than calling set() directly
 * so callers can compose it with their own writes (e.g.
 * setExtractionPreset also writes `extractionPreset` alongside the
 * proposal swap).
 */
function writeDraftProposal(
  s: WorkspaceState,
  next: {
    ops: SourcedYOp[];
    tree: SemanticContent | null;
    variants: Partial<Record<'concise' | 'balanced' | 'detailed', SourcedYOp[]>> | null;
    // `override` is the manual editor text. `null` = no override, the
    // editor renders the canonical YAML mirror via `selectScriptText`.
    // A string = the user typed in the editor and the override should
    // be preserved through this write. Intentionally a different name
    // than the state field (`editorOverride`) so the boundary test can
    // distinguish "passing a value to the writer" from "writing state".
    override: string | null;
  }
): Partial<WorkspaceState> {
  const hasDraft = next.ops.length > 0;
  const baseUpdate: Partial<WorkspaceState> = {
    draftOps: next.ops,
    draftTree: next.tree,
    draftVariants: hasDraft ? next.variants : null,
    editorOverride: next.override,
    hasDraft,
    retainedDraftFailure: null,
  };
  if (!s.conversationId) return baseUpdate;
  const snapshot: PersistedDraft | null = hasDraft
    ? { ops: next.ops, editorOverride: next.override }
    : null;
  return {
    ...baseUpdate,
    draftsByConversation: writeDraftSnapshot(s.draftsByConversation, s.conversationId, snapshot),
  };
}

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
      setDerived: ({
        tree,
        sourceIndex,
        opsLog,
        rowsById,
        opOrigins,
        baselineCommitHash,
        hasConversationChanges,
      }) =>
        set((s) => ({
          tree,
          sourceIndex,
          opsLog,
          rowsById: rowsById ?? s.rowsById,
          opOrigins: opOrigins ?? reconcileOpOrigins(s.opOrigins, s.opsLog, opsLog),
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

      setExtractionPreset: (extractionPreset) => {
        // Live-swap path: when the most recent Extract returned variants
        // for all three presets, the chip click acts as a view-mode
        // switch — replace the displayed ops with the cached variant
        // and re-derive the preview tree against the current committed
        // tree. Avoids a redundant LLM round-trip when the user just
        // wants to see the same conversation extracted at a different
        // density.
        //
        // Fallback path: when no cached variant exists for the picked
        // preset (no extraction yet, partial outcome that didn't ship
        // all three, post-refresh memory loss), behave like the legacy
        // setter — only set the preset; the next Extract picks it up.
        const s = get();
        const cached = s.draftVariants?.[extractionPreset];
        if (!cached || !s.hasDraft) {
          set({ extractionPreset });
          return;
        }
        // Hand-edited YAML guard: when the user has typed an override,
        // Apply parses that override (via selectScriptText). Silently
        // swapping draftOps would leave AfterPanel showing the new
        // variant while the editor still shows the typed override and
        // Apply commits the override. Preserve their edit and only
        // update the preset; a follow-up Extract is the unambiguous way
        // to flip density without losing manual work.
        if (s.editorOverride !== null) {
          set({ extractionPreset });
          return;
        }
        const previewResult = applySourcedYOps(s.tree, cached);
        const previewTree: SemanticContent = previewResult.ok
          ? { trees: previewResult.trees, relations: previewResult.relations }
          : s.tree;
        // Compose: write the new preset alongside the proposal swap.
        // writeDraftProposal handles draftOps/draftTree/draftVariants/
        // scriptText/scriptDirty/snapshot atomically; we just add
        // extractionPreset to the same set() call.
        // Live-swap clears any (non-existent — we already returned
        // early when override was set) override; the canonical YAML
        // mirror of the new variant becomes the rendered text.
        set({
          extractionPreset,
          ...writeDraftProposal(s, {
            ops: cached,
            tree: previewTree,
            variants: s.draftVariants,
            override: null,
          }),
        });
      },
      setLastExtractionPinIds: (lastExtractionPinIds) => set({ lastExtractionPinIds }),

      setEditorOverride: (text) => {
        // The user typed in the editor. Set the override and mirror
        // into the persisted snapshot (only when a draft is staged —
        // an override on top of a non-draft state has nothing to apply
        // and isn't persisted). The override survives a refresh.
        //
        // Empty / whitespace-only text is normalized to `null`. The
        // user pressing Ctrl-A delete is "no manual edit", not "the
        // override IS empty" — selectScriptDirty would otherwise return
        // true on a meaningless string, and `restoreDraftFor` already
        // applies the same downgrade for persisted snapshots. Keeping
        // setter and restore symmetric prevents the in-memory state
        // from holding values that survive a refresh as null.
        const normalized = text.trim() === '' ? null : text;
        const s = get();
        if (s.hasDraft && s.conversationId) {
          set({
            editorOverride: normalized,
            draftsByConversation: writeDraftSnapshot(s.draftsByConversation, s.conversationId, {
              ops: s.draftOps,
              editorOverride: normalized,
            }),
          });
        } else {
          set({ editorOverride: normalized });
        }
      },
      clearEditorOverride: () => {
        // Revert to canonical YAML. Discard, successful Apply, and the
        // pre-extract overwrite-confirm path all call this. With the
        // override cleared, `selectScriptText` derives from `draftOps`
        // and `selectScriptDirty` returns false.
        const s = get();
        if (s.hasDraft && s.conversationId) {
          set({
            editorOverride: null,
            draftsByConversation: writeDraftSnapshot(s.draftsByConversation, s.conversationId, {
              ops: s.draftOps,
              editorOverride: null,
            }),
          });
        } else {
          set({ editorOverride: null });
        }
      },

      setDraft: ({ ops, tree, variants }) => {
        // A new draft replaces any prior override. The editor renders
        // the canonical YAML mirror of the fresh ops via
        // `selectScriptText`; manual edits, if needed, come AFTER the
        // user opens the editor and types (`setEditorOverride`).
        const s = get();
        set(
          writeDraftProposal(s, {
            ops,
            tree,
            variants: variants ?? null,
            override: null,
          })
        );
      },
      clearDraft: () => {
        const s = get();
        // Discard, successful Apply, and any other "throw away the
        // proposal" path call clearDraft. Routed through the single
        // writer with empty payload; the writer's `override: null` plus
        // empty ops produces `selectScriptText === ''` and
        // `selectScriptDirty === false` automatically — no separate
        // setScriptText('')/setScriptDirty(false) calls needed by
        // callers (the triplet that the old behavior required is gone).
        set(
          writeDraftProposal(s, {
            ops: [],
            tree: null,
            variants: null,
            override: null,
          })
        );
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

        // Defensive override derivation: an override that is empty or
        // whitespace-only is not a meaningful manual edit — it would
        // produce `selectScriptText === ''` (blank editor) while
        // AfterPanel renders the draft preview, and force a stale
        // overwrite-confirm prompt on the next re-extract for content
        // the user never typed. Treat empty/whitespace overrides as
        // missing and let the canonical mirror take over.
        const restoredOverride =
          snapshot.editorOverride && snapshot.editorOverride.trim() !== ''
            ? snapshot.editorOverride
            : null;

        // Route through the single writer. `variants` is null because
        // the per-conversation snapshot intentionally does NOT persist
        // cached variants (memory-only by design — see draftVariants
        // doc above). Post-refresh, the chip falls back to "next-
        // extract" semantics until the user re-extracts.
        set(
          writeDraftProposal(s, {
            ops: snapshot.ops,
            tree: previewTree,
            variants: null,
            override: restoredOverride,
          })
        );
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
      // Bumped from implicit v1 to v2 when `PersistedDraft` shape changed
      // from { ops, scriptText, scriptDirty } to { ops, editorOverride }.
      // The migrate function below converts pre-existing localStorage
      // entries from any user who had a draft staged at the time of
      // the upgrade — without this, those drafts would be silently
      // dropped on first load post-upgrade.
      version: 2,
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState;
        if (version >= 2) return persistedState;
        const state = persistedState as { draftsByConversation?: Record<string, unknown> };
        const oldMap = state.draftsByConversation;
        if (!oldMap || typeof oldMap !== 'object') return persistedState;
        const newMap: Record<string, PersistedDraft> = {};
        for (const [convId, raw] of Object.entries(oldMap)) {
          if (!raw || typeof raw !== 'object') continue;
          const legacy = raw as {
            ops?: SourcedYOp[];
            scriptText?: string;
            scriptDirty?: boolean;
            editorOverride?: string | null;
          };
          if (!Array.isArray(legacy.ops) || legacy.ops.length === 0) continue;
          // Migration rule: a v1 entry with `scriptDirty=true` carried a
          // real manual edit — preserve as override. A v1 entry with
          // `scriptDirty=false` was a canonical mirror (scriptText
          // matched serializeOpsToYaml(ops)) — discard, the v2 selector
          // re-derives. v2 entries pass through unchanged.
          const editorOverride =
            typeof legacy.editorOverride === 'string'
              ? legacy.editorOverride
              : legacy.scriptDirty && typeof legacy.scriptText === 'string'
                ? legacy.scriptText
                : null;
          newMap[convId] = { ops: legacy.ops, editorOverride };
        }
        return { ...state, draftsByConversation: newMap };
      },
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
