// @vitest-environment jsdom

import type { SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchConversationSnapshotMock = vi.fn();
vi.mock('@/queries/loadConversation', () => ({
  fetchConversationSnapshot: (...args: unknown[]) => fetchConversationSnapshotMock(...args),
}));

import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { selectPanelExpanded, useWorkspaceStore } from '@/store/workspaceStore';

const EMPTY_TREE: SemanticContent = { trees: [], relations: [] };
const SAMPLE_TREE: SemanticContent = {
  trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }],
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

function snapshot(opts: { ops?: SourcedYOp[]; tree?: SemanticContent }): {
  turns: Array<{ turn_hash: string; content: string }>;
  opsLog: SourcedYOp[];
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;
} {
  return {
    turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
    opsLog: opts.ops ?? [],
    tree: opts.tree ?? EMPTY_TREE,
    sourceIndex: new Map<string, Source>(),
  };
}

describe('hydrateConversationToStore — discoverability auto-expand (PR-C P2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
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
});
