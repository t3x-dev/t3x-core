import { describe, expect, it } from 'vitest';
import { shouldDisableCommit } from '@/components/chat/AfterPanel';

describe('AfterPanel.shouldDisableCommit', () => {
  const baseEnabled = {
    hasResult: true,
    isCommitting: false,
    isCommitted: false,
    hasDraft: false,
  };

  it('enables Commit on a clean applied tree (the steady-state Commit case)', () => {
    expect(shouldDisableCommit(baseEnabled)).toBe(false);
  });

  it('disables Commit when the visible tree is only an inherited parent baseline', () => {
    // A child conversation can inherit a parent commit as its baseline
    // before it has any applied YOps of its own. That tree is visible,
    // but it is not a new result the child conversation should be able
    // to commit unchanged.
    expect(shouldDisableCommit({ ...baseEnabled, isInheritedBaselineOnly: true })).toBe(true);
  });

  it('disables Commit while a draft preview is staged (P2 regression)', () => {
    // Commit reads workspaceStore.tree (committed state), but the panel
    // renders draftTree when hasDraft. Allowing Commit here would freeze
    // the *pre-draft* tree while the staged YOps sit un-applied — the
    // user sees preview and ends up with a commit that doesn't match
    // anything on screen. The user must Apply (or Discard) first.
    //
    // The same helper gates BOTH the main Commit button AND the open
    // commit dialog's Enter / confirm path — closing a follow-up bypass
    // where the dialog was opened against a clean tree, then Extract
    // staged a draft mid-typing. AfterPanel additionally auto-closes
    // the dialog on the same hasDraft transition (cooperative defense),
    // and handleCommit re-checks hasDraft directly off the store
    // before commitTrees runs (in-flight keypress race).
    expect(shouldDisableCommit({ ...baseEnabled, hasDraft: true })).toBe(true);
  });

  it('disables Commit during in-flight commits and post-commit confirmation', () => {
    expect(shouldDisableCommit({ ...baseEnabled, isCommitting: true })).toBe(true);
    expect(shouldDisableCommit({ ...baseEnabled, isCommitted: true })).toBe(true);
  });

  it('disables Commit when there are no result rows to commit', () => {
    expect(shouldDisableCommit({ ...baseEnabled, hasResult: false })).toBe(true);
  });
});
