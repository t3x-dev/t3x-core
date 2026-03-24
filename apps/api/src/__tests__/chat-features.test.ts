/**
 * Chat Features Tests — validates new chat experience features:
 * - Multimodal message validation (image content blocks)
 * - Web search parameter handling
 * - Extended thinking parameter handling
 */

import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock undici for proxy support
vi.mock('undici', () => ({
  ProxyAgent: vi.fn(),
  fetch: vi.fn(),
}));

// Save and clear env vars
const savedEnv: Record<string, string | undefined> = {};
const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

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

const app = new Hono();
app.route('/', chatRoutes);

describe('Chat Multimodal Validation', () => {
  describe('string content (backward compatibility)', () => {
    it('accepts valid string content', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });
      // 400 because no API key, but NOT a validation error
      const data = await res.json();
      expect(data.error.code).toBe('PROVIDER_ERROR');
    });

    it('rejects empty string content', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '' }],
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
      expect(data.error.message).toContain('non-empty');
    });
  });

  describe('array content (multimodal)', () => {
    it('accepts valid image + text content', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' },
              },
              { type: 'text', text: 'What is in this image?' },
            ],
          }],
        }),
      });
      // Should pass validation — 400 is from missing API key, not validation
      const data = await res.json();
      expect(data.error.code).toBe('PROVIDER_ERROR');
    });

    it('rejects empty content array', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: [] }],
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain('content array must be non-empty');
    });

    it('rejects content array without text block', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: 'abc' },
              },
            ],
          }],
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain('at least one text block required');
    });

    it('rejects invalid image media type', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/bmp', data: 'abc' },
              },
              { type: 'text', text: 'Hello' },
            ],
          }],
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain('invalid image type');
    });

    it('rejects image without base64 source type', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url', media_type: 'image/jpeg', data: 'https://...' },
              },
              { type: 'text', text: 'Hello' },
            ],
          }],
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain('image must use base64 source');
    });

    it('rejects unknown content block type', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: [
              { type: 'video', data: 'something' },
              { type: 'text', text: 'Hello' },
            ],
          }],
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain('unknown block type');
    });

    it('rejects non-string/non-array content', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 42 }],
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain('content must be string or array');
    });

    it('accepts all valid image types', async () => {
      for (const mediaType of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
        const res = await app.request('/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: 'abc' } },
                { type: 'text', text: 'Describe' },
              ],
            }],
          }),
        });
        const data = await res.json();
        // Should pass validation — error should be PROVIDER_ERROR not INVALID_REQUEST
        expect(data.error.code).toBe('PROVIDER_ERROR');
      }
    });
  });

  describe('invalid roles', () => {
    it('rejects invalid role', async () => {
      const res = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'tool', content: 'Hello' }],
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain('invalid role');
    });
  });
});

describe('Chat Stream with web_search and thinking params', () => {
  it('accepts web_search parameter without error', async () => {
    const res = await app.request('/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Latest news' }],
        web_search: true,
      }),
    });
    // Should pass validation — 400 from missing API key
    const data = await res.json();
    expect(data.error.code).toBe('PROVIDER_ERROR');
  });

  it('accepts thinking parameter without error', async () => {
    const res = await app.request('/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Think about this' }],
        thinking: true,
      }),
    });
    const data = await res.json();
    expect(data.error.code).toBe('PROVIDER_ERROR');
  });

  it('accepts both web_search and thinking together', async () => {
    const res = await app.request('/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Search and think' }],
        web_search: true,
        thinking: true,
      }),
    });
    const data = await res.json();
    expect(data.error.code).toBe('PROVIDER_ERROR');
  });

  it('accepts multimodal content in stream endpoint', async () => {
    const res = await app.request('/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
            { type: 'text', text: 'What is this?' },
          ],
        }],
      }),
    });
    const data = await res.json();
    expect(data.error.code).toBe('PROVIDER_ERROR');
  });
});
