import type { PipelineEvent } from '@t3x-dev/core';
import { collectResult, runOperation } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPipelineContext } from '../../ops/context';
import type { MergeExecuteInput, MergePrepareInput } from '../../ops/merge';
import { MergeError, mergeExecuteOp, mergePrepareOp } from '../../ops/merge';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockContent = {
  trees: [{ key: 'topics', type: 'topic', slots: {}, children: [] }],
  relations: [],
};

const mockSourceCommit = {
  hash: 'sha256:source',
  schema: 't3x/commit/v5',
  parents: [],
  author: { type: 'human' as const, name: 'alice' },
  committed_at: '2026-04-03T00:00:00.000Z',
  content: mockContent,
  project_id: 'proj_123',
  message: 'source',
  branch: 'main',
  provenance: null,
  yops_log_ids: [],
  sources: null,
};

const mockTargetCommit = {
  ...mockSourceCommit,
  hash: 'sha256:target',
  message: 'target',
};

const mockMergedCommit = {
  ...mockSourceCommit,
  hash: 'sha256:merged',
  parents: ['sha256:source', 'sha256:target'],
  message: 'merged',
};

const mockPrepared = {
  autoKept: ['topics.a'],
  conflicts: [{ path: 'topics.b', sourceValue: { text: 's' }, targetValue: { text: 't' } }],
  onlyInSource: ['topics.c'],
  onlyInTarget: ['topics.d'],
  relationsOnlyInSource: [],
  relationsOnlyInTarget: [],
  relationsInBoth: [],
};

const mockMergedContent = {
  trees: [{ key: 'merged', type: 'topic', slots: {}, children: [] }],
  relations: [],
};

vi.mock('@t3x-dev/storage', () => ({
  getCommitUnified: vi.fn((_, hash: string) => {
    if (hash === 'sha256:source') return Promise.resolve(mockSourceCommit);
    if (hash === 'sha256:target') return Promise.resolve(mockTargetCommit);
    if (hash === 'sha256:missing') return Promise.resolve(null);
    return Promise.resolve(null);
  }),
  createCommit: vi.fn(() => Promise.resolve(mockMergedCommit)),
  updateBranchHead: vi.fn(() => Promise.resolve()),
}));

vi.mock('@t3x-dev/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...original,
    prepareMerge: vi.fn(() => mockPrepared),
    executeMerge: vi.fn(() => mockMergedContent),
    flattenTrees: vi.fn(() => [{ path: 'merged.a' }]),
  };
});

function buildMockContext(overrides: Partial<ApiPipelineContext> = {}): ApiPipelineContext {
  return {
    db: {} as any,
    projectId: 'proj_123',
    userId: 'user_1',
    providerRegistry: {} as any,
    abortSignal: new AbortController().signal,
    ...overrides,
  } as ApiPipelineContext;
}

async function collectEvents<O>(
  gen: AsyncGenerator<PipelineEvent, O>
): Promise<{ events: PipelineEvent[]; result: O }> {
  const events: PipelineEvent[] = [];
  let iterResult: IteratorResult<PipelineEvent, O>;
  do {
    iterResult = await gen.next();
    if (!iterResult.done) {
      events.push(iterResult.value);
    }
  } while (!iterResult.done);
  return { events, result: iterResult.value };
}

// ---------------------------------------------------------------------------
// Tests — mergePrepareOp
// ---------------------------------------------------------------------------

describe('mergePrepareOp', () => {
  it('has the correct name', () => {
    expect(mergePrepareOp.name).toBe('merge.prepare');
  });

  it('yields load + transform steps and returns prepared result', async () => {
    const ctx = buildMockContext();
    const input: MergePrepareInput = {
      source_hash: 'sha256:source',
      target_hash: 'sha256:target',
    };

    const { events, result } = await collectEvents(runOperation(mergePrepareOp, input, ctx));

    const eventTypes = events.map((e) => `${e.type}${e.step ? `:${e.step}` : ''}`);
    expect(eventTypes).toContain('op_start');
    expect(eventTypes).toContain('step_start:load');
    expect(eventTypes).toContain('step_done:load');
    expect(eventTypes).toContain('step_start:transform');
    expect(eventTypes).toContain('step_done:transform');
    expect(eventTypes).toContain('op_done');

    expect(result.prepared).toEqual(mockPrepared);
    expect(result.source_project_id).toBe('proj_123');
  });

  it('throws MergeError when source commit not found', async () => {
    const ctx = buildMockContext();
    const input: MergePrepareInput = {
      source_hash: 'sha256:missing',
      target_hash: 'sha256:target',
    };

    await expect(collectResult(runOperation(mergePrepareOp, input, ctx))).rejects.toThrow(
      MergeError
    );
  });

  it('throws MergeError when target commit not found', async () => {
    const ctx = buildMockContext();
    const input: MergePrepareInput = {
      source_hash: 'sha256:source',
      target_hash: 'sha256:missing',
    };

    await expect(collectResult(runOperation(mergePrepareOp, input, ctx))).rejects.toThrow(
      MergeError
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — mergeExecuteOp
// ---------------------------------------------------------------------------

describe('mergeExecuteOp', () => {
  it('has the correct name', () => {
    expect(mergeExecuteOp.name).toBe('merge.execute');
  });

  it('yields validate + load + transform + persist steps and returns commit + summary', async () => {
    const ctx = buildMockContext();
    const input: MergeExecuteInput = {
      source_hash: 'sha256:source',
      target_hash: 'sha256:target',
      prepared: mockPrepared as any,
      decisions: {
        conflictResolutions: { 'topics.b': 'source' },
        keepFromSource: ['topics.c'],
        keepFromTarget: [],
      } as any,
      message: 'merge commit',
      branch: 'main',
      author: { type: 'human', name: 'alice' },
    };

    const { events, result } = await collectEvents(runOperation(mergeExecuteOp, input, ctx));

    const eventTypes = events.map((e) => `${e.type}${e.step ? `:${e.step}` : ''}`);
    expect(eventTypes).toContain('op_start');
    expect(eventTypes).toContain('step_start:validate');
    expect(eventTypes).toContain('step_done:validate');
    expect(eventTypes).toContain('step_start:load');
    expect(eventTypes).toContain('step_done:load');
    expect(eventTypes).toContain('step_start:transform');
    expect(eventTypes).toContain('step_done:transform');
    expect(eventTypes).toContain('step_start:persist');
    expect(eventTypes).toContain('step_done:persist');
    expect(eventTypes).toContain('op_done');

    // output shape
    expect(result.commit).toEqual(mockMergedCommit);
    expect(result.merge_summary).toEqual({
      kept_identical: 1,
      resolved_conflicts: 1,
      kept_from_source: 1,
      kept_from_target: 0,
      discarded: 1,
      total_nodes: 1,
    });
  });

  it('throws MergeError for unresolved conflicts', async () => {
    const ctx = buildMockContext();
    const input: MergeExecuteInput = {
      source_hash: 'sha256:source',
      target_hash: 'sha256:target',
      prepared: mockPrepared as any,
      decisions: {
        conflictResolutions: {},
        keepFromSource: [],
        keepFromTarget: [],
      } as any,
      message: 'merge',
      author: { type: 'human', name: 'alice' },
    };

    await expect(collectResult(runOperation(mergeExecuteOp, input, ctx))).rejects.toThrow(
      /1 conflict\(s\) have no resolution/
    );
  });

  it('throws MergeError when source commit not found', async () => {
    const ctx = buildMockContext();
    const input: MergeExecuteInput = {
      source_hash: 'sha256:missing',
      target_hash: 'sha256:target',
      prepared: { ...mockPrepared, conflicts: [] } as any,
      decisions: {
        conflictResolutions: {},
        keepFromSource: [],
        keepFromTarget: [],
      } as any,
      message: 'merge',
      author: { type: 'human', name: 'alice' },
    };

    await expect(collectResult(runOperation(mergeExecuteOp, input, ctx))).rejects.toThrow(
      MergeError
    );
  });

  it('collectResult returns the output directly', async () => {
    const ctx = buildMockContext();
    const input: MergeExecuteInput = {
      source_hash: 'sha256:source',
      target_hash: 'sha256:target',
      prepared: mockPrepared as any,
      decisions: {
        conflictResolutions: { 'topics.b': 'source' },
        keepFromSource: [],
        keepFromTarget: ['topics.d'],
      } as any,
      message: 'merge',
      branch: 'main',
      author: { type: 'human', name: 'alice' },
    };

    const output = await collectResult(runOperation(mergeExecuteOp, input, ctx));
    expect(output.commit.hash).toBe('sha256:merged');
    expect(output.merge_summary.kept_identical).toBe(1);
  });
});
