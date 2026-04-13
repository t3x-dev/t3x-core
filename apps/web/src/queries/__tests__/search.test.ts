import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/search', () => ({
  searchNodes: vi.fn().mockResolvedValue({
    results: [{ node_id: 'n1', commit_hash: 'c1', text: 't', score: 0.9, keyword_rank: 1, vector_rank: null }],
    total: 1,
    mode: 'hybrid' as const,
    query_time_ms: 12,
  }),
}));

import { searchNodes } from '@/queries/search';

describe('queries/search', () => {
  it('delegates searchNodes to the L1 adapter and returns the SearchResult', async () => {
    const result = await searchNodes({ query: 'hello', mode: 'hybrid', limit: 10 });
    expect(result.total).toBe(1);
    expect(result.mode).toBe('hybrid');
    expect(result.results[0].node_id).toBe('n1');
  });
});
