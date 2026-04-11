import type { QuoteValidationResult, SemanticContent, YOp } from '@t3x-dev/core';
import { applyYOps } from '@t3x-dev/core';
import { create } from 'zustand';
import type { ParseError } from '@/lib/scriptParser';
import { opsToYaml, parseYOpsScript } from '@/lib/scriptParser';

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

type WorkspaceMode = 'idle' | 'streaming' | 'executed' | 'committing';
type SelectionSource = 'chat' | 'script' | 'after' | null;

interface WorkspaceState {
  mode: WorkspaceMode;
  panelExpanded: boolean;
  base: SemanticContent;
  baseCommitHash: string | null;
  /** True after a successful commit — locks chat, YOps, and result */
  isCommitted: boolean;
  scriptText: string;
  scriptOps: YOp[];
  parseErrors: ParseError[];
  disabledOpIndices: Set<number>;
  result: SemanticContent | null;
  appliedCount: number;
  execError: ExecError | null;
  // Selection (replaces hoverStore bidirectional hover)
  selectedNodePath: string | null;
  selectedSlotKey: string | null;
  selectedTurnIndex: number | null;
  selectedSource: SelectionSource;
  scrollToCenter: boolean;
  // Drift detection (replaces phaseStore drift fields)
  driftDetected: boolean;
  driftInfo: DriftInfo | null;
  driftChoices: string[];
  // Extraction style preset for the next extraction
  extractionPreset: 'concise' | 'balanced' | 'detailed';
  // Source pin IDs used in the last extraction (for commit source_refs)
  lastExtractionPinIds: string[];
  // Quote validation result from last extraction
  quoteValidation: QuoteValidationResult | null;
  // Number of ops already persisted to server (to avoid double-saving)
  persistedOpsCount: number;

  snapshotBase(content: SemanticContent, commitHash: string | null): void;
  setScriptText(text: string): void;
  execute(): void;
  toggleOp(index: number): void;
  appendOp(op: YOp): void;
  select(source: string, target: { nodePath?: string; slotKey?: string; turnIndex?: number }): void;
  clearSelection(): void;
  setMode(mode: WorkspaceMode): void;
  setPanelExpanded(expanded: boolean): void;
  setExtractionPreset(preset: 'concise' | 'balanced' | 'detailed'): void;
  setDriftDetected(info: DriftInfo, choices: string[]): void;
  clearDrift(): void;
  reset(): void;
}

const EMPTY_CONTENT: SemanticContent = { trees: [], relations: [] };

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  mode: 'idle',
  panelExpanded: false,
  base: EMPTY_CONTENT,
  baseCommitHash: null,
  scriptText: '',
  scriptOps: [],
  parseErrors: [],
  disabledOpIndices: new Set(),
  result: null,
  appliedCount: 0,
  execError: null,
  isCommitted: false,
  selectedNodePath: null,
  selectedSlotKey: null,
  selectedTurnIndex: null,
  selectedSource: null,
  scrollToCenter: false,
  extractionPreset: 'balanced',
  persistedOpsCount: 0,
  lastExtractionPinIds: [],
  quoteValidation: null,
  driftDetected: false,
  driftInfo: null,
  driftChoices: [],
  snapshotBase(content, commitHash) {
    set({
      base: structuredClone(content),
      baseCommitHash: commitHash,
      result: null,
      appliedCount: 0,
      execError: null,
    });
  },

  setScriptText(text) {
    const { ops, errors } = parseYOpsScript(text);
    set({ scriptText: text, scriptOps: ops ?? [], parseErrors: errors });
  },

  execute() {
    const { base, scriptOps, disabledOpIndices } = get();
    if (scriptOps.length === 0) return;
    const enabledOps = scriptOps.filter((_, i) => !disabledOpIndices.has(i));
    const result = applyYOps(base, enabledOps);
    const content = { trees: result.trees, relations: result.relations };
    if (result.ok) {
      set({
        result: content,
        appliedCount: result.applied,
        execError: null,
        mode: 'executed',
      });
    } else {
      set({
        result: content,
        appliedCount: result.applied,
        execError: result.error
          ? {
              op_index: result.error.op_index,
              code: result.error.code ?? 'UNKNOWN',
              message: result.error.message ?? 'Unknown error',
            }
          : null,
        mode: 'executed',
      });
    }
    // Sync result to draftStore so commit pipeline and source maps work
    import('./draftStore').then(({ useDraftStore }) => {
      useDraftStore.getState().setDraft(content);

      // Persist new ops to server (only ops added after last save)
      if (result.ok) {
        const { persistedOpsCount } = get();
        const newOps = enabledOps.slice(persistedOpsCount);
        if (newOps.length > 0) {
          const convId = useDraftStore.getState().conversationId;
          if (convId) {
            import('@/lib/api/trees').then(({ createYOpsEntry }) => {
              createYOpsEntry(convId, newOps, 'manual')?.catch(() => {});
            });
          }
          set({ persistedOpsCount: enabledOps.length });
        }

        // Auto-rename conversation and project from root tree key
        if (content.trees.length > 0) {
          const rootKey = (content.trees[0] as { key: string }).key;
          if (rootKey) {
            const displayName = rootKey
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c: string) => c.toUpperCase());

            import('@/store/chatStore').then(({ useChatStore }) => {
              useChatStore.getState().setConversationTitle(displayName);
              const convId = useDraftStore.getState().conversationId;
              if (convId) {
                import('@/lib/api/conversations').then(({ updateConversation }) => {
                  updateConversation(convId, { title: displayName }).catch(() => {});
                });
              }
              const projectId = useChatStore.getState().activeProjectId;
              if (projectId) {
                import('@/lib/api/projects').then(({ updateProject }) => {
                  updateProject(projectId, { name: displayName }).catch(() => {});
                });
                useChatStore.getState().refreshSidebar();
              }
            });
          }
        }
      }
    });
  },

  toggleOp(index) {
    const next = new Set(get().disabledOpIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    set({ disabledOpIndices: next });
  },

  appendOp(op) {
    const { scriptOps } = get();
    const updatedOps = [...scriptOps, op];
    const updatedText = opsToYaml(updatedOps);
    set({ scriptText: updatedText, scriptOps: updatedOps, parseErrors: [] });
  },

  select(source, { nodePath, slotKey, turnIndex }) {
    set({
      selectedNodePath: nodePath ?? null,
      selectedSlotKey: slotKey ?? null,
      selectedTurnIndex: turnIndex ?? null,
      selectedSource: source as SelectionSource,
      scrollToCenter: true,
    });
  },

  clearSelection() {
    set({
      selectedNodePath: null,
      selectedSlotKey: null,
      selectedTurnIndex: null,
      selectedSource: null,
      scrollToCenter: false,
    });
  },

  setMode(mode) {
    set({ mode });
  },

  setPanelExpanded(expanded) {
    set({ panelExpanded: expanded });
  },

  setExtractionPreset(preset) {
    set({ extractionPreset: preset });
  },

  setDriftDetected(info, choices) {
    set({ driftDetected: true, driftInfo: info, driftChoices: choices });
  },

  clearDrift() {
    set({ driftDetected: false, driftInfo: null, driftChoices: [] });
  },

  reset() {
    set({
      mode: 'idle',
      panelExpanded: false,
      base: EMPTY_CONTENT,
      baseCommitHash: null,
      scriptText: '',
      scriptOps: [],
      parseErrors: [],
      disabledOpIndices: new Set(),
      result: null,
      appliedCount: 0,
      execError: null,
      isCommitted: false,
      selectedNodePath: null,
      selectedSlotKey: null,
      selectedTurnIndex: null,
      selectedSource: null,
      scrollToCenter: false,
      driftDetected: false,
      driftInfo: null,
      driftChoices: [],
      lastExtractionPinIds: [],
      quoteValidation: null,
    });
  },
}));
