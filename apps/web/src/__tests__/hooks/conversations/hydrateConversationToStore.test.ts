// @vitest-environment jsdom

import type { SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchConversationSnapshotMock = vi.fn();
vi.mock('@/queries/loadConversation', () => ({
  fetchConversationSnapshot: (...args: unknown[]) => fetchConversationSnapshotMock(...args),
}));

import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { selectPanelExpanded, useWorkspaceStore } from '@/store/workspaceStore';

const EMPTY_TREE: SemanticContent = { trees: [], relations: [] };
const SAMPLE_TREE: SemanticContent = {
  trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }],
  relations: [],
};
const FOOTBALL_TREE: SemanticContent = {
  trees: [{ key: 'football', slots: { team: 'academy' }, children: [] }],
  relations: [],
};
const SAMPLE_OPS: SourcedYOp[] = [
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

function snapshot(opts: {
  ops?: SourcedYOp[];
  tree?: SemanticContent;
  committedAs?: string | null;
  committedAt?: string | null;
  parentCommitHash?: string | null;
  parentCommitBranch?: string | null;
}): {
  turns: Array<{
    turn_hash: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
  }>;
  opsLog: SourcedYOp[];
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;
  committedAs?: string | null;
  committedAt?: string | null;
  parentCommitHash?: string | null;
  parentCommitBranch?: string | null;
} {
  return {
    turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
    opsLog: opts.ops ?? [],
    tree: opts.tree ?? EMPTY_TREE,
    sourceIndex: new Map<string, Source>(),
    committedAs: opts.committedAs,
    committedAt: opts.committedAt,
    parentCommitHash: opts.parentCommitHash,
    parentCommitBranch: opts.parentCommitBranch,
  };
}

describe('hydrateConversationToStore — discoverability auto-expand (PR-C P2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    useCommitStore.setState({
      confirmedNodeIds: {},
      confirmedSlotKeys: {},
      manualEditedNodeIds: new Set(),
      lastCommitHash: null,
      committedNodeIds: {},
      committedNodeSnapshot: {},
      commitBranch: 'main',
      projectId: null,
      conversationTitle: null,
      isCommitting: false,
      commitError: null,
    });
    useChatStore.setState({ activeBranch: 'main' });
    useWorkspaceStore.setState({
      panelExpandedByProject: {},
      activeProjectId: null,
      pendingPanelExpanded: null,
      draftsByConversation: {},
    });
  });

  it('auto-expands when the project has no preference and the conversation has ops', async () => {
    // Real-world cold load: /chat/conv_X mounts, no per-project pref
    // for proj_X, hydrate finds 1 yops_log row and 1 tree. The panel
    // should open automatically — content-bearing conversations should
    // not require a manual click on the collapsed Workspace strip just
    // to reveal the data the URL already pointed at.
    fetchConversationSnapshotMock.mockResolvedValueOnce(
      snapshot({ ops: SAMPLE_OPS, tree: SAMPLE_TREE })
    );

    await hydrateConversationToStore('proj_X', 'conv_X');

    const s = useWorkspaceStore.getState();
    expect(s.panelExpandedByProject).toEqual({ proj_X: true });
    // setActiveProject hasn't been called by hydrate (the page useEffect
    // owns that), so selectPanelExpanded would still be false until the
    // page mirrors the project. The map write is what we're verifying.
    useWorkspaceStore.getState().setActiveProject('proj_X');
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(true);
  });

  it('does NOT override an explicit false preference even when content is present', () => {
    // Load-bearing case: a user who folded the panel for proj_X must
    // have that choice respected for every subsequent conversation in
    // that project, regardless of how much content the conversation
    // has. Auto-expand keys off `(projectId in panelExpandedByProject)`
    // — explicit `false` is "in" and the auto-expand is skipped.
    useWorkspaceStore.getState().setProjectPanelExpansion('proj_X', false);
    fetchConversationSnapshotMock.mockResolvedValueOnce(
      snapshot({ ops: SAMPLE_OPS, tree: SAMPLE_TREE })
    );

    return hydrateConversationToStore('proj_X', 'conv_X').then(() => {
      const s = useWorkspaceStore.getState();
      expect(s.panelExpandedByProject).toEqual({ proj_X: false });
    });
  });

  it('does NOT auto-expand an empty conversation (no ops, no tree, no relations, no draft)', async () => {
    // The auto-expand is content-conditional — a brand-new chat with
    // no extracted knowledge yet has nothing to reveal, so opening the
    // panel automatically would just show "No knowledge extracted yet"
    // and steal screen real estate. Wait until the user clicks Extract.
    fetchConversationSnapshotMock.mockResolvedValueOnce(snapshot({}));

    await hydrateConversationToStore('proj_Empty', 'conv_Empty');

    expect(useWorkspaceStore.getState().panelExpandedByProject).toEqual({});
  });

  it('does NOT mark hasContent based on relations alone, but does respect them when present', async () => {
    // Relations carry user-visible knowledge (cross-tree edges). A
    // conversation with relations but no trees still has something
    // worth showing.
    const treeWithRelationsOnly: SemanticContent = {
      trees: [],
      relations: [{ from: 'a', to: 'b', type: 'causes' }],
    };
    fetchConversationSnapshotMock.mockResolvedValueOnce(snapshot({ tree: treeWithRelationsOnly }));

    await hydrateConversationToStore('proj_Rel', 'conv_Rel');

    expect(useWorkspaceStore.getState().panelExpandedByProject).toEqual({
      proj_Rel: true,
    });
  });

  it('locks committed snapshots and clears stale local draft cache', async () => {
    useWorkspaceStore.setState({
      conversationId: 'conv_Committed',
      draftsByConversation: {
        conv_Committed: {
          ops: SAMPLE_OPS,
          scriptText: 'yops:\n- stale: true',
          tree: SAMPLE_TREE,
          dirty: true,
          baseOpsCount: 0,
          baseTurnCount: 1,
        },
      },
    });
    fetchConversationSnapshotMock.mockResolvedValueOnce(
      snapshot({
        ops: SAMPLE_OPS,
        tree: SAMPLE_TREE,
        committedAs: 'sha256:committed',
        committedAt: '2026-04-27T00:00:00.000Z',
      })
    );

    await hydrateConversationToStore('proj_Committed', 'conv_Committed');

    const workspace = useWorkspaceStore.getState();
    expect(workspace.isCommitted).toBe(true);
    expect(workspace.hasDraft).toBe(false);
    expect(workspace.draftsByConversation.conv_Committed).toBeUndefined();
    expect(useCommitStore.getState().lastCommitHash).toBe('sha256:committed');
  });

  it('keeps inherited child conversations unlocked and seeds the parent commit hash', async () => {
    fetchConversationSnapshotMock.mockResolvedValueOnce(
      snapshot({
        tree: SAMPLE_TREE,
        parentCommitHash: 'sha256:parent_commit',
        parentCommitBranch: '5',
      })
    );

    await hydrateConversationToStore('proj_Child', 'conv_Child');

    expect(useWorkspaceStore.getState().isCommitted).toBe(false);
    expect(useWorkspaceStore.getState().baselineCommitHash).toBe('sha256:parent_commit');
    expect(useWorkspaceStore.getState().hasConversationChanges).toBe(false);
    expect(useCommitStore.getState().lastCommitHash).toBe('sha256:parent_commit');
    expect(useCommitStore.getState().commitBranch).toBe('5');
    expect(useChatStore.getState().activeBranch).toBe('5');
  });

  it('marks inherited children with applied YOps as having conversation changes', async () => {
    fetchConversationSnapshotMock.mockResolvedValueOnce(
      snapshot({
        ops: SAMPLE_OPS,
        tree: SAMPLE_TREE,
        parentCommitHash: 'sha256:parent_commit',
      })
    );

    await hydrateConversationToStore('proj_Child', 'conv_Child');

    expect(useWorkspaceStore.getState().baselineCommitHash).toBe('sha256:parent_commit');
    expect(useWorkspaceStore.getState().hasConversationChanges).toBe(true);
  });

  it('ignores a stale hydration response after the active conversation changes', async () => {
    let resolveOldSnapshot: (value: ReturnType<typeof snapshot>) => void = () => {};
    fetchConversationSnapshotMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOldSnapshot = resolve;
      })
    );
    useChatStore.getState().setActiveConversation('conv_Old', 'proj_Old');

    const oldHydration = hydrateConversationToStore('proj_Old', 'conv_Old');

    useChatStore.getState().setActiveConversation('conv_New', 'proj_New');
    useWorkspaceStore.getState().setConversation('conv_New');
    useWorkspaceStore.getState().setDerived({
      tree: FOOTBALL_TREE,
      sourceIndex: new Map(),
      opsLog: [],
    });

    resolveOldSnapshot(snapshot({ ops: SAMPLE_OPS, tree: SAMPLE_TREE }));
    await oldHydration;

    const workspace = useWorkspaceStore.getState();
    expect(workspace.conversationId).toBe('conv_New');
    expect(workspace.tree.trees[0]?.key).toBe('football');
  });
});
