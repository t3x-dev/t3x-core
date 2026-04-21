/** biome-ignore-all lint/suspicious/noExplicitAny: op tests use broad casts for concise event fixture assertions */
/** biome-ignore-all lint/correctness/noUnusedFunctionParameters: mocked callbacks keep full signature for parity with production hooks */

import type { PipelineEvent } from '@t3x-dev/core';
import { collectResult, runOperation } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPipelineContext } from '../../ops/context';
import { diffOp } from '../../ops/diff';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const baseCommit = {
  hash: 'sha256:base_abc',
  message: 'base commit',
  author: { type: 'human', id: 'user_1', name: 'Alice' },
  committed_at: '2026-04-01T00:00:00.000Z',
  branch: 'main',
  content: {
    trees: [
      {
        key: 'topics',
        slots: {},
        children: [
          {
            key: 'greetings',
            slots: { summary: 'Hello world' },
            children: [],
          },
        ],
      },
    ],
    relations: [],
  },
};

const targetCommit = {
  hash: 'sha256:target_xyz',
  message: 'target commit',
  author: { type: 'human', id: 'user_1', name: 'Alice' },
  committed_at: '2026-04-02T00:00:00.000Z',
  branch: 'main',
  content: {
    trees: [
      {
        key: 'topics',
        slots: {},
        children: [
          {
            key: 'greetings',
            slots: { summary: 'Hello universe' },
            children: [],
          },
        ],
      },
    ],
    relations: [],
  },
};

vi.mock('@t3x-dev/storage', () => ({
  getCommitUnified: vi.fn((db: any, hash: string) => {
    if (hash === 'sha256:base_abc') return Promise.resolve(baseCommit);
    if (hash === 'sha256:target_xyz') return Promise.resolve(targetCommit);
    return Promise.resolve(null);
  }),
}));

function buildMockContext(overrides: Partial<ApiPipelineContext> = {}): ApiPipelineContext {
  return {
    db: {},
    projectId: '',
    userId: 'user_1',
    providerRegistry: {},
    abortSignal: new AbortController().signal,
    ...overrides,
  } as ApiPipelineContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('diffOp', () => {
  it('has the correct name', () => {
    expect(diffOp.name).toBe('diff');
  });

  it('yields load and transform steps and returns diff output', async () => {
    const ctx = buildMockContext();
    const events: PipelineEvent[] = [];

    const gen = runOperation(
      diffOp,
      {
        base_commit_hash: 'sha256:base_abc',
        target_commit_hash: 'sha256:target_xyz',
      },
      ctx
    );

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
    expect(eventTypes).toContain('step_start:load');
    expect(eventTypes).toContain('step_done:load');
    expect(eventTypes).toContain('step_start:transform');
    expect(eventTypes).toContain('step_done:transform');
    expect(eventTypes).toContain('op_done');

    // Verify output shape
    expect(output.base.hash).toBe('sha256:base_abc');
    expect(output.target.hash).toBe('sha256:target_xyz');
    expect(output.base.message).toBe('base commit');
    expect(output.target.message).toBe('target commit');
    expect(output.diff).toBeDefined();
    expect(output.diff).toHaveProperty('identical');
    expect(output.diff).toHaveProperty('modified');
    expect(output.diff).toHaveProperty('onlyInSource');
    expect(output.diff).toHaveProperty('onlyInTarget');
  });

  it('throws when base commit not found', async () => {
    const ctx = buildMockContext();

    await expect(
      collectResult(
        runOperation(
          diffOp,
          {
            base_commit_hash: 'sha256:nonexistent',
            target_commit_hash: 'sha256:target_xyz',
          },
          ctx
        )
      )
    ).rejects.toThrow('Base commit sha256:nonexistent not found');
  });

  it('throws when target commit not found', async () => {
    const ctx = buildMockContext();

    await expect(
      collectResult(
        runOperation(
          diffOp,
          {
            base_commit_hash: 'sha256:base_abc',
            target_commit_hash: 'sha256:nonexistent',
          },
          ctx
        )
      )
    ).rejects.toThrow('Target commit sha256:nonexistent not found');
  });

  it('returns null for message when commit has no message', async () => {
    const { getCommitUnified } = await import('@t3x-dev/storage');
    (getCommitUnified as any).mockImplementationOnce((_db: any, hash: string) => {
      if (hash === 'sha256:base_abc') return Promise.resolve({ ...baseCommit, message: undefined });
      if (hash === 'sha256:target_xyz') return Promise.resolve(targetCommit);
      return Promise.resolve(null);
    });

    const ctx = buildMockContext();
    const output = await collectResult(
      runOperation(
        diffOp,
        {
          base_commit_hash: 'sha256:base_abc',
          target_commit_hash: 'sha256:target_xyz',
        },
        ctx
      )
    );

    expect(output.base.message).toBeNull();
  });

  it('calls getCommitUnified with correct args', async () => {
    const { getCommitUnified } = await import('@t3x-dev/storage');
    (getCommitUnified as any).mockClear();

    const ctx = buildMockContext();
    await collectResult(
      runOperation(
        diffOp,
        {
          base_commit_hash: 'sha256:base_abc',
          target_commit_hash: 'sha256:target_xyz',
        },
        ctx
      )
    );

    expect(getCommitUnified).toHaveBeenCalledWith(expect.anything(), 'sha256:base_abc');
    expect(getCommitUnified).toHaveBeenCalledWith(expect.anything(), 'sha256:target_xyz');
  });
});
