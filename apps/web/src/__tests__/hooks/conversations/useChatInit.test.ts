// @vitest-environment jsdom

import type { SourcedYOp } from '@t3x-dev/core';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';

const hydrateConversationToStoreMock = vi.fn();
const fetchConversationMetaMock = vi.fn();
const fetchConversationTopicsMock = vi.fn();
const fetchParentCommitDataMock = vi.fn();
const initCommitStateMock = vi.fn();

vi.mock('@/hooks/conversations/hydrateConversationToStore', () => ({
  hydrateConversationToStore: (...args: unknown[]) => hydrateConversationToStoreMock(...args),
}));

vi.mock('@/queries/chatInitFetch', () => ({
  fetchConversationMeta: (...args: unknown[]) => fetchConversationMetaMock(...args),
  fetchConversationTopics: (...args: unknown[]) => fetchConversationTopicsMock(...args),
}));

vi.mock('@/queries/hydrateFromParent', () => ({
  fetchParentCommitData: (...args: unknown[]) => fetchParentCommitDataMock(...args),
}));

vi.mock('@/hooks/commits/useCommitActions', () => ({
  useCommitActions: () => ({ init: initCommitStateMock }),
}));

import { useChatInit } from '@/hooks/conversations/useChatInit';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const DRAFT_OPS: SourcedYOp[] = [
  {
    set: { path: 'trip/dest', value: 'HZ' },
    source: {
      type: 'llm',
      model: 'gpt-4o-mini',
      at: '2026-04-26T00:00:00Z',
      turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
    },
  },
];

describe('useChatInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    hydrateConversationToStoreMock.mockReturnValue(new Promise(() => {}));
    fetchConversationTopicsMock.mockResolvedValue([]);
    fetchConversationMetaMock.mockResolvedValue(null);
    fetchParentCommitDataMock.mockResolvedValue({ fetched: false });
    initCommitStateMock.mockResolvedValue(undefined);

    useWorkspaceStore.getState().reset();
    useWorkspaceStore.setState({
      panelExpandedByProject: {},
      activeProjectId: null,
      pendingPanelExpanded: null,
      draftsByConversation: {},
    });
    useChatStore.setState({
      activeConversationId: null,
      activeProjectId: null,
      activeBranch: 'main',
    });
    useCommitStore.setState({
      projectId: null,
      conversationTitle: null,
      beforeCommitHash: null,
      commitBranch: 'main',
    });
  });

  it('restores an in-memory draft snapshot before async hydrate finishes on in-app navigation', async () => {
    useWorkspaceStore.setState({
      draftsByConversation: {
        conv_nav: {
          ops: DRAFT_OPS,
          scriptText: serializeOpsToYaml(DRAFT_OPS),
          scriptDirty: false,
        },
      },
    });

    renderHook(() =>
      useChatInit({
        conversationId: 'conv_nav',
        resolvedConversationId: 'conv_nav',
        resolvedProjectId: 'proj_nav',
        setResolvedProjectId: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(useWorkspaceStore.getState().conversationId).toBe('conv_nav');
    });

    const workspace = useWorkspaceStore.getState();
    expect(hydrateConversationToStoreMock).toHaveBeenCalledWith('proj_nav', 'conv_nav');
    expect(workspace.hasDraft).toBe(true);
    expect(workspace.draftOps).toEqual(DRAFT_OPS);
    expect(workspace.scriptText).toBe(serializeOpsToYaml(DRAFT_OPS));
  });
});
