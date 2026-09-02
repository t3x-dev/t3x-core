/** biome-ignore-all lint/suspicious/noExplicitAny: route fixtures use narrow provider doubles */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInferenceRuntime, createInferenceRuntimeMiddleware } from '../lib/inference';
import { gateRoutes } from '../routes/gate.openapi';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  getDB: vi.fn(),
  getLLMProvider: vi.fn(),
  getProviderRegistry: vi.fn(),
  recordUsageFireAndForget: vi.fn(),
}));

vi.mock('@t3x-dev/storage', () => ({
  findConversationById: vi.fn(),
  findTurnsByConversation: vi.fn(),
  getBusinessRules: vi.fn(async () => []),
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
  getLLMProvider: mocks.getLLMProvider,
  getProviderRegistry: mocks.getProviderRegistry,
}));

vi.mock('../lib/usage-tracking', () => ({
  getUserId: vi.fn(() => 'user_1'),
  recordUsageFireAndForget: mocks.recordUsageFireAndForget,
}));

const provider = {
  id: 'openai',
  generate: mocks.generate,
  resolveConflict: vi.fn(),
};

function app(runtime: ReturnType<typeof createInferenceRuntime>) {
  const result = new Hono();
  result.use('*', createInferenceRuntimeMiddleware(runtime));
  result.use('*', async (c, next) => {
    c.set('userId', 'user_1');
    c.set('requestId', 'request_gate_1');
    await next();
  });
  result.route('/', gateRoutes);
  return result;
}

function requestBody() {
  return {
    project_id: 'project_1',
    content: { trees: [], relations: [] },
    turns: [{ role: 'user', content: 'Review this project' }],
    gates: ['semantic', 'business'],
    business_rules: [
      {
        id: 'business_1',
        type: 'llm',
        prompt: 'Does this satisfy policy?',
        severity: 'error',
      },
    ],
  };
}

describe('gate inference route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDB.mockResolvedValue({});
    mocks.getLLMProvider.mockResolvedValue(provider);
    mocks.getProviderRegistry.mockResolvedValue({
      getEntry: () => ({ defaultModel: 'gpt-test' }),
    });
  });

  it('settles semantic and business calls independently under one trusted scope', async () => {
    mocks.generate
      .mockResolvedValueOnce({
        text: JSON.stringify({
          dimensions: {
            completeness: { score: 1 },
            accuracy: { score: 1 },
            relations: { score: 1 },
            granularity: { score: 1 },
            hallucination: { score: 1 },
          },
          issues: [],
        }),
        usage: { inputTokens: 11, outputTokens: 3 },
      })
      .mockResolvedValueOnce({
        text: 'yes',
        usage: { inputTokens: 7, outputTokens: 1 },
      });
    const settle = vi.fn(async () => {});
    let generation = 0;
    const runtime = createInferenceRuntime({
      createGenerationId: () => `generation:gate:${++generation}`,
      admissionPolicy: {
        authorize: async (attempt) => ({
          outcome: 'admitted',
          admission: { id: `reservation:${attempt.generationId}` },
        }),
        settle,
        release: vi.fn(async () => {}),
      },
    });

    const response = await app(runtime).request('/v1/gate/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    });

    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(settle).toHaveBeenCalledTimes(2);
    expect(settle.mock.calls.map(([call]) => call.attempt.feature)).toEqual([
      'gate.semantic-review',
      'gate.business-rule',
    ]);
    for (const [call] of settle.mock.calls) {
      expect(call.attempt).toMatchObject({
        runId: 'request:request_gate_1',
        requestedModel: 'gpt-test',
        scope: {
          actor: { kind: 'user', id: 'user_1' },
          namespaceId: 'namespace_1',
          projectId: 'project_1',
          projectVisibility: 'unknown',
        },
      });
      expect(call.terminal).toMatchObject({
        kind: 'receipt',
        receipt: { resolvedProvider: 'openai', resolvedModel: 'gpt-test' },
      });
    }
  });

  it('returns 429 before provider I/O when admission is denied', async () => {
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

    const response = await app(runtime).request('/v1/gate/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Quota exhausted' },
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
