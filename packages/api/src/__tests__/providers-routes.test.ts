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
const originalOperatorUserIds = process.env.T3X_OPERATOR_USER_IDS;
const originalOperatorKeyIds = process.env.T3X_OPERATOR_KEY_IDS;
const originalAuthDisabled = process.env.AUTH_DISABLED;

const mockRegistry = {
  getEntry: vi.fn((id: string) => ({ id })),
  listProviders: vi.fn(() => []),
  getProviderIdsForRole: vi.fn(() => []),
  isConfigured: vi.fn(() => false),
  exportConfig: vi.fn(() => ({ roles: [] })),
  importConfig: vi.fn(),
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

import {
  type DeploymentCapabilities,
  SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
import { createDeploymentCapabilitiesMiddleware } from '../lib/deployment-capabilities';
import { refreshProviderRegistryConfig } from '../lib/provider-registry';
import { providersRoutes } from '../routes/providers.openapi';

describe('Provider Routes', () => {
  const app = new Hono();
  app.use('*', createDeploymentCapabilitiesMiddleware());
  app.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only authenticated context fixture
    (c as any).set('apiKey', {
      id: 'ak_human',
      user_id: 'user_owner',
      project_id: null,
      principal_kind: 'human',
    });
    return next();
  });
  app.route('/', providersRoutes);

  function principalApp(
    principalKind: 'human' | 'agent' | 'service',
    capabilities: DeploymentCapabilities = SELF_HOSTED_DEPLOYMENT_CAPABILITIES
  ) {
    const principal = new Hono();
    principal.use('*', createDeploymentCapabilitiesMiddleware(capabilities));
    principal.use('*', async (c, next) => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only authenticated context fixture
      (c as any).set('apiKey', {
        id: `ak_${principalKind}`,
        user_id: principalKind === 'human' ? 'user_owner' : null,
        project_id: principalKind === 'human' ? null : 'proj_bound',
        principal_kind: principalKind,
      });
      return next();
    });
    principal.route('/', providersRoutes);
    return principal;
  }

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  beforeEach(async () => {
    process.env.AUTH_DISABLED = 'false';
    process.env.T3X_OPERATOR_USER_IDS = 'user_owner';
    delete process.env.T3X_OPERATOR_KEY_IDS;
    mockRegistry.getEntry.mockImplementation((id: string) => ({ id }));
    mockRegistry.listProviders.mockReset();
    mockRegistry.getProviderIdsForRole.mockReset();
    mockRegistry.isConfigured.mockReset();
    mockRegistry.exportConfig.mockReset();
    mockRegistry.importConfig.mockReset();
    mockRegistry.assignRole.mockReset();
    mockRegistry.testConnection.mockReset();
    mockRegistry.clearInstances.mockReset();
    vi.mocked(refreshProviderRegistryConfig).mockClear();
    await storage.deleteProviderCredential(mockDB, 'anthropic');
    await storage.deleteProviderCredential(mockDB, 'openai');
    await storage.deleteProviderCredential(mockDB, 'google');
  });

  afterAll(async () => {
    if (originalOperatorUserIds === undefined) delete process.env.T3X_OPERATOR_USER_IDS;
    else process.env.T3X_OPERATOR_USER_IDS = originalOperatorUserIds;
    if (originalOperatorKeyIds === undefined) delete process.env.T3X_OPERATOR_KEY_IDS;
    else process.env.T3X_OPERATOR_KEY_IDS = originalOperatorKeyIds;
    if (originalAuthDisabled === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuthDisabled;
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
        default_model: 'gpt-4o-mini',
      }),
    });

    expect(res.status).toBe(200);

    const json: ApiResponse = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.provider).toBe('openai');
    expect(json.data.configured).toBe(true);
    expect(json.data.default_model).toBe('gpt-4o-mini');
    expect(JSON.stringify(json)).not.toContain('sk-local-openai');
  });

  it.each([
    'agent',
    'service',
  ] as const)('rejects %s principals before reading or mutating global provider settings', async (principalKind) => {
    const principal = principalApp(principalKind);

    expect((await principal.request('/v1/providers')).status).toBe(403);
    expect(
      (
        await principal.request('/v1/providers/local/openai', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: 'must-not-be-stored' }),
        })
      ).status
    ).toBe(403);

    const bundle = await storage.getProviderCredentialBundle(mockDB);
    expect(bundle.secrets.OPENAI_API_KEY).toBeUndefined();
  });

  it('rejects ordinary human principals without operator assignment', async () => {
    delete process.env.T3X_OPERATOR_USER_IDS;
    expect((await principalApp('human').request('/v1/providers')).status).toBe(403);
  });

  it('keeps provider administration available to configured human operators', async () => {
    mockRegistry.listProviders.mockReturnValue([]);
    expect((await principalApp('human').request('/v1/providers')).status).toBe(200);
  });

  it('rejects provider administration server-side in managed deployments', async () => {
    const managed = principalApp('human', {
      ...SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
      deployment_mode: 'managed',
      provider_credentials: { administration: 'disabled' },
      inference: { mode: 'managed' },
      identity: {
        ...SELF_HOSTED_DEPLOYMENT_CAPABILITIES.identity,
        mode: 'managed',
        auth_operations: ['sign_in', 'sign_out'],
      },
      usage: { mode: 'credits' },
      ui_extensions: { account: true, billing: true },
    });

    expect((await managed.request('/v1/providers')).status).toBe(403);
    expect(
      (
        await managed.request('/v1/providers/local/openai', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: 'must-not-be-stored' }),
        })
      ).status
    ).toBe(403);
    expect(mockRegistry.listProviders).not.toHaveBeenCalled();
    const bundle = await storage.getProviderCredentialBundle(mockDB);
    expect(bundle.secrets.OPENAI_API_KEY).toBeUndefined();
  });

  it('supports explicit human API-key operator bootstrap', async () => {
    delete process.env.T3X_OPERATOR_USER_IDS;
    process.env.T3X_OPERATOR_KEY_IDS = 'ak_human';
    mockRegistry.listProviders.mockReturnValue([]);
    expect((await principalApp('human').request('/v1/providers')).status).toBe(200);
  });

  it('normalizes google aliases to the local provider family model', async () => {
    const res = await app.request('/v1/providers/local/google-ai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'sk-local-google',
        default_model: 'gemini-2.0-flash',
      }),
    });

    expect(res.status).toBe(200);

    const json: ApiResponse = await res.json();
    expect(json.data.provider).toBe('google');
    expect(json.data.configured).toBe(true);
    expect(json.data.default_model).toBe('gemini-2.0-flash');
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
        default_model: 'gpt-4o-mini',
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
        default_model: 'claude-sonnet-4-20250514',
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
        defaultModel: 'gemini-2.0-flash',
        availableModels: ['gemini-2.0-flash', 'gemini-1.5-pro'],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        role: 'generation',
        configured: true,
        roles: ['generation'],
        requiredEnvKeys: ['OPENAI_API_KEY'],
        defaultModel: 'gpt-4o',
        availableModels: ['gpt-4-turbo'],
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
    ]);
  });

  it('hides non-supported generation providers from the provider list', async () => {
    mockRegistry.listProviders.mockImplementation(() => [
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        role: 'generation',
        configured: true,
        roles: ['generation'],
        requiredEnvKeys: ['ANTHROPIC_API_KEY'],
        defaultModel: 'claude-sonnet-4-6',
        availableModels: ['claude-sonnet-4-6'],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        role: 'generation',
        configured: true,
        roles: ['generation'],
        requiredEnvKeys: ['OPENAI_API_KEY'],
        defaultModel: 'gpt-5.4',
        availableModels: ['gpt-5.4'],
      },
      {
        id: 'google-ai',
        name: 'Google AI (Gemini)',
        role: 'generation',
        configured: true,
        roles: ['generation'],
        requiredEnvKeys: ['GOOGLE_AI_STUDIO_KEY'],
        defaultModel: 'gemini-2.5-pro',
        availableModels: ['gemini-2.5-pro'],
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
      {
        id: 'ollama',
        name: 'Ollama (Local)',
        role: 'generation',
        configured: false,
        roles: ['generation'],
        requiredEnvKeys: [],
        defaultModel: 'llama3.1',
        availableModels: ['llama3.1'],
      },
      {
        id: 'google-ai-embedding',
        name: 'Google AI Embedding',
        role: 'embedding',
        configured: true,
        roles: ['embedding'],
        requiredEnvKeys: ['GOOGLE_AI_STUDIO_KEY'],
        defaultModel: 'gemini-embedding-001',
        availableModels: ['gemini-embedding-001'],
      },
    ]);

    const res = await app.request('/v1/providers');

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.map((provider: { id: string }) => provider.id)).toEqual([
      'anthropic',
      'openai',
      'google-ai',
      'google-ai-embedding',
    ]);
  });

  it('filters unsupported generation providers out of provider role reads', async () => {
    // Legacy ids ('deepseek', 'ollama', 'anthropic-merge') may still appear in
    // persisted config from older installations; the read path must drop them.
    mockRegistry.exportConfig.mockReturnValue({
      roles: [
        {
          role: 'generation',
          providerIds: ['anthropic', 'deepseek', 'openai', 'ollama', 'google-ai'],
        },
        { role: 'embedding', providerIds: ['google-ai-embedding', 'openai-embedding'] },
      ],
    });

    const res = await app.request('/v1/providers/roles');

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual([
      {
        role: 'generation',
        provider_ids: ['anthropic', 'openai', 'google-ai'],
      },
      {
        role: 'embedding',
        provider_ids: ['google-ai-embedding', 'openai-embedding'],
      },
    ]);
  });

  it('drops unsupported generation providers when saving provider roles', async () => {
    mockRegistry.exportConfig.mockReturnValue({
      roles: [
        { role: 'generation', providerIds: ['openai', 'google-ai'] },
        { role: 'embedding', providerIds: ['google-ai-embedding'] },
      ],
    });

    const res = await app.request('/v1/providers/roles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roles: [
          { role: 'generation', provider_ids: ['deepseek', 'openai', 'ollama', 'google-ai'] },
          { role: 'embedding', provider_ids: ['google-ai-embedding'] },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockRegistry.assignRole).toHaveBeenCalledWith('generation', ['openai', 'google-ai']);
    expect(mockRegistry.assignRole).toHaveBeenCalledWith('embedding', ['google-ai-embedding']);

    const json: ApiResponse = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual([
      {
        role: 'generation',
        provider_ids: ['openai', 'google-ai'],
      },
      {
        role: 'embedding',
        provider_ids: ['google-ai-embedding'],
      },
    ]);
  });

  it('filters unsupported generation providers from provider config reads and writes', async () => {
    mockRegistry.exportConfig.mockReturnValue({
      roles: [
        { role: 'generation', providerIds: ['anthropic', 'openai', 'google-ai'] },
        { role: 'embedding', providerIds: ['google-ai-embedding'] },
      ],
    });

    const getRes = await app.request('/v1/providers/config');
    expect(getRes.status).toBe(200);

    const getJson: ApiResponse = await getRes.json();
    expect(getJson.data).toEqual({
      roles: [
        { role: 'generation', provider_ids: ['anthropic', 'openai', 'google-ai'] },
        { role: 'embedding', provider_ids: ['google-ai-embedding'] },
      ],
    });

    const putRes = await app.request('/v1/providers/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roles: [
          { role: 'generation', provider_ids: ['anthropic', 'deepseek', 'openai', 'ollama'] },
          { role: 'embedding', provider_ids: ['google-ai-embedding'] },
        ],
      }),
    });

    expect(putRes.status).toBe(200);
    expect(mockRegistry.importConfig).toHaveBeenCalledWith({
      roles: [
        { role: 'generation', providerIds: ['anthropic', 'openai'] },
        { role: 'embedding', providerIds: ['google-ai-embedding'] },
      ],
    });

    const putJson: ApiResponse = await putRes.json();
    expect(putJson.success).toBe(true);
    expect(putJson.data).toEqual({
      roles: [
        { role: 'generation', provider_ids: ['anthropic', 'openai', 'google-ai'] },
        { role: 'embedding', provider_ids: ['google-ai-embedding'] },
      ],
    });
  });
});
