// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEdit: vi.fn(),
  commitTrees: vi.fn(),
  commitIntroDemoReplay: vi.fn(),
  discardDraft: vi.fn(),
  executeScript: vi.fn(),
  applyIntroDemoReplay: vi.fn(),
  introDemoActive: false,
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

vi.mock('@/hooks/onboarding/useIntroDemoQueryFlag', () => ({
  useIntroDemoQueryFlag: () => mocks.introDemoActive,
}));

vi.mock('@/hooks/onboarding/useIntroDemoReplayActions', () => ({
  useIntroDemoReplayActions: () => ({
    apply: mocks.applyIntroDemoReplay,
    commit: mocks.commitIntroDemoReplay,
  }),
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
  mocks.commitIntroDemoReplay.mockReset();
  mocks.discardDraft.mockReset();
  mocks.executeScript.mockReset();
  mocks.applyIntroDemoReplay.mockReset();
  mocks.introDemoActive = false;
  mocks.scriptCanRun = false;
  mocks.scriptDisabledReason = 'No runnable script';
  mocks.parentCommit.current = null;
  window.history.pushState(null, '', '/chat');
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

  it('hides tree edit controls after commit', () => {
    seedSingleSlot();
    useWorkspaceStore.getState().setCommitted(true);

    render(createElement(AfterPanel));

    expect(screen.queryByTestId('slot-edit')).toBeNull();
    expect(screen.queryByTestId('add-child-button')).toBeNull();
    expect(screen.queryByTestId('add-field-button')).toBeNull();
  });

  it('hides tree edit controls while an extraction draft is waiting for Apply', () => {
    seedSingleSlot();
    useWorkspaceStore.getState().setDraft({
      ops: [{ set: { path: 'sports/teams', value: 'Three teams' } } as never],
      tree: {
        trees: [{ key: 'sports', slots: { teams: 'Three teams' }, children: [] }],
        relations: [],
      },
    });

    render(createElement(AfterPanel));

    expect(screen.queryByTestId('slot-edit')).toBeNull();
    expect(screen.queryByTestId('add-child-button')).toBeNull();
    expect(screen.queryByTestId('add-field-button')).toBeNull();
  });

  it('hides tree edit controls while manual YOps changes are waiting to run', () => {
    seedSingleSlot();
    useWorkspaceStore
      .getState()
      .setEditorOverride('yops:\n  - set:\n      path: x\n      value: y\n');

    render(createElement(AfterPanel));

    expect(screen.queryByTestId('slot-edit')).toBeNull();
    expect(screen.queryByTestId('add-child-button')).toBeNull();
    expect(screen.queryByTestId('add-field-button')).toBeNull();
  });

  it('adds child nodes from the node row add button', () => {
    seedSingleSlot();

    render(createElement(AfterPanel));
    fireEvent.click(screen.getByTestId('add-child-button'));
    fireEvent.change(screen.getByLabelText('Node name'), { target: { value: 'soccer facts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Node' }));

    expect(mocks.applyEdit).toHaveBeenCalledWith({
      define: { path: 'sports/soccer_facts' },
    });
  });

  it('adds fields through the tree edit dialog', () => {
    seedSingleSlot();

    render(createElement(AfterPanel));
    fireEvent.click(screen.getByTestId('add-field-button'));
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'match length' } });
    fireEvent.change(screen.getByLabelText('Value'), {
      target: { value: 'Two 45-minute halves' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Field' }));

    expect(mocks.applyEdit).toHaveBeenCalledWith({
      set: { path: 'sports/match_length', value: 'Two 45-minute halves' },
    });
  });

  it('validates duplicate field names in the tree edit dialog', () => {
    seedSingleSlot();

    render(createElement(AfterPanel));
    fireEvent.click(screen.getByTestId('add-field-button'));
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'teams' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Field' }));

    expect(screen.getByText('Field "teams" already exists.')).not.toBeNull();
    expect(mocks.applyEdit).not.toHaveBeenCalled();
  });

  it('deletes nodes through the tree delete confirmation dialog', () => {
    seedSingleSlot();
    const confirm = vi.spyOn(window, 'confirm');

    render(createElement(AfterPanel));
    fireEvent.click(screen.getByTitle('Remove node and children'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.applyEdit).toHaveBeenCalledWith({
      drop: { path: 'sports' },
    });
    confirm.mockRestore();
  });

  it('marks human tree edits with the row highlight marker and keeps the label in the header legend', () => {
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

    expect(screen.queryByText('Human · Tree')).toBeNull();
    expect(screen.getByText('Human')).not.toBeNull();
    expect(screen.getByText('teams').closest('[data-human-edit="true"]')).not.toBeNull();
  });

  it('renders empty output instead of the parent baseline for an inherited child before Apply', () => {
    const parentTrees = [
      {
        key: 'concepts',
        slots: { definition: 'A parent baseline concept' },
        children: [],
      },
    ];
    mocks.parentCommit.current = {
      message: 'Parent commit',
      trees: parentTrees,
    };
    useWorkspaceStore.getState().setConversation('conv_child');
    useWorkspaceStore.getState().setDerived({
      tree: { trees: parentTrees, relations: [] },
      sourceIndex: new Map(),
      opsLog: [],
      baselineCommitHash: 'sha256:parent_commit',
      hasConversationChanges: false,
    });

    render(createElement(AfterPanel));

    expect(screen.getByText('Output')).not.toBeNull();
    expect(screen.getByText('No knowledge extracted yet')).not.toBeNull();
    expect(screen.queryByText('Inherited baseline')).toBeNull();
    expect(screen.queryByText('Parent')).toBeNull();
    expect(screen.queryByText('concepts')).toBeNull();
    expect(screen.queryByText('A parent baseline concept')).toBeNull();
    expect(screen.queryByText('Removed node')).toBeNull();
  });

  it('hides the old bundled demo root row while the intro demo is active', async () => {
    const parentTrees = [
      {
        key: 'support_escalation_review',
        slots: {},
        children: [],
      },
    ];
    window.history.pushState(null, '', '/chat/conv_demo?introDemo=1');
    mocks.introDemoActive = true;
    mocks.parentCommit.current = {
      message: 'Old demo fixture',
      trees: parentTrees,
    };
    useWorkspaceStore.getState().setConversation('conv_demo');
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: [],
    });

    render(createElement(AfterPanel));

    await waitFor(() => {
      expect(screen.queryByText('support_escalation_review')).toBeNull();
    });
    expect(screen.getByText('No knowledge extracted yet')).not.toBeNull();
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

  it('shows the lightweight commit ceremony after the commit API returns a hash', async () => {
    mocks.commitTrees.mockResolvedValueOnce({
      hash: 'sha256:1234567890abcdef1234567890abcdef',
    });
    useWorkspaceStore.getState().setConversation('conv_123');
    useWorkspaceStore.getState().setDerived({
      tree: {
        trees: [{ key: 'current', slots: { value: 'ready' }, children: [] }],
        relations: [],
      },
      sourceIndex: new Map(),
      opsLog: [],
    });

    render(createElement(AfterPanel));

    fireEvent.click(screen.getByRole('button', { name: 'Commit · main' }));
    expect(screen.getByRole('dialog', { name: 'Commit this version?' })).not.toBeNull();
    expect(screen.queryByText('Name this commit')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByTestId('commit-dialog-confirm'));

    await waitFor(() => expect(mocks.commitTrees).toHaveBeenCalledWith('Current'));
    expect(await screen.findByRole('status', { name: 'Commit sealed' })).not.toBeNull();
    expect(screen.getByTitle('sha256:1234567890abcdef1234567890abcdef')).not.toBeNull();
  });

  it('confirms intro demo commits with the generated default message', async () => {
    mocks.introDemoActive = true;
    mocks.commitIntroDemoReplay.mockResolvedValueOnce('sha256:intro-demo-replay');
    useWorkspaceStore.getState().setConversation('conv_demo');
    useWorkspaceStore.getState().setDerived({
      tree: {
        trees: [{ key: 'prompt_review_intake', slots: { value: 'ready' }, children: [] }],
        relations: [],
      },
      sourceIndex: new Map(),
      opsLog: [],
    });

    render(createElement(AfterPanel));

    fireEvent.click(screen.getByRole('button', { name: 'Commit · main' }));
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByTestId('commit-dialog-confirm'));

    await waitFor(() =>
      expect(mocks.commitIntroDemoReplay).toHaveBeenCalledWith('Prompt Review Intake')
    );
    expect(mocks.commitTrees).not.toHaveBeenCalled();
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
