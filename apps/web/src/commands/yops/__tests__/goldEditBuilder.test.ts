import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/infrastructure/session';
import { SourceValidationError } from '../errors';
import { buildHumanSource, commitGoldEdit, sourceGoldEdit } from '../goldEditBuilder';
import * as yopsService from '../yopsService';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('buildHumanSource', () => {
  it('uses username when present', () => {
    vi.spyOn(session, 'getSessionUser').mockReturnValue({
      id: 'u1',
      name: 'Ethan Example',
      username: 'ethan',
      avatar_url: null,
    });
    const src = buildHumanSource();
    expect(src.type).toBe('human');
    expect(src.author).toBe('ethan');
    expect(src.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('falls back to name when username is null', () => {
    vi.spyOn(session, 'getSessionUser').mockReturnValue({
      id: 'u1',
      name: 'Ethan',
      username: null,
      avatar_url: null,
    });
    expect(buildHumanSource().author).toBe('Ethan');
  });

  it('throws SourceValidationError when no session user', () => {
    vi.spyOn(session, 'getSessionUser').mockReturnValue(null);
    expect(() => buildHumanSource()).toThrow(SourceValidationError);
  });

  it('throws SourceValidationError when both name and username are null', () => {
    vi.spyOn(session, 'getSessionUser').mockReturnValue({
      id: 'u1',
      name: null,
      username: null,
      avatar_url: null,
    });
    expect(() => buildHumanSource()).toThrow(SourceValidationError);
  });
});

describe('sourceGoldEdit', () => {
  it('attaches a HumanSource to a bare YOp without committing', async () => {
    vi.spyOn(session, 'getSessionUser').mockReturnValue({
      id: 'u1',
      name: null,
      username: 'ethan',
      avatar_url: null,
    });
    const commitSpy = vi.spyOn(yopsService, 'commitOps');

    const sourced = sourceGoldEdit({ unset: { path: 'x/y' } });

    expect(sourced.unset).toEqual({ path: 'x/y' });
    expect(sourced.source).toEqual(expect.objectContaining({ type: 'human', author: 'ethan' }));
    expect(commitSpy).not.toHaveBeenCalled();
  });
});

describe('commitGoldEdit', () => {
  it('persists an already-sourced op without rebuilding source', async () => {
    // Critical contract: commitGoldEdit must NOT call buildHumanSource.
    // If it did, we would commit a different `at` timestamp than the
    // optimistic replay used, producing a silent client/server divergence.
    const userSpy = vi.spyOn(session, 'getSessionUser');
    const spy = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    const sourced = {
      unset: { path: 'x/y' },
      source: { type: 'human' as const, author: 'fixed', at: '2026-04-25T00:00:00.000Z' },
    };
    await commitGoldEdit('c1', sourced);

    expect(spy).toHaveBeenCalledWith('c1', [sourced]);
    // The exact same source object should round-trip — not a fresh one.
    expect(spy.mock.calls[0][1][0].source).toBe(sourced.source);
    expect(userSpy).not.toHaveBeenCalled();
  });

  it('propagates errors from commitOps', async () => {
    vi.spyOn(yopsService, 'commitOps').mockRejectedValue(new Error('persist fail'));
    const sourced = {
      unset: { path: 'x' },
      source: { type: 'human' as const, author: 'ethan', at: '2026-04-25T00:00:00.000Z' },
    };
    await expect(commitGoldEdit('c1', sourced)).rejects.toThrow('persist fail');
  });
});
