import { describe, expect, it } from 'vitest';
import { composeCanvasFromFetches } from '@/hooks/canvas/useCanvasNodeActions.compose';
import type { ApiCommit, Conversation } from '@/types/api';

function commit(input: Partial<ApiCommit> & Pick<ApiCommit, 'hash' | 'branch'>): ApiCommit {
  return {
    hash: input.hash,
    schema: 't3x/commit',
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
  return {
    conversation_id: input.conversation_id,
    project_id: input.project_id ?? 'proj_1',
    title: input.title ?? 'New Chat',
    parent_commit_hash: input.parent_commit_hash,
    committed_as: input.committed_as ?? null,
    created_at: input.created_at ?? '2026-05-28T00:01:00.000Z',
    turns_count: input.turns_count ?? 1,
    metadata: input.metadata,
  } satisfies Conversation;
}

describe('composeCanvasFromFetches', () => {
  it('marks staging conversations with the parent commit branch', () => {
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
      [],
      new Map(),
      new Map()
    );

    const pending = result.nodes.find((node) => node.id === 'conv_pending');

    expect(pending?.data.branchType).toBe('branch');
    expect(pending?.data.branchName).toBe('111');
    expect(pending?.data.pendingBranch).toBe('branch');
    expect(pending?.data.pendingBranchName).toBe('111');
    expect(pending?.data.sourceCommitHash).toBe('sha256:branch_head');
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
      [],
      new Map(),
      new Map()
    );

    const pending = result.nodes.find((node) => node.id === 'conv_root_branch');

    expect(pending?.data.branchType).toBe('branch');
    expect(pending?.data.branchName).toBe('draft/root');
    expect(pending?.data.pendingBranch).toBe('branch');
    expect(pending?.data.pendingBranchName).toBe('draft/root');
  });

  it('keeps only the latest staging conversation on the canvas', () => {
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
      ],
      [],
      [],
      [],
      new Map(),
      new Map()
    );

    const pendingNodes = result.nodes.filter(
      (node) => node.data.kind === 'unit' && node.data.commitStatus === 'staging'
    );

    expect(pendingNodes).toHaveLength(1);
    expect(pendingNodes[0].id).toBe('conv_latest');
  });
});
