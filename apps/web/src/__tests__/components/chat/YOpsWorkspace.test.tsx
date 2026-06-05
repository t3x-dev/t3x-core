// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { SourcedYOp } from '@t3x-dev/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revisionHarness = vi.hoisted(() => ({
  reviseMock: vi.fn(),
  state: {
    isRevising: false,
    result: null as null | {
      kind: 'ok' | 'validation_failed';
      reason: string;
      dry_run: {
        ok: boolean;
        applied: number;
        error?: { code: string; message: string; op_index: number };
      };
    },
    error: null as string | null,
  },
}));

// Stub child panels so the test focuses on tab-switch behavior, not
// panel rendering (those have their own dedicated tests).
vi.mock('@/components/chat/AfterPanel', () => ({
  AfterPanel: () => <div data-testid="after-panel-stub" />,
}));
vi.mock('@/components/chat/ScriptEditor', () => ({
  ScriptEditor: () => <div data-testid="script-editor-stub">Raw YAML</div>,
}));
vi.mock('@/components/chat/YOpsLogPanel', async () => {
  const actual = await vi.importActual<typeof import('@/components/chat/YOpsLogPanel')>(
    '@/components/chat/YOpsLogPanel'
  );
  return {
    ...actual,
    YOpsLogPanel: ({ tab }: { tab?: string }) => (
      <div data-testid={`yops-log-panel-stub-${tab ?? 'default'}`}>panel: {tab}</div>
    ),
  };
});
vi.mock('@/components/chat/ArchivedOpsPanel', () => ({
  ArchivedOpsPanel: ({ conversationId }: { conversationId: string | null }) => (
    <div data-testid="archived-ops-panel-stub">archived: {conversationId ?? 'no-conv'}</div>
  ),
}));
vi.mock('@/components/chat/WorkspaceTopbar', () => ({
  WorkspaceTopbar: () => <div data-testid="topbar-stub" />,
}));
vi.mock('@/components/chat/ReplayWarningBanner', () => ({
  ReplayWarningBanner: () => null,
}));
vi.mock('@/hooks/drafts/useYOpsRevision', () => ({
  useYOpsRevision: () => ({
    isRevising: revisionHarness.state.isRevising,
    result: revisionHarness.state.result,
    error: revisionHarness.state.error,
    revise: revisionHarness.reviseMock,
  }),
}));

import { YOpsWorkspace } from '@/components/chat/YOpsWorkspace';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { WORKSPACE_PANEL_MIN_WIDTH } from '@/utils/chatWorkspaceLayout';

function llmOp(): SourcedYOp {
  return {
    define: { path: 'sights' },
    source: {
      type: 'llm',
      model: 'm',
      at: '2026-04-26T00:00:00Z',
      turn_ref: { turn_hash: 'sha256:t1', quote: 'sights', start_char: 0, end_char: 6 },
    },
  } as SourcedYOp;
}

describe('YOpsWorkspace view switcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revisionHarness.state.isRevising = false;
    revisionHarness.state.result = null;
    revisionHarness.state.error = null;
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.setState({
      panelExpandedByProject: { proj_a: true },
      activeProjectId: 'proj_a',
      draftsByConversation: {},
    });
    useChatStore.setState({ sidebarCollapsed: false });
  });
  afterEach(() => {
    useWorkspaceStore.getState().reset();
    useChatStore.setState({ sidebarCollapsed: false });
  });

  it('mounts on YOps when the conversation is empty', () => {
    const { container } = render(<YOpsWorkspace />);
    expect(screen.queryByRole('group', { name: 'Workspace status' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'YOps' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Logs/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeNull();
  });

  it('does not repeat workspace op counts in the YOps editor toolbar', () => {
    useWorkspaceStore.setState({
      opsLog: [llmOp()],
      draftOps: [llmOp()],
      hasDraft: true,
    });

    render(<YOpsWorkspace />);

    expect(screen.getByText('YOps editor')).toBeInTheDocument();
    expect(screen.queryByText(/1 ops · 1 pending/)).not.toBeInTheDocument();
  });

  it('uses the shared workspace minimum width when expanded', () => {
    const { container } = render(<YOpsWorkspace />);
    expect(container.firstElementChild).toHaveStyle({
      minWidth: `${WORKSPACE_PANEL_MIN_WIDTH}px`,
    });
  });

  it('keeps YOps visible when the first draft arrives and exposes Draft through Logs', () => {
    const { container } = render(<YOpsWorkspace />);
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeTruthy();

    act(() => {
      useWorkspaceStore.getState().setDraft({
        ops: [llmOp()],
        tree: { trees: [], relations: [] },
      });
    });

    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Logs/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Draft/ }));

    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeNull();
  });

  it('routes pending drafts through the Logs menu', () => {
    act(() => {
      useWorkspaceStore.getState().setDraft({
        ops: [llmOp()],
        tree: { trees: [], relations: [] },
      });
    });

    const { container } = render(<YOpsWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: /Logs/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Draft/ }));

    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeNull();
  });

  it('keeps a selected log view when a draft arrives', () => {
    const { container } = render(<YOpsWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: /Logs/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Applied/ }));
    expect(container.querySelector('[data-testid="yops-log-panel-stub-applied"]')).toBeTruthy();

    act(() => {
      useWorkspaceStore.getState().setDraft({
        ops: [llmOp()],
        tree: { trees: [], relations: [] },
      });
    });
    // Still on Applied, not auto-switched to Draft.
    expect(container.querySelector('[data-testid="yops-log-panel-stub-applied"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeNull();
  });

  it('can return to YOps after viewing a log', () => {
    act(() => {
      useWorkspaceStore.getState().setDraft({
        ops: [llmOp()],
        tree: { trees: [], relations: [] },
      });
    });
    const { container } = render(<YOpsWorkspace />);
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Logs/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Draft/ }));
    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeTruthy();
    const logsButton = screen.getByRole('button', { name: /Logs/ });
    expect(logsButton).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'YOps' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'YOps' }));

    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeNull();
    expect(logsButton).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'YOps' })).toBeDisabled();
  });

  it('selecting Archived from Logs mounts ArchivedOpsPanel with the active conversationId', () => {
    act(() => {
      useWorkspaceStore.getState().setConversation('conv_xyz');
    });
    const { container } = render(<YOpsWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: /Logs/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Archived/ }));
    const panel = container.querySelector('[data-testid="archived-ops-panel-stub"]');
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain('archived: conv_xyz');
    // The other panels are not rendered while Archived is active.
    expect(container.querySelector('[data-testid^="yops-log-panel-stub-"]')).toBeNull();
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeNull();
  });

  it('does not collapse the chat sidebar when expanding the workspace panel', () => {
    act(() => {
      useWorkspaceStore.setState({
        panelExpandedByProject: { proj_a: false },
        activeProjectId: 'proj_a',
      });
      useChatStore.setState({ sidebarCollapsed: false });
    });

    render(<YOpsWorkspace />);
    fireEvent.click(screen.getByTestId('yops-panel-collapsed'));

    expect(useWorkspaceStore.getState().panelExpandedByProject.proj_a).toBe(true);
    expect(useChatStore.getState().sidebarCollapsed).toBe(false);
  });

  it('submits natural-language feedback for AI YOps revision from the script view', () => {
    render(<YOpsWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Ask AI to revise' }));
    fireEvent.change(screen.getByLabelText('Revision feedback'), {
      target: { value: 'Use Tokyo instead of Hangzhou.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit revision' }));

    expect(revisionHarness.reviseMock).toHaveBeenCalledWith('Use Tokyo instead of Hangzhou.');
  });

  it('shows the latest AI revision dry-run status in the script view', () => {
    revisionHarness.state.result = {
      kind: 'ok',
      reason: 'Updated the destination.',
      dry_run: { ok: true, applied: 1 },
    };

    render(<YOpsWorkspace />);

    expect(screen.getByText('Updated the destination.')).toBeInTheDocument();
    expect(screen.getByText('Dry-run passed · 1 op')).toBeInTheDocument();
  });
});
