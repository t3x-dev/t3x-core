/** biome-ignore-all lint/suspicious/noExplicitAny: operation fixtures intentionally narrow storage records */

import { collectResult, runOperation } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInferenceRuntime, InferenceAdmissionDeniedError } from '../../lib/inference';
import type { ApiPipelineContext } from '../../ops/context';
import { leafGenerateOp } from '../../ops/leaf-gen';

const mocks = vi.hoisted(() => ({
  createLeafHistory: vi.fn(),
  createModelBoundProvider: vi.fn(),
  findLeafById: vi.fn(),
  findLeavesByCommit: vi.fn(),
  generateLeafOutput: vi.fn(),
  getRepositorySemanticCommit: vi.fn(),
  modeGenerate: vi.fn(),
  providerGenerate: vi.fn(),
  resolveProviderAndModel: vi.fn(),
  updateLeaf: vi.fn(),
  updateLeafOutput: vi.fn(),
}));

vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    collectLessonsFromAssertions: vi.fn(() => []),
    generateLeafOutput: mocks.generateLeafOutput,
    modeGenerate: mocks.modeGenerate,
  };
});

vi.mock('@t3x-dev/storage', () => ({
  createLeafHistory: mocks.createLeafHistory,
  findLeafById: mocks.findLeafById,
  findLeavesByCommit: mocks.findLeavesByCommit,
  updateLeaf: mocks.updateLeaf,
  updateLeafOutput: mocks.updateLeafOutput,
}));

vi.mock('../../lib/provider-resolver', () => ({
  createModelBoundProvider: mocks.createModelBoundProvider,
  resolveProviderAndModel: mocks.resolveProviderAndModel,
}));

vi.mock('../../lib/repository-state-transition', () => ({
  getRepositorySemanticCommit: mocks.getRepositorySemanticCommit,
}));

const leaf = {
  id: 'leaf_1',
  project_id: 'project_1',
  commit_hash: `sha256:${'a'.repeat(64)}`,
  type: 'article',
  constraints: [],
  config: {},
  assertions: [],
};

function context(runtime: ReturnType<typeof createInferenceRuntime>): ApiPipelineContext {
  return {
    db: {} as any,
    projectId: 'project_1',
    userId: 'user_1',
    providerRegistry: {} as any,
    inference: {
      runtime,
      runId: 'run:leaf-generation',
      scope: {
        actor: { kind: 'user', id: 'user_1' },
        namespaceId: 'namespace_1',
        projectId: 'project_1',
        projectVisibility: 'private',
      },
    },
    abortSignal: new AbortController().signal,
  } as ApiPipelineContext;
}

describe('leafGenerateOp inference lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLeafById.mockResolvedValue(leaf);
    mocks.findLeavesByCommit.mockResolvedValue([]);
    mocks.getRepositorySemanticCommit.mockResolvedValue({
      semanticContent: { trees: [], relations: [] },
    });
    mocks.resolveProviderAndModel.mockResolvedValue({
      ok: true,
      providerId: 'openai',
      model: 'gpt-test',
      provider: {},
      registry: {},
    });
    mocks.providerGenerate.mockResolvedValue({
      text: 'generated output',
      usage: { inputTokens: 13, outputTokens: 8 },
    });
    mocks.createModelBoundProvider.mockResolvedValue({
      id: 'openai',
      generate: mocks.providerGenerate,
    });
    mocks.generateLeafOutput.mockImplementation(async ({ provider }) => {
      const result = await provider.generate('leaf prompt');
      return {
        output: result.text,
        model: 'gpt-test',
        usage: result.usage,
        prompt: { system: 'system', user: 'user' },
        attempts: 1,
      };
    });
    mocks.updateLeafOutput.mockResolvedValue({
      ...leaf,
      output: 'generated output',
      generated_at: '2026-09-01T00:00:00.000Z',
    });
    mocks.createLeafHistory.mockResolvedValue(undefined);
  });

  it('admits and settles the provider call before persisting output', async () => {
    const settle = vi.fn(async () => {});
    const runtime = createInferenceRuntime({
      admissionPolicy: {
        authorize: async () => ({ outcome: 'admitted', admission: { id: 'reservation:1' } }),
        settle,
        release: vi.fn(async () => {}),
      },
      createGenerationId: () => 'generation:leaf:1',
    });

    const result = await collectResult(
      runOperation(leafGenerateOp, { leafId: leaf.id, mode: 'fast' }, context(runtime))
    );

    expect(result.output).toBe('generated output');
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: expect.objectContaining({
          generationId: 'generation:leaf:1',
          runId: 'run:leaf-generation',
          feature: 'leaf.generate',
          scope: expect.objectContaining({
            namespaceId: 'namespace_1',
            projectId: 'project_1',
          }),
        }),
        terminal: {
          kind: 'receipt',
          receipt: expect.objectContaining({
            resolvedProvider: 'openai',
            resolvedModel: 'gpt-test',
            usage: { inputTokens: 13, outputTokens: 8 },
          }),
        },
      })
    );
    expect(mocks.updateLeafOutput).toHaveBeenCalledAfter(mocks.providerGenerate);
  });

  it('fails closed before provider I/O and persistence when admission is denied', async () => {
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

    await expect(
      collectResult(
        runOperation(leafGenerateOp, { leafId: leaf.id, mode: 'fast' }, context(runtime))
      )
    ).rejects.toBeInstanceOf(InferenceAdmissionDeniedError);

    expect(mocks.providerGenerate).not.toHaveBeenCalled();
    expect(mocks.updateLeafOutput).not.toHaveBeenCalled();
    expect(mocks.createLeafHistory).not.toHaveBeenCalled();
  });
});
