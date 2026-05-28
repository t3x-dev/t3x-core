// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initCommitStateMock = vi.fn();
const fetchCommitsMock = vi.fn();
const getConversationMock = vi.fn();
const updateConversationMock = vi.fn();
const useBranchesMock = vi.fn();

vi.mock('@/hooks/commits/useCommitActions', () => ({
  useCommitActions: () => ({ init: initCommitStateMock }),
}));

vi.mock('@/queries/commits', () => ({
  fetchCommits: (...args: unknown[]) => fetchCommitsMock(...args),
}));

vi.mock('@/infrastructure/conversations', () => ({
  getConversation: (...args: unknown[]) => getConversationMock(...args),
}));

vi.mock('@/commands/conversations', () => ({
  updateConversation: (...args: unknown[]) => updateConversationMock(...args),
}));

vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => useBranchesMock(),
}));

import { ChatHeader } from '@/components/chat/ChatHeader';
import { CONVERSATION_BRANCH_CHANGED_EVENT } from '@/hooks/conversations/useConversationBranchSwitch';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

function resetStores() {
  useWorkspaceStore.getState().reset();
  useWorkspaceStore.setState({
    conversationId: 'conv_1',
    turns: [],
    opsLog: [],
    hasDraft: false,
    mode: 'idle',
    isCommitted: false,
  });
  useChatStore.setState({
    activeProjectId: 'proj_1',
    activeConversationId: 'conv_1',
    activeBranch: 'main',
    conversationTitle: null,
  });
  useCommitStore.setState({
    projectId: 'proj_1',
    commitBranch: 'main',
    lastCommitHash: null,
    beforeCommitHash: null,
    committedNodeIds: {},
    committedNodeSnapshot: {},
  });
}

describe('ChatHeader branch switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    useBranchesMock.mockReturnValue({
      branches: ['main', 'branch 111'],
      loading: false,
      create: vi.fn(),
    });
    fetchCommitsMock.mockResolvedValue([
      {
        hash: 'sha256:branch_head',
        content: { trees: [{ key: 'branch_tree', slots: {}, children: [] }], relations: [] },
      },
    ]);
    getConversationMock.mockResolvedValue({
      conversation_id: 'conv_1',
      project_id: 'proj_1',
      metadata: { foo: 'bar' },
    });
    updateConversationMock.mockResolvedValue({});
    initCommitStateMock.mockResolvedValue('sha256:branch_head');
  });

  afterEach(() => {
    cleanup();
  });

  it('persists target branch and parent commit before updating branch state', async () => {
    const branchChanged = vi.fn();
    window.addEventListener(CONVERSATION_BRANCH_CHANGED_EVENT, branchChanged);
    render(
      <ChatHeader conversationId="conv_1" selectedProvider="openai" selectedModel="gpt-5.4" />
    );

    fireEvent.click(screen.getByRole('button', { name: /switch branch: main/i }));
    fireEvent.click(await screen.findByRole('button', { name: /branch 111/i }));

    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith('conv_1', {
        parent_commit_hash: 'sha256:branch_head',
        metadata: { foo: 'bar', target_branch: 'branch 111' },
      });
    });
    expect(initCommitStateMock).toHaveBeenCalledWith('proj_1', 'branch 111');
    expect(useChatStore.getState().activeBranch).toBe('branch 111');
    expect(useCommitStore.getState().commitBranch).toBe('branch 111');
    expect(useWorkspaceStore.getState().baselineCommitHash).toBe('sha256:branch_head');
    expect(useWorkspaceStore.getState().tree.trees[0]?.key).toBe('branch_tree');
    expect(branchChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          projectId: 'proj_1',
          conversationId: 'conv_1',
          branch: 'branch 111',
          parentCommitHash: 'sha256:branch_head',
        },
      })
    );
    window.removeEventListener(CONVERSATION_BRANCH_CHANGED_EVENT, branchChanged);
  });

  it('locks branch switching after YOps have been materialized', async () => {
    useWorkspaceStore.setState({
      opsLog: [{ set: { path: 'concepts/name', value: 'T3X' }, source: { type: 'human' } }],
    } as never);

    render(
      <ChatHeader conversationId="conv_1" selectedProvider="openai" selectedModel="gpt-5.4" />
    );

    fireEvent.click(screen.getByRole('button', { name: /switch branch: main/i }));

    expect(updateConversationMock).not.toHaveBeenCalled();
    expect(document.body.querySelector('.fixed')).toBeNull();
  });
});
