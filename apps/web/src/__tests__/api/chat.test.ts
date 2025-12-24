/**
 * Chat API Route Tests
 *
 * Tests POST /api/v1/chat - Non-streaming chat
 * Tests GET /api/v1/chat/providers - List available providers
 * Tests POST /api/v1/chat/stream - Streaming chat with SSE
 *
 * Includes:
 * - Validation tests (always run)
 * - Mock integration tests (always run)
 * - Real API integration tests (only when ANTHROPIC_API_KEY is set)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { fetch as undiciFetch } from 'undici';

// Store original env
const originalEnv = process.env;

// Mock undici module
vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici');
  return {
    ...actual,
    fetch: vi.fn(),
  };
});

// Helper to get mocked undici fetch
const getMockedFetch = () => vi.mocked(undiciFetch);

describe('Chat API Routes', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset env for each test
    process.env = { ...originalEnv };
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /api/v1/chat', () => {
    it('returns 400 for invalid JSON', async () => {
      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_JSON');
    });

    it('returns 400 when messages array is missing', async () => {
      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
      expect(data.error.message).toContain('messages');
    });

    it('returns 400 when messages array is empty', async () => {
      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [] }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 when API key is not configured', async () => {
      // Remove API key
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_ERROR');
      expect(data.error.message).toContain('API key not configured');
    });

    it('returns 400 for unsupported provider', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          provider: 'unsupported-provider',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      // Either returns API key error (for unknown provider) or provider error
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/v1/chat/providers', () => {
    it('returns available providers with claude as default', async () => {
      const { GET } = await import('@/app/api/v1/chat/providers/route');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.providers).toContain('claude');
      expect(data.data.default).toBe('claude');
    });

    it('includes openai when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';

      // Need to re-import to get fresh module with new env
      vi.resetModules();
      const { GET } = await import('@/app/api/v1/chat/providers/route');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.providers).toContain('openai');
    });

    it('excludes openai when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;

      vi.resetModules();
      const { GET } = await import('@/app/api/v1/chat/providers/route');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.providers).not.toContain('openai');
    });
  });

  describe('POST /api/v1/chat/stream', () => {
    it('returns 400 for invalid JSON', async () => {
      const { POST } = await import('@/app/api/v1/chat/stream/route');

      const request = new NextRequest('http://localhost/api/v1/chat/stream', {
        method: 'POST',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_JSON');
    });

    it('returns 400 when messages array is missing', async () => {
      const { POST } = await import('@/app/api/v1/chat/stream/route');

      const request = new NextRequest('http://localhost/api/v1/chat/stream', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 when API key is not configured', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;

      vi.resetModules();
      const { POST } = await import('@/app/api/v1/chat/stream/route');

      const request = new NextRequest('http://localhost/api/v1/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_ERROR');
    });
  });

  // ===========================================================================
  // Mock Integration Tests - Test full flow with mocked external API
  // ===========================================================================
  describe('Mock Integration - POST /api/v1/chat', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('successfully calls Claude API and returns response', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      // Mock successful Claude API response
      const mockClaudeResponse = {
        content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
        model: 'claude-sonnet-4-5-20250929',
        usage: { input_tokens: 10, output_tokens: 15 },
        stop_reason: 'end_turn',
      };

      getMockedFetch().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockClaudeResponse)),
      } as unknown as Response);

      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.content).toBe('Hello! How can I help you today?');
      expect(data.data.model).toBe('claude-sonnet-4-5-20250929');
      expect(data.data.usage).toEqual({ input_tokens: 10, output_tokens: 15 });

      // Verify fetch was called with correct parameters
      expect(getMockedFetch()).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });

    it('handles Claude API error response', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      // Mock Claude API error
      getMockedFetch().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      } as unknown as Response);

      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('CHAT_ERROR');
      expect(data.error.message).toContain('429');
    });

    it('handles network errors', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      // Mock network error
      getMockedFetch().mockRejectedValue(new Error('Network error'));

      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('CHAT_ERROR');
      expect(data.error.message).toContain('Network error');
    });

    it('passes system message correctly to Claude', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      const mockClaudeResponse = {
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-5-20250929',
      };

      getMockedFetch().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockClaudeResponse)),
      } as unknown as Response);

      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);

      // Verify system message was extracted and passed correctly
      const fetchCall = getMockedFetch().mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.system).toBe('You are a helpful assistant.');
      expect(body.messages).toHaveLength(1); // Only user message
      expect(body.messages[0].role).toBe('user');
    });

    it('uses custom temperature and max_tokens', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      const mockClaudeResponse = {
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-5-20250929',
      };

      getMockedFetch().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockClaudeResponse)),
      } as unknown as Response);

      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.5,
          max_tokens: 1000,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);

      const fetchCall = getMockedFetch().mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(1000);
    });
  });

  // ===========================================================================
  // Real API Integration Tests - Only run when ANTHROPIC_API_KEY is set
  // ===========================================================================
  describe('Real API Integration (requires ANTHROPIC_API_KEY)', () => {
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    beforeEach(() => {
      // Restore real undici fetch for real API tests
      vi.doUnmock('undici');
    });

    afterEach(() => {
      // Re-enable mock for other tests
      vi.doMock('undici', async () => {
        const actual = await vi.importActual<typeof import('undici')>('undici');
        return {
          ...actual,
          fetch: vi.fn(),
        };
      });
    });

    it.skipIf(!hasApiKey)('calls real Claude API and gets response', async () => {
      vi.resetModules();
      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Say "test passed" and nothing else.' }],
          max_tokens: 50,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      // Debug output if failed
      if (response.status !== 200) {
        console.log('Real API test failed:', data);
      }

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.content).toBeDefined();
      expect(data.data.content.length).toBeGreaterThan(0);
      expect(data.data.model).toContain('claude');
    }, 30000); // 30s timeout for real API call

    it.skipIf(!hasApiKey)('handles multi-turn conversation', async () => {
      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Remember the number 42.' },
            { role: 'assistant', content: 'I will remember the number 42.' },
            { role: 'user', content: 'What number did I ask you to remember?' },
          ],
          max_tokens: 50,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.content.toLowerCase()).toContain('42');
    }, 30000);

    it.skipIf(!hasApiKey)('respects system message', async () => {
      const { POST } = await import('@/app/api/v1/chat/route');

      const request = new NextRequest('http://localhost/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You must always respond with exactly "PONG" and nothing else.' },
            { role: 'user', content: 'PING' },
          ],
          max_tokens: 10,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.content.toUpperCase()).toContain('PONG');
    }, 30000);
  });
});
