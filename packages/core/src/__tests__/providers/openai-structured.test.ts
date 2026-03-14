import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LLMProviderError } from '../../llm/types';
import { OpenAIProvider } from '../../providers/llm/openai';

vi.spyOn(console, 'log').mockImplementation(() => {});

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

describe('OpenAIProvider.generateFromPrompt', () => {
  it('sends system message and user messages in OpenAI chat format', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [{ message: { content: 'Hello!' } }],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            })
          ),
      })
    );

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const result = await provider.generateFromPrompt(
      {
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hi' }],
      },
      { model: 'gpt-4o', temperature: 0.1, maxTokens: 100 }
    );

    expect(result.text).toBe('Hello!');
    expect(result.usage.inputTokens).toBe(10);

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    // System message should be first in messages array
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hi' });
    expect(body.model).toBe('gpt-4o');
  });
});

describe('OpenAIProvider.generateStructured', () => {
  it('sends json_schema response_format and parses response', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [{ message: { content: '{"name": "Alice", "age": 30}' } }],
              usage: { prompt_tokens: 20, completion_tokens: 15 },
            })
          ),
      })
    );

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract info about Alice, age 30' }] },
      schema,
      { model: 'gpt-4o' }
    );

    expect(result.data).toEqual({ name: 'Alice', age: 30 });
    expect(result.usage.inputTokens).toBe(20);

    // Verify response_format was sent
    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.response_format).toBeDefined();
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('extract_data');
    expect(body.response_format.json_schema.schema).toBeDefined();
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('throws LLMProviderError when JSON parsing fails', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [{ message: { content: 'not valid json' } }],
              usage: { prompt_tokens: 10, completion_tokens: 8 },
            })
          ),
      })
    );

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    await expect(
      provider.generateStructured({ messages: [{ role: 'user', content: 'Extract' }] }, schema, {
        model: 'gpt-4o',
      })
    ).rejects.toThrow(LLMProviderError);
  });
});
