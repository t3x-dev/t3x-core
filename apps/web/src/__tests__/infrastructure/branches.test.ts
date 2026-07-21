import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeoutMock = vi.fn();
const handleResponseMock = vi.fn();

vi.mock('@/infrastructure/core', () => ({
  API_V1: '/v1',
  buildQueryString: vi.fn(),
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  handleResponse: (...args: unknown[]) => handleResponseMock(...args),
}));

import { switchBranch } from '@/infrastructure/branches';

describe('branches infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWithTimeoutMock.mockResolvedValue({ ok: true });
    handleResponseMock.mockResolvedValue({ name: 'main' });
  });

  it('uses the switch endpoint request contract', async () => {
    await switchBranch('proj_1', 'main', true, 'feature/source');

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith('/v1/branches/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: 'proj_1',
        branch_name: 'main',
        create_if_missing: true,
        parent_branch: 'feature/source',
      }),
    });
  });
});
