import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCommitTransitionView } from '@/infrastructure/commits';

afterEach(() => vi.restoreAllMocks());

describe('getCommitTransitionView', () => {
  it('requests one server-derived view using only project, ref, and commit identity', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            transition: {
              schema: 't3x.dev/transition-view/v1',
              version: 1,
              mode: 'legacy',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const view = await getCommitTransitionView(
      'project/one',
      'feature/review',
      `sha256:${'a'.repeat(64)}`
    );

    expect(view).toMatchObject({ schema: 't3x.dev/transition-view/v1', mode: 'legacy' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/projects/project%2Fone/commits/sha256%3A');
    expect(String(url)).toContain('transition-view?ref=feature%2Freview');
    expect(init?.body).toBeUndefined();
  });
});
