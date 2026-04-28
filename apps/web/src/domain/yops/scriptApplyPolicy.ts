export type WorkspaceScriptState =
  | 'empty'
  | 'candidate'
  | 'active_clean'
  | 'active_dirty'
  | 'replay_failed';

export type WorkspaceScriptMode = 'idle' | 'streaming' | 'executed' | 'committing' | 'error';

export interface WorkspaceScriptFacts {
  hasDraft: boolean;
  scriptDirty: boolean;
  activeOpCount: number;
  activeUncommittedRowCount: number;
  replayWarningRowId?: string;
}

export type ApplyPayloadPolicy =
  | { kind: 'none'; reason: string }
  | { kind: 'append' }
  | { kind: 'candidate'; replaceActiveLLMDraft: true }
  | { kind: 'replace_active_script'; replaceActiveScript: true }
  | { kind: 'repair'; repairYopsLogId: string };

export interface ApplyPolicy {
  canApply: boolean;
  label: string;
  tooltip: string;
  payload: ApplyPayloadPolicy;
}

export function deriveWorkspaceScriptState(facts: WorkspaceScriptFacts): WorkspaceScriptState {
  if (facts.replayWarningRowId) return 'replay_failed';
  if (facts.hasDraft) return 'candidate';
  if (facts.scriptDirty) return 'active_dirty';
  if (facts.activeUncommittedRowCount > 0) return 'active_clean';
  return 'empty';
}

function disabled(reason: string): ApplyPolicy {
  return {
    canApply: false,
    label: 'Apply',
    tooltip: reason,
    payload: { kind: 'none', reason },
  };
}

export function getApplyPolicyForScriptState(input: {
  state: WorkspaceScriptState;
  scriptDirty: boolean;
  replayWarningRowId?: string;
  mode: WorkspaceScriptMode;
  hasInheritedBaseline: boolean;
  activeOpCount: number;
  activeUncommittedRowCount: number;
}): ApplyPolicy {
  if (input.mode === 'streaming') return disabled('Extraction running');
  if (input.mode === 'committing') return disabled('Commit in progress');

  switch (input.state) {
    case 'empty':
      return disabled(input.hasInheritedBaseline ? 'Inherited baseline' : 'No applied YOps');
    case 'candidate':
      return {
        canApply: true,
        label: 'Apply',
        tooltip: 'Draft ready to apply',
        payload: { kind: 'candidate', replaceActiveLLMDraft: true },
      };
    case 'active_clean':
      return disabled('Applied script is up to date');
    case 'active_dirty':
      return {
        canApply: true,
        label: 'Apply',
        tooltip:
          input.activeUncommittedRowCount > 0
            ? 'Apply will replace active uncommitted script'
            : input.activeOpCount > 0
              ? 'Apply will add changes on committed baseline'
              : 'Apply the script to the tree',
        payload:
          input.activeUncommittedRowCount > 0 || input.activeOpCount > 0
            ? { kind: 'replace_active_script', replaceActiveScript: true }
            : { kind: 'append' },
      };
    case 'replay_failed':
      if (input.scriptDirty && input.replayWarningRowId) {
        return {
          canApply: true,
          label: 'Apply',
          tooltip: `Apply will repair failing row ${input.replayWarningRowId}`,
          payload: { kind: 'repair', repairYopsLogId: input.replayWarningRowId },
        };
      }
      return disabled('Repair required before Apply');
  }
}
