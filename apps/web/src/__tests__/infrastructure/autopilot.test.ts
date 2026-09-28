import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  handleResponse: vi.fn(),
}));

vi.mock('@/infrastructure/core', () => ({
  API_V1: '/v1',
  fetchWithTimeout: api.fetchWithTimeout,
  handleResponse: api.handleResponse,
}));

import { updateAutopilotConfig } from '@/infrastructure/autopilot';

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchWithTimeout.mockResolvedValue({});
});

describe('updateAutopilotConfig', () => {
  it('returns the config inside the API response envelope', async () => {
    const config = {
      enabled: true,
      min_nodes: 3,
      auto_create_leaf: false,
      target_branch: 'release',
    };
    api.handleResponse.mockResolvedValue({ config });

    await expect(updateAutopilotConfig('project one', { enabled: true })).resolves.toEqual(config);
    expect(api.fetchWithTimeout).toHaveBeenCalledWith(
      '/v1/projects/project%20one/autopilot/config',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ enabled: true }) })
    );
  });
});
