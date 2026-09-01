import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/infrastructure/core';
import * as client from '@/infrastructure/trees';
import { loadYOpsLog, type PersistenceError } from '../yopsLog';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('loadYOpsLog', () => {
  it('loads active evidence by default', async () => {
    const spy = vi.spyOn(client, 'listYOpsLog').mockResolvedValue([]);
    await loadYOpsLog('c1');
    expect(spy).toHaveBeenCalledWith('c1', undefined, { activeOnly: true });
  });

  it('can request the full audit log', async () => {
    const spy = vi.spyOn(client, 'listYOpsLog').mockResolvedValue([]);
    await loadYOpsLog('c1', undefined, { activeOnly: false });
    expect(spy).toHaveBeenCalledWith('c1', undefined, { activeOnly: false });
  });

  it('wraps read errors without exposing a write operation', async () => {
    vi.spyOn(client, 'listYOpsLog').mockRejectedValue(new ApiError('TIMEOUT', 'slow'));
    await expect(loadYOpsLog('c1')).rejects.toMatchObject({
      name: 'PersistenceError',
      operation: 'load',
      code: 'TIMEOUT',
    } satisfies Partial<PersistenceError>);
  });
});
