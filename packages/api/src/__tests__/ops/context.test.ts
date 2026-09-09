import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDB = { query: vi.fn() };
const mockRegistry = { getProvider: vi.fn() };
const { mockFindProjectById } = vi.hoisted(() => ({
  mockFindProjectById: vi.fn(),
}));

vi.mock('../../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

vi.mock('../../lib/provider-registry', () => ({
  getProviderRegistry: vi.fn(() => Promise.resolve(mockRegistry)),
}));

vi.mock('@t3x-dev/storage', () => ({
  findProjectById: mockFindProjectById,
}));

import { buildPipelineContext } from '../../ops/context';

function fakeHonoContext(overrides: { userId?: string; ingressChannel?: string } = {}) {
  const store = new Map<string, unknown>();
  if (overrides.userId) store.set('userId', overrides.userId);
  if (overrides.ingressChannel) store.set('inferenceIngressChannel', overrides.ingressChannel);

  return {
    get: (key: string) => store.get(key),
    req: {
      raw: { signal: new AbortController().signal },
    },
  } as unknown as Parameters<typeof buildPipelineContext>[0];
}

describe('buildPipelineContext', () => {
  beforeEach(() => {
    mockFindProjectById.mockReset();
    mockFindProjectById.mockImplementation((_: unknown, projectId: string) =>
      Promise.resolve({
        projectId,
        namespaceId: 'namespace_123',
        visibility: 'private' as const,
      })
    );
  });

  it('returns db, providerRegistry, projectId, userId, and abortSignal', async () => {
    const c = fakeHonoContext({ userId: 'user_abc', ingressChannel: 'agent' });
    const ctx = await buildPipelineContext(c, 'proj_123');

    expect(ctx.db).toBe(mockDB);
    expect(ctx.providerRegistry).toBe(mockRegistry);
    expect(ctx.projectId).toBe('proj_123');
    expect(ctx.userId).toBe('user_abc');
    expect(ctx.abortSignal).toBeInstanceOf(AbortSignal);
    expect(ctx.inference).toMatchObject({
      scope: {
        actor: { kind: 'user', id: 'user_abc' },
        ingressChannel: 'agent',
        namespaceId: 'namespace_123',
        projectId: 'proj_123',
        projectVisibility: 'private',
      },
    });
    expect(mockFindProjectById).toHaveBeenCalledWith(mockDB, 'proj_123');
  });

  it('sets userId to undefined when not present in Hono context', async () => {
    const c = fakeHonoContext();
    const ctx = await buildPipelineContext(c, 'proj_456');

    expect(ctx.userId).toBeUndefined();
    expect(ctx.inference.scope.ingressChannel).toBe('api');
  });

  it('rejects a missing project before exposing a billable scope', async () => {
    mockFindProjectById.mockResolvedValueOnce(null);

    await expect(buildPipelineContext(fakeHonoContext(), 'proj_missing')).rejects.toThrow(
      'Cannot build pipeline context for missing project: proj_missing'
    );
  });
});
