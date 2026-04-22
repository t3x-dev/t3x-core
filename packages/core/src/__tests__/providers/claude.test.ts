/**
 * Claude LLM Provider Tests
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ProviderExtractionDraftSchema } from '../../extractors/v2/providerDraft';
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
        text: () =>
          Promise.resolve(
            JSON.stringify({
              content: [{ type: 'text', text: 'Hello!' }],
              usage: { input_tokens: 10, output_tokens: 5 },
            })
          ),
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
  it('sends output_config.format and parses structured JSON text', async () => {
    const responseBody = {
      content: [{ type: 'text', text: '{"name":"Alice","age":30}' }],
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
    expect(body.output_config).toEqual({
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name', 'age'],
          additionalProperties: false,
        },
      },
    });
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('falls back to text parsing when no tool_use in response', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              content: [{ type: 'text', text: '{"name": "Bob", "age": 25}' }],
              usage: { input_tokens: 10, output_tokens: 8 },
            })
          ),
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

  it('normalizes provider draft child aliases before schema parsing', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              content: [
                {
                  type: 'tool_use',
                  id: 'tool_1',
                  name: 'extract_data',
                  input: {
                    schema: 't3x/provider-extraction-draft',
                    version: 1,
                    mode: 'bootstrap',
                    items: [
                      {
                        id: 'item_1',
                        intent: 'add',
                        confidence: 0.9,
                        reasoning_type: 'direct',
                        target_ref: {
                          node_key: null,
                          path: null,
                          existing_node_id: null,
                        },
                        candidate: {
                          key: 'airport_issue',
                          path_hint: 'airport_issue',
                          slot: null,
                          value_json: null,
                          values_json: '{"summary":"SEA had a cyberattack"}',
                          children_json:
                            '[{"area":"Baggage Handling","description":"Automated baggage systems were disrupted"}]',
                        },
                        evidence: [
                          {
                            turn_tag: 'T1',
                            quote:
                              'Baggage Handling: The automated baggage systems were severely disrupted.',
                            role: 'primary',
                          },
                        ],
                      },
                    ],
                    warnings: [],
                  },
                },
              ],
              usage: { input_tokens: 12, output_tokens: 8 },
            })
          ),
      })
    );

    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract' }] },
      ProviderExtractionDraftSchema,
      { model: 'claude-sonnet-4-6' }
    );

    expect(result.data.items[0]?.candidate.children_json).toBe(
      '[{"key":"Baggage Handling","values":{"description":"Automated baggage systems were disrupted"}}]'
    );
  });

  it('folds child description into values when key is already present', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              content: [
                {
                  type: 'tool_use',
                  id: 'tool_1',
                  name: 'extract_data',
                  input: {
                    schema: 't3x/provider-extraction-draft',
                    version: 1,
                    mode: 'bootstrap',
                    items: [
                      {
                        id: 'item_1',
                        intent: 'add',
                        confidence: 0.9,
                        reasoning_type: 'direct',
                        target_ref: {
                          node_key: null,
                          path: null,
                          existing_node_id: null,
                        },
                        candidate: {
                          key: 'airport_issue',
                          path_hint: 'airport_issue',
                          slot: null,
                          value_json: null,
                          values_json: '{"summary":"SEA had a cyberattack"}',
                          children_json:
                            '[{"key":"Baggage Handling","description":"Automated baggage systems were disrupted"}]',
                        },
                        evidence: [
                          {
                            turn_tag: 'T1',
                            quote:
                              'Baggage Handling: The automated baggage systems were severely disrupted.',
                            role: 'primary',
                          },
                        ],
                      },
                    ],
                    warnings: [],
                  },
                },
              ],
              usage: { input_tokens: 12, output_tokens: 8 },
            })
          ),
      })
    );

    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract' }] },
      ProviderExtractionDraftSchema,
      { model: 'claude-sonnet-4-6' }
    );

    expect(result.data.items[0]?.candidate.children_json).toBe(
      '[{"key":"Baggage Handling","values":{"description":"Automated baggage systems were disrupted"}}]'
    );
  });

  it('lowers provider draft schema to Claude structured-output subset', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              content: [
                {
                  type: 'text',
                  text: '{"schema":"t3x/provider-extraction-draft","version":1,"mode":"bootstrap","items":[],"warnings":[]}',
                },
              ],
              usage: { input_tokens: 12, output_tokens: 8 },
            })
          ),
      })
    );

    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract' }] },
      ProviderExtractionDraftSchema,
      { model: 'claude-sonnet-4-6' }
    );

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.output_config.format.schema.properties.version).toEqual({
      type: 'integer',
      enum: [1],
    });
    expect(body.output_config.format.schema.properties.items.items.properties.confidence).toEqual({
      type: 'number',
    });
  });

  it('flattens nested child value and children fields into supported child shape', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              content: [
                {
                  type: 'tool_use',
                  id: 'tool_1',
                  name: 'extract_data',
                  input: {
                    schema: 't3x/provider-extraction-draft',
                    version: 1,
                    mode: 'bootstrap',
                    items: [
                      {
                        id: 'item_1',
                        intent: 'add',
                        confidence: 0.9,
                        reasoning_type: 'direct',
                        target_ref: {
                          node_key: null,
                          path: null,
                          existing_node_id: null,
                        },
                        candidate: {
                          key: 'airport_issue',
                          path_hint: 'airport_issue',
                          slot: null,
                          value_json: null,
                          values_json: '{"summary":"SEA had a cyberattack"}',
                          children_json:
                            '[{"key":"Baggage Handling","value":"Automated baggage systems were disrupted"},{"key":"Passenger Impact","children":[{"key":"Long Lines"},{"key":"Manual Check-In"}]}]',
                        },
                        evidence: [
                          {
                            turn_tag: 'T1',
                            quote: 'Airlines were unable to use the airport’s common-use systems.',
                            role: 'primary',
                          },
                        ],
                      },
                    ],
                    warnings: [],
                  },
                },
              ],
              usage: { input_tokens: 12, output_tokens: 8 },
            })
          ),
      })
    );

    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract' }] },
      ProviderExtractionDraftSchema,
      { model: 'claude-sonnet-4-6' }
    );

    expect(result.data.items[0]?.candidate.children_json).toBe(
      '[{"key":"Baggage Handling","values":{"value":"Automated baggage systems were disrupted"}},{"key":"Passenger Impact","values":{"children":[{"key":"Long Lines"},{"key":"Manual Check-In"}]}}]'
    );
  });

  it('falls back to a plain-text JSON retry when structured output returns no content', async () => {
    const draftJson = {
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'topic',
            path_hint: 'topic',
            slot: null,
            value_json: null,
            values_json: '{"summary":"hello"}',
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'hello', role: 'primary' }],
        },
      ],
      warnings: [],
    };

    // First call: structured output path returns content with no usable data.
    // Second call: plain generateFromPrompt returns JSON in the text block.
    mockFetchFn
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                content: [{ type: 'text', text: "I'll think about this…" }],
                usage: { input_tokens: 12, output_tokens: 8 },
              })
            ),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                content: [
                  {
                    type: 'text',
                    text: `Here is the draft:\n\n\`\`\`json\n${JSON.stringify(draftJson)}\n\`\`\``,
                  },
                ],
                usage: { input_tokens: 14, output_tokens: 10 },
              })
            ),
        })
      );

    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract' }] },
      ProviderExtractionDraftSchema,
      { model: 'claude-opus-4-6' }
    );

    expect(mockFetchFn).toHaveBeenCalledTimes(2);
    expect(result.data.items[0]?.id).toBe('item_1');

    // Second call should be the plain messages API (no output_config).
    const secondBody = JSON.parse(mockFetchFn.mock.calls[1][1].body);
    expect(secondBody.output_config).toBeUndefined();
  });

  it('throws when fallback plain-text call also produces no extractable JSON', async () => {
    mockFetchFn
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                content: [{ type: 'text', text: 'thinking...' }],
                usage: { input_tokens: 12, output_tokens: 8 },
              })
            ),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                content: [{ type: 'text', text: 'Still thinking, no JSON.' }],
                usage: { input_tokens: 14, output_tokens: 10 },
              })
            ),
        })
      );

    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    await expect(
      provider.generateStructured(
        { messages: [{ role: 'user', content: 'Extract' }] },
        ProviderExtractionDraftSchema,
        { model: 'claude-opus-4-6' }
      )
    ).rejects.toThrow(LLMProviderError);
  });
});
