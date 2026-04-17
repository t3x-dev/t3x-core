import type { AnyDB } from '@t3x-dev/storage';
import * as storage from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;
let cleanup: (() => Promise<void>) | null = null;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { resetProviderRegistry } from '../lib/provider-registry';
import { llmRoutes } from '../routes/llm.openapi';

const originalEnv = { ...process.env };
const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_STUDIO_KEY'];

describe('GET /v1/llm/models', () => {
  let app: Hono;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    app = new Hono();
    app.route('/', llmRoutes);
  });

  beforeEach(async () => {
    resetProviderRegistry();

    for (const key of envKeys) {
      delete process.env[key];
    }

    await storage.deleteProviderCredential(mockDB, 'anthropic');
    await storage.deleteProviderCredential(mockDB, 'openai');
    await storage.deleteProviderCredential(mockDB, 'google');
  });

  afterAll(async () => {
    process.env = originalEnv;

    if (cleanup) {
      await cleanup();
    }
  });

  it('marks only configured providers as available using stored local credentials', async () => {
    await storage.upsertProviderCredential(mockDB, {
      providerId: 'openai',
      apiKey: 'sk-local-openai',
    });

    const res = await app.request('/v1/llm/models');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const providers = body.data.providers;
    expect(providers).toHaveLength(3);

    const anthropic = providers.find((p: { name: string }) => p.name === 'anthropic');
    expect(anthropic.available).toBe(false);

    const openai = providers.find((p: { name: string }) => p.name === 'openai');
    expect(openai.available).toBe(true);
    expect(openai.models.length).toBeGreaterThan(0);

    const google = providers.find((p: { name: string }) => p.name === 'google');
    expect(google.available).toBe(false);
  });

  it('falls back to env-backed provider availability when no local credential exists', async () => {
    process.env.GOOGLE_AI_STUDIO_KEY = 'google-env-key';

    const res = await app.request('/v1/llm/models');

    expect(res.status).toBe(200);
    const body = await res.json();

    const providers = body.data.providers;
    const anthropic = providers.find((p: { name: string }) => p.name === 'anthropic');
    const openai = providers.find((p: { name: string }) => p.name === 'openai');
    const google = providers.find((p: { name: string }) => p.name === 'google');

    expect(anthropic.available).toBe(false);
    expect(openai.available).toBe(false);
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
