import type { PipelineEvent } from '@t3x-dev/core';
import { collectResult, runOperation } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPipelineContext } from '../../ops/context';
import type { LeafGenInput } from '../../ops/leaf-gen';
import { leafGenerateOp } from '../../ops/leaf-gen';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLeaf = {
  id: 'leaf_001',
  commit_hash: 'sha256:abc123',
  type: 'deploy_agent',
  title: 'Test Leaf',
  constraints: [{ id: 'cst_1', type: 'require', match_mode: 'exact', value: 'hello' }],
  config: { user_instruction: 'Be concise' },
  output: null,
  assertions: [],
  project_id: 'proj_123',
  created_at: '2026-04-03T00:00:00.000Z',
  generated_at: null,
};

const mockCommit = {
  hash: 'sha256:abc123',
  schema: 't3x/commit/v5',
  parents: [],
  content: { trees: [{ key: 'topics', type: 'topic', slots: {}, children: [] }] },
  project_id: 'proj_123',
  message: 'test commit',
};

const mockGenerateResult = {
  output: 'Generated hello world output',
  model: 'claude-3-haiku',
  usage: { inputTokens: 100, outputTokens: 50 },
  attempts: 1,
  validation: {
    allPassed: true,
    passedCount: 1,
    failedCount: 0,
    assertions: [
      {
        id: 'ast_1',
        constraint_id: 'cst_1',
        passed: true,
        details: 'Exact match found',
      },
    ],
  },
};

const mockUpdatedLeaf = {
  ...mockLeaf,
  output: 'Generated hello world output',
  generated_at: '2026-04-03T01:00:00.000Z',
};

vi.mock('@t3x-dev/storage', () => ({
  findLeafById: vi.fn(() => Promise.resolve(mockLeaf)),
  getCommitUnified: vi.fn(() => Promise.resolve(mockCommit)),
  findLeavesByCommit: vi.fn(() => Promise.resolve([mockLeaf])),
  updateLeafOutput: vi.fn(() => Promise.resolve(mockUpdatedLeaf)),
  updateLeaf: vi.fn(() =>
    Promise.resolve({ ...mockUpdatedLeaf, assertions: mockGenerateResult.validation.assertions })
  ),
  createLeafHistory: vi.fn(() => Promise.resolve({ id: 'lhist_001' })),
}));

vi.mock('../../lib/provider-registry', () => ({
  generateWithFallback: vi.fn(() => Promise.resolve(mockGenerateResult)),
}));

vi.mock('../../lib/usage-tracking', () => ({
  recordUsageFireAndForget: vi.fn(),
}));

vi.mock('../../middleware/logger', () => ({
  pinoLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    collectLessonsFromAssertions: vi.fn(() => ['lesson 1']),
  };
});

function buildMockContext(overrides: Partial<ApiPipelineContext> = {}): ApiPipelineContext {
  return {
    db: {} as any,
    projectId: 'proj_123',
    userId: 'user_1',
    providerRegistry: {
      tryWithFallback: vi.fn((_cap: string, fn: (p: any) => any) => fn({ generate: vi.fn() })),
    } as any,
    abortSignal: new AbortController().signal,
    ...overrides,
  } as ApiPipelineContext;
}

const baseInput: LeafGenInput = {
  leafId: 'leaf_001',
  mode: 'fast',
  userId: 'user_1',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('leafGenerateOp', () => {
  it('has the correct name', () => {
    expect(leafGenerateOp.name).toBe('leaf-generate');
  });

  it('yields correct event sequence for fast mode', async () => {
    const ctx = buildMockContext();
    const events: PipelineEvent[] = [];

    const gen = runOperation(leafGenerateOp, baseInput, ctx);

    let result: IteratorResult<PipelineEvent, any>;
    do {
      result = await gen.next();
      if (!result.done) {
        events.push(result.value);
      }
    } while (!result.done);

    const eventTypes = events.map((e) => `${e.type}${e.step ? `:${e.step}` : ''}`);
    expect(eventTypes).toContain('op_start');
    expect(eventTypes).toContain('step_start:load');
    expect(eventTypes).toContain('step_done:load');
    expect(eventTypes).toContain('step_start:analyze');
    expect(eventTypes).toContain('step_done:analyze');
    expect(eventTypes).toContain('step_start:transform');
    expect(eventTypes).toContain('step_done:transform');
    // validate step appears because fast mode produced assertions
    expect(eventTypes).toContain('step_start:validate');
    expect(eventTypes).toContain('step_done:validate');
    expect(eventTypes).toContain('step_start:persist');
    expect(eventTypes).toContain('step_done:persist');
    expect(eventTypes).toContain('op_done');
  });

  it('returns correct output shape for fast mode', async () => {
    const ctx = buildMockContext();
    const output = await collectResult(runOperation(leafGenerateOp, baseInput, ctx));

    expect(output.output).toBe('Generated hello world output');
    expect(output.generated_at).toBe('2026-04-03T01:00:00.000Z');
    expect(output.mode).toBe('fast');
    expect(output.validation).toEqual({
      all_passed: true,
      passed_count: 1,
      failed_count: 0,
      attempts: 1,
    });
    expect(output.leaf).toBeDefined();
    // No multi-round fields in fast mode
    expect(output.rounds).toBeUndefined();
    expect(output.total_rounds).toBeUndefined();
  });

  it('passes mode through for standard mode (multi-round)', async () => {
    const mockModeResult = {
      output: 'Multi-round output',
      rounds: [
        {
          name: 'draft',
          round_number: 1,
          constraints_passed: true,
          failed_constraints: [],
        },
      ],
      total_rounds: 1,
      mode: 'standard' as const,
    };

    const ctx = buildMockContext({
      providerRegistry: {
        tryWithFallback: vi.fn((_cap: string, fn: (p: any) => any) =>
          fn({ generate: vi.fn() }).then
            ? fn({ generate: vi.fn() })
            : Promise.resolve(mockModeResult)
        ),
      } as any,
    });

    // Override tryWithFallback to return the multi-round result directly
    (ctx.providerRegistry as any).tryWithFallback = vi.fn(() => Promise.resolve(mockModeResult));

    const input: LeafGenInput = {
      leafId: 'leaf_001',
      mode: 'standard',
      userId: 'user_1',
    };

    const { updateLeafOutput } = await import('@t3x-dev/storage');
    (updateLeafOutput as any).mockResolvedValueOnce({
      ...mockUpdatedLeaf,
      output: 'Multi-round output',
    });

    const output = await collectResult(runOperation(leafGenerateOp, input, ctx));

    expect(output.output).toBe('Multi-round output');
    expect(output.mode).toBe('standard');
    expect(output.rounds).toHaveLength(1);
    expect(output.total_rounds).toBe(1);
    // No validation in multi-round mode
    expect(output.validation).toBeUndefined();
  });

  it('throws when leaf is not found', async () => {
    const { findLeafById } = await import('@t3x-dev/storage');
    (findLeafById as any).mockResolvedValueOnce(null);

    const ctx = buildMockContext();

    await expect(collectResult(runOperation(leafGenerateOp, baseInput, ctx))).rejects.toThrow(
      'Leaf not found: leaf_001'
    );
  });

  it('throws when commit is not found', async () => {
    const { getCommitUnified } = await import('@t3x-dev/storage');
    (getCommitUnified as any).mockResolvedValueOnce(null);

    const ctx = buildMockContext();

    await expect(collectResult(runOperation(leafGenerateOp, baseInput, ctx))).rejects.toThrow(
      'Source commit not found: sha256:abc123'
    );
  });

  it('calls storage functions with correct arguments', async () => {
    const ctx = buildMockContext();
    const {
      findLeafById,
      getCommitUnified,
      findLeavesByCommit,
      updateLeafOutput,
      createLeafHistory,
    } = await import('@t3x-dev/storage');

    // Reset mocks
    (findLeafById as any).mockClear().mockResolvedValue(mockLeaf);
    (getCommitUnified as any).mockClear().mockResolvedValue(mockCommit);
    (findLeavesByCommit as any).mockClear().mockResolvedValue([mockLeaf]);
    (updateLeafOutput as any).mockClear().mockResolvedValue(mockUpdatedLeaf);
    (createLeafHistory as any).mockClear().mockResolvedValue({ id: 'lhist_001' });

    await collectResult(runOperation(leafGenerateOp, baseInput, ctx));

    expect(findLeafById).toHaveBeenCalledWith(expect.anything(), 'leaf_001');
    expect(getCommitUnified).toHaveBeenCalledWith(expect.anything(), 'sha256:abc123');
    expect(findLeavesByCommit).toHaveBeenCalledWith(expect.anything(), 'sha256:abc123');
    expect(updateLeafOutput).toHaveBeenCalledWith(
      expect.anything(),
      'leaf_001',
      'Generated hello world output'
    );
    expect(createLeafHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        leaf_id: 'leaf_001',
        output: 'Generated hello world output',
        config: expect.objectContaining({ generation_mode: 'fast' }),
        model: 'claude-3-haiku',
      })
    );
  });
});
