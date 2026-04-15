import type { PipelineEvent } from '@t3x-dev/core';
import { collectResult, runOperation } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import type { CommitInput } from '../../ops/commit';
import { commitOp } from '../../ops/commit';
import type { ApiPipelineContext } from '../../ops/context';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCommit = {
  hash: 'sha256:abc123',
  schema: 't3x/commit',
  parents: [],
  author: { type: 'human' as const, name: 'cli' },
  committed_at: '2026-04-03T00:00:00.000Z',
  content: { trees: [{ key: 'topics', type: 'topic', slots: {}, children: [] }], relations: [] },
  project_id: 'proj_123',
  message: 'test commit',
  branch: 'main',
  provenance: null,
  yops_log_ids: [],
  sources: null,
};

vi.mock('@t3x-dev/storage', () => ({
  createCommit: vi.fn(() => Promise.resolve(mockCommit)),
  getCommit: vi.fn(() => Promise.resolve(null)),
}));

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

const baseInput: CommitInput = {
  project_id: 'proj_123',
  content: { trees: [{ key: 'topics', type: 'topic', slots: {}, children: [] }] },
  message: 'test commit',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commitOp', () => {
  it('has the correct name', () => {
    expect(commitOp.name).toBe('commit');
  });

  it('yields step_start/step_done for validate and persist, returns commit', async () => {
    const ctx = buildMockContext();
    const events: PipelineEvent[] = [];

    const gen = runOperation(commitOp, baseInput, ctx);

    let result: IteratorResult<PipelineEvent, any>;
    do {
      result = await gen.next();
      if (!result.done) {
        events.push(result.value);
      }
    } while (!result.done);

    const output = result.value;

    // Verify pipeline events
    const eventTypes = events.map((e) => `${e.type}${e.step ? `:${e.step}` : ''}`);
    expect(eventTypes).toContain('op_start');
    expect(eventTypes).toContain('step_start:validate');
    expect(eventTypes).toContain('step_done:validate');
    expect(eventTypes).toContain('step_start:persist');
    expect(eventTypes).toContain('step_done:persist');
    expect(eventTypes).toContain('op_done');

    // Verify output shape
    expect(output).toEqual(mockCommit);
    expect(output.hash).toBe('sha256:abc123');
    expect(output.project_id).toBe('proj_123');
  });

  it('uses default author when none provided', async () => {
    const ctx = buildMockContext();
    const { createCommit } = await import('@t3x-dev/storage');
    (createCommit as any).mockClear();

    await collectResult(runOperation(commitOp, baseInput, ctx));

    expect(createCommit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        author: { type: 'human', name: 'cli' },
      })
    );
  });

  it('passes custom author through to createCommit', async () => {
    const ctx = buildMockContext();
    const { createCommit } = await import('@t3x-dev/storage');
    (createCommit as any).mockClear();

    const input: CommitInput = {
      ...baseInput,
      author: { type: 'agent', id: 'agent_1', name: 'MyAgent' },
    };

    await collectResult(runOperation(commitOp, input, ctx));

    expect(createCommit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        author: { type: 'agent', id: 'agent_1', name: 'MyAgent' },
      })
    );
  });

  it('passes all optional fields through to createCommit', async () => {
    const ctx = buildMockContext();
    const { createCommit } = await import('@t3x-dev/storage');
    (createCommit as any).mockClear();

    const input: CommitInput = {
      ...baseInput,
      branch: 'feature',
      parents: ['sha256:parent1'],
      provenance: { method: 'llm_extraction', model: 'gpt-4' },
      yops_log_ids: ['yops_001'],
      sources: [{ type: 'conversation', id: 'conv_1', title: 'Chat' }],
    };

    await collectResult(runOperation(commitOp, input, ctx));

    expect(createCommit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_123',
        branch: 'feature',
        parents: ['sha256:parent1'],
        provenance: { method: 'llm_extraction', model: 'gpt-4' },
        yops_log_ids: ['yops_001'],
        sources: [{ type: 'conversation', id: 'conv_1', title: 'Chat' }],
      })
    );
  });

  it('collectResult returns the commit directly', async () => {
    const ctx = buildMockContext();
    const output = await collectResult(runOperation(commitOp, baseInput, ctx));

    expect(output.hash).toBe('sha256:abc123');
    expect(output.schema).toBe('t3x/commit');
  });
});
