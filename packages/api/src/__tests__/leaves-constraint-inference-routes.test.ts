/** biome-ignore-all lint/suspicious/noExplicitAny: route fixtures use narrow storage/provider doubles */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInferenceRuntime, createInferenceRuntimeMiddleware } from '../lib/inference';
import { leavesMLRoutes } from '../routes/leaves-ml.openapi';

const mocks = vi.hoisted(() => ({
  findLeafById: vi.fn(),
  generate: vi.fn(),
  getDB: vi.fn(),
  getProviderRegistry: vi.fn(),
  getRepositorySemanticCommit: vi.fn(),
}));

vi.mock('@t3x-dev/storage', () => ({
  createLeafHistory: vi.fn(),
  findEditsByLeafId: vi.fn(),
  findLeafById: mocks.findLeafById,
  findLeavesByCommit: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  getDB: mocks.getDB,
}));

vi.mock('../lib/project-access', () => ({
  assertProjectAccess: vi.fn(async () => ({
    projectId: 'project_1',
    namespaceId: 'namespace_1',
  })),
}));

vi.mock('../lib/provider-registry', () => ({
  getLLMProvider: vi.fn(),
  getProviderRegistry: mocks.getProviderRegistry,
}));

vi.mock('../lib/repository-state-transition', () => ({
  getRepositorySemanticCommit: mocks.getRepositorySemanticCommit,
}));

function app(runtime: ReturnType<typeof createInferenceRuntime>) {
  const result = new Hono();
  result.use('*', createInferenceRuntimeMiddleware(runtime));
  result.use('*', async (c, next) => {
    c.set('userId', 'user_1');
    await next();
  });
  result.route('/', leavesMLRoutes);
  return result;
}

describe('leaf constraint inference routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDB.mockResolvedValue({});
    mocks.findLeafById.mockResolvedValue({
      id: 'leaf_1',
      project_id: 'project_1',
      commit_hash: `sha256:${'a'.repeat(64)}`,
      type: 'tweet',
    });
    mocks.getRepositorySemanticCommit.mockResolvedValue({
      semanticContent: {
        trees: [{ key: 'topic', slots: { value: 'fact' }, children: [] }],
        relations: [],
      },
    });
    const provider = {
      id: 'openai',
      generate: mocks.generate,
      resolveConflict: vi.fn(),
    };
    mocks.getProviderRegistry.mockResolvedValue({
      getEntry: () => ({ defaultModel: 'gpt-test' }),
      tryWithFallback: async (_role: string, invoke: (value: typeof provider) => unknown) =>
        invoke(provider),
    });
    mocks.generate.mockResolvedValue({
      text: '[]',
      usage: { inputTokens: 17, outputTokens: 3 },
    });
  });

  it('settles suggestions with the authenticated namespace/project scope', async () => {
    const settle = vi.fn(async () => {});
    const runtime = createInferenceRuntime({
      admissionPolicy: {
        authorize: async () => ({ outcome: 'admitted', admission: { id: 'reservation:1' } }),
        settle,
        release: vi.fn(async () => {}),
      },
      createGenerationId: () => 'generation:constraint:1',
    });

    const response = await app(runtime).request('/v1/leaves/leaf_1/suggest-constraints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'run:constraint' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: expect.objectContaining({
          feature: 'leaf.suggest-constraints',
          scope: expect.objectContaining({
            actor: { kind: 'user', id: 'user_1' },
            namespaceId: 'namespace_1',
            projectId: 'project_1',
          }),
        }),
        terminal: {
          kind: 'receipt',
          receipt: expect.objectContaining({
            resolvedProvider: 'openai',
            usage: { inputTokens: 17, outputTokens: 3 },
          }),
        },
      })
    );
  });

  it('returns 429 before provider I/O when policy denies admission', async () => {
    const runtime = createInferenceRuntime({
      admissionPolicy: {
        authorize: async () => ({
          outcome: 'denied',
          code: 'quota_exhausted',
          reason: 'Quota exhausted',
        }),
        settle: vi.fn(async () => {}),
        release: vi.fn(async () => {}),
      },
    });

    const response = await app(runtime).request('/v1/leaves/leaf_1/suggest-constraints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(429);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
