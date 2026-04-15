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
};

const MOCK_CONVERSATION = {
  conversationId: 'conv_new1',
  projectId: 'proj_test1',
  title: 'MCP Extraction',
  alias: null,
};

const MOCK_CONVERSATION_OTHER_PROJECT = {
  conversationId: 'conv_other',
  projectId: 'proj_other',
  title: 'Other project conv',
  alias: null,
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

// Mock extraction result
const MOCK_EXTRACTION_RESULT = {
  ok: true as const,
  yops: [
    { define: { path: 'trip' } },
    { populate: { path: 'trip', values: { budget: 5000, destination: 'Tokyo' } } },
  ],
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
  usage: { inputTokens: 100, outputTokens: 50 },
};

const MOCK_EXTRACTION_EMPTY = {
  ok: true as const,
  yops: [],
  snapshot: { trees: [], relations: [] },
  usage: { inputTokens: 100, outputTokens: 10 },
};

const MOCK_EXTRACTION_FAILED = {
  ok: false as const,
  error: 'LLM returned invalid YAML',
  usage: { inputTokens: 100, outputTokens: 0 },
};

// Track mock calls
const mockExtract = vi.fn();

vi.mock('@t3x-dev/core', async () => {
  const actual = await vi.importActual<typeof import('@t3x-dev/core')>('@t3x-dev/core');
  return {
    ...actual,
    Extractor: vi.fn().mockImplementation(() => ({
      extract: mockExtract,
    })),
    createProviderRegistry: vi.fn(() => ({
      register: vi.fn(),
      autoConfigureFromEnv: vi.fn(),
      tryWithFallback: vi.fn(async (_role: string, fn: (provider: unknown) => Promise<unknown>) =>
        fn({})
      ),
    })),
    createClaudeProvider: vi.fn(() => ({})),
  };
});

vi.mock('@t3x-dev/storage', () => ({
  findProjectById: vi.fn((_db: unknown, id: string) => {
    if (id === 'proj_test1') return Promise.resolve(MOCK_PROJECT);
    return Promise.resolve(null);
  }),
  insertConversation: vi.fn(() => Promise.resolve(MOCK_CONVERSATION)),
  findConversationById: vi.fn((_db: unknown, id: string) => {
    if (id === 'conv_existing') return Promise.resolve(MOCK_CONVERSATION);
    if (id === 'conv_other') return Promise.resolve(MOCK_CONVERSATION_OTHER_PROJECT);
    return Promise.resolve(null);
  }),
  insertTurn: vi.fn(() => Promise.resolve(MOCK_TURN)),
  findTurnsByConversation: vi.fn(() => Promise.resolve([MOCK_TURN])),
  insertDraft: vi.fn(() => Promise.resolve(MOCK_DRAFT)),
  updateDraft: vi.fn(() => Promise.resolve(MOCK_UPDATED_DRAFT)),
  recordEvent: vi.fn(() => Promise.resolve(1n)),
}));

// ── Import handler after mocks ──

import { extractHandler } from '../tools/core/extract.js';

// ── Tests ──

describe('t3x_extract handler', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    mockExtract.mockResolvedValue(MOCK_EXTRACTION_RESULT);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
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

  it('returns error when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ANTHROPIC_API_KEY is not set');
    expect(result.content[0].text).toContain('environment variable');
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

  it('returns error when extraction fails', async () => {
    mockExtract.mockResolvedValue(MOCK_EXTRACTION_FAILED);
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'plan a trip to Tokyo',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Extraction failed');
  });

  it('returns error when extraction produces empty trees', async () => {
    mockExtract.mockResolvedValue(MOCK_EXTRACTION_EMPTY);
    const result = await extractHandler({
      project_id: 'proj_test1',
      text: 'hello',
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

    // Should NOT create a new conversation
    expect(insertConversation).not.toHaveBeenCalled();

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.is_new_conversation).toBe(false);
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
      1 // initial draft revision
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

    // Extraction should still succeed — realtime sync is best-effort
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
});
