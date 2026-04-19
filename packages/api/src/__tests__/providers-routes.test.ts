/**
 * Provider Routes Tests
 *
 * Covers safe CRUD for local provider credentials and test metadata updates.
 */

import { getModelsByProvider } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import * as storage from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;
let cleanup: (() => Promise<void>) | null = null;

const mockRegistry = {
  getEntry: vi.fn((id: string) => ({ id })),
  listProviders: vi.fn(() => []),
  getProviderIdsForRole: vi.fn(() => []),
  isConfigured: vi.fn(() => false),
  exportConfig: vi.fn(() => ({ roles: [] })),
  assignRole: vi.fn(),
  testConnection: vi.fn(),
  clearInstances: vi.fn(),
};

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/provider-registry', () => ({
  getProviderRegistry: vi.fn(() => Promise.resolve(mockRegistry)),
  refreshProviderRegistryConfig: vi.fn(() => Promise.resolve()),
  saveRegistryConfig: vi.fn(() => Promise.resolve()),
}));

import { refreshProviderRegistryConfig } from '../lib/provider-registry';
import { providersRoutes } from '../routes/providers.openapi';

describe('Provider Routes', () => {
  const app = new Hono();
  app.route('/', providersRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  beforeEach(async () => {
    mockRegistry.getEntry.mockImplementation((id: string) => ({ id }));
    mockRegistry.listProviders.mockReset();
    mockRegistry.getProviderIdsForRole.mockReset();
    mockRegistry.isConfigured.mockReset();
    mockRegistry.exportConfig.mockReset();
    mockRegistry.assignRole.mockReset();
    mockRegistry.testConnection.mockReset();
    mockRegistry.clearInstances.mockReset();
    vi.mocked(refreshProviderRegistryConfig).mockClear();
    await storage.deleteProviderCredential(mockDB, 'anthropic');
    await storage.deleteProviderCredential(mockDB, 'openai');
    await storage.deleteProviderCredential(mockDB, 'google');
  });

  afterAll(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  it('writes local provider credentials without returning the raw key', async () => {
    const res = await app.request('/v1/providers/local/openai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'sk-local-openai',
        default_model: 'gpt-5.4-mini',
      }),
    });

    expect(res.status).toBe(200);

    const json: ApiResponse = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.provider).toBe('openai');
    expect(json.data.configured).toBe(true);
    expect(json.data.default_model).toBe('gpt-5.4-mini');
    expect(JSON.stringify(json)).not.toContain('sk-local-openai');
  });

  it('normalizes google aliases to the local provider family model', async () => {
    const res = await app.request('/v1/providers/local/google-ai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'sk-local-google',
        default_model: 'gemini-3-flash-preview',
      }),
    });

    expect(res.status).toBe(200);

    const json: ApiResponse = await res.json();
    expect(json.data.provider).toBe('google');
    expect(json.data.configured).toBe(true);
    expect(json.data.default_model).toBe('gemini-3-flash-preview');
  });

  it('normalizes blank default_model input to null', async () => {
    const res = await app.request('/v1/providers/local/openai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'sk-local-openai',
        default_model: '   ',
      }),
    });

    expect(res.status).toBe(200);

    const json: ApiResponse = await res.json();
    expect(json.data.provider).toBe('openai');
    expect(json.data.default_model).toBeNull();
  });

  it('rejects whitespace-only api_key input', async () => {
    const res = await app.request('/v1/providers/local/openai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: '   ',
        default_model: 'gpt-5.4-mini',
      }),
    });

    expect(res.status).toBe(400);

    const json: ApiResponse = await res.json();
    expect(json.success).toBe(false);
  });

  it('persists successful provider test metadata', async () => {
    mockRegistry.testConnection.mockResolvedValue({
      ok: true,
      latencyMs: 12,
    });

    await app.request('/v1/providers/local/anthropic', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'sk-local-anthropic',
        default_model: 'claude-sonnet-4-6',
      }),
    });

    const testRes = await app.request('/v1/providers/anthropic/test', {
      method: 'POST',
    });

    expect(testRes.status).toBe(200);
    expect(mockRegistry.testConnection).toHaveBeenCalledWith('anthropic');

    const statusRes = await app.request('/v1/providers/local/anthropic');
    const statusJson: ApiResponse = await statusRes.json();
    expect(statusJson.data.last_test_status).toBe('ok');
    expect(statusJson.data.last_tested_at).toBeTruthy();
    expect(statusJson.data.last_test_error).toBeNull();
  });

  it('persists failed provider test metadata', async () => {
    mockRegistry.testConnection.mockResolvedValue({
      ok: false,
      error: 'boom',
      latencyMs: 8,
    });

    await app.request('/v1/providers/local/openai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'sk-local-openai',
      }),
    });

    const testRes = await app.request('/v1/providers/openai/test', {
      method: 'POST',
    });

    expect(testRes.status).toBe(200);

    const statusRes = await app.request('/v1/providers/local/openai');
    const statusJson: ApiResponse = await statusRes.json();
    expect(statusJson.data.last_test_status).toBe('error');
    expect(statusJson.data.last_test_error).toBe('[redacted]');
    expect(statusJson.data.last_tested_at).toBeTruthy();
  });

  it('keeps provider test success when metadata persistence fails', async () => {
    mockRegistry.testConnection.mockResolvedValue({
      ok: true,
      latencyMs: 9,
    });

    await app.request('/v1/providers/local/openai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'sk-local-openai',
      }),
    });

    const updateSpy = vi
      .spyOn(storage, 'updateProviderCredentialTestResult')
      .mockRejectedValueOnce(new Error('metadata write failed'));

    const testRes = await app.request('/v1/providers/openai/test', {
      method: 'POST',
    });

    expect(testRes.status).toBe(200);

    updateSpy.mockRestore();
  });

  it('deletes local provider credentials and returns configured=false', async () => {
    await app.request('/v1/providers/local/anthropic', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: 'sk-ant-local' }),
    });

    const res = await app.request('/v1/providers/local/anthropic', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);

    const json: ApiResponse = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.provider).toBe('anthropic');
    expect(json.data.configured).toBe(false);
    expect(JSON.stringify(json)).not.toContain('sk-ant-local');
  });

  it('refreshes runtime overrides before listing providers and uses the shared generation model catalog', async () => {
    mockRegistry.listProviders.mockImplementation(() => [
      {
        id: 'google-ai',
        name: 'Google AI (Gemini)',
        role: 'generation',
        configured: true,
        roles: ['generation'],
        requiredEnvKeys: ['GOOGLE_AI_STUDIO_KEY'],
        defaultModel: 'gemini-3-flash-preview',
        availableModels: ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview'],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        role: 'generation',
        configured: true,
        roles: ['generation'],
        requiredEnvKeys: ['OPENAI_API_KEY'],
        defaultModel: 'gpt-5.4-mini',
        availableModels: ['gpt-5.4-nano', 'gpt-5.4-mini'],
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        role: 'generation',
        configured: false,
        roles: ['generation'],
        requiredEnvKeys: ['DEEPSEEK_API_KEY'],
        defaultModel: 'deepseek-chat',
        availableModels: ['deepseek-chat'],
      },
    ]);

    const res = await app.request('/v1/providers');

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    expect(json.success).toBe(true);
    expect(vi.mocked(refreshProviderRegistryConfig)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(refreshProviderRegistryConfig).mock.invocationCallOrder[0]).toBeLessThan(
      mockRegistry.listProviders.mock.invocationCallOrder[0]
    );

    expect(json.data).toEqual([
      expect.objectContaining({
        id: 'google-ai',
        available_models: getModelsByProvider('google').map((model) => model.id),
      }),
      expect.objectContaining({
        id: 'openai',
        available_models: getModelsByProvider('openai').map((model) => model.id),
      }),
      expect.objectContaining({
        id: 'deepseek',
        available_models: ['deepseek-chat'],
      }),
    ]);
  });
});
