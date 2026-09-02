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

import { getProviderRegistry, resetProviderRegistry } from '../lib/provider-registry';
import {
  createGenerationModelCatalogSnapshot,
  createGenerationProviderRuntimeMiddleware,
  GENERATION_PROVIDER_RUNTIME_VERSION,
  type GenerationProviderRuntime,
} from '../lib/provider-runtime';
import { llmRoutes } from '../routes/llm.openapi';

const originalEnv = { ...process.env };
const envKeys = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'OPENAI_API_KEY',
  'GOOGLE_AI_STUDIO_KEY',
];

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

  it('returns generation provider order and default from backend role priority', async () => {
    const registry = await getProviderRegistry();
    registry.assignRole('generation', ['openai', 'google-ai', 'anthropic']);

    const res = await app.request('/v1/llm/models');

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.generation_provider_order).toEqual(['openai', 'google', 'anthropic']);
    expect(body.data.default_provider).toBe('openai');
    expect(body.data.providers.map((provider: { name: string }) => provider.name)).toEqual([
      'openai',
      'google',
      'anthropic',
    ]);
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

  it('publishes the versioned provider-neutral catalog projection', async () => {
    await storage.upsertProviderCredential(mockDB, {
      providerId: 'openai',
      apiKey: 'sk-local-openai',
    });

    const res = await app.request('/v1/llm/models');
    const body = await res.json();
    const catalog = body.data.catalog;

    expect(catalog.schema).toBe('t3x.language-model-catalog/v1');
    expect(catalog.revision).toContain('openai-1');
    expect(catalog.defaultModelId).toBe('gpt-5.4');
    expect(catalog.models.find((model: { id: string }) => model.id === 'gpt-5.4')).toEqual({
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      capabilities: ['text'],
      availability: 'available',
      limits: { maxOutputTokens: 131072 },
    });
    expect(JSON.stringify(catalog)).not.toContain('providerModelId');
    expect(JSON.stringify(catalog)).not.toContain('pricing');
    expect(JSON.stringify(catalog)).not.toContain('api_key');
  });

  it('uses an application-injected hosted catalog without exposing its binding authority', async () => {
    const hostedCatalog = createGenerationModelCatalogSnapshot({
      revision: 'hosted-7',
      defaultModelId: 'balanced',
      models: [
        {
          id: 'balanced',
          label: 'Balanced',
          capabilities: ['text', 'tool_use', 'streaming'],
          availability: 'available',
        },
      ],
    });
    const runtime: GenerationProviderRuntime = {
      contractVersion: GENERATION_PROVIDER_RUNTIME_VERSION,
      catalog: {
        async snapshot() {
          return hostedCatalog;
        },
      },
      async resolve() {
        return { ok: false, code: 'unavailable', message: 'not exercised' };
      },
    };
    const hostedApp = new Hono();
    hostedApp.use('*', createGenerationProviderRuntimeMiddleware(runtime));
    hostedApp.route('/', llmRoutes);

    const body = await hostedApp.request('/v1/llm/models').then((response) => response.json());
    expect(body.data.catalog).toEqual(hostedCatalog);
    expect(body.data.catalog.models[0]).not.toHaveProperty('providerModelId');
    expect(body.data.catalog.models[0]).not.toHaveProperty('pricing');
  });

  it('returns the latest public 3-model sets for OpenAI and Google', async () => {
    const res = await app.request('/v1/llm/models');
    expect(res.status).toBe(200);

    const body = await res.json();
    const providers = body.data.providers as Array<{
      name: string;
      models: Array<{ id: string }>;
    }>;

    expect(
      providers.find((provider) => provider.name === 'openai')?.models.map((m) => m.id)
    ).toEqual(['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano']);
    expect(
      providers.find((provider) => provider.name === 'google')?.models.map((m) => m.id)
    ).toEqual(['gemini-2.5-pro', 'gemini-3.6-flash', 'gemini-3.1-flash-lite']);
  });
});
