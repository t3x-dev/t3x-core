// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useRepositoryProfile } from '@/hooks/projects/useRepositoryProfile';
import { apiProjectToSummary, useProjectStore } from '@/store/projectStore';

const update = vi.hoisted(() => vi.fn());
vi.mock('@/commands/projects/updateProject', () => ({ updateProject: update }));
beforeEach(() => {
  update.mockReset();
  useProjectStore.getState().cacheProject(
    apiProjectToSummary({
      project_id: 'p',
      name: 'Current',
      visibility: 'private',
      created_at: '2026-10-15T00:00:00Z',
      metadata: { description: 'Keep' },
      repository_profile: { readme: 'Original', tags: ['Old'] },
      can_edit: true,
    })
  );
});
it('updates current display without replaying unrelated fields from out-of-order responses', async () => {
  let finishReadme!: (value: unknown) => void;
  update.mockImplementation((_id, body) =>
    body.repository_profile.readme !== undefined
      ? new Promise((resolve) => {
          finishReadme = resolve;
        })
      : Promise.resolve({ repository_profile: { readme: 'New', tags: ['New tag'] } })
  );
  const { result } = renderHook(() => useRepositoryProfile('p'));
  await act(async () => {
    const first = result.current({ readme: 'New' });
    await result.current({ tags: ['New tag'] });
    finishReadme({
      name: 'Stale',
      metadata: { description: 'Stale' },
      repository_profile: { readme: 'New', tags: ['Old'] },
    });
    await first;
  });
  expect(useProjectStore.getState().details.p).toMatchObject({
    name: 'Current',
    description: 'Keep',
    repositoryProfile: { readme: 'New', tags: ['New tag'] },
  });
  expect(update).toHaveBeenCalledWith('p', { repository_profile: { readme: 'New' } });
});
