import type { SemanticContent, YOp } from '@t3x-dev/core';
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

export interface GateIssue {
  severity: 'error' | 'warning' | 'info';
  description: string;
}

type WorkspaceMode = 'idle' | 'streaming' | 'executed' | 'committing';
type SelectionSource = 'chat' | 'script' | 'after' | null;

interface WorkspaceState {
  mode: WorkspaceMode;
  panelExpanded: boolean;
  base: SemanticContent;
  baseCommitHash: string | null;
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
  // Gate issues (replaces phaseStore gateIssues)
  gateIssues: Record<string, GateIssue[]>;
  // Advisory questions (replaces phaseStore advisoryQuestions)
  advisoryQuestions: Array<{
    id: string;
    type: string;
    treeId: string;
    slotKey?: string;
    question: string;
    currentValue?: unknown;
  }>;
  // Source pin IDs used in the last extraction (for commit source_refs)
  lastExtractionPinIds: string[];

  snapshotBase(content: SemanticContent, commitHash: string | null): void;
  setScriptText(text: string): void;
  execute(): void;
  toggleOp(index: number): void;
  appendOp(op: YOp): void;
  select(source: string, target: { nodePath?: string; slotKey?: string; turnIndex?: number }): void;
  clearSelection(): void;
  setMode(mode: WorkspaceMode): void;
  setPanelExpanded(expanded: boolean): void;
  setDriftDetected(info: DriftInfo, choices: string[]): void;
  clearDrift(): void;
  setGateIssues(issues: Record<string, GateIssue[]>): void;
  setAdvisoryQuestions(
    questions: Array<{
      id: string;
      type: string;
      treeId: string;
      slotKey?: string;
      question: string;
      currentValue?: unknown;
    }>
  ): void;
  reset(): void;
}

const EMPTY_CONTENT: SemanticContent = { trees: [], relations: [] };

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  mode: 'idle',
  panelExpanded: true,
  base: EMPTY_CONTENT,
  baseCommitHash: null,
  scriptText: '',
  scriptOps: [],
  parseErrors: [],
  disabledOpIndices: new Set(),
  result: null,
  appliedCount: 0,
  execError: null,
  selectedNodePath: null,
  selectedSlotKey: null,
  selectedTurnIndex: null,
  selectedSource: null,
  scrollToCenter: false,
  lastExtractionPinIds: [],
  driftDetected: false,
  driftInfo: null,
  driftChoices: [],
  gateIssues: {},
  advisoryQuestions: [],

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

  setDriftDetected(info, choices) {
    set({ driftDetected: true, driftInfo: info, driftChoices: choices });
  },

  clearDrift() {
    set({ driftDetected: false, driftInfo: null, driftChoices: [] });
  },

  setGateIssues(issues) {
    set({ gateIssues: issues });
  },

  setAdvisoryQuestions(questions) {
    set({ advisoryQuestions: questions });
  },

  reset() {
    set({
      mode: 'idle',
      panelExpanded: true,
      base: EMPTY_CONTENT,
      baseCommitHash: null,
      scriptText: '',
      scriptOps: [],
      parseErrors: [],
      disabledOpIndices: new Set(),
      result: null,
      appliedCount: 0,
      execError: null,
      selectedNodePath: null,
      selectedSlotKey: null,
      selectedTurnIndex: null,
      selectedSource: null,
      scrollToCenter: false,
      driftDetected: false,
      driftInfo: null,
      driftChoices: [],
      gateIssues: {},
      advisoryQuestions: [],
      lastExtractionPinIds: [],
    });
  },
}));
