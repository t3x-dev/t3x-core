import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks (must be hoisted before imports) ──

const { mockGenerateLeafOutput } = vi.hoisted(() => ({
  mockGenerateLeafOutput: vi.fn(),
}));

// ── Mocks ──

const mockDB = {};

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Mock leaf record
const MOCK_LEAF = {
  id: 'leaf_test1',
  commit_hash: 'sha256:commit1',
  type: 'tweet' as const,
  title: 'Test Tweet',
  constraints: [
    { id: 'cst_1', type: 'require' as const, match_mode: 'exact' as const, value: 'dark mode' },
  ],
  config: {},
  output: null,
  assertions: [],
  project_id: 'proj_test1',
  created_at: new Date().toISOString(),
  generated_at: null,
};

const MOCK_PROJECT = {
  id: 'proj_test1',
  name: 'Test Project',
  description: null,
  ownerId: 'user_test1',
  defaultProvider: 'openai',
  defaultModel: 'gpt-5.4',
  providerConfig: null,
};

const MOCK_LEAF_NO_CONSTRAINTS = {
  ...MOCK_LEAF,
  id: 'leaf_test2',
  constraints: [],
};

const MOCK_COMMIT = {
  hash: 'sha256:commit1',
  content: {
    trees: [{ key: 's_1', slots: { text: 'User prefers dark mode' }, children: [] }],
    relations: [],
  },
  message: 'Test commit',
  branch: 'main',
  project_id: 'proj_test1',
};

const MOCK_HISTORICAL_LEAVES = [
  {
    id: 'leaf_old1',
    assertions: [
      {
        id: 'ast_prev1',
        constraint_id: 'cst_old1',
        passed: false,
        details: 'Required text not found',
        lesson: 'Always mention dark mode explicitly',
      },
    ],
  },
];

const MOCK_UPDATED_LEAF = {
  ...MOCK_LEAF,
  output: 'I love using dark mode! #DarkMode',
  generated_at: '2026-04-13T00:00:00.000Z',
  assertions: [
    {
      id: 'ast_1',
      constraint_id: 'cst_1',
      passed: true,
      details: 'Found "dark mode" in output',
    },
  ],
};

// Mock generation result
const MOCK_GENERATION_RESULT = {
  output: 'I love using dark mode! #DarkMode',
  model: 'claude-sonnet-4-20250514',
  usage: {
    inputTokens: 150,
    outputTokens: 25,
  },
  prompt: {
    system: 'You are a content generation assistant...',
    user: 'Generate a tweet...',
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
        details: 'Found "dark mode" in output',
      },
    ],
  },
};

const MOCK_GENERATION_RESULT_FAILED = {
  ...MOCK_GENERATION_RESULT,
  attempts: 3,
  validation: {
    allPassed: false,
    passedCount: 0,
    failedCount: 1,
    assertions: [
      {
        id: 'ast_1',
        constraint_id: 'cst_1',
        passed: false,
        details: '"dark mode" not found in output',
      },
    ],
  },
};

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
    generateLeafOutput: mockGenerateLeafOutput,
    createDefaultProviderRegistry: vi.fn(() => ({
      getById: (...args: unknown[]) => mockRegistryGetById(...args),
      getEntry: (...args: unknown[]) => mockRegistryGetEntry(...args),
      getProviderIdsForRole: (...args: unknown[]) => mockRegistryGetProviderIdsForRole(...args),
      isConfigured: (...args: unknown[]) => mockRegistryIsConfigured(...args),
      importConfig: (...args: unknown[]) => mockRegistryImportConfig(...args),
      listProviders: (...args: unknown[]) => mockRegistryListProviders(...args),
    })),
    collectLessonsFromAssertions: vi.fn((leaves: Array<{ id: string; assertions: unknown[] }>) => {
      // Collect any lessons from assertions
      const lessons: string[] = [];
      for (const leaf of leaves) {
        for (const assertion of leaf.assertions as Array<{ lesson?: string }>) {
          if (assertion.lesson) lessons.push(assertion.lesson);
        }
      }
      return lessons;
    }),
  };
});

vi.mock('@t3x-dev/storage', () => ({
  findProjectById: vi.fn((_db: unknown, id: string) => {
    if (id === 'proj_test1') return Promise.resolve(MOCK_PROJECT);
    return Promise.resolve(null);
  }),
  findLeafById: vi.fn((_db: unknown, id: string) => {
    if (id === 'leaf_test1') return Promise.resolve(MOCK_LEAF);
    if (id === 'leaf_test2') return Promise.resolve(MOCK_LEAF_NO_CONSTRAINTS);
    return Promise.resolve(null);
  }),
  getCommitUnified: vi.fn((_db: unknown, hash: string) => {
    if (hash === 'sha256:commit1') return Promise.resolve(MOCK_COMMIT);
    return Promise.resolve(null);
  }),
  findLeavesByCommit: vi.fn(() => Promise.resolve(MOCK_HISTORICAL_LEAVES)),
  updateLeafOutput: vi.fn((_db: unknown, _id: string, _output: string) =>
    Promise.resolve(MOCK_UPDATED_LEAF)
  ),
  updateLeaf: vi.fn((_db: unknown, _id: string, _input: unknown) =>
    Promise.resolve(MOCK_UPDATED_LEAF)
  ),
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

import { generateHandler } from '../tools/core/generate.js';

// ── Tests ──

describe('t3x_generate handler', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;
  const originalOpenAIEnv = process.env.OPENAI_API_KEY;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetProviderRegistry } = await import('../provider-runtime.js');
    const { findProjectById } = await import('@t3x-dev/storage');
    resetProviderRegistry();
    vi.mocked(findProjectById).mockImplementation((_db: unknown, id: string) => {
      if (id === 'proj_test1') return Promise.resolve(MOCK_PROJECT);
      return Promise.resolve(null);
    });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    delete process.env.OPENAI_API_KEY;
    mockGenerateLeafOutput.mockResolvedValue(MOCK_GENERATION_RESULT);
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

  it('returns error when leaf_id is missing', async () => {
    const result = await generateHandler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"leaf_id" is required');
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

    const result = await generateHandler({ leaf_id: 'leaf_test1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No configured generation provider is available');
  });

  it('uses project default provider/model without requiring ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await generateHandler({ leaf_id: 'leaf_test1' });

    expect(result.isError).toBeUndefined();
    expect(mockGenerateLeafOutput).toHaveBeenCalledWith(
      expect.objectContaining({
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

    const result = await generateHandler({ leaf_id: 'leaf_test1' });

    expect(result.isError).toBeUndefined();
    expect(mockGenerateLeafOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
      })
    );
  });

  it('returns error when leaf is not found', async () => {
    const result = await generateHandler({ leaf_id: 'leaf_missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Leaf not found');
    expect(result.content[0].text).toContain('leaf_missing');
  });

  it('returns error when source commit is not found', async () => {
    const { findLeafById } = await import('@t3x-dev/storage');
    vi.mocked(findLeafById).mockResolvedValueOnce({
      ...MOCK_LEAF,
      commit_hash: 'sha256:nonexistent',
    });

    const result = await generateHandler({ leaf_id: 'leaf_test1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Source commit not found');
  });

  // ── Success cases ──

  it('generates output and returns score + assertions', async () => {
    const result = await generateHandler({ leaf_id: 'leaf_test1' });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    expect(data.leaf_id).toBe('leaf_test1');
    expect(data.output).toBe('I love using dark mode! #DarkMode');
    expect(data.generated_at).toBeDefined();
    expect(data.model).toBe('claude-sonnet-4-20250514');
    expect(data.attempts).toBe(1);
    expect(data.score).toEqual({
      all_passed: true,
      passed: 1,
      failed: 0,
      total: 1,
    });
    expect(data.assertions).toHaveLength(1);
    expect(data.assertions[0].passed).toBe(true);
    expect(data.assertions[0].constraint_id).toBe('cst_1');
  });

  it('reports failed assertions in score summary', async () => {
    mockGenerateLeafOutput.mockResolvedValueOnce(MOCK_GENERATION_RESULT_FAILED);
    const { updateLeaf, updateLeafOutput } = await import('@t3x-dev/storage');
    vi.mocked(updateLeafOutput).mockResolvedValueOnce({
      ...MOCK_UPDATED_LEAF,
      assertions: MOCK_GENERATION_RESULT_FAILED.validation.assertions,
    });
    vi.mocked(updateLeaf).mockResolvedValueOnce({
      ...MOCK_UPDATED_LEAF,
      assertions: MOCK_GENERATION_RESULT_FAILED.validation.assertions,
    });

    const result = await generateHandler({ leaf_id: 'leaf_test1' });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    expect(data.attempts).toBe(3);
    expect(data.score.all_passed).toBe(false);
    expect(data.score.failed).toBe(1);
    expect(data.assertions[0].passed).toBe(false);
  });

  it('returns empty assertions when leaf has no constraints', async () => {
    const noConstraintResult = {
      ...MOCK_GENERATION_RESULT,
      validation: undefined,
    };
    mockGenerateLeafOutput.mockResolvedValueOnce(noConstraintResult);

    const result = await generateHandler({ leaf_id: 'leaf_test2' });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    expect(data.score.total).toBe(0);
    expect(data.score.all_passed).toBe(true);
    expect(data.assertions).toHaveLength(0);
  });

  it('passes model and max_tokens to generator when provided', async () => {
    await generateHandler({
      leaf_id: 'leaf_test1',
      model: 'claude-opus-4-20250514',
      max_tokens: 2048,
    });

    expect(mockGenerateLeafOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-6',
        maxTokens: 2048,
      })
    );
  });

  it('passes knowledge and leaf to generator', async () => {
    await generateHandler({ leaf_id: 'leaf_test1' });

    expect(mockGenerateLeafOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledge: expect.objectContaining({ trees: expect.any(Array) }),
        leaf: expect.objectContaining({ id: 'leaf_test1' }),
      })
    );
  });

  it('includes lessons from historical leaves when available', async () => {
    await generateHandler({ leaf_id: 'leaf_test1' });

    // collectLessonsFromAssertions should have been called with historical leaves
    const { collectLessonsFromAssertions } = await import('@t3x-dev/core');
    expect(collectLessonsFromAssertions).toHaveBeenCalled();
  });

  it('includes usage stats in response', async () => {
    const result = await generateHandler({ leaf_id: 'leaf_test1' });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    expect(data.usage).toEqual({
      input_tokens: 150,
      output_tokens: 25,
    });
  });

  it('returns error when generation throws', async () => {
    mockGenerateLeafOutput.mockRejectedValueOnce(new Error('API key invalid'));

    const result = await generateHandler({ leaf_id: 'leaf_test1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Generation failed');
    expect(result.content[0].text).toContain('API key invalid');
  });
});
