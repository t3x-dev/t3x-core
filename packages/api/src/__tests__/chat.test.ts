/**
 * Chat Routes Tests
 */

import type { AnyDB } from '@t3x-dev/storage';
import * as storage from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

// Mock undici for proxy support.
vi.mock('undici', () => ({
  ProxyAgent: vi.fn(),
  fetch: vi.fn(),
}));

let mockDB: AnyDB;
let cleanup: (() => Promise<void>) | null = null;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { resetProviderRegistry } from '../lib/provider-registry';
import { chatRoutes } from '../routes/chat.openapi';

const originalEnv = { ...process.env };
const envKeys = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_AI_STUDIO_KEY',
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
];

describe('Chat Routes', () => {
  const app = new Hono();
  app.route('/', chatRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  beforeEach(async () => {
    resetProviderRegistry();
    vi.restoreAllMocks();

    for (const key of envKeys) {
      delete process.env[key];
    }

    await storage.deleteProviderCredential(mockDB, 'anthropic');
    await storage.deleteProviderCredential(mockDB, 'openai');
    await storage.deleteProviderCredential(mockDB, 'google');
  });

  afterAll(async () => {
    process.env = originalEnv;
    vi.unstubAllGlobals();

    if (cleanup) {
      await cleanup();
    }
  });

  describe('GET /v1/chat/providers', () => {
    it('returns only configured chat providers from the provider system', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });

      const res = await app.request('/v1/chat/providers');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.providers).toEqual(['openai']);
      expect(data.data.default).toBe('openai');
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

    it('returns 400 when no configured chat provider is available', async () => {
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

    it('uses stored local anthropic credentials without env fallback', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'anthropic',
        apiKey: 'sk-local-anthropic',
      });

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://api.anthropic.com/v1/messages');
        expect(init?.headers).toMatchObject({
          'Content-Type': 'application/json',
          'x-api-key': 'sk-local-anthropic',
          'anthropic-version': '2023-06-01',
        });

        const payload = JSON.parse(String(init?.body)) as {
          model: string;
          messages: Array<{ role: string; content: string }>;
        };
        expect(payload.model).toBe('claude-sonnet-4-20250514');
        expect(payload.messages).toEqual([{ role: 'user', content: 'Hello' }]);

        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'Anthropic says hi' }],
            model: 'claude-sonnet-4-20250514',
            usage: { input_tokens: 11, output_tokens: 7 },
            stop_reason: 'end_turn',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.content).toBe('Anthropic says hi');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('prefers stored local openai credentials over env credentials', async () => {
      process.env.OPENAI_API_KEY = 'sk-env-openai';

      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://api.openai.com/v1/chat/completions');
        expect(init?.headers).toMatchObject({
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-local-openai',
        });

        const payload = JSON.parse(String(init?.body)) as {
          model: string;
          messages: Array<{ role: string; content: string }>;
        };
        expect(payload.model).toBe('gpt-4o');
        expect(payload.messages).toEqual([{ role: 'user', content: 'Hello from OpenAI' }]);

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OpenAI says hi' } }],
            usage: { prompt_tokens: 13, completion_tokens: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          messages: [{ role: 'user', content: 'Hello from OpenAI' }],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.content).toBe('OpenAI says hi');
      expect(data.data.model).toBe('gpt-4o');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('strips the provider prefix before calling upstream for prefixed-model requests', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://api.openai.com/v1/chat/completions');

        const payload = JSON.parse(String(init?.body)) as {
          model: string;
          messages: Array<{ role: string; content: string }>;
        };
        expect(payload.model).toBe('gpt-4o');
        expect(payload.messages).toEqual([{ role: 'user', content: 'Hello prefixed OpenAI' }]);

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OpenAI prefixed model works' } }],
            usage: { prompt_tokens: 10, completion_tokens: 6 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai:gpt-4o',
          messages: [{ role: 'user', content: 'Hello prefixed OpenAI' }],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.content).toBe('OpenAI prefixed model works');
      expect(data.data.model).toBe('gpt-4o');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fails clearly instead of falling back when an explicit model targets an unconfigured provider', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });

      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'anthropic:claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Do not fall through' }],
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_ERROR');
      expect(String(data.error.message)).toContain('anthropic');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects thinking for non-anthropic providers instead of ignoring it', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });

      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          thinking: true,
          messages: [{ role: 'user', content: 'Do not ignore thinking' }],
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_ERROR');
      expect(String(data.error.message)).toContain('openai');
      expect(String(data.error.message)).toContain('thinking');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects web_search for non-anthropic providers instead of ignoring it', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });

      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          web_search: true,
          messages: [{ role: 'user', content: 'Do not ignore web search' }],
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_ERROR');
      expect(String(data.error.message)).toContain('openai');
      expect(String(data.error.message)).toContain('web_search');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects bare provider aliases passed as model input', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });

      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [{ role: 'user', content: 'Do not treat provider alias as a model' }],
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_ERROR');
      expect(String(data.error.message)).toContain('openai');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects malformed provider:model input with an empty model suffix', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });

      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai:',
          messages: [{ role: 'user', content: 'Do not accept empty provider:model suffixes' }],
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_ERROR');
      expect(String(data.error.message)).toContain('openai:');
      expect(fetchMock).not.toHaveBeenCalled();
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

    it('returns 400 when no configured chat provider is available', async () => {
      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('uses stored local anthropic credentials for streaming chat without env fallback', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'anthropic',
        apiKey: 'sk-local-stream-anthropic',
      });

      const upstreamStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              [
                'event: message_start',
                'data: {"message":{"model":"claude-sonnet-4-20250514","usage":{"input_tokens":9}}}',
                '',
                'event: content_block_delta',
                'data: {"delta":{"type":"text_delta","text":"Hello from stream"}}',
                '',
                'event: message_delta',
                'data: {"usage":{"output_tokens":4}}',
                '',
                'event: message_stop',
                'data: {"type":"message_stop"}',
                '',
              ].join('\n')
            )
          );
          controller.close();
        },
      });

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://api.anthropic.com/v1/messages');
        expect(init?.headers).toMatchObject({
          'Content-Type': 'application/json',
          'x-api-key': 'sk-local-stream-anthropic',
          'anthropic-version': '2023-06-01',
        });

        const payload = JSON.parse(String(init?.body)) as {
          model: string;
          stream: boolean;
          messages: Array<{ role: string; content: string }>;
        };
        expect(payload.model).toBe('claude-sonnet-4-20250514');
        expect(payload.stream).toBe(true);
        expect(payload.messages).toEqual([{ role: 'user', content: 'Hello stream' }]);

        return new Response(upstreamStream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello stream' }],
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const body = await res.text();
      expect(body).toContain('"type":"token","content":"Hello from stream"');
      expect(body).toContain('"type":"done","model":"claude-sonnet-4-20250514"');
      expect(body).toContain('[DONE]');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fails clearly instead of falling back when stream model targets an unsupported provider', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'anthropic',
        apiKey: 'sk-local-stream-anthropic',
      });

      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          thinking: true,
          messages: [{ role: 'user', content: 'Do not silently stream with Claude' }],
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_ERROR');
      expect(String(data.error.message)).toContain('openai');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
