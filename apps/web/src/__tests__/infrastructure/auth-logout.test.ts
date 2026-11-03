import { beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  handleResponse: vi.fn(),
}));

vi.mock('@/infrastructure/core', () => ({
  API_V1: '/api/v1',
  fetchWithTimeout: core.fetchWithTimeout,
  handleResponse: core.handleResponse,
}));

import { postLogout } from '@/infrastructure/auth';

describe('postLogout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revokes the current server session', async () => {
    const response = { status: 200 } as Response;
    core.fetchWithTimeout.mockResolvedValue(response);
    core.handleResponse.mockResolvedValue({ logged_out: true });

    await expect(postLogout()).resolves.toBeUndefined();

    expect(core.fetchWithTimeout).toHaveBeenCalledWith('/api/v1/auth/logout', {
      method: 'POST',
    });
    expect(core.handleResponse).toHaveBeenCalledWith(response);
  });

  it('treats an already-invalid session as logged out', async () => {
    core.fetchWithTimeout.mockResolvedValue({ status: 401 } as Response);

    await expect(postLogout()).resolves.toBeUndefined();
    expect(core.handleResponse).not.toHaveBeenCalled();
  });
});
