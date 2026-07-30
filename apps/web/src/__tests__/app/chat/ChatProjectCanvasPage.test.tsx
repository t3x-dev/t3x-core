import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import ChatProjectCanvasPage, {
  buildStateCanvasRedirect,
} from '@/app/chat/project/[projectId]/canvas/page';

describe('ChatProjectCanvasPage', () => {
  it('preserves old deep-link state while redirecting Canvas into State', async () => {
    expect(
      buildStateCanvasRedirect('proj/test', {
        introDemo: '1',
        selected: 'sha256:commit',
        view: 'render',
      })
    ).toBe('/project/proj%2Ftest?view=canvas&introDemo=1&selected=sha256%3Acommit');

    await ChatProjectCanvasPage({
      params: Promise.resolve({ projectId: 'proj_test' }),
      searchParams: Promise.resolve({ introDemo: '1' }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/project/proj_test?view=canvas&introDemo=1');
  });
});
