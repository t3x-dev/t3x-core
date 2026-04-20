import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LLMProviderError } from '../../llm/types';
import { ProviderExtractionDraftSchema } from '../../extractors/v2/providerDraft';
import { GeminiProvider } from '../../providers/llm/gemini';

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

function makeGeminiResponse(text: string, promptTokens = 10, candidateTokens = 5) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: promptTokens, candidatesTokenCount: candidateTokens },
  };
}

describe('GeminiProvider.generateFromPrompt', () => {
  it('sends system instruction and user messages in Gemini format', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(makeGeminiResponse('Hello!'))),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const result = await provider.generateFromPrompt(
      {
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hi' }],
      },
      { model: 'gemini-2.0-flash', temperature: 0.1, maxTokens: 100 }
    );

    expect(result.text).toBe('Hello!');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    // System message should be in systemInstruction
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are helpful.' }] });
    // User messages should be in contents array
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Hi' }] }]);
    // Model used in URL
    const url = mockFetchFn.mock.calls[0][0] as string;
    expect(url).toContain('gemini-2.0-flash');
  });

  it('maps assistant role to model role', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(makeGeminiResponse('OK'))),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    await provider.generateFromPrompt(
      {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: 'How are you?' },
        ],
      },
      { model: 'gemini-2.0-flash' }
    );

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.contents[1].role).toBe('model');
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[2].role).toBe('user');
  });

  it('omits systemInstruction when no system prompt', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(makeGeminiResponse('OK'))),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    await provider.generateFromPrompt(
      { messages: [{ role: 'user', content: 'Hello' }] },
      { model: 'gemini-2.0-flash' }
    );

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.systemInstruction).toBeUndefined();
  });
});

describe('GeminiProvider.generateStructured', () => {
  it('sends responseSchema and responseMimeType, parses response', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify(makeGeminiResponse('{"name": "Alice", "age": 30}', 20, 15))
          ),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract info about Alice, age 30' }] },
      schema,
      { model: 'gemini-2.0-flash' }
    );

    expect(result.data).toEqual({ name: 'Alice', age: 30 });
    expect(result.usage.inputTokens).toBe(20);
    expect(result.usage.outputTokens).toBe(15);

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.generationConfig.responseSchema).toBeDefined();
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    // Verify schema structure
    expect(body.generationConfig.responseSchema.type).toBe('object');
    expect(body.generationConfig.responseSchema.properties).toBeDefined();
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it('sends systemInstruction with structured request when system is provided', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(JSON.stringify(makeGeminiResponse('{"name": "Bob", "age": 25}'))),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    await provider.generateStructured(
      { system: 'Extract structured data.', messages: [{ role: 'user', content: 'Bob, 25' }] },
      schema,
      { model: 'gemini-2.0-flash' }
    );

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Extract structured data.' }] });
  });

  it('uses a low thinking budget for Gemini 3.1 Pro structured extraction', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(JSON.stringify(makeGeminiResponse('{"name":"Bob","age":25}'))),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract' }] },
      schema,
      { model: 'gemini-3.1-pro-preview' }
    );

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 256 });
  });

  it('throws LLMProviderError when JSON parsing fails', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(makeGeminiResponse('not valid json'))),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string(), age: z.number() });
    await expect(
      provider.generateStructured({ messages: [{ role: 'user', content: 'Extract' }] }, schema, {
        model: 'gemini-2.0-flash',
      })
    ).rejects.toThrow(LLMProviderError);
  });

  it('throws LLMProviderError when response does not match schema', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(makeGeminiResponse('{"name": "Alice"}'))),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    // age is required and missing
    const schema = z.object({ name: z.string(), age: z.number() });
    await expect(
      provider.generateStructured({ messages: [{ role: 'user', content: 'Extract' }] }, schema, {
        model: 'gemini-2.0-flash',
      })
    ).rejects.toThrow(LLMProviderError);
  });

  it('throws LLMProviderError on HTTP error', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const schema = z.object({ name: z.string() });
    await expect(
      provider.generateStructured({ messages: [{ role: 'user', content: 'Extract' }] }, schema, {
        model: 'gemini-2.0-flash',
      })
    ).rejects.toThrow(LLMProviderError);
  });

  it('lowers provider draft schema to the Gemini responseSchema subset', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify(
              makeGeminiResponse(
                '{"schema":"t3x/provider-extraction-draft","version":1,"mode":"bootstrap","items":[],"warnings":[]}'
              )
            )
          ),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract' }] },
      ProviderExtractionDraftSchema,
      { model: 'gemini-3-flash-preview' }
    );

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    const schema = body.generationConfig.responseSchema;
    expect(schema.properties.schema).toMatchObject({
      type: 'string',
      enum: ['t3x/provider-extraction-draft'],
    });
    expect(schema.properties.version).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 1,
    });
    expect(schema.properties.mode).toMatchObject({
      type: 'string',
      enum: ['bootstrap', 'incremental'],
    });
    expect(schema.properties.items.items.properties.intent).toMatchObject({
      type: 'string',
      enum: ['add', 'update', 'remove', 'reinforce', 'noop'],
    });
    expect(schema.properties.items.items.properties.reasoning_type).toMatchObject({
      type: 'string',
      enum: ['direct', 'paraphrase', 'cross_turn', 'implicit'],
    });
    expect(
      schema.properties.items.items.properties.evidence.items.properties.role
    ).toMatchObject({
      type: 'string',
      enum: ['primary', 'supporting'],
    });
    expect(JSON.stringify(schema)).not.toContain('"const"');
    expect(JSON.stringify(schema)).not.toContain('"additionalProperties"');
    expect(JSON.stringify(schema.properties.version)).not.toContain('"enum"');
  });

  it('normalizes nested child values_json into canonical child values', async () => {
    mockFetchFn.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify(
              makeGeminiResponse(
                '{"schema":"t3x/provider-extraction-draft","version":1,"mode":"bootstrap","items":[{"id":"item_1","intent":"add","confidence":0.9,"reasoning_type":"direct","target_ref":{"node_key":null,"path":null,"existing_node_id":null},"candidate":{"key":"airport_issue","path_hint":"airport_issue","slot":null,"value_json":null,"values_json":"{\\"summary\\":\\"SEA had a cyberattack\\"}","children_json":"[{\\"key\\":\\"Baggage Handling\\",\\"values_json\\":\\"{\\\\\\"description\\\\\\":\\\\\\"Automated baggage systems were disrupted\\\\\\"}\\"}]"},"evidence":[{"turn_tag":"T1","quote":"Baggage Handling: The automated baggage systems were severely disrupted.","role":"primary"}]}],"warnings":[]}'
              )
            )
          ),
      })
    );

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const result = await provider.generateStructured(
      { messages: [{ role: 'user', content: 'Extract' }] },
      ProviderExtractionDraftSchema,
      { model: 'gemini-3-flash-preview' }
    );

    expect(result.data.items[0]?.candidate.children_json).toBe(
      '[{"key":"Baggage Handling","values":{"description":"Automated baggage systems were disrupted"}}]'
    );
  });
});
