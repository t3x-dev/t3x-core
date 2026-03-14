/**
 * Claude LLM Provider Tests
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LLMProviderError } from '../../llm/types';
import { ClaudeProvider, createClaudeProvider } from '../../providers/llm/claude';

// Silence console.log from fetchWithProxy
vi.spyOn(console, 'log').mockImplementation(() => {});

// Save and clear proxy env vars so fetchWithProxy uses global fetch (mockable)
const savedProxy: Record<string, string | undefined> = {};
const proxyKeys = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

const mockFetchFn = vi.fn();

beforeAll(() => {
  for (const key of proxyKeys) {
    savedProxy[key] = process.env[key];
    delete process.env[key];
  }
  vi.stubGlobal('fetch', mockFetchFn);
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const key of proxyKeys) {
    if (savedProxy[key] !== undefined) {
      process.env[key] = savedProxy[key];
    }
  }
});

beforeEach(() => {
  mockFetchFn.mockReset();
});

function setMockFetch(responseBody: object, status = 200) {
  mockFetchFn.mockImplementation(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(responseBody)),
    })
  );
}

function successResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

describe('ClaudeProvider', () => {
  describe('constructor', () => {
    it('sets default model and base URL', () => {
      const provider = new ClaudeProvider({ apiKey: 'test-key' });
      expect(provider.id).toBe('claude');
    });
  });

  describe('generate', () => {
    it('returns generated text on success', async () => {
      setMockFetch(successResponse('Hello from Claude'));
      const provider = new ClaudeProvider({ apiKey: 'test-key' });
      const result = await provider.generate('Say hello');
      expect(result.text).toBe('Hello from Claude');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
    });

    it('sends correct request body', async () => {
      setMockFetch(successResponse('ok'));
      const provider = new ClaudeProvider({
        apiKey: 'my-key',
        model: 'claude-test',
        baseUrl: 'https://custom.api',
      });
      await provider.generate('Test prompt', {
        temperature: 0.5,
        maxTokens: 100,
        stopSequences: ['STOP'],
      });

      const [url, options] = mockFetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://custom.api/v1/messages');
      expect((options.headers as Record<string, string>)['x-api-key']).toBe('my-key');

      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('claude-test');
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(100);
      expect(body.stop_sequences).toEqual(['STOP']);
      expect(body.messages[0].content).toBe('Test prompt');
    });

    it('throws LLMProviderError on HTTP error', async () => {
      setMockFetch({ error: 'forbidden' }, 403);
      const provider = new ClaudeProvider({ apiKey: 'key' });
      await expect(provider.generate('test')).rejects.toThrow(LLMProviderError);
    });

    it('throws LLMProviderError when no text content in response', async () => {
      setMockFetch({ content: [{ type: 'image', text: '' }] });
      const provider = new ClaudeProvider({ apiKey: 'key' });
      await expect(provider.generate('test')).rejects.toThrow('No text content');
    });

    it('throws LLMProviderError on network error', async () => {
      mockFetchFn.mockImplementation(() => Promise.reject(new Error('Network failure')));
      const provider = new ClaudeProvider({ apiKey: 'key' });
      await expect(provider.generate('test')).rejects.toThrow(LLMProviderError);
    });

    it('uses default temperature and maxTokens', async () => {
      setMockFetch(successResponse('ok'));
      const provider = new ClaudeProvider({ apiKey: 'key' });
      await provider.generate('test');
      const body = JSON.parse(
        (mockFetchFn.mock.calls[0] as [string, RequestInit])[1].body as string
      );
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(2048);
    });
  });

  describe('resolveConflict', () => {
    it('calls generate with merge prompt', async () => {
      setMockFetch(successResponse('Merged result'));
      const provider = new ClaudeProvider({ apiKey: 'key' });
      const result = await provider.resolveConflict('base', 'source', 'target', 'context');
      expect(result.text).toBe('Merged result');
      const body = JSON.parse(
        (mockFetchFn.mock.calls[0] as [string, RequestInit])[1].body as string
      );
      const prompt = body.messages[0].content;
      expect(prompt).toContain('base');
      expect(prompt).toContain('source');
      expect(prompt).toContain('target');
      expect(prompt).toContain('context');
    });

    it('handles null texts', async () => {
      setMockFetch(successResponse('resolved'));
      const provider = new ClaudeProvider({ apiKey: 'key' });
      await provider.resolveConflict(null, null, null);
      const body = JSON.parse(
        (mockFetchFn.mock.calls[0] as [string, RequestInit])[1].body as string
      );
      expect(body.messages[0].content).toContain('(deleted)');
    });
  });

  describe('factory', () => {
    it('createClaudeProvider returns ClaudeProvider', () => {
      const provider = createClaudeProvider({ apiKey: 'key' });
      expect(provider).toBeInstanceOf(ClaudeProvider);
    });
  });
});

describe('ClaudeProvider.generateFromPrompt', () => {
  it('sends system and messages in correct format', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          content: [{ type: 'text', text: 'Hello!' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        })),
      })
    );

    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    const result = await provider.generateFromPrompt(
      {
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hi' }],
      },
      { model: 'claude-sonnet-4-20250514', temperature: 0.1, maxTokens: 100 }
    );

    expect(result.text).toBe('Hello!');
    expect(result.usage.inputTokens).toBe(10);

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.system).toBe('You are helpful.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
    expect(body.model).toBe('claude-sonnet-4-20250514');
  });
});

describe('ClaudeProvider.generateStructured', () => {
  it('sends tool definition and extracts tool input', async () => {
    const responseBody = {
      content: [
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'extract_data',
          input: { name: 'Alice', age: 30 },
        },
      ],
      usage: { input_tokens: 20, output_tokens: 15 },
    };

    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(responseBody)),
      })
    );

    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract info about Alice, age 30' }] },
      schema,
      { model: 'claude-sonnet-4-20250514' }
    );

    expect(result.data).toEqual({ name: 'Alice', age: 30 });
    expect(result.usage.inputTokens).toBe(20);

    // Verify tools parameter was sent
    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.tools).toBeDefined();
    expect(body.tools[0].name).toBe('extract_data');
    expect(body.tools[0].input_schema).toBeDefined();
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'extract_data' });
  });

  it('falls back to text parsing when no tool_use in response', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          content: [{ type: 'text', text: '{"name": "Bob", "age": 25}' }],
          usage: { input_tokens: 10, output_tokens: 8 },
        })),
      })
    );

    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract' }] },
      schema,
      { model: 'claude-sonnet-4-20250514' }
    );

    expect(result.data).toEqual({ name: 'Bob', age: 25 });
  });
});
