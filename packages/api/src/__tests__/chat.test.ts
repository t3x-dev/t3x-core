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

import { createInferenceRuntime, createInferenceRuntimeMiddleware } from '../lib/inference';
import { getProviderRegistry, resetProviderRegistry } from '../lib/provider-registry';
import { chatRoutes, generationRoutes } from '../routes/chat.openapi';

const originalEnv = { ...process.env };
const envKeys = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
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

  it('keeps the legacy Chat export as the same Generation route object', () => {
    expect(chatRoutes).toBe(generationRoutes);
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

    it('uses generation role priority order for configured chat providers and default selection', async () => {
      const registry = await getProviderRegistry();
      registry.assignRole('generation', ['google-ai', 'openai', 'anthropic']);

      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'anthropic',
        apiKey: 'sk-local-anthropic',
      });

      const res = await app.request('/v1/chat/providers');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.providers).toEqual(['openai', 'claude']);
      expect(data.data.default).toBe('openai');
    });
  });

  describe('POST /v1/chat', () => {
    it('denies before provider I/O when the injected admission policy rejects the attempt', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const authorize = vi.fn(async () => ({
        outcome: 'denied' as const,
        code: 'quota_exhausted',
        reason: 'No hosted generation grant remains',
      }));
      const deniedApp = new Hono();
      deniedApp.use(
        '*',
        createInferenceRuntimeMiddleware(
          createInferenceRuntime({
            createGenerationId: () => 'gen_denied_chat',
            admissionPolicy: {
              authorize,
              settle: vi.fn(),
              release: vi.fn(),
            },
          })
        )
      );
      deniedApp.route('/', generationRoutes);

      const response = await deniedApp.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          messages: [{ role: 'user', content: 'Do not invoke upstream' }],
        }),
      });

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'No hosted generation grant remains' },
      });
      expect(authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          generationId: 'gen_denied_chat',
          feature: 'generation.chat.complete',
          scope: { actor: { kind: 'anonymous', id: null }, ingressChannel: 'api' },
        })
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('settles one normalized receipt for successful non-streaming generation', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              model: 'gpt-5.4-resolved',
              choices: [{ message: { content: 'Accounted response' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 17, completion_tokens: 9 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      );
      const settle = vi.fn(async () => {});
      const accountedApp = new Hono();
      accountedApp.use(
        '*',
        createInferenceRuntimeMiddleware(
          createInferenceRuntime({
            createGenerationId: () => 'gen_accounted_chat',
            admissionPolicy: {
              async authorize(attempt) {
                return {
                  outcome: 'admitted',
                  admission: { id: `admission:${attempt.generationId}` },
                };
              },
              settle,
              release: vi.fn(),
            },
          })
        )
      );
      accountedApp.route('/', generationRoutes);

      const response = await accountedApp.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          model: 'gpt-5.4',
          messages: [{ role: 'user', content: 'Account this request' }],
        }),
      });

      expect(response.status).toBe(200);
      expect(settle).toHaveBeenCalledOnce();
      expect(settle).toHaveBeenCalledWith(
        expect.objectContaining({
          admission: { id: 'admission:gen_accounted_chat' },
          terminal: {
            kind: 'receipt',
            receipt: expect.objectContaining({
              generationId: 'gen_accounted_chat',
              requestedModel: 'gpt-5.4',
              resolvedModel: 'gpt-5.4-resolved',
              resolvedProvider: 'openai',
              usage: { inputTokens: 17, outputTokens: 9 },
              finishStatus: 'stop',
            }),
          },
        })
      );
    });

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
        expect(payload.model).toBe('claude-sonnet-4-6');
        expect(payload.messages).toEqual([{ role: 'user', content: 'Hello' }]);

        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'Anthropic says hi' }],
            model: 'claude-sonnet-4-6',
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
        expect(payload.model).toBe('gpt-5.4');
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
      expect(data.data.model).toBe('gpt-5.4');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('supports OpenAI non-streaming chat with env-backed credentials', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'gpt-4o-mini',
            choices: [{ message: { content: 'Hello from OpenAI' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
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

    it('returns 429 when the configured provider reports a rate limit', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'google',
        apiKey: 'google-local-key',
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() =>
          Promise.resolve(
            new Response('{"error":{"code":429,"message":"Quota exceeded"}}', {
              status: 429,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        )
      );

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          model: 'gemini-2.5-pro',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toEqual({
        code: 'RATE_LIMITED',
        message: 'Rate limited. Please try again later.',
      });
    });

    it('returns 401 when the configured provider rejects its API key', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'invalid-local-key',
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('{"error":{"message":"Invalid API key"}}', {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toEqual({
        code: 'AUTH_ERROR',
        message: 'Provider authentication failed.',
      });
    });

    it('strips the provider prefix and normalizes legacy OpenAI model ids', async () => {
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
        expect(payload.model).toBe('gpt-5.4');
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
      expect(data.data.model).toBe('gpt-5.4');
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

    it('normalizes retired Anthropic model ids before calling upstream chat', async () => {
      await storage.upsertProviderCredential(mockDB, {
        providerId: 'anthropic',
        apiKey: 'sk-local-anthropic',
      });

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://api.anthropic.com/v1/messages');

        const payload = JSON.parse(String(init?.body)) as {
          model: string;
          messages: Array<{ role: string; content: string }>;
        };
        expect(payload.model).toBe('claude-sonnet-4-6');
        expect(payload.messages).toEqual([{ role: 'user', content: 'Hello canonical Claude' }]);

        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'Claude canonical model works' }],
            model: 'claude-sonnet-4-6',
            usage: { input_tokens: 10, output_tokens: 5 },
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
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hello canonical Claude' }],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.content).toBe('Claude canonical model works');
      expect(data.data.model).toBe('claude-sonnet-4-6');
      expect(fetchMock).toHaveBeenCalledTimes(1);
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

    it('rejects web_search on non-streaming chat instead of ignoring it', async () => {
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
      expect(String(data.error.message)).toContain('web_search');
      expect(String(data.error.message)).toContain('streaming chat');
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
});
