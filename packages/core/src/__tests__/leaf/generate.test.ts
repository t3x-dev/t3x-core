/**
 * Tests for Leaf Generation Service
 *
 * @see packages/core/src/leaf/generate.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationError, generateLeafOutput, isGenerationConfigured } from '../../leaf/generate';
import type { SemanticContent } from '../../semantic/types';
import type { Leaf } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════

const createTestKnowledge = (): SemanticContent => ({
  trees: [
    { key: 'user_preference', slots: { theme: 'dark mode' }, children: [] },
    { key: 'language', slots: { primary: 'English' }, children: [] },
  ],
  relations: [],
});

const createTestLeaf = (withConstraints = false): Leaf => ({
  id: 'leaf_test',
  commit_hash: 'sha256:test-hash',
  type: 'tweet',
  title: 'Test Tweet',
  constraints: withConstraints
    ? [{ id: 'cst_1', type: 'require', match_mode: 'exact', value: 'dark mode' }]
    : [],
  config: {},
  project_id: 'proj_test',
  created_at: new Date().toISOString(),
});

const createMockResponse = (text: string, inputTokens = 100, outputTokens = 50) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text }],
  model: 'claude-sonnet-4-20250514',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// isGenerationConfigured Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('isGenerationConfigured', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns true when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    expect(isGenerationConfigured()).toBe(true);
  });

  it('returns false when ANTHROPIC_API_KEY is not set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isGenerationConfigured()).toBe(false);
  });

  it('returns false when ANTHROPIC_API_KEY is empty string', () => {
    process.env.ANTHROPIC_API_KEY = '';
    expect(isGenerationConfigured()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateLeafOutput Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('generateLeafOutput', () => {
  const originalEnv = process.env;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    // Clear any proxy settings to use native fetch which we can mock
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws NOT_CONFIGURED when API key is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(
      generateLeafOutput({
        knowledge: createTestKnowledge(),
        leaf: createTestLeaf(),
      })
    ).rejects.toThrow(GenerationError);

    await expect(
      generateLeafOutput({
        knowledge: createTestKnowledge(),
        leaf: createTestLeaf(),
      })
    ).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
  });

  it('calls Anthropic API with correct parameters', async () => {
    const mockResponse = createMockResponse('Generated tweet about dark mode!');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });

    const leaf = createTestLeaf(true);

    await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf,
      model: 'claude-sonnet-4-20250514',
      temperature: 0.8,
      maxTokens: 512,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.method).toBe('POST');
    expect(options.headers['x-api-key']).toBe('sk-ant-test-key');
    expect(options.headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(options.body);
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.temperature).toBe(0.8);
    expect(body.max_tokens).toBe(512);
    expect(body.system).toBeDefined();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
  });

  it('extracts text from response', async () => {
    const expectedOutput = 'Generated tweet about dark mode!';
    const mockResponse = createMockResponse(expectedOutput);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });

    const result = await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf: createTestLeaf(),
    });

    expect(result.output).toBe(expectedOutput);
  });

  it('returns usage statistics', async () => {
    const mockResponse = createMockResponse('Test output', 150, 75);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });

    const result = await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf: createTestLeaf(),
    });

    expect(result.usage).toEqual({
      inputTokens: 150,
      outputTokens: 75,
    });
  });

  it('uses default model when not specified', async () => {
    const mockResponse = createMockResponse('Test output');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });

    await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf: createTestLeaf(),
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('uses default temperature when not specified', async () => {
    const mockResponse = createMockResponse('Test output');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });

    await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf: createTestLeaf(),
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.7);
  });

  it('returns model from response', async () => {
    const mockResponse = createMockResponse('Test output');
    mockResponse.model = 'claude-opus-4-20250514';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });

    const result = await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf: createTestLeaf(),
    });

    expect(result.model).toBe('claude-opus-4-20250514');
  });

  it('returns prompt in result', async () => {
    const mockResponse = createMockResponse('Test output');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });

    const result = await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf: createTestLeaf(),
    });

    expect(result.prompt.system).toBeDefined();
    expect(result.prompt.user).toBeDefined();
    expect(result.prompt.user).toContain('dark mode');
  });

  it('handles rate limit errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'rate_limit_error',
              message: 'Rate limit exceeded',
            },
          })
        ),
    });

    await expect(
      generateLeafOutput({
        knowledge: createTestKnowledge(),
        leaf: createTestLeaf(),
      })
    ).rejects.toMatchObject({
      code: 'RATE_LIMIT',
      statusCode: 429,
    });
  });

  it('handles authentication errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'authentication_error',
              message: 'Invalid API key',
            },
          })
        ),
    });

    await expect(
      generateLeafOutput({
        knowledge: createTestKnowledge(),
        leaf: createTestLeaf(),
      })
    ).rejects.toMatchObject({
      code: 'AUTH_ERROR',
      statusCode: 401,
    });
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      generateLeafOutput({
        knowledge: createTestKnowledge(),
        leaf: createTestLeaf(),
      })
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('handles empty response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-sonnet-4-20250514',
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 0 },
          })
        ),
    });

    await expect(
      generateLeafOutput({
        knowledge: createTestKnowledge(),
        leaf: createTestLeaf(),
      })
    ).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
    });
  });

  it('auto-validates and retries when constraints fail', async () => {
    const leaf = createTestLeaf(true); // has require constraint: 'dark mode'

    // First attempt: output missing 'dark mode' → fails validation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(JSON.stringify(createMockResponse('A tweet about preferences', 100, 50))),
    });
    // Retry: output now includes 'dark mode' → passes validation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(createMockResponse('I love dark mode!', 120, 60))),
    });

    const result = await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf,
    });

    expect(result.output).toBe('I love dark mode!');
    expect(result.attempts).toBe(2);
    expect(result.validation).toBeDefined();
    expect(result.validation!.allPassed).toBe(true);
    // Total usage should be sum of both calls
    expect(result.usage.inputTokens).toBe(220);
    expect(result.usage.outputTokens).toBe(110);
    // fetch was called twice (initial + retry)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns failed validation after max retries', async () => {
    const leaf = createTestLeaf(true); // has require constraint: 'dark mode'

    // All 3 attempts fail validation
    for (let i = 0; i < 3; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(JSON.stringify(createMockResponse('No matching content', 100, 50))),
      });
    }

    const result = await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf,
    });

    expect(result.output).toBe('No matching content');
    expect(result.attempts).toBe(3);
    expect(result.validation).toBeDefined();
    expect(result.validation!.allPassed).toBe(false);
    expect(result.validation!.failedCount).toBe(1);
  });

  it('skips validation when no constraints', async () => {
    const leaf = createTestLeaf(false); // no constraints

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(createMockResponse('Any output'))),
    });

    const result = await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf,
    });

    expect(result.output).toBe('Any output');
    expect(result.attempts).toBe(1);
    expect(result.validation).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses custom base URL when set', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://custom.api.com';
    // Ensure no proxy is set so our mock fetch is used
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;

    const mockResponse = createMockResponse('Test output');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });

    await generateLeafOutput({
      knowledge: createTestKnowledge(),
      leaf: createTestLeaf(),
    });

    expect(mockFetch.mock.calls[0][0]).toBe('https://custom.api.com/v1/messages');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GenerationError Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('GenerationError', () => {
  it('has correct properties', () => {
    const error = new GenerationError('Test error', 'TEST_CODE', 500, new Error('cause'));

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.statusCode).toBe(500);
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.name).toBe('GenerationError');
  });

  it('is instance of Error', () => {
    const error = new GenerationError('Test', 'CODE');
    expect(error).toBeInstanceOf(Error);
  });
});
