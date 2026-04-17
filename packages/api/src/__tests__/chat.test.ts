/**
 * Chat Routes Tests
 */

import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock undici for proxy support
vi.mock('undici', () => ({
  ProxyAgent: vi.fn(),
  fetch: vi.fn(),
}));

// Save and clear proxy/API env vars
const savedEnv: Record<string, string | undefined> = {};
const envKeys = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
];

beforeAll(() => {
  for (const key of envKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterAll(() => {
  for (const key of envKeys) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

import { chatRoutes } from '../routes/chat.openapi';

describe('Chat Routes', () => {
  const app = new Hono();
  app.route('/', chatRoutes);

  describe('GET /v1/chat/providers', () => {
    it('returns list of providers', async () => {
      const res = await app.request('/v1/chat/providers');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.providers).toBeInstanceOf(Array);
    });
  });

  describe('POST /v1/chat', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for empty messages', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing messages', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no API key configured', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'claude-sonnet-4-20250514',
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('PROVIDER_ERROR');
    });

    it('supports OpenAI non-streaming chat', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'gpt-4o-mini',
            choices: [
              {
                message: { content: 'Hello from OpenAI' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 11, completion_tokens: 7 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.content).toBe('Hello from OpenAI');
      fetchMock.mockRestore();
      delete process.env.OPENAI_API_KEY;
    });
  });

  describe('POST /v1/chat/stream', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for empty messages', async () => {
      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no API key', async () => {
      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });
      expect(res.status).toBe(400);
    });

    it('supports OpenAI streaming chat', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      const streamBody = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"id":"chatcmpl_1","model":"gpt-4o-mini","choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"id":"chatcmpl_1","model":"gpt-4o-mini","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n'
            )
          );
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(streamBody, { status: 200 }));

      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('"type":"token","content":"Hel"');
      expect(text).toContain('"type":"token","content":"lo"');
      expect(text).toContain('"type":"done"');
      fetchMock.mockRestore();
      delete process.env.OPENAI_API_KEY;
    });
  });
});
