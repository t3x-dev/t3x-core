import { describe, expect, it } from 'vitest';
import { deriveWorkspaceActionBarState } from '@/domain/workspace/actionBarState';

const baseFacts = {
  sourceCount: 2,
  materializedOpCount: 4,
  draftOpCount: 0,
  appliedOpCount: 4,
  pendingCount: 0,
  scriptDirty: false,
  hasDraft: false,
  hasResult: true,
  isCommitted: false,
  mode: 'idle' as const,
  isInheritedBaselineOnly: false,
  canApply: false,
  applyDisabledReason: 'Applied script is up to date',
  branch: 'main',
};

describe('deriveWorkspaceActionBarState', () => {
  it('prioritizes dirty script execution before commit', () => {
    const state = deriveWorkspaceActionBarState({
      ...baseFacts,
      scriptDirty: true,
      pendingCount: 1,
      canApply: true,
      applyDisabledReason: null,
    });

    expect(state.phase).toBe('script-dirty');
    expect(state.primary.id).toBe('run_script');
    expect(state.primary.label).toBe('Run script');
    expect(state.primary.enabled).toBe(true);
    expect(state.secondary.map((action) => action.id)).toEqual(['discard_changes']);
    expect(state.commitReadiness.ready).toBe(false);
    expect(state.commitReadiness.reason).toBe('Run or discard script changes before commit');
  });

  it('shows apply/discard when a draft is staged', () => {
    const state = deriveWorkspaceActionBarState({
      ...baseFacts,
      hasDraft: true,
      draftOpCount: 3,
      pendingCount: 3,
      canApply: true,
      applyDisabledReason: null,
    });

    expect(state.phase).toBe('has-draft');
    expect(state.primary.id).toBe('apply_changes');
    expect(state.primary.label).toBe('Apply changes');
    expect(state.secondary.map((action) => action.id)).toEqual(['discard_changes']);
    expect(state.commitReadiness.reason).toBe('Apply or discard pending YOps before commit');
  });

  it('uses commit semantics when the workspace is ready to commit', () => {
    const state = deriveWorkspaceActionBarState(baseFacts);

    expect(state.phase).toBe('commit-ready');
    expect(state.primary.id).toBe('commit');
    expect(state.primary.label).toBe('Commit · main');
    expect(state.primary.tone).toBe('commit');
    expect(state.commitReadiness).toEqual({ ready: true, reason: null });
  });

  it('keeps cancel visible during extraction but exposes the unavailable reason', () => {
    const state = deriveWorkspaceActionBarState({
      ...baseFacts,
      mode: 'streaming',
      hasResult: false,
      canApply: false,
      applyDisabledReason: 'Extraction running',
    });

    expect(state.phase).toBe('extracting');
    expect(state.primary.label).toBe('Extracting...');
    expect(state.primary.enabled).toBe(false);
    expect(state.secondary[0]).toMatchObject({
      id: 'cancel_extraction',
      label: 'Cancel',
      enabled: false,
      reason: 'Current extraction cannot be canceled from this surface yet',
    });
  });
});
