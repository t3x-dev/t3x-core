import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockState, resetMockState } = vi.hoisted(() => {
  type Project = {
    projectId: string;
    name: string;
    createdAt: Date;
    ownerId: string | null;
    defaultProvider: string | null;
    defaultModel: string | null;
    providerConfig: string | null;
  };

  type Conversation = {
    conversationId: string;
    projectId: string;
    title: string;
    provider: string | null;
    model: string | null;
  };

  type Draft = {
    id: string;
    project_id: string;
    title: string;
    status: 'editing' | 'committed';
    revision: number;
    nodes: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }>;
    parent_commit_hash?: string;
    committed_as?: string;
  };

  type Commit = {
    hash: string;
    schema: string;
    parents: string[];
    author: { type: 'human'; name: 'mcp' };
    committed_at: string;
    content: { trees: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }>; relations: unknown[] };
    project_id: string;
    message: string;
    branch: string;
    provenance: { method: 'human_curation' };
    yops_log_ids: string[];
    sources: null;
  };

  type MergeDraft = {
    draftId: string;
    projectId: string;
    sourceHash: string;
    targetHash: string;
    targetBranch: string | null;
    preparedJson: string;
    status: 'pending' | 'committed' | 'cancelled';
  };

  const state = {
    projects: new Map<string, Project>(),
    conversations: new Map<string, Conversation>(),
    turns: [] as Array<{
      turnHash: string;
      projectId: string;
      conversationId: string;
      role: 'user' | 'assistant';
      content: string;
    }>,
    drafts: new Map<string, Draft>(),
    commits: new Map<string, Commit>(),
    mergeDrafts: new Map<string, MergeDraft>(),
    counters: {
      project: 1,
      conversation: 1,
      draft: 1,
      commit: 1,
      merge: 1,
      turn: 1,
    },
  };

  const reset = () => {
    state.projects.clear();
    state.conversations.clear();
    state.turns = [];
    state.drafts.clear();
    state.commits.clear();
    state.mergeDrafts.clear();
    state.counters = {
      project: 1,
      conversation: 1,
      draft: 1,
      commit: 1,
      merge: 1,
      turn: 1,
    };
  };

  return {
    mockState: state,
    resetMockState: reset,
  };
});

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('@t3x-dev/core', () => ({
  ALL_LEAF_TYPES: ['tweet', 'weibo', 'wechat', 'email', 'article', 'slack', 'deploy_agent'],
  createDefaultProviderRegistry: vi.fn(() => ({
    getById: vi.fn((providerId: string) => ({ id: providerId })),
    getEntry: vi.fn((providerId: string) =>
      providerId === 'openai' ? { defaultModel: 'gpt-5.4' } : undefined
    ),
    getProviderIdsForRole: vi.fn(() => ['openai']),
    isConfigured: vi.fn((providerId: string) => providerId === 'openai'),
    importConfig: vi.fn(),
    listProviders: vi.fn(() => [
      { id: 'openai', defaultModel: 'gpt-5.4', availableModels: ['gpt-5.4'] },
    ]),
  })),
  getCanonicalModelId: vi.fn((model: string) => model),
  getModelInfo: vi.fn((model: string) =>
    model === 'gpt-5.4' ? { provider: 'openai' } : null
  ),
  extractAndApply: vi.fn(
    ({ turns }: { turns: Array<{ content: string }> }) => {
      const text = turns.map((turn) => turn.content).join('\n');
      if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(text)) {
        return Promise.resolve({
          ok: true,
          draft: { schema: 't3x/extraction-draft', version: 1, mode: 'bootstrap', items: [] },
          compiled: { ops: [], warnings: [] },
          snapshot: { trees: [], relations: [] },
          turnHashByTag: {},
        });
      }

      const budgetMatches = [...text.matchAll(/(\d{3,5})/g)];
      const budget = budgetMatches.length
        ? Number(budgetMatches[budgetMatches.length - 1][1])
        : 5000;
      const destination = text.includes('Kyoto')
        ? 'Kyoto'
        : text.includes('Hangzhou')
          ? 'Hangzhou'
          : 'Tokyo';

      return Promise.resolve({
        ok: true,
        draft: { schema: 't3x/extraction-draft', version: 1, mode: 'bootstrap', items: [] },
        compiled: {
          ops: [{ op: 'populate', path: 'trip', values: { budget, destination } }],
          warnings: [],
        },
        snapshot: {
          trees: [{ key: 'trip', slots: { budget, destination }, children: [] }],
          relations: [],
        },
        turnHashByTag: { T1: 'sha256:turn-seeded' },
      });
    }
  ),
  diffCommits: vi.fn(
    (
      base: { trees: Array<{ slots: Record<string, unknown> }> },
      target: { trees: Array<{ slots: Record<string, unknown> }> }
    ) => {
      const baseSlots = base.trees[0]?.slots ?? {};
      const targetSlots = target.trees[0]?.slots ?? {};
      const modified =
        JSON.stringify(baseSlots) === JSON.stringify(targetSlots)
          ? []
          : [
              {
                path: 'trip',
                slotDiffs: Object.keys({ ...baseSlots, ...targetSlots }).map((key) => ({
                  key,
                  type: baseSlots[key] === targetSlots[key] ? 'unchanged' : 'changed',
                  oldValue: baseSlots[key],
                  newValue: targetSlots[key],
                })),
              },
            ];

      return {
        identical: modified.length === 0 ? [{ path: 'trip' }] : [],
        modified,
        onlyInSource: [],
        onlyInTarget: [],
        relationsAdded: [],
        relationsRemoved: [],
      };
    }
  ),
  prepareMerge: vi.fn(
    (
      _base: { trees: Array<{ slots: Record<string, unknown> }> },
      source: { trees: Array<{ slots: Record<string, unknown> }> },
      target: { trees: Array<{ slots: Record<string, unknown> }> }
    ) => ({
      autoKept: [],
      conflicts:
        JSON.stringify(source.trees[0]?.slots ?? {}) === JSON.stringify(target.trees[0]?.slots ?? {})
          ? []
          : [
              {
                path: 'trip',
                slotConflicts: [
                  {
                    key: 'budget',
                    sourceValue: source.trees[0]?.slots?.budget,
                    targetValue: target.trees[0]?.slots?.budget,
                  },
                ],
              },
            ],
      onlyInSource: [],
      onlyInTarget: [],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
    })
  ),
  executeMerge: vi.fn(
    (
      _base: unknown,
      source: { trees: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }>; relations: unknown[] },
      target: { trees: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }>; relations: unknown[] },
      _prepared: unknown,
      decisions: { conflictResolutions: Record<string, 'source' | 'target' | 'both'> }
    ) => {
      const resolution = decisions.conflictResolutions.trip ?? 'target';
      return resolution === 'source' ? source : target;
    }
  ),
  collectLessonsFromAssertions: vi.fn(() => []),
  generateLeafOutput: vi.fn(),
}));

vi.mock('../validate/pipeline.js', () => ({
  validateYOps: vi.fn(
    async (
      yopsYaml: string,
      currentContent: {
        trees: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }>;
        relations: unknown[];
      }
    ) => {
      const valueMatch = yopsYaml.match(/value:\s*(\d+)/);
      const nextBudget = valueMatch ? Number(valueMatch[1]) : 5000;
      const nextTrees = currentContent.trees.map((tree) =>
        tree.key === 'trip'
          ? { ...tree, slots: { ...tree.slots, budget: nextBudget } }
          : tree
      );

      return {
        ok: true,
        errors: [],
        auto_fixes: [],
        warnings: [],
        parsed_yops: [{ set: { path: 'trip/budget', value: nextBudget } }],
        result_doc: {
          trees: nextTrees,
          relations: currentContent.relations,
        },
      };
    }
  ),
}));

vi.mock('@t3x-dev/storage', () => ({
  findProjects: vi.fn(async () => [...mockState.projects.values()]),
  findProjectById: vi.fn(async (_db: unknown, id: string) => mockState.projects.get(id) ?? null),
  insertProject: vi.fn(async (_db: unknown, { name }: { name: string }) => {
    const projectId = `proj_${mockState.counters.project++}`;
    const project = {
      projectId,
      name,
      createdAt: new Date('2026-04-22T00:00:00.000Z'),
      ownerId: 'user_1',
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      providerConfig: null,
    };
    mockState.projects.set(projectId, project);
    return project;
  }),
  insertBranch: vi.fn(async () => ({
    branchId: 'branch_main',
    projectId: 'proj_1',
    name: 'main',
    parentBranch: null,
    createdAt: new Date('2026-04-22T00:00:00.000Z'),
  })),
  findBranchesByProject: vi.fn(async () => [
    { branchId: 'branch_main', projectId: 'proj_1', name: 'main' },
  ]),
  findConversationById: vi.fn(
    async (_db: unknown, id: string) => mockState.conversations.get(id) ?? null
  ),
  findConversationsByProject: vi.fn(async () => [...mockState.conversations.values()]),
  insertConversation: vi.fn(
    async (_db: unknown, { projectId, title }: { projectId: string; title: string }) => {
      const conversationId = `conv_${mockState.counters.conversation++}`;
      const conversation = {
        conversationId,
        projectId,
        title,
        provider: null,
        model: null,
      };
      mockState.conversations.set(conversationId, conversation);
      return conversation;
    }
  ),
  insertTurn: vi.fn(
    async (
      _db: unknown,
      input: {
        projectId: string;
        conversationId: string;
        role: 'user' | 'assistant';
        content: string;
      }
    ) => {
      const turn = {
        turnHash: `sha256:turn${mockState.counters.turn++}`,
        projectId: input.projectId,
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
      };
      mockState.turns.push(turn);
      return turn;
    }
  ),
  findTurnsByConversation: vi.fn(
    async (_db: unknown, { conversationId }: { conversationId: string }) =>
      mockState.turns.filter((turn) => turn.conversationId === conversationId)
  ),
  insertDraft: vi.fn(
    async (_db: unknown, { project_id, title }: { project_id: string; title: string }) => {
      const draftId = `draft_${mockState.counters.draft++}`;
      const draft = {
        id: draftId,
        project_id,
        title,
        status: 'editing' as const,
        revision: 1,
        nodes: [],
      };
      mockState.drafts.set(draftId, draft);
      return draft;
    }
  ),
  findDraftById: vi.fn(async (_db: unknown, id: string) => mockState.drafts.get(id) ?? null),
  listDraftsByProject: vi.fn(async (_db: unknown, projectId: string) =>
    [...mockState.drafts.values()].filter((draft) => draft.project_id === projectId)
  ),
  updateDraft: vi.fn(
    async (
      _db: unknown,
      draftId: string,
      patch: { nodes?: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }> },
      _revision: number
    ) => {
      const draft = mockState.drafts.get(draftId);
      if (!draft) throw new Error(`Draft not found: ${draftId}`);
      const updated = {
        ...draft,
        nodes: patch.nodes ?? draft.nodes,
        revision: draft.revision + 1,
      };
      mockState.drafts.set(draftId, updated);
      return updated;
    }
  ),
  createCommit: vi.fn(async (_db: unknown, input: Omit<Commit, 'hash' | 'schema' | 'committed_at' | 'yops_log_ids' | 'sources'>) => {
    const hash = `sha256:commit${mockState.counters.commit++}`;
    const commit = {
      hash,
      schema: 't3x/commit',
      committed_at: new Date('2026-04-22T00:00:00.000Z').toISOString(),
      yops_log_ids: [],
      sources: null,
      ...input,
    };
    mockState.commits.set(hash, commit);
    return commit;
  }),
  commitDraft: vi.fn(async (_db: unknown, draftId: string, hash: string) => {
    const draft = mockState.drafts.get(draftId);
    if (draft) {
      mockState.drafts.set(draftId, {
        ...draft,
        status: 'committed',
        committed_as: hash,
      });
    }
    return true;
  }),
  getCommit: vi.fn(async (_db: unknown, hash: string) => mockState.commits.get(hash) ?? null),
  getCommitUnified: vi.fn(async (_db: unknown, hash: string) => mockState.commits.get(hash) ?? null),
  listCommits: vi.fn(async (_db: unknown, { projectId }: { projectId: string }) =>
    [...mockState.commits.values()].filter((commit) => commit.project_id === projectId)
  ),
  createMergeDraft: vi.fn(
    async (
      _db: unknown,
      input: { projectId: string; sourceHash: string; targetHash: string; prepared: unknown }
    ) => {
      const draftId = `md_${mockState.counters.merge++}`;
      const draft = {
        draftId,
        projectId: input.projectId,
        sourceHash: input.sourceHash,
        targetHash: input.targetHash,
        targetBranch: 'main',
        preparedJson: JSON.stringify(input.prepared),
        status: 'pending' as const,
      };
      mockState.mergeDrafts.set(draftId, draft);
      return draft;
    }
  ),
  getMergeDraft: vi.fn(
    async (_db: unknown, draftId: string) => mockState.mergeDrafts.get(draftId) ?? null
  ),
  updateMergeDraft: vi.fn(
    async (
      _db: unknown,
      draftId: string,
      patch: { prepared?: unknown; status?: 'pending' | 'committed' | 'cancelled' }
    ) => {
      const draft = mockState.mergeDrafts.get(draftId);
      if (!draft) throw new Error(`Merge draft not found: ${draftId}`);
      const updated = {
        ...draft,
        preparedJson: patch.prepared ? JSON.stringify(patch.prepared) : draft.preparedJson,
        status: patch.status ?? draft.status,
      };
      mockState.mergeDrafts.set(draftId, updated);
      return updated;
    }
  ),
  cancelMergeDraft: vi.fn(async (_db: unknown, draftId: string) => {
    const draft = mockState.mergeDrafts.get(draftId);
    if (!draft) return null;
    const updated = { ...draft, status: 'cancelled' as const };
    mockState.mergeDrafts.set(draftId, updated);
    return updated;
  }),
  createPin: vi.fn(),
  deletePin: vi.fn(),
  findPinById: vi.fn(async () => null),
  findPinsByProject: vi.fn(async () => []),
  findLeafById: vi.fn(async () => null),
  findLeavesByProject: vi.fn(async () => []),
  findLeavesByCommit: vi.fn(async () => []),
  findAgentDraftById: vi.fn(async () => null),
  findAgentDraftsByProject: vi.fn(async () => []),
  updateLeaf: vi.fn(),
  updateLeafOutput: vi.fn(),
  recordEvent: vi.fn(async () => 1n),
  getProviderCredentialBundle: vi.fn(async () => ({
    secrets: { OPENAI_API_KEY: 'sk-openai' },
    safe: {
      openai: {
        configured: true,
        defaultModel: 'gpt-5.4',
        lastTestStatus: null,
        lastTestedAt: null,
        lastTestError: null,
      },
    },
  })),
  getGlobalSetting: vi.fn(async () => null),
  findUserById: vi.fn(async () => ({
    id: 'user_1',
    default_provider: 'openai',
    default_model: 'gpt-5.4',
  })),
}));

import { createMcpServer } from '../server.js';

function getCallTool() {
  const { server } = createMcpServer({ toolsets: ['core', 'advanced'] });
  const handler = (server as unknown as { _requestHandlers: Map<string, Function> })._requestHandlers.get(
    'tools/call'
  );
  expect(handler).toBeDefined();

  return async (name: string, args?: Record<string, unknown>) =>
    (handler as Function)({
      method: 'tools/call',
      jsonrpc: '2.0',
      id: 1,
      params: {
        name,
        arguments: args,
      },
    }) as Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
}

function getText(result: { content: Array<{ text: string }> }) {
  return result.content[0].text;
}

function expectOkJson(result: { content: Array<{ text: string }>; isError?: boolean }) {
  expect(result.isError).toBeUndefined();
  return JSON.parse(getText(result));
}

describe('mcp audit scenarios', () => {
  beforeEach(async () => {
    resetMockState();
    const { resetProviderRegistry } = await import('../provider-runtime.js');
    resetProviderRegistry();
  });

  it('runs extract -> query -> edit -> commit -> extract -> commit -> diff with current semantics', async () => {
    const callTool = getCallTool();

    const project = expectOkJson(
      await callTool('t3x_admin', { action: 'create_project', name: 'Scenario A1/A2' })
    );

    const firstExtract = expectOkJson(
      await callTool('t3x_extract', {
        project_id: project.project_id,
        text: 'Plan a Tokyo trip with budget 5000',
      })
    );
    expect(firstExtract.is_new_conversation).toBe(true);

    const firstDraft = expectOkJson(
      await callTool('t3x_query', { target: 'draft', id: firstExtract.draft_id })
    );
    expect(firstDraft.id).toBe(firstExtract.draft_id);

    const edited = expectOkJson(
      await callTool('t3x_edit', {
        draft_id: firstExtract.draft_id,
        yops: 'yops:\n  - set:\n      path: trip/budget\n      value: 7000',
        if_revision: firstDraft.revision,
      })
    );
    expect(edited.applied).toBe(true);

    const firstCommit = expectOkJson(
      await callTool('t3x_commit', {
        project_id: project.project_id,
        draft_id: firstExtract.draft_id,
        message: 'Initial snapshot',
      })
    );
    expect(firstCommit.parents).toEqual([]);

    const secondExtract = expectOkJson(
      await callTool('t3x_extract', {
        project_id: project.project_id,
        conversation_id: firstExtract.conversation_id,
        text: 'Add a Kyoto stop and budget 8000',
      })
    );
    expect(secondExtract.conversation_id).toBe(firstExtract.conversation_id);
    expect(secondExtract.is_new_conversation).toBe(false);

    const secondCommit = expectOkJson(
      await callTool('t3x_commit', {
        project_id: project.project_id,
        draft_id: secondExtract.draft_id,
        message: 'Follow-up snapshot',
      })
    );
    expect(secondCommit.parents).toEqual([]);

    const legacyDiff = await callTool('t3x_diff', {
      source: firstCommit.commit_hash,
      target: secondCommit.commit_hash,
    });
    expect(legacyDiff.isError).toBe(true);
    expect(getText(legacyDiff)).toContain('"base" is required');

    const diff = expectOkJson(
      await callTool('t3x_diff', {
        base: firstCommit.commit_hash,
        target: secondCommit.commit_hash,
      })
    );
    expect(diff.base).toBe(firstCommit.commit_hash);
    expect(diff.target).toBe(secondCommit.commit_hash);
    expect(diff.summary.modified).toBe(1);
  });

  it('runs the documented merge five-step flow through tools/call', async () => {
    const callTool = getCallTool();

    const project = expectOkJson(
      await callTool('t3x_admin', { action: 'create_project', name: 'Scenario A4' })
    );

    const firstExtract = expectOkJson(
      await callTool('t3x_extract', {
        project_id: project.project_id,
        text: 'Plan a Tokyo trip with budget 5000',
      })
    );
    const firstCommit = expectOkJson(
      await callTool('t3x_commit', {
        project_id: project.project_id,
        draft_id: firstExtract.draft_id,
        message: 'Base snapshot',
      })
    );

    const secondExtract = expectOkJson(
      await callTool('t3x_extract', {
        project_id: project.project_id,
        text: 'Plan a Kyoto trip with budget 8000',
      })
    );
    const secondCommit = expectOkJson(
      await callTool('t3x_commit', {
        project_id: project.project_id,
        draft_id: secondExtract.draft_id,
        message: 'Variant snapshot',
      })
    );

    const prepared = expectOkJson(
      await callTool('t3x_merge', {
        action: 'prepare',
        project_id: project.project_id,
        source_hash: firstCommit.commit_hash,
        target_hash: secondCommit.commit_hash,
      })
    );
    expect(prepared.summary.conflicts).toBe(1);

    const shown = expectOkJson(
      await callTool('t3x_merge', {
        action: 'show_conflict',
        draft_id: prepared.draft_id,
        index: 0,
      })
    );
    expect(shown.conflict.path).toBe('trip');

    const resolved = expectOkJson(
      await callTool('t3x_merge', {
        action: 'resolve',
        draft_id: prepared.draft_id,
        index: 0,
        resolution: 'source',
        reasoning: 'Keep the original budget',
      })
    );
    expect(resolved.progress).toBe('1/1 conflicts resolved');

    const executed = expectOkJson(
      await callTool('t3x_merge', {
        action: 'execute',
        draft_id: prepared.draft_id,
        message: 'Merge scenario',
      })
    );
    expect(executed.parents).toEqual([firstCommit.commit_hash, secondCommit.commit_hash]);
  });

  it('distinguishes empty text from non-extractable text through tools/call', async () => {
    const callTool = getCallTool();

    const project = expectOkJson(
      await callTool('t3x_admin', { action: 'create_project', name: 'Scenario A5' })
    );

    const emptyText = await callTool('t3x_extract', {
      project_id: project.project_id,
      text: '',
    });
    expect(emptyText.isError).toBe(true);
    expect(getText(emptyText)).toContain('"text" is required');

    const noExtractableContent = await callTool('t3x_extract', {
      project_id: project.project_id,
      text: '!!! ???',
    });
    expect(noExtractableContent.isError).toBe(true);
    expect(getText(noExtractableContent)).toContain('No extractable content found');
  });
});
