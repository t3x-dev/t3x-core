import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { state, resetState } = vi.hoisted(() => {
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
    content: {
      trees: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }>;
      relations: unknown[];
    };
    project_id: string;
    message: string;
    branch: string;
    provenance: { method: 'human_curation' };
    yops_log_ids: string[];
    sources: null;
  };

  type Leaf = {
    id: string;
    commit_hash: string;
    type: string;
    title: string;
    constraints: Array<{
      id: string;
      type: 'require' | 'exclude';
      match_mode: 'exact' | 'semantic';
      value: string;
    }>;
    config: Record<string, unknown>;
    output: string | null;
    assertions: unknown[];
    project_id: string;
    created_at: string;
    generated_at: string | null;
  };

  const shared = {
    projects: new Map<string, Project>(),
    conversations: new Map<string, Conversation>(),
    drafts: new Map<string, Draft>(),
    commits: new Map<string, Commit>(),
    leaves: new Map<string, Leaf>(),
    turns: [] as Array<{
      turnHash: string;
      projectId: string;
      conversationId: string;
      role: 'user' | 'assistant';
      content: string;
    }>,
    counters: {
      project: 1,
      conversation: 1,
      draft: 1,
      commit: 1,
      leaf: 1,
      turn: 1,
    },
  };

  const reset = () => {
    shared.projects.clear();
    shared.conversations.clear();
    shared.drafts.clear();
    shared.commits.clear();
    shared.leaves.clear();
    shared.turns = [];
    shared.counters = {
      project: 1,
      conversation: 1,
      draft: 1,
      commit: 1,
      leaf: 1,
      turn: 1,
    };
  };

  return { state: shared, resetState: reset };
});

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('@t3x-dev/core', () => ({
  ALL_LEAF_TYPES: ['tweet', 'weibo', 'wechat', 'email', 'article', 'slack', 'deploy_agent'],
  createDefaultProviderRegistry: vi.fn(() => ({
    getById: vi.fn((providerId: string) => ({ id: providerId })),
    getEntry: vi.fn(() => ({ defaultModel: 'gpt-5.4' })),
    getProviderIdsForRole: vi.fn(() => ['openai']),
    isConfigured: vi.fn(() => true),
    importConfig: vi.fn(),
    listProviders: vi.fn(() => [
      { id: 'openai', defaultModel: 'gpt-5.4', availableModels: ['gpt-5.4'] },
    ]),
  })),
  getCanonicalModelId: vi.fn((model: string) => model),
  getModelInfo: vi.fn((model: string) => (model === 'gpt-5.4' ? { provider: 'openai' } : null)),
  extractAndApply: vi.fn(({ turns }: { turns: Array<{ content: string }> }) => {
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

    const budget = text.includes('8000') ? 8000 : 5000;
    const destination = text.includes('Kyoto') ? 'Kyoto' : 'Tokyo';

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
      turnHashByTag: { T1: 'sha256:turn1' },
    });
  }),
  diffCommits: vi.fn(
    (
      base: { trees: Array<{ slots: Record<string, unknown> }> },
      target: { trees: Array<{ slots: Record<string, unknown> }> }
    ) => ({
      identical: [],
      modified:
        JSON.stringify(base.trees[0]?.slots ?? {}) === JSON.stringify(target.trees[0]?.slots ?? {})
          ? []
          : [
              {
                path: 'trip',
                slotDiffs: [
                  {
                    key: 'budget',
                    type: 'changed',
                    oldValue: base.trees[0]?.slots?.budget,
                    newValue: target.trees[0]?.slots?.budget,
                  },
                ],
              },
            ],
      onlyInSource: [],
      onlyInTarget: [],
      relationsAdded: [],
      relationsRemoved: [],
    })
  ),
  prepareMerge: vi.fn(),
  executeMerge: vi.fn(),
  collectLessonsFromAssertions: vi.fn(() => []),
  generateLeafOutput: vi.fn(async ({ leaf, model }: { leaf: { id: string }; model: string }) => ({
    output: `Generated output for ${leaf.id}`,
    model,
    usage: {
      inputTokens: 123,
      outputTokens: 45,
    },
    attempts: 1,
    validation: {
      allPassed: true,
      passedCount: 1,
      failedCount: 0,
      assertions: [
        {
          id: 'ast_1',
          constraint_id: 'cst_1',
          passed: true,
          details: 'Constraint satisfied',
        },
      ],
    },
  })),
}));

vi.mock('@t3x-dev/storage', () => ({
  findProjects: vi.fn(async () => [...state.projects.values()]),
  findProjectById: vi.fn(async (_db: unknown, id: string) => state.projects.get(id) ?? null),
  insertProject: vi.fn(async (_db: unknown, { name }: { name: string }) => {
    const projectId = `proj_${state.counters.project++}`;
    const project = {
      projectId,
      name,
      createdAt: new Date('2026-04-22T00:00:00.000Z'),
      ownerId: 'user_1',
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      providerConfig: null,
    };
    state.projects.set(projectId, project);
    return project;
  }),
  insertConversation: vi.fn(
    async (_db: unknown, { projectId, title }: { projectId: string; title: string }) => {
      const conversationId = `conv_${state.counters.conversation++}`;
      const conversation = {
        conversationId,
        projectId,
        title,
        provider: null,
        model: null,
      };
      state.conversations.set(conversationId, conversation);
      return conversation;
    }
  ),
  findConversationById: vi.fn(
    async (_db: unknown, id: string) => state.conversations.get(id) ?? null
  ),
  findConversationsByProject: vi.fn(async () => [...state.conversations.values()]),
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
        turnHash: `sha256:turn${state.counters.turn++}`,
        projectId: input.projectId,
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
      };
      state.turns.push(turn);
      return turn;
    }
  ),
  findTurnsByConversation: vi.fn(
    async (_db: unknown, { conversationId }: { conversationId: string }) =>
      state.turns.filter((turn) => turn.conversationId === conversationId)
  ),
  insertDraft: vi.fn(
    async (_db: unknown, { project_id, title }: { project_id: string; title: string }) => {
      const draftId = `draft_${state.counters.draft++}`;
      const draft = {
        id: draftId,
        project_id,
        title,
        status: 'editing' as const,
        revision: 1,
        nodes: [],
      };
      state.drafts.set(draftId, draft);
      return draft;
    }
  ),
  updateDraft: vi.fn(
    async (
      _db: unknown,
      draftId: string,
      patch: { nodes?: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }> }
    ) => {
      const draft = state.drafts.get(draftId);
      if (!draft) throw new Error(`Draft not found: ${draftId}`);
      const updated = {
        ...draft,
        nodes: patch.nodes ?? draft.nodes,
        revision: draft.revision + 1,
      };
      state.drafts.set(draftId, updated);
      return updated;
    }
  ),
  findDraftById: vi.fn(async (_db: unknown, id: string) => state.drafts.get(id) ?? null),
  listDraftsByProject: vi.fn(async (_db: unknown, projectId: string) =>
    [...state.drafts.values()].filter((draft) => draft.project_id === projectId)
  ),
  createCommit: vi.fn(
    async (
      _db: unknown,
      input: Omit<
        typeof state.commits extends Map<string, infer T> ? T : never,
        'hash' | 'schema' | 'committed_at' | 'yops_log_ids' | 'sources'
      >
    ) => {
      const hash = `sha256:commit${state.counters.commit++}`;
      const commit = {
        hash,
        schema: 't3x/commit',
        committed_at: new Date('2026-04-22T00:00:00.000Z').toISOString(),
        yops_log_ids: [],
        sources: null,
        ...input,
      };
      state.commits.set(hash, commit);
      return commit;
    }
  ),
  createLeaf: vi.fn(
    async (
      _db: unknown,
      input: {
        commit_hash: string;
        type: string;
        title?: string;
        constraints?: Array<{
          id?: string;
          type: 'require' | 'exclude';
          match_mode: 'exact' | 'semantic';
          value: string;
        }>;
        config?: Record<string, unknown>;
        project_id: string;
      }
    ) => {
      const leafId = `leaf_${state.counters.leaf++}`;
      const leaf = {
        id: leafId,
        commit_hash: input.commit_hash,
        type: input.type,
        title: input.title ?? undefined,
        constraints: (input.constraints ?? []).map((constraint, index) => ({
          id: constraint.id ?? `cst_${index + 1}`,
          ...constraint,
        })),
        config: input.config ?? {},
        output: null,
        assertions: [],
        project_id: input.project_id,
        created_at: '2026-04-22T00:00:00.000Z',
        generated_at: null,
      };
      state.leaves.set(leafId, leaf);
      return leaf;
    }
  ),
  commitDraft: vi.fn(async (_db: unknown, draftId: string, hash: string) => {
    const draft = state.drafts.get(draftId);
    if (draft) {
      state.drafts.set(draftId, {
        ...draft,
        status: 'committed',
        committed_as: hash,
      });
    }
    return true;
  }),
  getCommit: vi.fn(async (_db: unknown, hash: string) => state.commits.get(hash) ?? null),
  getCommitUnified: vi.fn(async (_db: unknown, hash: string) => state.commits.get(hash) ?? null),
  listCommits: vi.fn(async (_db: unknown, { projectId }: { projectId: string }) =>
    [...state.commits.values()].filter((commit) => commit.project_id === projectId)
  ),
  findLeafById: vi.fn(async (_db: unknown, id: string) => state.leaves.get(id) ?? null),
  findLeavesByProject: vi.fn(async (_db: unknown, projectId: string) =>
    [...state.leaves.values()].filter((leaf) => leaf.project_id === projectId)
  ),
  findLeavesByCommit: vi.fn(async (_db: unknown, commitHash: string) =>
    [...state.leaves.values()].filter((leaf) => leaf.commit_hash === commitHash)
  ),
  findPinById: vi.fn(async () => null),
  findPinsByProject: vi.fn(async () => []),
  findAgentDraftById: vi.fn(async () => null),
  findAgentDraftsByProject: vi.fn(async () => []),
  findBranchesByProject: vi.fn(async () => []),
  getMergeDraft: vi.fn(async () => null),
  createMergeDraft: vi.fn(),
  updateMergeDraft: vi.fn(),
  cancelMergeDraft: vi.fn(),
  insertBranch: vi.fn(),
  createPin: vi.fn(),
  deletePin: vi.fn(),
  updateLeaf: vi.fn(async (_db: unknown, leafId: string, patch: { assertions?: unknown[] }) => {
    const leaf = state.leaves.get(leafId);
    if (!leaf) return null;
    const updated = {
      ...leaf,
      assertions: patch.assertions ?? leaf.assertions,
    };
    state.leaves.set(leafId, updated);
    return updated;
  }),
  updateLeafOutput: vi.fn(async (_db: unknown, leafId: string, output: string) => {
    const leaf = state.leaves.get(leafId);
    if (!leaf) return null;
    const updated = {
      ...leaf,
      output,
      generated_at: '2026-04-22T00:00:00.000Z',
    };
    state.leaves.set(leafId, updated);
    return updated;
  }),
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

async function connectClientAndServer() {
  const { server } = createMcpServer({ toolsets: ['core', 'advanced'] });
  const client = new Client(
    { name: 't3x-mcp-protocol-test-client', version: '0.0.0' },
    { capabilities: {} }
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}

function parseTextResult(result: { content: Array<{ type?: string; text?: string }> }) {
  return JSON.parse(result.content[0].text ?? '{}');
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('MCP protocol tool flows', () => {
  beforeEach(async () => {
    resetState();
    const { resetProviderRegistry } = await import('../provider-runtime.js');
    resetProviderRegistry();
  });

  it('advertises the current tool surface to clients', async () => {
    const { client } = await connectClientAndServer();

    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        't3x_query',
        't3x_commit',
        't3x_edit',
        't3x_extract',
        't3x_generate',
        't3x_diff',
        't3x_merge',
        't3x_admin',
      ])
    );
    expect(names).not.toContain('t3x_create_leaf');

    await client.close();
  });

  it('runs a create_project -> extract -> commit -> diff flow over the MCP protocol', async () => {
    const { client } = await connectClientAndServer();

    const project = parseTextResult(
      await client.callTool({
        name: 't3x_admin',
        arguments: { action: 'create_project', name: 'Protocol Flow' },
      })
    );

    const firstExtract = parseTextResult(
      await client.callTool({
        name: 't3x_extract',
        arguments: {
          project_id: project.project_id,
          text: 'Plan a Tokyo trip with budget 5000',
        },
      })
    );

    const firstCommit = parseTextResult(
      await client.callTool({
        name: 't3x_commit',
        arguments: {
          project_id: project.project_id,
          draft_id: firstExtract.draft_id,
          message: 'First snapshot',
        },
      })
    );
    expect(firstCommit.parents).toEqual([]);

    const secondExtract = parseTextResult(
      await client.callTool({
        name: 't3x_extract',
        arguments: {
          project_id: project.project_id,
          conversation_id: firstExtract.conversation_id,
          text: 'Add Kyoto and budget 8000',
        },
      })
    );

    const secondCommit = parseTextResult(
      await client.callTool({
        name: 't3x_commit',
        arguments: {
          project_id: project.project_id,
          draft_id: secondExtract.draft_id,
          message: 'Second snapshot',
        },
      })
    );
    expect(secondCommit.parents).toEqual([]);

    const legacyDiff = await client.callTool({
      name: 't3x_diff',
      arguments: {
        source: firstCommit.commit_hash,
        target: secondCommit.commit_hash,
      },
    });
    expect(legacyDiff.isError).toBe(true);
    expect(legacyDiff.content[0].text).toContain('"base" is required');

    const diff = parseTextResult(
      await client.callTool({
        name: 't3x_diff',
        arguments: {
          base: firstCommit.commit_hash,
          target: secondCommit.commit_hash,
        },
      })
    );
    expect(diff.summary.modified).toBe(1);

    await client.close();
  });

  it('surfaces generate boundary errors to protocol clients', async () => {
    const { client } = await connectClientAndServer();

    const result = await client.callTool({
      name: 't3x_generate',
      arguments: { commit_hash: 'sha256:commit1' },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"leaf_id" is required');

    await client.close();
  });

  it('generates output for an existing leaf over the MCP protocol', async () => {
    const { client } = await connectClientAndServer();

    const project = parseTextResult(
      await client.callTool({
        name: 't3x_admin',
        arguments: { action: 'create_project', name: 'Protocol Generate Flow' },
      })
    );

    const extract = parseTextResult(
      await client.callTool({
        name: 't3x_extract',
        arguments: {
          project_id: project.project_id,
          text: 'Plan a Tokyo trip with budget 5000',
        },
      })
    );

    const commit = parseTextResult(
      await client.callTool({
        name: 't3x_commit',
        arguments: {
          project_id: project.project_id,
          draft_id: extract.draft_id,
          message: 'Snapshot for leaf generation',
        },
      })
    );

    const leaf = parseTextResult(
      await client.callTool({
        name: 't3x_admin',
        arguments: {
          action: 'create_leaf',
          project_id: project.project_id,
          commit_hash: commit.commit_hash,
          leaf_type: 'tweet',
          title: 'Trip summary',
          constraints: [
            {
              type: 'require',
              match_mode: 'exact',
              value: 'Tokyo',
            },
          ],
        },
      })
    );

    const generated = parseTextResult(
      await client.callTool({
        name: 't3x_generate',
        arguments: { leaf_id: leaf.leaf_id },
      })
    );

    expect(leaf.type).toBe('tweet');
    expect(leaf.commit_hash).toBe(commit.commit_hash);
    expect(generated.leaf_id).toBe(leaf.leaf_id);
    expect(generated.output).toBe(`Generated output for ${leaf.leaf_id}`);
    expect(generated.score).toEqual({
      all_passed: true,
      passed: 1,
      failed: 0,
      total: 1,
    });
    expect(generated.assertions[0].constraint_id).toBe('cst_1');
    expect(generated.usage).toEqual({
      input_tokens: 123,
      output_tokens: 45,
    });

    await client.close();
  });
});
