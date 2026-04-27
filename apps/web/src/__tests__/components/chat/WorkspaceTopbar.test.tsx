// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/drafts/useScriptExecution', () => ({
  useScriptExecution: () => ({
    execute: vi.fn(),
    canRun: false,
    disabledReason: 'No runnable script',
  }),
}));

import { WorkspaceTopbar } from '@/components/chat/WorkspaceTopbar';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('WorkspaceTopbar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkspaceStore.getState().reset();
  });

  it('labels parent-only replay state as inherited baseline', () => {
    useWorkspaceStore.setState({
      tree: {
        trees: [{ key: 'food', slots: { desired_food: 'chestnuts' }, children: [] }],
        relations: [],
      },
      opsLog: [],
      baselineCommitHash: 'sha256:parent_commit',
      hasConversationChanges: false,
      isCommitted: false,
      hasDraft: false,
    });

    render(<WorkspaceTopbar />);

    expect(screen.getByText('Inherited baseline')).not.toBeNull();
    expect(screen.queryByText(/0 applied/)).toBeNull();
  });
});
