import { describe, expect, it, vi } from 'vitest';

// Mock the DB module so tools don't try to connect to a real database
vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock @t3x-dev/storage to avoid real DB calls during import
vi.mock('@t3x-dev/storage', () => ({
  findProjects: vi.fn(),
  findProjectById: vi.fn(),
  findDraftById: vi.fn(),
  listDraftsByProject: vi.fn(),
  findAgentDraftById: vi.fn(),
  findAgentDraftsByProject: vi.fn(),
  findBranchesByProject: vi.fn(),
  findConversationById: vi.fn(),
  findConversationsByProject: vi.fn(),
  findLeafById: vi.fn(),
  findLeavesByProject: vi.fn(),
  findLeavesByCommit: vi.fn(),
  findPinById: vi.fn(),
  findPinsByProject: vi.fn(),
  findTurnsByConversation: vi.fn(),
  getCommit: vi.fn(),
  getCommitUnified: vi.fn(),
  listCommits: vi.fn(),
  insertProject: vi.fn(),
  insertBranch: vi.fn(),
  insertConversation: vi.fn(),
  insertTurn: vi.fn(),
  insertDraft: vi.fn(),
  updateDraft: vi.fn(),
  commitDraft: vi.fn(),
  createCommit: vi.fn(),
  createLeaf: vi.fn(),
  createPin: vi.fn(),
  deletePin: vi.fn(),
  createMergeDraft: vi.fn(),
  getMergeDraft: vi.fn(),
  updateMergeDraft: vi.fn(),
  cancelMergeDraft: vi.fn(),
  updateLeaf: vi.fn(),
  updateLeafOutput: vi.fn(),
}));

// Mock @t3x-dev/core to avoid loading heavy modules
vi.mock('@t3x-dev/core', () => ({
  ALL_LEAF_TYPES: [
    'tweet',
    'linkedin',
    'reddit',
    'threads',
    'article',
    'email',
    'slack',
    'deploy_agent',
  ],
  diffCommits: vi.fn(),
  prepareMerge: vi.fn(),
  executeMerge: vi.fn(),
  GateRunner: vi.fn(),
  createDefaultProviderRegistry: vi.fn(() => ({
    tryWithFallback: vi.fn(),
  })),
  extractAndApply: vi.fn(),
  DEFAULT_STYLE: {},
  normalizeRuntimeProviderId: vi.fn((providerId: string | null | undefined) =>
    providerId === 'claude' ? 'anthropic' : providerId
  ),
  isGenerationRuntimeProviderId: vi.fn((providerId: string) =>
    ['openai', 'anthropic', 'gemini'].includes(providerId)
  ),
  runtimeProviderIdForPublic: vi.fn((providerId: string | null | undefined) =>
    providerId === 'claude' ? 'anthropic' : providerId
  ),
  collectLessonsFromAssertions: vi.fn(() => []),
  generateLeafOutput: vi.fn(),
}));

import { createMcpServer } from '../server.js';

type CallToolHandler = (request: {
  method: 'tools/call';
  jsonrpc: '2.0';
  id: number;
  params: { name: string; arguments?: Record<string, unknown> };
}) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

function getCallToolHandler(toolsets: Array<'core' | 'advanced'>) {
  const { server } = createMcpServer({ toolsets });
  const handler = (
    server as unknown as { _requestHandlers: Map<string, CallToolHandler> }
  )._requestHandlers.get('tools/call');

  expect(handler).toBeDefined();
  return handler as CallToolHandler;
}

describe('createMcpServer', () => {
  it('returns a server instance and tools array', () => {
    const { server, tools } = createMcpServer({ toolsets: ['core'] });

    expect(server).toBeDefined();
    expect(tools).toBeDefined();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('core toolset provides exactly 5 tools', () => {
    const { tools } = createMcpServer({ toolsets: ['core'] });

    expect(tools).toHaveLength(5);
  });

  it('core toolset includes the correct tool names', () => {
    const { tools } = createMcpServer({ toolsets: ['core'] });
    const names = tools.map((t) => t.name);

    expect(names).toContain('t3x_query');
    expect(names).toContain('t3x_commit');
    expect(names).toContain('t3x_edit');
    expect(names).toContain('t3x_extract');
    expect(names).toContain('t3x_generate');
  });

  it('core toolset does not include advanced tools', () => {
    const { tools } = createMcpServer({ toolsets: ['core'] });
    const names = tools.map((t) => t.name);

    expect(names).not.toContain('t3x_diff');
    expect(names).not.toContain('t3x_merge');
    expect(names).not.toContain('t3x_admin');
  });

  it('core + advanced toolsets provide exactly 8 tools', () => {
    const { tools } = createMcpServer({ toolsets: ['core', 'advanced'] });

    expect(tools).toHaveLength(8);
  });

  it('core + advanced toolsets include all tool names', () => {
    const { tools } = createMcpServer({ toolsets: ['core', 'advanced'] });
    const names = tools.map((t) => t.name);

    expect(names).toContain('t3x_query');
    expect(names).toContain('t3x_commit');
    expect(names).toContain('t3x_edit');
    expect(names).toContain('t3x_extract');
    expect(names).toContain('t3x_generate');
    expect(names).toContain('t3x_diff');
    expect(names).toContain('t3x_merge');
    expect(names).toContain('t3x_admin');
    expect(names).not.toContain('t3x_create_leaf');
  });

  it('advanced-only toolset provides exactly 3 tools', () => {
    const { tools } = createMcpServer({ toolsets: ['advanced'] });

    expect(tools).toHaveLength(3);
    const names = tools.map((t) => t.name);
    expect(names).toContain('t3x_diff');
    expect(names).toContain('t3x_merge');
    expect(names).toContain('t3x_admin');
  });

  it('duplicate toolsets do not produce duplicate tools', () => {
    const { tools } = createMcpServer({ toolsets: ['core', 'core', 'advanced'] });

    expect(tools).toHaveLength(8);
    const names = tools.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(8);
  });

  it('every tool has a name, description, and inputSchema', () => {
    const { tools } = createMcpServer({ toolsets: ['core', 'advanced'] });

    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('empty toolsets array produces zero tools', () => {
    const { tools } = createMcpServer({ toolsets: [] });

    expect(tools).toHaveLength(0);
  });

  it('routes tool calls through the server call handler', async () => {
    const callTool = getCallToolHandler(['core', 'advanced']);

    const result = await callTool({
      method: 'tools/call',
      jsonrpc: '2.0',
      id: 1,
      params: {
        name: 't3x_diff',
        arguments: { source: 'sha256:aaa', target: 'sha256:bbb' },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"base" is required');
  });

  it('surfaces generate boundary errors through the server call handler', async () => {
    const callTool = getCallToolHandler(['core']);

    const result = await callTool({
      method: 'tools/call',
      jsonrpc: '2.0',
      id: 2,
      params: {
        name: 't3x_generate',
        arguments: { commit_hash: 'sha256:commit1' },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"leaf_id" is required');
  });

  it('returns unknown tool errors from the server call handler', async () => {
    const callTool = getCallToolHandler(['core']);

    const result = await callTool({
      method: 'tools/call',
      jsonrpc: '2.0',
      id: 3,
      params: {
        name: 't3x_create_leaf',
        arguments: { commit_hash: 'sha256:commit1' },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool: t3x_create_leaf');
  });

  it('formats nested database errors instead of returning an empty message', async () => {
    const { getDB } = await import('../db.js');
    const getDBMock = getDB as ReturnType<typeof vi.fn>;
    getDBMock.mockRejectedValueOnce(
      new AggregateError([new Error('connect EPERM 127.0.0.1:5445')], '')
    );

    const callTool = getCallToolHandler(['core']);
    const result = await callTool({
      method: 'tools/call',
      jsonrpc: '2.0',
      id: 4,
      params: {
        name: 't3x_query',
        arguments: {
          target: 'projects',
        },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('connect EPERM 127.0.0.1:5445');
    expect(result.content[0].text).not.toBe('Error: ');
    expect(result.content[0].text).not.toBe('Error: undefined');
  });
});
