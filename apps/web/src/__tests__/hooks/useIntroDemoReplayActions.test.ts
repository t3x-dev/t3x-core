// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';
import { readIntroDemoLocalCommit } from '@/hooks/onboarding/introDemoLocalCommit';
import {
  demoOps,
  demoTree,
  INTRO_DEMO_ROOT_KEY,
  useIntroDemoReplayActions,
} from '@/hooks/onboarding/useIntroDemoReplayActions';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { cleanupRoots, renderHook } from './renderHook';

const mocks = vi.hoisted(() => ({
  createCommit: vi.fn(),
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/commands/commits', () => ({
  createCommit: mocks.createCommit,
}));

vi.mock('sonner', () => ({
  toast: mocks.toast,
}));

const OLD_DEMO_ROOT_KEY = 'support_escalation_review';

describe('useIntroDemoReplayActions demo content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.setState({
      activeProjectId: null,
      panelExpandedByProject: {},
      panelExpandedByTemporaryConversation: {},
      pendingPanelExpanded: null,
      draftsByConversation: {},
    });
    useChatStore.setState({
      activeConversationId: null,
      activeProjectId: null,
      activeBranch: 'main',
      conversationTitle: null,
      refreshKey: 0,
    });
    useCommitStore.setState({
      lastCommitHash: null,
      beforeCommitHash: null,
      committedNodeIds: {},
      committedNodeSnapshot: {},
      commitBranch: 'main',
      projectId: null,
      conversationTitle: null,
      isCommitting: false,
      commitError: null,
    });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupRoots();
    window.sessionStorage.clear();
  });

  it('keeps extracted demo YAML content while removing the old bundled root name', () => {
    const tree = demoTree();
    const yaml = serializeOpsToYaml(demoOps());

    expect(tree.trees[0]?.key).toBe(INTRO_DEMO_ROOT_KEY);
    expect(tree.trees[0]?.children.length).toBeGreaterThan(0);
    expect(tree.relations[0]?.from).toContain(INTRO_DEMO_ROOT_KEY);
    expect(yaml).toContain(INTRO_DEMO_ROOT_KEY);
    expect(yaml).toContain('refund_policy');
    expect(yaml).not.toContain(OLD_DEMO_ROOT_KEY);
  });

  it('persists the demo commit through the commit API and records the returned hash', async () => {
    vi.useFakeTimers();
    const apiHash = 'sha256:api_demo_commit';
    mocks.createCommit.mockResolvedValueOnce({ commit: { hash: apiHash } });
    const commitEvents: CustomEvent[] = [];
    const onCommitCreated = (event: Event) => commitEvents.push(event as CustomEvent);
    window.addEventListener('t3x:commit-created', onCommitCreated);

    useChatStore.getState().setActiveConversation('conv_demo', 'proj_demo');
    useChatStore.getState().setActiveBranch('demo-branch');
    useWorkspaceStore.getState().setConversation('conv_demo');
    useWorkspaceStore.getState().setActiveProject('proj_demo');
    useWorkspaceStore.getState().setDerived({
      tree: demoTree(),
      sourceIndex: new Map(),
      opsLog: demoOps(),
      hasConversationChanges: true,
    });
    useCommitStore.setState({
      projectId: 'proj_demo',
      lastCommitHash: 'sha256:seed',
      commitBranch: 'demo-branch',
      conversationTitle: 'Prompt Review Demo',
    });

    const { result } = renderHook(() => useIntroDemoReplayActions());
    const commitPromise = result.current.commit('Prompt Review Intake');
    await vi.advanceTimersByTimeAsync(420);
    const hash = await commitPromise;

    window.removeEventListener('t3x:commit-created', onCommitCreated);

    expect(hash).toBe(apiHash);
    expect(mocks.createCommit).toHaveBeenCalledWith(
      'proj_demo',
      expect.objectContaining({
        trees: expect.any(Array),
        relations: expect.any(Array),
      }),
      expect.objectContaining({
        parents: ['sha256:seed'],
        branch: 'demo-branch',
        message: 'Prompt Review Intake',
        sources: [{ type: 'conversation', id: 'conv_demo', title: 'Prompt Review Demo' }],
        source_conversation_id: 'conv_demo',
        provenance: { method: 'llm_extraction', model: 'fixture-replay' },
      })
    );
    expect(readIntroDemoLocalCommit('proj_demo')?.hash).toBe(apiHash);
    expect(useWorkspaceStore.getState().isCommitted).toBe(true);
    expect(commitEvents[0]?.detail.payload.hash).toBe(apiHash);
    expect(useChatStore.getState().refreshKey).toBe(1);
  });
});
