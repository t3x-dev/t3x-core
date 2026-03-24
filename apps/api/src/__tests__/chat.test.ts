/**
 * Chat Routes Tests
 */

import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { chatRoutes } from '../routes/chat';

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
  });
});
