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

  it('disables Commit while a draft preview is staged (P2 regression)', () => {
    // Commit reads workspaceStore.tree (committed state), but the panel
    // renders draftTree when hasDraft. Allowing Commit here would freeze
    // the *pre-draft* tree while the staged YOps sit un-applied — the
    // user sees preview and ends up with a commit that doesn't match
    // anything on screen. The user must Apply (or Discard) first.
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
