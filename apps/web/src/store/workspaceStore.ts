import type { SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { create } from 'zustand';

export const WORKSPACE_PANEL_EXPANDED_STORAGE_KEY = 't3x-workspace-panel-expanded';

function getLocalStorage(): Storage | null {
  const storageCandidate = globalThis.localStorage;
  if (!storageCandidate || typeof storageCandidate.getItem !== 'function') return null;
  return storageCandidate;
}

export function readPersistedWorkspacePanelExpanded(): boolean {
  return getLocalStorage()?.getItem(WORKSPACE_PANEL_EXPANDED_STORAGE_KEY) === 'true';
}

export function writePersistedWorkspacePanelExpanded(expanded: boolean): void {
  getLocalStorage()?.setItem(WORKSPACE_PANEL_EXPANDED_STORAGE_KEY, String(expanded));
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
export type SelectionSource = 'chat' | 'script' | 'before' | 'after' | null;

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

  select: (
    source: SelectionSource,
    target: { nodePath?: string; slotKey?: string; turnIndex?: number }
  ) => void;
  clearSelection: () => void;

  setDriftDetected: (info: DriftInfo, choices: string[]) => void;
  clearDrift: () => void;

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
  | 'select'
  | 'clearSelection'
  | 'setDriftDetected'
  | 'clearDrift'
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

  setScriptText: (scriptText) => set({ scriptText }),
  setScriptDirty: (scriptDirty) => set({ scriptDirty }),

  reset: () =>
    set({
      ...initialState(),
      panelExpanded: readPersistedWorkspacePanelExpanded(),
    }),
}));
