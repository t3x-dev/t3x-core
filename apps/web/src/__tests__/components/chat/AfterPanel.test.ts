// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEdit: vi.fn(),
  commitTrees: vi.fn(),
  discardDraft: vi.fn(),
  executeScript: vi.fn(),
  scriptCanRun: false,
  scriptDisabledReason: 'No runnable script' as string | null,
  parentCommit: { current: null as null | { trees: unknown[]; message?: string | null } },
}));

vi.mock('@/hooks/shared/useGoldEdit', () => ({
  useGoldEdit: () => ({ applyEdit: mocks.applyEdit, enabled: true }),
}));

vi.mock('@/hooks/commits/useCommitActions', () => ({
  useCommitActions: () => ({ commit: mocks.commitTrees }),
}));

vi.mock('@/hooks/commits/useParentCommit', () => ({
  useParentCommit: () => mocks.parentCommit.current,
}));

vi.mock('@/hooks/drafts/useDiscardDraft', () => ({
  useDiscardDraft: () => mocks.discardDraft,
}));

vi.mock('@/hooks/drafts/useScriptExecution', () => ({
  useScriptExecution: () => ({
    execute: mocks.executeScript,
    canRun: mocks.scriptCanRun,
    disabledReason: mocks.scriptDisabledReason,
  }),
}));

import {
  AfterPanel,
  formatSlotPreviewValue,
  humanEditMarkerFromSource,
  SlotPreviewInline,
  shouldDisableCommit,
  shouldShowAppliedResultFailure,
} from '@/components/chat/AfterPanel';
import { useWorkspaceStore } from '@/store/workspaceStore';

beforeEach(() => {
  mocks.applyEdit.mockReset();
  mocks.applyEdit.mockResolvedValue(undefined);
  mocks.commitTrees.mockReset();
  mocks.discardDraft.mockReset();
  mocks.executeScript.mockReset();
  mocks.scriptCanRun = false;
  mocks.scriptDisabledReason = 'No runnable script';
  mocks.parentCommit.current = null;
  useWorkspaceStore.getState().reset();
});

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

  it('disables Commit while the YOps script has unapplied local edits', () => {
    expect(shouldDisableCommit({ ...baseEnabled, scriptDirty: true })).toBe(true);
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

describe('AfterPanel.humanEditMarkerFromSource', () => {
  it('labels human script edits for the applied tree', () => {
    expect(
      humanEditMarkerFromSource({
        type: 'human',
        author: 'alice',
        at: '2026-05-06T00:00:00.000Z',
        surface: 'script',
      })
    ).toEqual({
      label: 'Human · YOps',
      title: 'Human edit via YOps by alice',
    });
  });

  it('does not mark LLM sources as human edits', () => {
    expect(
      humanEditMarkerFromSource({
        type: 'llm',
        model: 'gpt-4o-mini',
        at: '2026-05-06T00:00:00.000Z',
        turn_ref: { turn_hash: 'sha256:t1', quote: 'q' },
      })
    ).toBeNull();
  });
});

describe('AfterPanel tree edit controls', () => {
  function seedSingleSlot(sourceIndex = new Map()) {
    useWorkspaceStore.getState().setConversation('conv_123');
    useWorkspaceStore.getState().setDerived({
      tree: {
        trees: [
          {
            key: 'sports',
            slots: { teams: 'Two teams' },
            children: [],
          },
        ],
        relations: [],
      },
      sourceIndex,
      opsLog: [],
    });
  }

  it('shows an explicit edit button and saves slot edits through tree YOps', () => {
    seedSingleSlot();

    render(createElement(AfterPanel));
    fireEvent.click(screen.getByTestId('slot-edit'));

    const input = screen.getByDisplayValue('Two teams');
    fireEvent.change(input, { target: { value: 'Three teams' } });
    fireEvent.blur(input);

    expect(mocks.applyEdit).toHaveBeenCalledWith({
      set: { path: 'sports/teams', value: 'Three teams' },
    });
  });

  it('adds child nodes from the node row add button', () => {
    seedSingleSlot();
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('soccer facts');

    render(createElement(AfterPanel));
    fireEvent.click(screen.getByTestId('add-child-button'));

    expect(mocks.applyEdit).toHaveBeenCalledWith({
      define: { path: 'sports/soccer_facts' },
    });
    prompt.mockRestore();
  });

  it('adds fields by asking for a field name and then the field value', () => {
    seedSingleSlot();
    const prompt = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce('match length')
      .mockReturnValueOnce('Two 45-minute halves');

    render(createElement(AfterPanel));
    fireEvent.click(screen.getByTestId('add-field-button'));

    expect(mocks.applyEdit).toHaveBeenCalledWith({
      set: { path: 'sports/match_length', value: 'Two 45-minute halves' },
    });
    prompt.mockRestore();
  });

  it('marks human tree edits with the human label and blue-highlight marker', () => {
    seedSingleSlot(
      new Map([
        [
          'sports/teams',
          {
            type: 'human',
            author: 'Local Tester',
            at: '2026-05-06T00:00:00.000Z',
            surface: 'tree',
          },
        ],
      ])
    );

    render(createElement(AfterPanel));

    const label = screen.getByText('Human · Tree');
    expect(label).not.toBeNull();
    expect(label.closest('[data-human-edit="true"]')).not.toBeNull();
  });

  it('renders the parent commit tree for an inherited child before Apply', () => {
    mocks.parentCommit.current = {
      message: 'Parent commit',
      trees: [
        {
          key: 'concepts',
          slots: { definition: 'A parent baseline concept' },
          children: [],
        },
      ],
    };
    useWorkspaceStore.getState().setConversation('conv_child');
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: [],
      baselineCommitHash: 'sha256:parent_commit',
      hasConversationChanges: false,
    });

    render(createElement(AfterPanel));

    expect(screen.getByText('Inherited baseline')).not.toBeNull();
    expect(screen.getByText('concepts')).not.toBeNull();
    expect(screen.getByText('A parent baseline concept')).not.toBeNull();
    expect(screen.queryByText('Removed node')).toBeNull();
  });

  it('renders draft apply and discard through the unified action bar', () => {
    mocks.scriptCanRun = true;
    mocks.scriptDisabledReason = null;
    useWorkspaceStore.getState().setConversation('conv_123');
    useWorkspaceStore.getState().setDerived({
      tree: {
        trees: [{ key: 'current', slots: { value: 'old' }, children: [] }],
        relations: [],
      },
      sourceIndex: new Map(),
      opsLog: [],
    });
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'current/value', value: 'new' },
          source: {
            type: 'llm',
            model: 'm',
            at: '2026-05-19T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'new' },
          },
        },
      ],
      tree: {
        trees: [{ key: 'current', slots: { value: 'new' }, children: [] }],
        relations: [],
      },
    });

    render(createElement(AfterPanel));

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByTestId('workspace-action-bar')).not.toBeNull();
    expect(mocks.executeScript).toHaveBeenCalledTimes(1);
    expect(mocks.discardDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('commit-button')).toBeNull();
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
