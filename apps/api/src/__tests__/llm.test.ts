import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

describe('GET /api/v1/llm/models', () => {
  let app: Hono;

  beforeAll(async () => {
    // Set test env vars
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    delete process.env.OPENAI_API_KEY;
    process.env.GOOGLE_AI_STUDIO_KEY = 'test-key';
    process.env.AUTH_DISABLED = 'true';

    // Import after env is set
    const { llmRoutes } = await import('../routes/llm.openapi');
    app = new Hono();
    app.route('/', llmRoutes);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns providers with availability', async () => {
    const res = await app.request('/v1/llm/models');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const providers = body.data.providers;
    expect(providers).toHaveLength(3);

    const anthropic = providers.find((p: { name: string }) => p.name === 'anthropic');
    expect(anthropic.available).toBe(true);
    expect(anthropic.models.length).toBeGreaterThanOrEqual(2);

    const openai = providers.find((p: { name: string }) => p.name === 'openai');
    // available is always true (security: don't leak which keys are configured)
    expect(openai.available).toBe(true);

    const google = providers.find((p: { name: string }) => p.name === 'google');
    expect(google.available).toBe(true);
  });

  it('each model has required fields', async () => {
    const res = await app.request('/v1/llm/models');
    const body = await res.json();
    for (const provider of body.data.providers) {
      for (const model of provider.models) {
        expect(model.id).toBeTruthy();
        expect(model.label).toBeTruthy();
        expect(model.capabilities).toBeDefined();
        expect(model.max_output_tokens).toBeGreaterThan(0);
      }
    }
  });
});
