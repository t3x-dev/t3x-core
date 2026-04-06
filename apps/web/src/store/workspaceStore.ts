import { create } from 'zustand';
import type { SemanticContent, YOp } from '@t3x-dev/core';
import { applyYOps } from '@t3x-dev/core';
import { parseYOpsScript, opsToYaml } from '@/lib/scriptParser';
import type { ParseError } from '@/lib/scriptParser';

export interface ExecError {
  op_index: number;
  code: string;
  message: string;
}

type WorkspaceMode = 'idle' | 'streaming' | 'executed' | 'committing';
type SelectionSource = 'chat' | 'script' | 'after' | null;

interface WorkspaceState {
  mode: WorkspaceMode;
  base: SemanticContent;
  baseCommitHash: string | null;
  scriptText: string;
  scriptOps: YOp[];
  parseErrors: ParseError[];
  disabledOpIndices: Set<number>;
  result: SemanticContent | null;
  appliedCount: number;
  execError: ExecError | null;
  selectedNodePath: string | null;
  selectedSlotKey: string | null;
  selectedTurnIndex: number | null;
  selectedSource: SelectionSource;
  panelExpanded: boolean;

  snapshotBase(content: SemanticContent, commitHash: string | null): void;
  setScriptText(text: string): void;
  execute(): void;
  toggleOp(index: number): void;
  appendOp(op: YOp): void;
  select(source: string, target: { nodePath?: string; slotKey?: string; turnIndex?: number }): void;
  clearSelection(): void;
  setMode(mode: WorkspaceMode): void;
  setPanelExpanded(expanded: boolean): void;
  reset(): void;
}

const EMPTY_CONTENT: SemanticContent = { trees: [], relations: [] };

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  mode: 'idle',
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
  panelExpanded: true,

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
    if (result.ok) {
      set({
        result: { trees: result.trees, relations: result.relations },
        appliedCount: result.applied,
        execError: null,
        mode: 'executed',
      });
    } else {
      set({
        result: { trees: result.trees, relations: result.relations },
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
    });
  },

  clearSelection() {
    set({
      selectedNodePath: null,
      selectedSlotKey: null,
      selectedTurnIndex: null,
      selectedSource: null,
    });
  },

  setMode(mode) {
    set({ mode });
  },

  setPanelExpanded(expanded) {
    set({ panelExpanded: expanded });
  },

  reset() {
    set({
      mode: 'idle',
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
      panelExpanded: true,
    });
  },
}));
