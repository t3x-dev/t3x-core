import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeProvider } from '../../providers/llm/claude';
import { GeminiProvider } from '../../providers/llm/gemini';
import { OpenAIProvider } from '../../providers/llm/openai';

const savedProxy: Record<string, string | undefined> = {};
const proxyKeys = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];
const mockFetch = vi.fn();

beforeAll(() => {
  for (const key of proxyKeys) {
    savedProxy[key] = process.env[key];
    delete process.env[key];
  }
  vi.stubGlobal('fetch', mockFetch);
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const key of proxyKeys) {
    if (savedProxy[key] !== undefined) process.env[key] = savedProxy[key];
  }
});

beforeEach(() => mockFetch.mockReset());

function response(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200 }
  );
}

async function collect(stream: AsyncIterable<unknown>) {
  const events: unknown[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const prompt = { messages: [{ role: 'user' as const, content: 'Hello' }] };

describe('provider prompt streaming', () => {
  it('streams OpenAI chat completion deltas and usage', async () => {
    mockFetch.mockResolvedValue(
      response([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const provider = new OpenAIProvider({ apiKey: 'test' });
    expect(await collect(provider.streamFromPrompt(prompt, { model: 'gpt-5.4' }))).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'done', usage: { inputTokens: 3, outputTokens: 2 } },
    ]);
  });

  it('streams Gemini visible parts and usage', async () => {
    mockFetch.mockResolvedValue(
      response([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\n\n',
      ])
    );
    const provider = new GeminiProvider({ apiKey: 'test' });
    expect(await collect(provider.streamFromPrompt(prompt, { model: 'gemini-2.5-pro' }))).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'done', usage: { inputTokens: 3, outputTokens: 2 } },
    ]);
  });

  it('streams Claude text deltas and usage', async () => {
    mockFetch.mockResolvedValue(
      response([
        'event: message_start\ndata: {"message":{"usage":{"input_tokens":3}}}\n\n',
        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hel"}}\n\n',
        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"lo"}}\n\n',
        'event: message_delta\ndata: {"usage":{"output_tokens":2}}\n\n',
        'event: message_stop\ndata: {}\n\n',
      ])
    );
    const provider = new ClaudeProvider({ apiKey: 'test' });
    expect(
      await collect(provider.streamFromPrompt(prompt, { model: 'claude-sonnet-4-6' }))
    ).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'done', usage: { inputTokens: 3, outputTokens: 2 } },
    ]);
  });
});
