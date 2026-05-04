import { describe, expect, it } from 'vitest';
import {
  deriveWorkspaceScriptState,
  getApplyPolicyForScriptState,
} from '@/domain/yops/scriptApplyPolicy';

describe('Workspace script apply policy', () => {
  it('derives the five script states from workspace facts', () => {
    expect(
      deriveWorkspaceScriptState({
        hasDraft: false,
        scriptDirty: false,
        activeOpCount: 0,
        activeUncommittedRowCount: 0,
      })
    ).toBe('empty');
    expect(
      deriveWorkspaceScriptState({
        hasDraft: true,
        scriptDirty: false,
        activeOpCount: 0,
        activeUncommittedRowCount: 0,
      })
    ).toBe('candidate');
    expect(
      deriveWorkspaceScriptState({
        hasDraft: false,
        scriptDirty: false,
        activeOpCount: 1,
        activeUncommittedRowCount: 1,
      })
    ).toBe('active_clean');
    expect(
      deriveWorkspaceScriptState({
        hasDraft: false,
        scriptDirty: true,
        activeOpCount: 1,
        activeUncommittedRowCount: 1,
      })
    ).toBe('active_dirty');
    expect(
      deriveWorkspaceScriptState({
        hasDraft: true,
        scriptDirty: true,
        activeOpCount: 1,
        activeUncommittedRowCount: 1,
        replayWarningRowId: 'yl_bad',
      })
    ).toBe('replay_failed');
  });

  it('returns inherited-baseline tooltip for empty inherited state', () => {
    const policy = getApplyPolicyForScriptState({
      state: 'empty',
      scriptDirty: false,
      mode: 'idle',
      hasInheritedBaseline: true,
      activeOpCount: 0,
      activeUncommittedRowCount: 0,
    });

    expect(policy.canApply).toBe(false);
    expect(policy.tooltip).toBe('Inherited baseline');
    expect(policy.payload).toEqual({ kind: 'none', reason: 'Inherited baseline' });
  });

  it('applies staged extract drafts as an append (no LLM supersede)', () => {
    const policy = getApplyPolicyForScriptState({
      state: 'candidate',
      scriptDirty: false,
      mode: 'idle',
      hasInheritedBaseline: false,
      activeOpCount: 0,
      activeUncommittedRowCount: 0,
    });

    expect(policy.canApply).toBe(true);
    expect(policy.tooltip).toBe('Draft ready to apply');
    expect(policy.payload).toEqual({ kind: 'append' });
  });

  it('disables active clean scripts', () => {
    const policy = getApplyPolicyForScriptState({
      state: 'active_clean',
      scriptDirty: false,
      mode: 'idle',
      hasInheritedBaseline: false,
      activeOpCount: 1,
      activeUncommittedRowCount: 1,
    });

    expect(policy.canApply).toBe(false);
    expect(policy.tooltip).toBe('Applied script is up to date');
  });

  it('replaces active uncommitted rows for dirty active scripts', () => {
    const policy = getApplyPolicyForScriptState({
      state: 'active_dirty',
      scriptDirty: true,
      mode: 'idle',
      hasInheritedBaseline: false,
      activeOpCount: 2,
      activeUncommittedRowCount: 2,
    });

    expect(policy.canApply).toBe(true);
    expect(policy.tooltip).toBe('Apply will replace active uncommitted script');
    expect(policy.payload).toEqual({ kind: 'replace_active_script', replaceActiveScript: true });
  });

  it('keeps first manual script edits as append, not replace', () => {
    const policy = getApplyPolicyForScriptState({
      state: 'active_dirty',
      scriptDirty: true,
      mode: 'idle',
      hasInheritedBaseline: false,
      activeOpCount: 0,
      activeUncommittedRowCount: 0,
    });

    expect(policy.canApply).toBe(true);
    expect(policy.payload).toEqual({ kind: 'append' });
  });

  it('uses baseline-normalized apply when editing committed baseline script', () => {
    const policy = getApplyPolicyForScriptState({
      state: 'active_dirty',
      scriptDirty: true,
      mode: 'idle',
      hasInheritedBaseline: false,
      activeOpCount: 3,
      activeUncommittedRowCount: 0,
    });

    expect(policy.canApply).toBe(true);
    expect(policy.tooltip).toBe('Apply will add changes on committed baseline');
    expect(policy.payload).toEqual({ kind: 'replace_active_script', replaceActiveScript: true });
  });

  it('requires an edited script before repairing a replay warning', () => {
    const clean = getApplyPolicyForScriptState({
      state: 'replay_failed',
      scriptDirty: false,
      replayWarningRowId: 'yl_bad',
      mode: 'idle',
      hasInheritedBaseline: false,
      activeOpCount: 1,
      activeUncommittedRowCount: 1,
    });
    const dirty = getApplyPolicyForScriptState({
      state: 'replay_failed',
      scriptDirty: true,
      replayWarningRowId: 'yl_bad',
      mode: 'idle',
      hasInheritedBaseline: false,
      activeOpCount: 1,
      activeUncommittedRowCount: 1,
    });

    expect(clean.canApply).toBe(false);
    expect(clean.tooltip).toBe('Repair required before Apply');
    expect(dirty.canApply).toBe(true);
    expect(dirty.tooltip).toBe('Apply will repair failing row yl_bad');
    expect(dirty.payload).toEqual({ kind: 'repair', repairYopsLogId: 'yl_bad' });
  });

  it('mode blocks apply regardless of script state', () => {
    const policy = getApplyPolicyForScriptState({
      state: 'candidate',
      scriptDirty: false,
      mode: 'committing',
      hasInheritedBaseline: false,
      activeOpCount: 0,
      activeUncommittedRowCount: 0,
    });

    expect(policy.canApply).toBe(false);
    expect(policy.tooltip).toBe('Commit in progress');
  });
});
