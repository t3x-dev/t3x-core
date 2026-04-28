import type { SourcedYOp } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/infrastructure/core';
import * as client from '@/infrastructure/trees';
import { appendYOps, deriveRowSource, loadYOpsLog, PersistenceError } from '../yopsLog';

beforeEach(() => {
  vi.restoreAllMocks();
});

const humanOp: SourcedYOp = {
  set: { path: 'x', value: 'y' },
  source: { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' },
} as unknown as SourcedYOp;

const llmOp: SourcedYOp = {
  set: { path: 'x', value: 'y' },
  source: {
    type: 'llm',
    model: 'm',
    at: '2026-04-12T00:00:00Z',
    turn_ref: { turn_hash: 'sha256:a', quote: 'x' },
  },
} as unknown as SourcedYOp;

describe('deriveRowSource', () => {
  it('returns "manual" for empty ops array', () => {
    expect(deriveRowSource([])).toBe('manual');
  });
});

describe('appendYOps', () => {
  it('delegates to createYOpsEntry with row source "manual" for human ops', async () => {
    const spy = vi.spyOn(client, 'createYOpsEntry').mockResolvedValue({
      id: 'yl_1',
      conversation_id: 'c1',
      project_id: 'p1',
      source: 'manual',
      turn_hash: null,
      yops: [humanOp],
      created_at: '2026-04-12T00:00:00Z',
    } as never);
    await appendYOps('c1', [humanOp]);
    expect(spy).toHaveBeenCalledWith('c1', [humanOp], 'manual', undefined, undefined);
  });

  it('uses row source "pipeline" when all ops are llm', async () => {
    const spy = vi.spyOn(client, 'createYOpsEntry').mockResolvedValue({} as never);
    await appendYOps('c1', [llmOp]);
    expect(spy).toHaveBeenCalledWith('c1', [llmOp], 'pipeline', undefined, undefined);
  });

  it('uses row source "manual" for mixed batch', async () => {
    const spy = vi.spyOn(client, 'createYOpsEntry').mockResolvedValue({} as never);
    await appendYOps('c1', [llmOp, humanOp]);
    expect(spy).toHaveBeenCalledWith('c1', [llmOp, humanOp], 'manual', undefined, undefined);
  });

  it('forwards replaceActiveLLMDraft option to createYOpsEntry', async () => {
    // Apply-from-staged-Extract-draft path: web's hook reads
    // hasDraft and passes { replaceActiveLLMDraft: true } so the API
    // marks prior active LLM drafts as superseded inside the same
    // transaction. Without this, re-Extract → Apply just appends and
    // the workspace stacks duplicate suggestions.
    const spy = vi.spyOn(client, 'createYOpsEntry').mockResolvedValue({} as never);
    await appendYOps('c1', [llmOp], { replaceActiveLLMDraft: true });
    expect(spy).toHaveBeenCalledWith('c1', [llmOp], 'pipeline', undefined, {
      replaceActiveLLMDraft: true,
    });
  });

  it('forwards repairYopsLogId option to createYOpsEntry', async () => {
    const spy = vi.spyOn(client, 'createYOpsEntry').mockResolvedValue({} as never);
    await appendYOps('c1', [humanOp], { repairYopsLogId: 'yl_failing' });
    expect(spy).toHaveBeenCalledWith('c1', [humanOp], 'manual', undefined, {
      repairYopsLogId: 'yl_failing',
    });
  });

  it('forwards replaceActiveScript option to createYOpsEntry', async () => {
    const spy = vi.spyOn(client, 'createYOpsEntry').mockResolvedValue({} as never);
    await appendYOps('c1', [humanOp], { replaceActiveScript: true });
    expect(spy).toHaveBeenCalledWith('c1', [humanOp], 'manual', undefined, {
      replaceActiveScript: true,
    });
  });

  it('omits replaceActiveLLMDraft when not provided (preserves legacy callers)', async () => {
    // Gold edits, compression, and any caller that doesn't pass options
    // must keep their existing append-only semantics — dropping the
    // option means the API uses its default (false).
    const spy = vi.spyOn(client, 'createYOpsEntry').mockResolvedValue({} as never);
    await appendYOps('c1', [humanOp]);
    expect(spy).toHaveBeenCalledWith('c1', [humanOp], 'manual', undefined, undefined);
  });

  it('wraps ApiError into PersistenceError', async () => {
    vi.spyOn(client, 'createYOpsEntry').mockRejectedValue(new ApiError('MISSING_SOURCE', 'boom'));
    await expect(appendYOps('c1', [humanOp])).rejects.toBeInstanceOf(PersistenceError);
  });

  it('preserves error code through wrapping', async () => {
    vi.spyOn(client, 'createYOpsEntry').mockRejectedValue(new ApiError('HTTP_500', 'bad'));
    try {
      await appendYOps('c1', [humanOp]);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PersistenceError);
      expect((e as PersistenceError).code).toBe('HTTP_500');
      expect((e as PersistenceError).operation).toBe('append');
    }
  });
});

describe('loadYOpsLog', () => {
  it('loads active yops by default', async () => {
    const spy = vi.spyOn(client, 'listYOpsLog').mockResolvedValue([]);
    await loadYOpsLog('c1');
    expect(spy).toHaveBeenCalledWith('c1', undefined, { activeOnly: true });
  });

  it('can request the full audit log when needed', async () => {
    const spy = vi.spyOn(client, 'listYOpsLog').mockResolvedValue([]);
    await loadYOpsLog('c1', undefined, { activeOnly: false });
    expect(spy).toHaveBeenCalledWith('c1', undefined, { activeOnly: false });
  });

  it('wraps errors with operation="load"', async () => {
    vi.spyOn(client, 'listYOpsLog').mockRejectedValue(new ApiError('TIMEOUT', 'slow'));
    try {
      await loadYOpsLog('c1');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PersistenceError);
      expect((e as PersistenceError).operation).toBe('load');
    }
  });
});
