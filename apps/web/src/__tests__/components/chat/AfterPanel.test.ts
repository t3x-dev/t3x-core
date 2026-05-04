// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  formatSlotPreviewValue,
  SlotPreviewInline,
  shouldDisableCommit,
  shouldShowAppliedResultFailure,
} from '@/components/chat/AfterPanel';

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

describe('AfterPanel.shouldShowAppliedResultFailure', () => {
  it('shows the failed re-extract row when the panel is still rendering an applied result', () => {
    expect(
      shouldShowAppliedResultFailure({
        hasDraft: false,
        hasResult: true,
        lastError: 'Extraction returned ops that do not form a valid tree update.',
      })
    ).toBe(true);
  });

  it('does not collide with retained-draft, empty, or clean states', () => {
    expect(
      shouldShowAppliedResultFailure({
        hasDraft: true,
        hasResult: true,
        lastError: 'failed',
      })
    ).toBe(false);
    expect(
      shouldShowAppliedResultFailure({
        hasDraft: false,
        hasResult: false,
        lastError: 'failed',
      })
    ).toBe(false);
    expect(
      shouldShowAppliedResultFailure({
        hasDraft: false,
        hasResult: true,
        lastError: null,
      })
    ).toBe(false);
  });
});

describe('AfterPanel.formatSlotPreviewValue', () => {
  it('renders comma-separated slot strings as YAML list items', () => {
    expect(formatSlotPreviewValue('landscape, studio, fashion, commercial')).toEqual({
      kind: 'list',
      items: [
        { kind: 'scalar', text: 'landscape' },
        { kind: 'scalar', text: 'studio' },
        { kind: 'scalar', text: 'fashion' },
        { kind: 'scalar', text: 'commercial' },
      ],
    });
  });

  it('renders array slot values as YAML list items', () => {
    expect(formatSlotPreviewValue(['cropping power', 'image quality', 'fine textures'])).toEqual({
      kind: 'list',
      items: [
        { kind: 'scalar', text: 'cropping power' },
        { kind: 'scalar', text: 'image quality' },
        { kind: 'scalar', text: 'fine textures' },
      ],
    });
  });

  it('keeps plain scalar slot values inline', () => {
    expect(formatSlotPreviewValue('61 megapixels')).toEqual({
      kind: 'scalar',
      text: '61 megapixels',
    });
  });

  it('keeps prose strings with commas inline', () => {
    expect(formatSlotPreviewValue('Better for fast motion, but still has tradeoffs.')).toEqual({
      kind: 'scalar',
      text: 'Better for fast motion, but still has tradeoffs.',
    });
  });
});

describe('AfterPanel.SlotPreviewInline', () => {
  it('renders list slots with YAML bullet markers instead of comma text', () => {
    render(
      createElement(SlotPreviewInline, {
        value: formatSlotPreviewValue('landscape, studio, fashion, commercial'),
      })
    );

    expect(screen.getByText('landscape')).not.toBeNull();
    expect(screen.getByText('studio')).not.toBeNull();
    expect(screen.queryByText('landscape, studio, fashion, commercial')).toBeNull();
    expect(screen.getAllByText('-')).toHaveLength(4);
  });
});
