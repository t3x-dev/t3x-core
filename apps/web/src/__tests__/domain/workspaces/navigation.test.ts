import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceContextCandidate,
  buildWorkspaceContextId,
  buildWorkspaceHandoffHref,
  collectWorkspaceConversationIds,
  findUniqueCommitConversationId,
  findUniqueWorkspaceConversationId,
  parseWorkspaceNavigationTarget,
  resolveWorkspaceNavigation,
} from '@/domain/workspaces/navigation';
import type { WorkspaceCandidate } from '@/types/workspaces';

function createWorkspace(
  overrides: Partial<WorkspaceCandidate> & Pick<WorkspaceCandidate, 'id' | 'targetBranch'>
): WorkspaceCandidate {
  const { id, targetBranch, ...rest } = overrides;
  return {
    id,
    projectId: 'proj_1',
    title: overrides.id,
    summary: 'Workspace navigation fixture.',
    status: 'ready_for_yops',
    updatedAt: '2026-07-24T08:00:00.000Z',
    baseCommitHash: null,
    targetBranch,
    sourceBundle: [],
    schemaBindings: [],
    schemaCandidate: { summary: 'Fixture schema.', fields: [] },
    schemaReview: { verdict: 'ready', summary: 'Ready.', gaps: [] },
    yopsDraft: { id: `draft_${overrides.id}`, operations: [] },
    outputTargets: [],
    ...rest,
  };
}

const workspaces: WorkspaceCandidate[] = [
  createWorkspace({
    id: 'workspace_a',
    targetBranch: 'feature/a',
    baseCommitHash: 'sha256:a-base',
    lastCommitHash: 'sha256:a-head',
    sourceBundle: [
      { id: 'source_a', type: 'chat', title: 'Conversation A', conversationId: 'conv_a' },
      {
        id: 'source_a_preview',
        type: 'chat',
        title: 'Conversation A preview',
        previewTurns: [
          {
            id: 'turn_a',
            role: 'user',
            author: 'User',
            content: 'Preview evidence',
            conversationId: 'conv_a_preview',
          },
        ],
      },
    ],
  }),
  createWorkspace({
    id: 'workspace_b',
    targetBranch: 'feature/b',
    baseCommitHash: 'sha256:b-base',
    lastCommitHash: 'sha256:b-head',
    sourceBundle: [
      { id: 'source_b', type: 'chat', title: 'Conversation B', conversationId: 'conv_b' },
    ],
  }),
];

describe('workspace navigation handoff', () => {
  it('parses the complete State handoff context and normalizes the source view', () => {
    const target = parseWorkspaceNavigationTarget(
      new URLSearchParams({
        branch: 'feature/a',
        commit: 'sha256:a-head',
        workspace: 'workspace_a',
        conversation: 'conv_a',
        sourceView: 'chat',
      })
    );

    expect(target).toEqual({
      branch: 'feature/a',
      commitHash: 'sha256:a-head',
      workspaceId: 'workspace_a',
      conversationId: 'conv_a',
      sourceView: 'chat',
      explicitHandoff: true,
    });
  });

  it('strictly resolves a workspace-only target while a plain entry keeps fallback semantics', () => {
    const selected = resolveWorkspaceNavigation(
      workspaces,
      parseWorkspaceNavigationTarget(new URLSearchParams({ workspace: 'workspace_b' }))
    );
    const missing = resolveWorkspaceNavigation(
      workspaces,
      parseWorkspaceNavigationTarget(new URLSearchParams({ workspace: 'missing' }))
    );
    const direct = resolveWorkspaceNavigation(
      workspaces,
      parseWorkspaceNavigationTarget(new URLSearchParams())
    );

    expect(selected).toMatchObject({
      status: 'resolved',
      candidate: { id: 'workspace_b' },
      restoreStoredConversation: false,
    });
    expect(missing).toEqual({
      status: 'selection_required',
      candidate: null,
      conversationId: null,
      sourceView: null,
      restoreStoredConversation: false,
      reason: 'workspace_not_found',
    });
    expect(direct).toMatchObject({
      status: 'default',
      candidate: { id: 'workspace_a' },
      restoreStoredConversation: true,
    });
  });

  it('strictly resolves an explicit handoff by workspace, branch, and last commit', () => {
    const resolution = resolveWorkspaceNavigation(
      workspaces,
      parseWorkspaceNavigationTarget(
        new URLSearchParams({
          branch: 'feature/a',
          commit: 'sha256:a-head',
          workspace: 'workspace_a',
          conversation: 'conv_a_preview',
          sourceView: 'chat',
        })
      )
    );

    expect(resolution).toMatchObject({
      status: 'resolved',
      candidate: { id: 'workspace_a' },
      conversationId: 'conv_a_preview',
      sourceView: 'chat',
      restoreStoredConversation: false,
    });
  });

  it('allows a continued draft to match its base commit', () => {
    const resolution = resolveWorkspaceNavigation(
      workspaces,
      parseWorkspaceNavigationTarget(
        new URLSearchParams({
          branch: 'feature/b',
          commit: 'sha256:b-base',
          workspace: 'workspace_b',
        })
      )
    );

    expect(resolution).toMatchObject({
      status: 'resolved',
      candidate: { id: 'workspace_b' },
      restoreStoredConversation: false,
    });
  });

  it('projects a named workspace into historical branch context after its mutable draft moves', () => {
    const target = parseWorkspaceNavigationTarget(
      new URLSearchParams({
        branch: 'feature/a',
        commit: 'sha256:a-head',
        workspace: 'workspace_b',
        conversation: 'conv_a',
      })
    );
    const resolution = resolveWorkspaceNavigation(workspaces, target);

    expect(resolution).toMatchObject({
      status: 'resolved',
      candidate: { id: 'workspace_b' },
      conversationId: 'conv_a',
    });
    if (resolution.status !== 'resolved') throw new Error('Expected historical resolution.');

    expect(buildWorkspaceContextCandidate(resolution.candidate, target)).toMatchObject({
      id: buildWorkspaceContextId('workspace_b', 'feature/a', 'sha256:a-head'),
      lastCommitHash: 'sha256:a-head',
      status: 'committed',
      targetBranch: 'feature/a',
      sourceBundle: [{ conversationId: 'conv_a' }],
    });
  });

  it('requires selection when branch and commit identify multiple workspaces', () => {
    const duplicate = createWorkspace({
      id: 'workspace_a_duplicate',
      targetBranch: 'feature/a',
      lastCommitHash: 'sha256:a-head',
    });
    const resolution = resolveWorkspaceNavigation(
      [...workspaces, duplicate],
      parseWorkspaceNavigationTarget(
        new URLSearchParams({ branch: 'feature/a', commit: 'sha256:a-head' })
      )
    );

    expect(resolution).toMatchObject({
      status: 'selection_required',
      candidate: null,
      reason: 'ambiguous_workspace',
      restoreStoredConversation: false,
    });
  });

  it('rejects a workspace-only conversation that does not belong to the resolved workspace', () => {
    const resolution = resolveWorkspaceNavigation(
      workspaces,
      parseWorkspaceNavigationTarget(
        new URLSearchParams({
          workspace: 'workspace_a',
          conversation: 'conv_b',
        })
      )
    );

    expect(resolution).toMatchObject({
      status: 'selection_required',
      candidate: null,
      reason: 'conversation_not_found',
      restoreStoredConversation: false,
    });
  });

  it('collects source and preview-turn conversations and returns only a unique commit intersection', () => {
    expect([...collectWorkspaceConversationIds(workspaces[0]!)]).toEqual([
      'conv_a',
      'conv_a_preview',
    ]);
    expect(
      findUniqueWorkspaceConversationId(
        [
          { type: 'conversation', id: 'conv_a' },
          { type: 'import', id: 'import_1' },
        ],
        workspaces[0]!
      )
    ).toBe('conv_a');
    expect(
      findUniqueWorkspaceConversationId(
        [
          { type: 'conversation', id: 'conv_a' },
          { type: 'conversation', id: 'conv_a_preview' },
        ],
        workspaces[0]!
      )
    ).toBeNull();
    expect(
      findUniqueWorkspaceConversationId([{ type: 'conversation', id: 'conv_b' }], workspaces[0]!)
    ).toBeNull();
    expect(
      findUniqueCommitConversationId([
        { type: 'conversation', id: 'conv_historical' },
        { type: 'import', id: 'import_1' },
      ])
    ).toBe('conv_historical');
  });

  it('builds a stable State-to-Workspaces URL in handoff parameter order', () => {
    expect(
      buildWorkspaceHandoffHref('/owner/repo/workspaces', {
        branch: 'feature/a',
        commitHash: 'sha256:a-head',
        workspaceId: 'workspace_a',
        conversationId: 'conv_a',
        sourceView: 'chat',
      })
    ).toBe(
      '/owner/repo/workspaces?branch=feature%2Fa&commit=sha256%3Aa-head&workspace=workspace_a&conversation=conv_a&sourceView=chat'
    );

    expect(
      buildWorkspaceHandoffHref('/owner/repo/workspaces', {
        branch: 'feature/b',
        commitHash: 'sha256:b-head',
      })
    ).toBe('/owner/repo/workspaces?branch=feature%2Fb&commit=sha256%3Ab-head');
  });
});
