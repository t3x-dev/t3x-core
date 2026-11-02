import { describe, expect, it } from 'vitest';
import { composeCanvasFromFetches } from '@/hooks/canvas/useCanvasNodeActions.compose';
import type { ApiCommit, Conversation } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';

function commit(input: Partial<ApiCommit> & Pick<ApiCommit, 'hash' | 'branch'>): ApiCommit {
  return {
    hash: input.hash,
    schema: 't3x/commit/v2',
    parents: input.parents ?? [],
    author: { type: 'human' },
    committed_at: input.committed_at ?? '2026-05-28T00:00:00.000Z',
    content: input.content ?? { trees: [], relations: [] },
    project_id: input.project_id ?? 'proj_1',
    message: input.message ?? 'Technology',
    branch: input.branch,
    sources: input.sources ?? null,
    provenance: input.provenance ?? null,
    position_x: input.position_x,
    position_y: input.position_y,
  };
}

function conversation(input: Partial<Conversation> & Pick<Conversation, 'conversation_id'>) {
  const turnsCount = input.turns_count ?? 1;
  return {
    conversation_id: input.conversation_id,
    project_id: input.project_id ?? 'proj_1',
    title: input.title ?? 'New Chat',
    parent_commit_hash: input.parent_commit_hash,
    committed_as: input.committed_as ?? null,
    created_at: input.created_at ?? '2026-05-28T00:01:00.000Z',
    turns_count: turnsCount,
    has_pending_changes: input.has_pending_changes ?? (!input.committed_as && turnsCount > 0),
    metadata: input.metadata,
  } satisfies Conversation;
}

describe('composeCanvasFromFetches', () => {
  it('projects a pending conversation as a terminal group on its parent commit branch', () => {
    const result = composeCanvasFromFetches(
      'proj_1',
      [
        conversation({
          conversation_id: 'conv_pending',
          parent_commit_hash: 'sha256:branch_head',
        }),
      ],
      [commit({ hash: 'sha256:branch_head', branch: '111' })],
      [],
      new Map(),
      new Map()
    );

    expect(result.nodes.map((node) => node.id)).toEqual([
      'sha256:branch_head',
      'pending-branch:111',
    ]);
    expect(result.nodes[1]?.data.pendingConversationGroup?.conversations).toEqual([
      expect.objectContaining({ conversationId: 'conv_pending' }),
    ]);
    expect(result.edges).toContainEqual(
      expect.objectContaining({
        source: 'sha256:branch_head',
        target: 'pending-branch:111',
        data: expect.objectContaining({ edgeType: 'pending' }),
      })
    );
    expect(result.pendingConversations).toEqual([
      expect.objectContaining({
        branch: '111',
        conversationId: 'conv_pending',
        parentCommitHash: 'sha256:branch_head',
      }),
    ]);
  });

  it('uses target_branch metadata when a staging conversation has no parent commit', () => {
    const result = composeCanvasFromFetches(
      'proj_1',
      [
        conversation({
          conversation_id: 'conv_root_branch',
          metadata: { target_branch: 'draft/root' },
        }),
      ],
      [],
      [],
      new Map(),
      new Map()
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.data.pendingConversationGroup?.branch).toBe('draft/root');
    expect(result.pendingConversations[0]?.branch).toBe('draft/root');
  });

  it('lists every non-empty uncommitted conversation and excludes empty conversations', () => {
    const result = composeCanvasFromFetches(
      'proj_1',
      [
        conversation({
          conversation_id: 'conv_older',
          created_at: '2026-05-28T00:01:00.000Z',
        }),
        conversation({
          conversation_id: 'conv_latest',
          created_at: '2026-05-28T00:03:00.000Z',
        }),
        conversation({
          conversation_id: 'conv_middle',
          created_at: '2026-05-28T00:02:00.000Z',
        }),
        conversation({
          conversation_id: 'conv_empty',
          created_at: '2026-05-28T00:04:00.000Z',
          turns_count: 0,
        }),
      ],
      [],
      [],
      new Map(),
      new Map()
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.data.pendingConversationGroup?.conversations).toHaveLength(3);
    expect(result.pendingConversations.map((conversation) => conversation.conversationId)).toEqual([
      'conv_latest',
      'conv_middle',
      'conv_older',
    ]);
  });

  it('groups pending conversations by workspace branch and attaches one card to each tail', () => {
    const result = composeCanvasFromFetches(
      'proj_1',
      [
        conversation({
          conversation_id: 'conv_main_a',
          title: 'Main A',
          metadata: { workspace_id: 'workspace_branch:main' },
        }),
        conversation({
          conversation_id: 'conv_main_b',
          title: 'Main B',
          metadata: { workspace_id: 'workspace_branch:main' },
        }),
        conversation({
          conversation_id: 'conv_dev',
          title: 'Dev only',
          metadata: { workspace_id: 'workspace_branch:dev' },
        }),
      ],
      [
        commit({ hash: 'sha256:main_head', branch: 'main' }),
        commit({ hash: 'sha256:dev_head', branch: 'dev' }),
      ],
      [],
      new Map(),
      new Map()
    );

    const mainPending = result.nodes.find((node) => node.id === 'pending-branch:main');
    const devPending = result.nodes.find((node) => node.id === 'pending-branch:dev');
    expect(
      mainPending?.data.pendingConversationGroup?.conversations.map(({ title }) => title)
    ).toEqual(['Main B', 'Main A']);
    expect(
      devPending?.data.pendingConversationGroup?.conversations.map(({ title }) => title)
    ).toEqual(['Dev only']);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'sha256:main_head', target: 'pending-branch:main' }),
        expect.objectContaining({ source: 'sha256:dev_head', target: 'pending-branch:dev' }),
      ])
    );
  });

  it('prefers the persisted Workspace source association over stale conversation metadata', () => {
    const result = composeCanvasFromFetches(
      'proj_1',
      [
        conversation({
          conversation_id: 'conv_dev',
          title: 'Dev change',
          metadata: { workspace_id: 'workspace_branch:main' },
        }),
      ],
      [
        commit({ hash: 'sha256:main_head', branch: 'main' }),
        commit({ hash: 'sha256:dev_head', branch: 'dev' }),
      ],
      [],
      new Map(),
      new Map(),
      [
        {
          id: 'workspace_branch:dev',
          targetBranch: 'dev',
          sourceBundle: [
            {
              id: 'chat:conv_dev',
              type: 'chat',
              title: 'Dev change',
              conversationId: 'conv_dev',
            },
          ],
        } as WorkspaceCandidate,
      ]
    );

    expect(result.pendingConversations).toEqual([
      expect.objectContaining({ branch: 'dev', conversationId: 'conv_dev' }),
    ]);
    expect(result.nodes.find((node) => node.id === 'pending-branch:dev')).toBeDefined();
    expect(result.nodes.find((node) => node.id === 'pending-branch:main')).toBeUndefined();
    expect(result.edges).toContainEqual(
      expect.objectContaining({ source: 'sha256:dev_head', target: 'pending-branch:dev' })
    );
  });

  it('does not infer Pending from legacy content without a tracked change checkpoint', () => {
    const result = composeCanvasFromFetches(
      'proj_1',
      [
        conversation({
          conversation_id: 'conv_legacy_unlinked',
          turns_count: 8,
          has_pending_changes: false,
        }),
      ],
      [],
      [],
      new Map(),
      new Map()
    );

    expect(result.pendingConversations).toEqual([]);
  });

  it('uses committed_as to associate a conversation when CommitV2 sources are absent', () => {
    const result = composeCanvasFromFetches(
      'proj_1',
      [
        conversation({
          conversation_id: 'conv_committed',
          committed_as: 'sha256:committed',
          turns_count: 4,
          title: 'Verified source',
        }),
      ],
      [commit({ hash: 'sha256:committed', branch: 'main', sources: null })],
      [],
      new Map(),
      new Map()
    );

    expect(result.pendingConversations).toEqual([]);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.data.conversationId).toBe('conv_committed');
  });

  it('does not count a committed conversation when its commit is outside the fetched history window', () => {
    const result = composeCanvasFromFetches(
      'proj_1',
      [
        conversation({
          conversation_id: 'conv_old',
          committed_as: 'sha256:not-fetched',
          turns_count: 3,
        }),
      ],
      [],
      [],
      new Map(),
      new Map()
    );

    expect(result.nodes).toEqual([]);
    expect(result.pendingConversations).toEqual([]);
  });
});
