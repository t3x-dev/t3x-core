import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import LegacyProjectLeafDetailPage, {
  buildRepositoryLeafRedirect,
} from '@/app/chat/project/[projectId]/leaf/[leafId]/page';
import LegacyProjectLeafIndexPage, {
  buildRepositoryOutputsRedirect,
} from '@/app/chat/project/[projectId]/leaf/page';

describe('legacy project Leaf routes', () => {
  it('redirects the Leaf index to repository Outputs and preserves compatible context', async () => {
    expect(
      buildRepositoryOutputsRedirect('proj/test', {
        introDemo: '1',
        leaf: 'untrusted-leaf',
        tab: 'state',
      })
    ).toBe('/project/proj%2Ftest?tab=outputs&introDemo=1');

    await LegacyProjectLeafIndexPage({
      params: Promise.resolve({ projectId: 'proj_test' }),
      searchParams: Promise.resolve({ introDemo: '1' }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/project/proj_test?tab=outputs&introDemo=1');
  });

  it('binds the route Leaf identity while preserving compatible context', async () => {
    expect(
      buildRepositoryLeafRedirect('proj/test', 'leaf/verified', {
        introDemo: ['1'],
        leaf: 'untrusted-leaf',
        tab: 'state',
      })
    ).toBe('/project/proj%2Ftest?tab=outputs&leaf=leaf%2Fverified&introDemo=1');

    await LegacyProjectLeafDetailPage({
      params: Promise.resolve({ projectId: 'proj_test', leafId: 'leaf_first' }),
      searchParams: Promise.resolve({ introDemo: '1' }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      '/project/proj_test?tab=outputs&leaf=leaf_first&introDemo=1'
    );
  });
});
