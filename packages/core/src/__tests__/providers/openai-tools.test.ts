import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../../llm/types';
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
    if (savedProxy[key] !== undefined) process.env[key] = savedProxy[key];
  }
});

beforeEach(() => {
  mockFetchFn.mockReset();
});

const readSchema: ToolDefinition = {
  name: 'readSchema',
  description: 'Read the resolved Workspace schema.',
  input_schema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

const reasoningItem = {
  type: 'reasoning',
  id: 'rs_1',
  summary: [],
  encrypted_content: 'opaque-reasoning-state',
};

function mockResponsesResponse(body: unknown, status = 200) {
  mockFetchFn.mockImplementation(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  );
}

function sentBody() {
  return JSON.parse((mockFetchFn.mock.calls[0] as [string, RequestInit])[1].body as string);
}

describe('OpenAIProvider.generateWithTools', () => {
  it('sends Responses function tools and parses a function call', async () => {
    mockResponsesResponse({
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'I will read the schema.' }],
        },
        {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_read',
          name: 'readSchema',
          arguments: '{}',
        },
      ],
      usage: { input_tokens: 12, output_tokens: 4 },
    });
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
    });

    const result = await provider.generateWithTools(
      { system: 'Use tools.', messages: [{ role: 'user', content: '读取 schema' }] },
      [readSchema],
      { model: 'gpt-4o', maxTokens: 100 }
    );

    const [url, options] = mockFetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = sentBody();
    expect(body).toMatchObject({
      model: 'gpt-4o',
      instructions: 'Use tools.',
      input: [{ role: 'user', content: '读取 schema' }],
      tool_choice: 'auto',
      max_output_tokens: 100,
      store: false,
      temperature: 0.3,
    });
    expect(body.tools).toEqual([
      {
        type: 'function',
        name: 'readSchema',
        description: 'Read the resolved Workspace schema.',
        parameters: readSchema.input_schema,
        strict: false,
      },
    ]);
    expect(body).not.toHaveProperty('reasoning');
    expect(result).toMatchObject({
      stop_reason: 'tool_use',
      usage: { inputTokens: 12, outputTokens: 4 },
      tool_calls: [{ id: 'call_read', name: 'readSchema', input: {} }],
    });
    expect(result._rawAssistantContent).toEqual([
      { type: 'text', text: 'I will read the schema.' },
      { type: 'tool_use', id: 'call_read', name: 'readSchema', input: {} },
    ]);
  });

  it('keeps reasoning effort with tools on gpt-5 models', async () => {
    mockResponsesResponse({
      status: 'completed',
      output: [
        reasoningItem,
        { type: 'function_call', call_id: 'call_read', name: 'readSchema', arguments: '{}' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new OpenAIProvider({ apiKey: 'test-key' });

    const result = await provider.generateWithTools(
      { messages: [{ role: 'user', content: '读取 schema' }] },
      [readSchema],
      { model: 'gpt-5.4-mini', reasoningEffort: 'medium', maxTokens: 100 }
    );

    const body = sentBody();
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.include).toEqual(['reasoning.encrypted_content']);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(result._rawAssistantContent).toEqual([
      { type: 'openai_reasoning', item: reasoningItem },
      { type: 'tool_use', id: 'call_read', name: 'readSchema', input: {} },
    ]);
  });

  it('replays reasoning, function_call, and function_call_output on continuation', async () => {
    mockResponsesResponse({
      status: 'completed',
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'r1' }] },
      ],
      usage: { input_tokens: 20, output_tokens: 6 },
    });
    const provider = new OpenAIProvider({ apiKey: 'test-key' });

    const result = await provider.generateWithTools(
      {
        messages: [
          { role: 'user', content: '读取 schema' },
          {
            role: 'assistant',
            content: [
              { type: 'openai_reasoning', item: reasoningItem },
              { type: 'tool_use', id: 'call_read', name: 'readSchema', input: {} },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'call_read', content: '{"version":"r1"}' },
            ],
          },
        ],
      },
      [readSchema],
      { model: 'gpt-5.4', reasoningEffort: 'high' }
    );

    expect(sentBody().input).toEqual([
      { role: 'user', content: '读取 schema' },
      reasoningItem,
      { type: 'function_call', call_id: 'call_read', name: 'readSchema', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call_read', output: '{"version":"r1"}' },
    ]);
    expect(result.tool_calls).toEqual([]);
    expect(result.stop_reason).toBe('end_turn');
    expect(result._rawAssistantContent).toEqual([{ type: 'text', text: 'r1' }]);
  });

  it('maps max_output_tokens incompletion to max_tokens', async () => {
    mockResponsesResponse({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'partial' }] },
      ],
    });
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const result = await provider.generateWithTools(
      { messages: [{ role: 'user', content: 'go' }] },
      [readSchema],
      { model: 'gpt-5.4' }
    );
    expect(result.stop_reason).toBe('max_tokens');
    expect(sentBody().max_output_tokens).toBe(8192);
  });

  it('rejects invalid tool arguments, empty output, and HTTP failures', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const call = () =>
      provider.generateWithTools({ messages: [{ role: 'user', content: 'go' }] }, [readSchema], {
        model: 'gpt-4o',
      });

    mockResponsesResponse({
      status: 'completed',
      output: [
        { type: 'function_call', call_id: 'call_bad', name: 'readSchema', arguments: '{oops' },
      ],
    });
    await expect(call()).rejects.toThrow(/not valid JSON/);

    mockResponsesResponse({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [reasoningItem],
    });
    await expect(call()).rejects.toThrow(/incomplete: max_output_tokens/);

    mockResponsesResponse({ error: 'forbidden' }, 403);
    await expect(call()).rejects.toThrow(LLMProviderError);
  });
});
