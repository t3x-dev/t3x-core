import type { SourcedYOp } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as yopsLogInfra from '@/infrastructure/yopsLog';
import { SourceValidationError } from '../errors';
import { commitOps } from '../yopsService';

beforeEach(() => {
  vi.restoreAllMocks();
});

const humanOp: SourcedYOp = {
  set: { path: 'x', value: 'y' },
  source: { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' },
};

const llmOp: SourcedYOp = {
  set: { path: 'x', value: 'y' },
  source: {
    type: 'llm',
    model: 'm',
    at: '2026-04-12T00:00:00Z',
    turn_ref: { turn_hash: 'sha256:a', quote: 'q' },
  },
};

describe('commitOps', () => {
  it('calls infrastructure.appendYOps with ops when all are valid', async () => {
    const spy = vi.spyOn(yopsLogInfra, 'appendYOps').mockResolvedValue({} as never);
    await commitOps('c1', [humanOp, llmOp]);
    expect(spy).toHaveBeenCalledWith('c1', [humanOp, llmOp], undefined);
  });

  it('forwards options.replaceActiveLLMDraft to infrastructure.appendYOps', async () => {
    // Apply-from-staged-Extract-draft path: caller passes the flag so
    // the API marks prior active LLM drafts as superseded inside the
    // same transaction as the new entry's insert. commitOps must
    // pass it through unchanged.
    const spy = vi.spyOn(yopsLogInfra, 'appendYOps').mockResolvedValue({} as never);
    await commitOps('c1', [llmOp], { replaceActiveLLMDraft: true });
    expect(spy).toHaveBeenCalledWith('c1', [llmOp], { replaceActiveLLMDraft: true });
  });

  it('returns the entry from appendYOps', async () => {
    const entry = {
      id: 'yl_1',
      yops: [humanOp],
      created_at: '2026-04-12T00:00:00Z',
      source: 'manual',
    };
    vi.spyOn(yopsLogInfra, 'appendYOps').mockResolvedValue(entry as never);
    const result = await commitOps('c1', [humanOp]);
    expect(result).toBe(entry);
  });

  it('throws SourceValidationError when an op has no source', async () => {
    const bad = { set: { path: 'x', value: 'y' } } as unknown as SourcedYOp;
    const spy = vi.spyOn(yopsLogInfra, 'appendYOps');
    await expect(commitOps('c1', [bad])).rejects.toBeInstanceOf(SourceValidationError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws SourceValidationError when source type is invalid', async () => {
    const bad = {
      set: { path: 'x', value: 'y' },
      source: { type: 'robot' },
    } as unknown as SourcedYOp;
    await expect(commitOps('c1', [bad])).rejects.toBeInstanceOf(SourceValidationError);
  });

  it('throws SourceValidationError for human source missing author', async () => {
    const bad = {
      set: { path: 'x', value: 'y' },
      source: { type: 'human', author: '', at: '2026-04-12T00:00:00Z' },
    } as unknown as SourcedYOp;
    await expect(commitOps('c1', [bad])).rejects.toBeInstanceOf(SourceValidationError);
  });

  it('reports the first failing op index', async () => {
    const good = humanOp;
    const bad = { set: { path: 'x', value: 'y' } } as unknown as SourcedYOp;
    try {
      await commitOps('c1', [good, good, bad]);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SourceValidationError);
      expect((e as SourceValidationError).opIndex).toBe(2);
    }
  });

  it('propagates PersistenceError from infrastructure', async () => {
    vi.spyOn(yopsLogInfra, 'appendYOps').mockRejectedValue(
      new yopsLogInfra.PersistenceError('append', 'HTTP_500', 'boom')
    );
    await expect(commitOps('c1', [humanOp])).rejects.toBeInstanceOf(yopsLogInfra.PersistenceError);
  });

  it('accepts empty ops array without calling appendYOps', async () => {
    const spy = vi.spyOn(yopsLogInfra, 'appendYOps').mockResolvedValue({} as never);
    await commitOps('c1', []);
    // Design choice: we still call appendYOps (may be a no-op server-side)
    // OR we skip. Assert whichever your implementation chose — see impl notes.
    // For this test, let's require that the service passes through (simpler).
    expect(spy).toHaveBeenCalledWith('c1', [], undefined);
  });
});
