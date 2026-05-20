export type WorkspaceActionMode = 'idle' | 'streaming' | 'executed' | 'committing' | 'error';

export type WorkspaceActionId =
  | 'run_script'
  | 'discard_changes'
  | 'apply_changes'
  | 'commit'
  | 'continue_editing'
  | 'cancel_extraction';

export type WorkspaceActionTone = 'neutral' | 'pending' | 'commit' | 'danger';

export interface WorkspaceActionState {
  id: WorkspaceActionId;
  label: string;
  enabled: boolean;
  tone: WorkspaceActionTone;
  reason: string | null;
}

export type WorkspaceActionPhase =
  | 'script-dirty'
  | 'has-draft'
  | 'commit-ready'
  | 'extracting'
  | 'committed'
  | 'blocked';

export interface WorkspaceActionBarFacts {
  scriptDirty: boolean;
  hasDraft: boolean;
  hasResult: boolean;
  isCommitted: boolean;
  mode: WorkspaceActionMode;
  isInheritedBaselineOnly: boolean;
  canApply: boolean;
  applyDisabledReason: string | null;
  branch: string;
}

export interface WorkspaceActionBarState {
  phase: WorkspaceActionPhase;
  primary: WorkspaceActionState;
  secondary: WorkspaceActionState[];
  commitReadiness: {
    ready: boolean;
    reason: string | null;
  };
}

function action(input: WorkspaceActionState): WorkspaceActionState {
  return input;
}

function disabledCommitReason(facts: WorkspaceActionBarFacts): string | null {
  if (facts.mode === 'streaming') return 'Extraction running';
  if (facts.mode === 'committing') return 'Commit in progress';
  if (facts.isCommitted) return 'Already committed';
  if (facts.scriptDirty) return 'Run or discard script changes before commit';
  if (facts.hasDraft) return 'Apply or discard pending YOps before commit';
  if (facts.isInheritedBaselineOnly) {
    return 'Extract, edit, or Apply new YOps before committing this conversation';
  }
  if (!facts.hasResult)
    return 'Extract, edit, or Apply new YOps before committing this conversation';
  return null;
}

export function deriveWorkspaceActionBarState(
  facts: WorkspaceActionBarFacts
): WorkspaceActionBarState {
  const commitReason = disabledCommitReason(facts);
  const commitReadiness = { ready: commitReason === null, reason: commitReason };

  if (facts.mode === 'streaming') {
    return {
      phase: 'extracting',
      primary: action({
        id: 'run_script',
        label: 'Extracting...',
        enabled: false,
        tone: 'pending',
        reason: 'Extraction running',
      }),
      secondary: [
        action({
          id: 'cancel_extraction',
          label: 'Cancel',
          enabled: false,
          tone: 'neutral',
          reason: 'Current extraction cannot be canceled from this surface yet',
        }),
      ],
      commitReadiness,
    };
  }

  if (facts.scriptDirty) {
    return {
      phase: 'script-dirty',
      primary: action({
        id: 'run_script',
        label: 'Run script',
        enabled: facts.canApply,
        tone: 'pending',
        reason: facts.canApply ? null : facts.applyDisabledReason,
      }),
      secondary: [
        action({
          id: 'discard_changes',
          label: 'Discard changes',
          enabled: true,
          tone: 'neutral',
          reason: null,
        }),
      ],
      commitReadiness,
    };
  }

  if (facts.hasDraft) {
    return {
      phase: 'has-draft',
      primary: action({
        id: 'apply_changes',
        label: 'Apply changes',
        enabled: facts.canApply,
        tone: 'pending',
        reason: facts.canApply ? null : facts.applyDisabledReason,
      }),
      secondary: [
        action({
          id: 'discard_changes',
          label: 'Discard',
          enabled: true,
          tone: 'neutral',
          reason: null,
        }),
      ],
      commitReadiness,
    };
  }

  if (facts.isCommitted) {
    return {
      phase: 'committed',
      primary: action({
        id: 'commit',
        label: 'Committed',
        enabled: false,
        tone: 'commit',
        reason: 'Already committed',
      }),
      secondary: [],
      commitReadiness,
    };
  }

  if (commitReadiness.ready) {
    return {
      phase: 'commit-ready',
      primary: action({
        id: 'commit',
        label: `Commit · ${facts.branch}`,
        enabled: true,
        tone: 'commit',
        reason: null,
      }),
      secondary: [
        action({
          id: 'continue_editing',
          label: 'Continue editing',
          enabled: true,
          tone: 'neutral',
          reason: null,
        }),
      ],
      commitReadiness,
    };
  }

  return {
    phase: 'blocked',
    primary: action({
      id: 'commit',
      label: `Commit · ${facts.branch}`,
      enabled: false,
      tone: 'commit',
      reason: commitReadiness.reason,
    }),
    secondary: [],
    commitReadiness,
  };
}
