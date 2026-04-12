import type { SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { create } from 'zustand';

export interface ExecError {
  op_index: number;
  code: string;
  message: string;
}

export interface DriftInfo {
  relation?: string;
  new_topic?: string;
  old_topic?: string;
}

export interface WorkspaceTurn {
  turn_hash: string;
  content: string;
}

export type WorkspaceMode = 'idle' | 'streaming' | 'executed' | 'committing' | 'error';
export type SelectionSource = 'chat' | 'script' | 'after' | null;

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
  execError: ExecError | null;

  // ── Selection (ephemeral, cleared on refresh) ──
  selectedNodePath: string | null;
  selectedSlotKey: string | null;
  selectedTurnIndex: number | null;
  selectedSource: SelectionSource;
  scrollToCenter: boolean;

  // ── Drift detection ──
  driftDetected: boolean;
  driftInfo: DriftInfo | null;
  driftChoices: string[];

  // ── Extraction config ──
  extractionPreset: 'concise' | 'balanced' | 'detailed';
  lastExtractionPinIds: string[];

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
  setExecError: (err: ExecError | null) => void;

  select: (
    source: SelectionSource,
    target: { nodePath?: string; slotKey?: string; turnIndex?: number },
  ) => void;
  clearSelection: () => void;

  setDriftDetected: (info: DriftInfo, choices: string[]) => void;
  clearDrift: () => void;

  setExtractionPreset: (preset: 'concise' | 'balanced' | 'detailed') => void;
  setLastExtractionPinIds: (ids: string[]) => void;

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
  | 'setExecError'
  | 'select'
  | 'clearSelection'
  | 'setDriftDetected'
  | 'clearDrift'
  | 'setExtractionPreset'
  | 'setLastExtractionPinIds'
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
    execError: null,
    selectedNodePath: null,
    selectedSlotKey: null,
    selectedTurnIndex: null,
    selectedSource: null,
    scrollToCenter: false,
    driftDetected: false,
    driftInfo: null,
    driftChoices: [],
    extractionPreset: 'balanced',
    lastExtractionPinIds: [],
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
  setExecError: (execError) => set({ execError }),

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

  setDriftDetected: (info, choices) =>
    set({ driftDetected: true, driftInfo: info, driftChoices: choices }),
  clearDrift: () => set({ driftDetected: false, driftInfo: null, driftChoices: [] }),

  setExtractionPreset: (extractionPreset) => set({ extractionPreset }),
  setLastExtractionPinIds: (lastExtractionPinIds) => set({ lastExtractionPinIds }),

  reset: () => set(initialState()),
}));
