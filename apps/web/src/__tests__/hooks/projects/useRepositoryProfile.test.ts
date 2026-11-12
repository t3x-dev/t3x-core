// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  useRepositoryDescription,
  useRepositoryProfile,
} from '@/hooks/projects/useRepositoryProfile';
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
      : Promise.resolve({
          repository_profile: {
            readme: 'New',
            tags: ['New tag'],
            icon: { key: 'flask', color: 'violet' },
          },
        })
  );
  const { result } = renderHook(() => useRepositoryProfile('p'));
  await act(async () => {
    const first = result.current({ readme: 'New' });
    await result.current({ tags: ['New tag'], icon: { key: 'flask', color: 'violet' } });
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
    repositoryProfile: {
      readme: 'New',
      tags: ['New tag'],
      icon: { key: 'flask', color: 'violet' },
    },
  });
  expect(update).toHaveBeenCalledWith('p', { repository_profile: { readme: 'New' } });
});

it('requires the server to confirm icon changes, including a null reset', async () => {
  update.mockResolvedValueOnce({ repository_profile: { readme: 'Original', tags: ['Old'] } });
  update.mockResolvedValueOnce({
    repository_profile: { readme: 'Original', tags: ['Old'], icon: null },
  });
  const { result } = renderHook(() => useRepositoryProfile('p'));
  await expect(result.current({ icon: null })).rejects.toThrow('did not return');
  await act(async () => result.current({ icon: null }));
  expect(useProjectStore.getState().details.p.repositoryProfile?.icon).toBeNull();
});

it('saves the description without rolling back other repository metadata', async () => {
  let finish!: (value: unknown) => void;
  update.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result } = renderHook(() => useRepositoryDescription('p'));
  await act(async () => {
    const save = result.current('Updated description');
    useProjectStore
      .getState()
      .updateProject('p', { metadata: { description: 'Keep', homepage: 'latest' } });
    finish({
      name: 'Stale name',
      metadata: { description: 'Updated description', homepage: 'stale' },
    });
    await save;
  });
  expect(update).toHaveBeenCalledWith('p', { metadata: { description: 'Updated description' } });
  expect(useProjectStore.getState().details.p).toMatchObject({
    name: 'Current',
    description: 'Updated description',
    metadata: { description: 'Updated description', homepage: 'latest' },
    repositoryProfile: { readme: 'Original', tags: ['Old'] },
  });
});

it('does not claim a saved description when the response omits it', async () => {
  update.mockResolvedValue({ metadata: {} });
  const { result } = renderHook(() => useRepositoryDescription('p'));
  await expect(result.current('New')).rejects.toThrow('did not return');
  expect(useProjectStore.getState().details.p.description).toBe('Keep');
});
