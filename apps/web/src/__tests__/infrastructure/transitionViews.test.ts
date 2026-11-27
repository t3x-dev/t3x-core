import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitByline, commitTitle } from '@/domain/format/formatters';
import { getApiCommit, getCommitTransitionView, listCommits } from '@/infrastructure/commits';

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

it('renders the same unrecorded attribution for historical list and detail responses', async () => {
  const hash = `sha256:${'a'.repeat(64)}`;
  const recorded = '2026-08-01T00:00:00Z';
  const listEntry = {
    id: hash,
    format: 'transition_v2',
    schema: 't3x/commit/v2',
    parents: [],
    recordedAt: recorded,
  };
  const detail = {
    digest: hash,
    object: { schema: 't3x/commit/v2', parents: [] },
    recorded_at: recorded,
  };
  const response = (data: unknown) => Response.json({ success: true, data });
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response({ commits: [listEntry] }))
    .mockResolvedValueOnce(response({ commit: detail }));
  const listed = await listCommits('project', 'main');
  const stored = await getApiCommit(hash, 'project');
  for (const commit of [listed[0]!, stored]) {
    expect(commitByline(commit)).toBe('Author not recorded');
    expect(commitTitle(commit.message, commit.operation_count)).toBe('No commit message');
    expect(commit.hash).toBe(hash);
    expect(commit.parents).toEqual([]);
  }
});
