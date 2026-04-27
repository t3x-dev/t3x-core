// @vitest-environment jsdom

import type { SemanticContent } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadConversationMock = vi.fn();
const fetchCommitForInheritanceMock = vi.fn();

vi.mock('@/infrastructure/conversationLoader', () => ({
  loadConversation: (...args: unknown[]) => loadConversationMock(...args),
}));

vi.mock('@/queries/chatInitFetch', () => ({
  fetchCommitForInheritance: (...args: unknown[]) => fetchCommitForInheritanceMock(...args),
}));

import { fetchConversationSnapshot } from '@/queries/loadConversation';

const PARENT_TREE: SemanticContent = {
  trees: [{ key: 'parent_trip', slots: { destination: 'Dali' }, children: [] }],
  relations: [],
};

describe('fetchConversationSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses parent commit content as the baseline for inherited conversations', async () => {
    loadConversationMock.mockResolvedValueOnce({
      convId: 'conv_child',
      turns: [],
      opsLog: [],
      committedAs: null,
      committedAt: null,
      parentCommitHash: 'sha256:parent_commit',
    });
    fetchCommitForInheritanceMock.mockResolvedValueOnce({
      hash: 'sha256:parent_commit',
      content: PARENT_TREE,
      branch: '5',
    });

    const snapshot = await fetchConversationSnapshot('proj_1', 'conv_child');

    expect(fetchCommitForInheritanceMock).toHaveBeenCalledWith('sha256:parent_commit');
    expect(snapshot.tree).toEqual(PARENT_TREE);
    expect(snapshot.parentCommitHash).toBe('sha256:parent_commit');
    expect(snapshot.parentCommitBranch).toBe('5');
  });
});
