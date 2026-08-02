import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import LegacyChatLandingPage, { buildLegacyChatLandingRedirect } from '@/app/chat/page';

describe('LegacyChatLandingPage', () => {
  it('retires the old Chat landing in favor of the repository directory', async () => {
    expect(buildLegacyChatLandingRedirect()).toBe('/');

    await LegacyChatLandingPage({ searchParams: Promise.resolve({}) });

    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('preserves project and branch identity when an old landing link supplied them', async () => {
    expect(
      buildLegacyChatLandingRedirect({
        projectId: 'proj/test',
        branch: 'release/candidate',
        introDemo: '1',
        introDemoStage: 'compose',
      })
    ).toBe('/project/proj%2Ftest?branch=release%2Fcandidate');

    await LegacyChatLandingPage({
      searchParams: Promise.resolve({ projectId: 'proj_test', branch: 'main' }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/project/proj_test?branch=main');
  });
});
