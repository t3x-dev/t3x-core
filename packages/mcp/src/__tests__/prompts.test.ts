import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
  closeDB: vi.fn(() => Promise.resolve()),
}));

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
  findPinById: vi.fn(),
  findPinsByProject: vi.fn(),
  getCommit: vi.fn(),
  getMergeDraft: vi.fn(),
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
  updateMergeDraft: vi.fn(),
  cancelMergeDraft: vi.fn(),
  updateLeaf: vi.fn(),
  updateLeafOutput: vi.fn(),
}));

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
  Extractor: vi.fn(),
  GateRunner: vi.fn(),
  runTransforms: vi.fn(),
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

async function connectClientAndServer() {
  const { server } = createMcpServer({ toolsets: ['core', 'advanced'] });
  const client = new Client(
    { name: 't3x-mcp-test-client', version: '0.0.0' },
    { capabilities: {} }
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('MCP prompts', () => {
  it('advertises prompts capability during initialization', async () => {
    const { client } = await connectClientAndServer();

    expect(client.getServerCapabilities()).toMatchObject({
      prompts: {},
      tools: {},
    });

    await client.close();
  });

  it('lists the workflow prompt catalog', async () => {
    const { client } = await connectClientAndServer();

    const result = await client.listPrompts();

    expect(result.prompts).toEqual([
      expect.objectContaining({ name: 'extract_review_commit' }),
      expect.objectContaining({ name: 'inspect_workbench_draft' }),
      expect.objectContaining({ name: 'prepare_resolve_merge' }),
      expect.objectContaining({ name: 'generate_from_leaf' }),
    ]);

    await client.close();
  });

  it('renders extract_review_commit with argument-aware workflow text', async () => {
    const { client } = await connectClientAndServer();

    const result = await client.getPrompt({
      name: 'extract_review_commit',
      arguments: { project_id: 'proj_123' },
    });

    expect(result.description).toContain('extract text into a workbench draft');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      role: 'user',
      content: {
        type: 'text',
      },
    });
    expect(result.messages[0].content.text).toContain('t3x_extract');
    expect(result.messages[0].content.text).toContain('t3x://projects/proj_123');
    expect(result.messages[0].content.text).toContain('t3x_commit');

    await client.close();
  });

  it('renders prepare_resolve_merge with merge flow guidance', async () => {
    const { client } = await connectClientAndServer();

    const result = await client.getPrompt({
      name: 'prepare_resolve_merge',
      arguments: {
        source_hash: 'sha256:source',
        target_hash: 'sha256:target',
      },
    });

    expect(result.messages[0].content.text).toContain('t3x_diff');
    expect(result.messages[0].content.text).toContain('t3x_merge');
    expect(result.messages[0].content.text).toContain('t3x://commits/sha256:source');
    expect(result.messages[0].content.text).toContain('t3x://commits/sha256:target');

    await client.close();
  });
});
