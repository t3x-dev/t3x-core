import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeoutMock = vi.fn();
const handleResponseMock = vi.fn();

vi.mock('@/infrastructure/core', () => ({
  API_V1: 'https://api.test/api/v1',
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  handleResponse: (...args: unknown[]) => handleResponseMock(...args),
}));

import { getContextManifest } from '@/infrastructure/contextManifest';

describe('infrastructure/contextManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the encoded conversation context manifest endpoint', async () => {
    const response = new Response('{}');
    const manifest = {
      conversation_id: 'conv/with space',
      project_id: 'proj_1',
      baseline: {
        commit_hash: null,
        branch: null,
        message: null,
        content: null,
        source: 'none',
        source_conversation_id: null,
        node_count: 0,
        relation_count: 0,
      },
      references: [],
      feedback: [],
      token_estimate: 0,
      sources: [],
      chat_context_text: '',
      extraction_context_text: '',
    };

    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce(manifest);

    await expect(getContextManifest('conv/with space')).resolves.toBe(manifest);

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/conversations/conv%2Fwith%20space/context-manifest'
    );
    expect(handleResponseMock).toHaveBeenCalledWith(response);
  });
});
