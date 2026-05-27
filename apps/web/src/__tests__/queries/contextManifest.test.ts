import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/contextManifest', () => ({
  getContextManifest: vi.fn(),
}));

import { getContextManifest } from '@/infrastructure/contextManifest';
import { fetchContextManifest } from '@/queries/contextManifest';

describe('queries/contextManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates manifest reads to infrastructure', async () => {
    const manifest = {
      conversation_id: 'conv_1',
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
      source_items: [],
      token_estimate: 0,
      sources: [],
      chat_context_text: '',
      extraction_context_text: '',
    };
    vi.mocked(getContextManifest).mockResolvedValueOnce(manifest);

    await expect(fetchContextManifest('conv_1')).resolves.toBe(manifest);

    expect(getContextManifest).toHaveBeenCalledWith('conv_1');
  });
});
