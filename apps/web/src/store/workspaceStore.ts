import type { SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { create } from 'zustand';

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
  panelExpanded: boolean;
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
  setTurns: (turns: WorkspaceTurn[]) => void;
  setDerived: (input: {
    tree: SemanticContent;
    sourceIndex: Map<string, Source>;
    opsLog: SourcedYOp[];
  }) => void;
  setMode: (mode: WorkspaceMode) => void;
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

  reset: () => void;
}

const EMPTY_TREE: SemanticContent = { trees: [], relations: [] };

function initialState(): Omit<
  WorkspaceState,
  | 'setConversation'
  | 'setTurns'
  | 'setDerived'
  | 'setMode'
  | 'setPanelExpanded'
  | 'setCommitted'
  | 'setError'
  | 'setReplayWarning'
  | 'select'
  | 'clearSelection'
  | 'setExtractionPreset'
  | 'setLastExtractionPinIds'
  | 'setScriptText'
  | 'setScriptDirty'
  | 'reset'
> {
  return {
    conversationId: null,
    turns: [],
    opsLog: [],
    tree: EMPTY_TREE,
    sourceIndex: new Map(),
    mode: 'idle',
    panelExpanded: false,
    isCommitted: false,
    lastError: null,
    replayWarning: null,
    selectedNodePath: null,
    selectedSlotKey: null,
    selectedTurnIndex: null,
    selectedSource: null,
    scrollToCenter: false,
    extractionPreset: 'balanced',
    lastExtractionPinIds: [],
    scriptText: '',
    scriptDirty: false,
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...initialState(),

  setConversation: (id) => set({ conversationId: id }),
  setTurns: (turns) => set({ turns }),
  setDerived: ({ tree, sourceIndex, opsLog }) => set({ tree, sourceIndex, opsLog }),
  setMode: (mode) => set({ mode }),
  setPanelExpanded: (panelExpanded) => set({ panelExpanded }),
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

  setScriptText: (scriptText) => set({ scriptText }),
  setScriptDirty: (scriptDirty) => set({ scriptDirty }),

  reset: () => set(initialState()),
}));
