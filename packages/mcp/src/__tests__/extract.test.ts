import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──

const mockDB = {};

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

const MOCK_PROJECT = {
  id: 'proj_test1',
  name: 'Test Project',
  description: null,
  ownerId: 'user_test1',
  defaultProvider: 'openai',
  defaultModel: 'gpt-5.4',
  providerConfig: null,
};

const MOCK_CONVERSATION = {
  conversationId: 'conv_new1',
  projectId: 'proj_test1',
  title: 'MCP Extraction',
  alias: null,
  provider: null,
  model: null,
};

const MOCK_EXISTING_CONVERSATION = {
  conversationId: 'conv_existing',
  projectId: 'proj_test1',
  title: 'Existing conversation',
  alias: null,
  provider: 'anthropic',
  model: 'claude-opus-4-20250514',
};

const MOCK_CONVERSATION_OTHER_PROJECT = {
  conversationId: 'conv_other',
  projectId: 'proj_other',
  title: 'Other project conv',
  alias: null,
  provider: null,
  model: null,
};

const MOCK_TURN = {
  turnHash: 'sha256:turn1',
  parentTurnHash: null,
  projectId: 'proj_test1',
  conversationId: 'conv_new1',
  role: 'user',
  content: 'I want to plan a trip to Tokyo with a budget of 5000 dollars.',
  createdAt: new Date(),
};

const MOCK_DRAFT = {
  id: 'draft_ext1',
  project_id: 'proj_test1',
  title: 'MCP Extraction',
  status: 'editing',
  nodes: [],
  revision: 1,
};

const MOCK_UPDATED_DRAFT = {
  ...MOCK_DRAFT,
  revision: 2,
};

const MOCK_EXTRACT_SUCCESS = {
  ok: true as const,
  draft: { schema: 't3x/extraction-draft', version: 1, mode: 'bootstrap', items: [] },
  compiled: {
    ops: [
      { op: 'define', path: 'trip' },
      { op: 'populate', path: 'trip', values: { budget: 5000, destination: 'Tokyo' } },
    ],
    warnings: [],
  },
  snapshot: {
    trees: [
      {
        key: 'trip',
        slots: { budget: 5000, destination: 'Tokyo' },
        children: [],
      },
    ],
    relations: [],
  },
  turnHashByTag: { T1: 'sha256:turn1' },
};

const MOCK_EXTRACT_EMPTY_TREES = {
  ok: true as const,
  draft: { schema: 't3x/extraction-draft', version: 1, mode: 'bootstrap', items: [] },
  compiled: { ops: [], warnings: [] },
  snapshot: { trees: [], relations: [] },
  turnHashByTag: { T1: 'sha256:turn1' },
};

const MOCK_EXTRACT_FAILURE = {
  ok: false as const,
  failure: {
    code: 'draft_schema',
    message: 'LLM returned invalid draft shape',
    retry: { retryable: false, strategy: 'none', maxAttempts: 0 },
  },
  turnHashByTag: { T1: 'sha256:turn1' },
};

// Track mocks
const mockExtractAndApply = vi.fn();
const mockRegistryGetById = vi.fn();
const mockRegistryGetEntry = vi.fn();
const mockRegistryGetProviderIdsForRole = vi.fn();
const mockRegistryIsConfigured = vi.fn();
const mockRegistryImportConfig = vi.fn();
const mockRegistryListProviders = vi.fn();

vi.mock('@t3x-dev/core', async () => {
  const actual = await vi.importActual<typeof import('@t3x-dev/core')>('@t3x-dev/core');
  return {
    ...actual,
    extractAndApply: (...args: unknown[]) => mockExtractAndApply(...args),
    createDefaultProviderRegistry: vi.fn(() => ({
      getById: (...args: unknown[]) => mockRegistryGetById(...args),
      getEntry: (...args: unknown[]) => mockRegistryGetEntry(...args),
      getProviderIdsForRole: (...args: unknown[]) => mockRegistryGetProviderIdsForRole(...args),
      isConfigured: (...args: unknown[]) => mockRegistryIsConfigured(...args),
      importConfig: (...args: unknown[]) => mockRegistryImportConfig(...args),
      listProviders: (...args: unknown[]) => mockRegistryListProviders(...args),
    })),
  };
});

vi.mock('@t3x-dev/storage', () => ({
  findProjectById: vi.fn((_db: unknown, id: string) => {
    if (id === 'proj_test1') return Promise.resolve(MOCK_PROJECT);
    return Promise.resolve(null);
  }),
  insertConversation: vi.fn(() => Promise.resolve(MOCK_CONVERSATION)),
  findConversationById: vi.fn((_db: unknown, id: string) => {
    if (id === 'conv_existing') return Promise.resolve(MOCK_EXISTING_CONVERSATION);
    if (id === 'conv_other') return Promise.resolve(MOCK_CONVERSATION_OTHER_PROJECT);
    return Promise.resolve(null);
  }),
  insertTurn: vi.fn(() => Promise.resolve(MOCK_TURN)),
  findTurnsByConversation: vi.fn(() => Promise.resolve([MOCK_TURN])),
  insertDraft: vi.fn(() => Promise.resolve(MOCK_DRAFT)),
  updateDraft: vi.fn(() => Promise.resolve(MOCK_UPDATED_DRAFT)),
  recordEvent: vi.fn(() => Promise.resolve(1n)),
  getProviderCredentialBundle: vi.fn(() =>
    Promise.resolve({
      secrets: { OPENAI_API_KEY: 'sk-db-openai' },
      safe: {
        anthropic: {
          configured: false,
          defaultModel: null,
          lastTestStatus: null,
          lastTestedAt: null,
          lastTestError: null,
        },
        openai: {
          configured: true,
          defaultModel: 'gpt-5.4',
          lastTestStatus: null,
          lastTestedAt: null,
          lastTestError: null,
        },
        google: {
          configured: false,
          defaultModel: null,
          lastTestStatus: null,
          lastTestedAt: null,
          lastTestError: null,
        },
      },
    })
  ),
  getGlobalSetting: vi.fn(() => Promise.resolve(null)),
  findUserById: vi.fn((_db: unknown, id: string) => {
    if (id === 'user_test1') {
      return Promise.resolve({
        id: 'user_test1',
        default_provider: 'anthropic',
        default_model: 'claude-sonnet-4-20250514',
      });
    }
    return Promise.resolve(null);
  }),
}));

// ── Import handler after mocks ──

import { extractHandler } from '../tools/core/extract.js';

// ── Tests ──

describe('t3x_extract handler', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;
  const originalOpenAIEnv = process.env.OPENAI_API_KEY;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetProviderRegistry } = await import('../provider-runtime.js');
    const { findConversationById, findProjectById } = await import('@t3x-dev/storage');
    resetProviderRegistry();
    vi.mocked(findProjectById).mockImplementation((_db: unknown, id: string) => {
      if (id === 'proj_test1') return Promise.resolve(MOCK_PROJECT);
      return Promise.resolve(null);
    });
    vi.mocked(findConversationById).mockImplementation((_db: unknown, id: string) => {
      if (id === 'conv_existing') return Promise.resolve(MOCK_EXISTING_CONVERSATION);
      if (id === 'conv_other') return Promise.resolve(MOCK_CONVERSATION_OTHER_PROJECT);
      return Promise.resolve(null);
    });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    delete process.env.OPENAI_API_KEY;
    mockExtractAndApply.mockResolvedValue(MOCK_EXTRACT_SUCCESS);
    mockRegistryGetById.mockImplementation((providerId: string) => ({ id: providerId }));
    mockRegistryGetEntry.mockImplementation((providerId: string) => {
      if (providerId === 'openai') return { defaultModel: 'gpt-5.4' };
      if (providerId === 'anthropic') return { defaultModel: 'claude-sonnet-4-20250514' };
      return undefined;
    });
    mockRegistryGetProviderIdsForRole.mockReturnValue(['openai', 'anthropic']);
    mockRegistryIsConfigured.mockImplementation((id: string) =>
      ['openai', 'anthropic'].includes(id)
    );
    mockRegistryListProviders.mockReturnValue([
      { id: 'openai', defaultModel: 'gpt-5.4', availableModels: ['gpt-5.4'] },
      {
        id: 'anthropic',
        defaultModel: 'claude-sonnet-4-20250514',
        availableModels: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
      },
    ]);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalOpenAIEnv !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAIEnv;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  // ── Validation errors ──

  it('returns error when project_id is missing', async () => {
    const result = await extractHandler({ text: 'some text' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"project_id" is required');
  });

  it('returns error when text is missing', async () => {
    const result = await extractHandler({ project_id: 'proj_test1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"text" is required');
  });

  it('returns required error when text is an empty string', async () => {
    const result = await extractHandler({ project_id: 'proj_test1', text: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"text" is required');
  });

  it('returns error when no generation provider is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { findProjectById } = await import('@t3x-dev/storage');
    vi.mocked(findProjectById).mockResolvedValue({
      ...MOCK_PROJECT,
      defaultProvider: null,
      defaultModel: null,
    });
    mockRegistryGetProviderIdsForRole.mockReturnValue(['anthropic']);
    mockRegistryIsConfigured.mockReturnValue(false);
    mockRegistryGetById.mockReturnValue(null);

    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No configured generation provider is available');
  });

  it('uses project default provider/model without requiring ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });

    expect(result.isError).toBeUndefined();
    expect(mockExtractAndApply).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'openai',
        model: 'gpt-5.4',
      })
    );
  });

  it('uses project owner user defaults when project defaults are unset', async () => {
    const { findProjectById } = await import('@t3x-dev/storage');
    vi.mocked(findProjectById).mockResolvedValue({
      ...MOCK_PROJECT,
      defaultProvider: null,
      defaultModel: null,
    });

    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });

    expect(result.isError).toBeUndefined();
    expect(mockExtractAndApply).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
      })
    );
  });

  it('prefers conversation provider/model overrides over project defaults', async () => {
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
      conversation_id: 'conv_existing',
    });

    expect(result.isError).toBeUndefined();
    expect(mockExtractAndApply).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'anthropic',
        model: 'claude-opus-4-6',
      })
    );
  });

  // ── Project / conversation lookup errors ──

  it('returns error when project is not found', async () => {
    const result = await extractHandler({
      project_id: 'proj_missing',
      text: 'some text',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Project not found');
  });

  it('returns error when conversation_id is provided but not found', async () => {
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'some text',
      conversation_id: 'conv_missing',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Conversation not found');
  });

  it('returns error when conversation belongs to different project', async () => {
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'some text',
      conversation_id: 'conv_other',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('does not belong to project');
  });

  // ── Extraction failures ──

  it('returns error when v2 pipeline fails', async () => {
    mockExtractAndApply.mockResolvedValue(MOCK_EXTRACT_FAILURE);
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Extraction failed');
    expect(result.content[0].text).toContain('LLM returned invalid draft shape');
  });

  it('returns error when extraction helper fails after compilation', async () => {
    mockExtractAndApply.mockResolvedValue({
      ok: false,
      failure: {
        code: 'executable_structure',
        message: 'path not found',
        retry: { retryable: false, strategy: 'none', maxAttempts: 0 },
      },
      turnHashByTag: { T1: 'sha256:turn1' },
    });
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('path not found');
  });

  it('returns error when applied trees are empty', async () => {
    mockExtractAndApply.mockResolvedValue(MOCK_EXTRACT_EMPTY_TREES);
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: '!!! ???',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No extractable content');
  });

  // ── Success cases ──

  it('extracts successfully and returns draft_id', async () => {
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'I want to plan a trip to Tokyo with a budget of 5000 dollars.',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.draft_id).toBe('draft_ext1');
    expect(data.conversation_id).toBe('conv_new1');
    expect(data.is_new_conversation).toBe(true);
    expect(data.tree_summary).toHaveLength(1);
    expect(data.tree_summary[0].key).toBe('trip');
    expect(data.next_steps).toBeDefined();
    expect(Array.isArray(data.next_steps)).toBe(true);
  });

  it('creates conversation and turns from raw text', async () => {
    const { insertConversation, insertTurn } = await import('@t3x-dev/storage');

    await extractHandler({
      project_id: 'proj_test1',
      text: 'I want to go to Tokyo',
      source: 'meeting notes',
    });

    expect(insertConversation).toHaveBeenCalledWith(mockDB, {
      projectId: 'proj_test1',
      title: 'Extract: meeting notes',
    });
    expect(insertTurn).toHaveBeenCalled();
  });

  it('uses existing conversation when conversation_id is provided', async () => {
    const { insertConversation } = await import('@t3x-dev/storage');

    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'more details about the trip',
      conversation_id: 'conv_existing',
    });

    expect(insertConversation).not.toHaveBeenCalled();

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.is_new_conversation).toBe(false);
  });

  it('does not attach a parent commit hash when reusing conversation context', async () => {
    const { insertDraft } = await import('@t3x-dev/storage');

    await extractHandler({
      project_id: 'proj_test1',
      text: 'more details about the trip',
      conversation_id: 'conv_existing',
    });

    const mock = insertDraft as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalled();
    expect(mock.mock.calls[0]?.[1]).not.toHaveProperty('parent_commit_hash');
  });

  it('creates a draft with extracted nodes', async () => {
    const { insertDraft, updateDraft } = await import('@t3x-dev/storage');

    await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo with budget 5000',
    });

    expect(insertDraft).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({
        project_id: 'proj_test1',
        title: 'MCP Extraction',
      })
    );
    expect(updateDraft).toHaveBeenCalledWith(
      mockDB,
      'draft_ext1',
      expect.objectContaining({
        nodes: expect.arrayContaining([expect.objectContaining({ key: 'trip' })]),
      }),
      1
    );
  });

  it('emits extraction.done event for WebUI realtime sync', async () => {
    const { recordEvent } = await import('@t3x-dev/storage');

    await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });

    expect(recordEvent).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({
        type: 'extraction.done',
        projectId: 'proj_test1',
        conversationId: 'conv_new1',
        payload: expect.objectContaining({
          draft_id: 'draft_ext1',
          source: 'mcp',
        }),
      })
    );
  });

  it('does not fail extraction if recordEvent throws', async () => {
    const { recordEvent } = await import('@t3x-dev/storage');
    (recordEvent as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('events table wedged')
    );

    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.draft_id).toBe('draft_ext1');
  });

  it('includes yops_count in response', async () => {
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.yops_count).toBe(2);
  });

  it('invokes the v2 pipeline with bootstrap mode and the resolved provider', async () => {
    await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });

    expect(mockExtractAndApply).toHaveBeenCalledTimes(1);
    const call = mockExtractAndApply.mock.calls[0][0];
    expect(call.mode).toBe('bootstrap');
    expect(call.providerId).toBe('openai');
    expect(call.model).toBe('gpt-5.4');
    expect(call.turns).toEqual([
      expect.objectContaining({
        turn_hash: 'sha256:turn1',
        role: 'user',
      }),
    ]);
  });
});
