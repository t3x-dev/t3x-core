// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { SourcedYOp } from '@t3x-dev/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { YOpsWorkspace } from '@/components/chat/YOpsWorkspace';
import { useWorkspaceStore } from '@/store/workspaceStore';

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

describe('YOpsWorkspace tab default + auto-switch', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.setState({
      panelExpandedByProject: { proj_a: true },
      activeProjectId: 'proj_a',
      draftsByConversation: {},
    });
  });
  afterEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it('mounts on YOps when the conversation is empty', () => {
    const { container } = render(<YOpsWorkspace />);
    expect(screen.getByRole('tab', { name: 'YOps' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Raw YAML' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeNull();
  });

  it('auto-switches to the Draft tab when the first draft arrives', () => {
    const { container } = render(<YOpsWorkspace />);
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeTruthy();

    act(() => {
      useWorkspaceStore.getState().setDraft({
        ops: [llmOp()],
        tree: { trees: [], relations: [] },
      });
    });

    // Auto-switch fires: Draft tab is now visible, YOps is hidden.
    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeNull();
  });

  it('a manual tab pick locks the view — subsequent draft arrival does NOT clobber it', () => {
    const { container, getByText } = render(<YOpsWorkspace />);
    // User manually clicks the Applied tab.
    const appliedTab = getByText('Applied');
    fireEvent.click(appliedTab);
    expect(container.querySelector('[data-testid="yops-log-panel-stub-applied"]')).toBeTruthy();

    // Draft arrives — auto-switch should NOT fire because the user
    // already picked.
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

  it('re-enables draft auto-switch after the staged draft is cleared', () => {
    act(() => {
      useWorkspaceStore.getState().setDraft({
        ops: [llmOp()],
        tree: { trees: [], relations: [] },
      });
    });
    const { container, getByText } = render(<YOpsWorkspace />);
    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeTruthy();

    fireEvent.click(getByText('Applied'));
    expect(container.querySelector('[data-testid="yops-log-panel-stub-applied"]')).toBeTruthy();

    act(() => {
      useWorkspaceStore.getState().clearDraft();
    });
    expect(container.querySelector('[data-testid="yops-log-panel-stub-applied"]')).toBeTruthy();

    act(() => {
      useWorkspaceStore.getState().setDraft({
        ops: [llmOp()],
        tree: { trees: [], relations: [] },
      });
    });

    expect(container.querySelector('[data-testid="yops-log-panel-stub-draft"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="yops-log-panel-stub-applied"]')).toBeNull();
  });

  it('clicking the Archived tab mounts ArchivedOpsPanel with the active conversationId', () => {
    act(() => {
      useWorkspaceStore.getState().setConversation('conv_xyz');
    });
    const { container, getByText } = render(<YOpsWorkspace />);
    fireEvent.click(getByText('Archived'));
    const panel = container.querySelector('[data-testid="archived-ops-panel-stub"]');
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain('archived: conv_xyz');
    // The other panels are not rendered while Archived is active.
    expect(container.querySelector('[data-testid^="yops-log-panel-stub-"]')).toBeNull();
    expect(container.querySelector('[data-testid="script-editor-stub"]')).toBeNull();
  });
});
