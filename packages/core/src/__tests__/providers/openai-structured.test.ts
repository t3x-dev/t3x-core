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
  it('sends system and user messages through the Responses API input format', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'Hello!' }],
                },
              ],
              usage: { input_tokens: 10, output_tokens: 5 },
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
      { model: 'gpt-5.4-mini', temperature: 0.1, maxTokens: 100 }
    );

    expect(result.text).toBe('Hello!');
    expect(result.usage.inputTokens).toBe(10);

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.input).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);
    expect(body.model).toBe('gpt-5.4-mini');
    expect(String(mockFetchFn.mock.calls[0][0])).toBe('https://api.openai.com/v1/responses');
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
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: '{"name": "Alice", "age": 30}' }],
                },
              ],
              usage: { input_tokens: 20, output_tokens: 15 },
            })
          ),
      })
    );

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract info about Alice, age 30' }] },
      schema,
      { model: 'gpt-5.4-mini' }
    );

    expect(result.data).toEqual({ name: 'Alice', age: 30 });
    expect(result.usage.inputTokens).toBe(20);

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.text.format).toBeDefined();
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.name).toBe('extract_data');
    expect(body.text.format.schema).toBeDefined();
    expect(body.text.format.strict).toBe(true);
  });

  it('throws LLMProviderError when JSON parsing fails', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'not valid json' }],
                },
              ],
              usage: { input_tokens: 10, output_tokens: 8 },
            })
          ),
      })
    );

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    await expect(
      provider.generateStructured({ messages: [{ role: 'user', content: 'Extract' }] }, schema, {
        model: 'gpt-5.4-mini',
      })
    ).rejects.toThrow(LLMProviderError);
  });
});
