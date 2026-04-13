import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/lib/session';
import { SourceValidationError } from '../errors';
import { buildHumanSource, commitGoldEdit } from '../goldEditBuilder';
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

describe('commitGoldEdit', () => {
  it('attaches HumanSource to op and delegates to yopsService.commitOps', async () => {
    vi.spyOn(session, 'getSessionUser').mockReturnValue({
      id: 'u1',
      name: null,
      username: 'ethan',
      avatar_url: null,
    });
    const spy = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);
    await commitGoldEdit('c1', { unset: { path: 'x/y' } });
    expect(spy).toHaveBeenCalledWith('c1', [
      expect.objectContaining({
        unset: { path: 'x/y' },
        source: expect.objectContaining({ type: 'human', author: 'ethan' }),
      }),
    ]);
  });

  it('propagates errors from commitOps', async () => {
    vi.spyOn(session, 'getSessionUser').mockReturnValue({
      id: 'u1',
      name: null,
      username: 'ethan',
      avatar_url: null,
    });
    vi.spyOn(yopsService, 'commitOps').mockRejectedValue(new Error('persist fail'));
    await expect(commitGoldEdit('c1', { unset: { path: 'x' } })).rejects.toThrow('persist fail');
  });
});
