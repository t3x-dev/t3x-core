// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectSettings } from '@/hooks/projects/useProjectSettings';

const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('branch=main'),
}));
const fetchProject = vi.fn();
const updateProject = vi.fn();
const deleteProject = vi.fn();

vi.mock('@/queries/project', () => ({
  fetchProject: (...args: unknown[]) => fetchProject(...args),
}));
vi.mock('@/commands/projects/updateProject', () => ({
  updateProject: (...args: unknown[]) => updateProject(...args),
}));
vi.mock('@/commands/projects/deleteProject', () => ({
  deleteProject: (...args: unknown[]) => deleteProject(...args),
}));

const project = {
  project_id: 'proj_1',
  name: 'tree-demo',
  namespace: 'team',
  canonical_path: '/team/tree-demo',
  visibility: 'private' as const,
  created_at: '2026-09-28T00:00:00.000Z',
  metadata: { description: 'old', starter: 'prd-v1' },
};

describe('useProjectSettings', () => {
  beforeEach(() => {
    fetchProject.mockReset().mockResolvedValue(project);
    updateProject.mockReset();
    deleteProject.mockReset();
  });

  it('preserves unrelated metadata keys when saving the description', async () => {
    updateProject.mockResolvedValue({
      ...project,
      name: 'renamed',
      canonical_path: '/team/renamed',
      metadata: { description: 'new', starter: 'prd-v1' },
    });
    const { result } = renderHook(() => useProjectSettings('proj_1'));
    await waitFor(() => expect(result.current.project).not.toBeNull());

    await act(() => result.current.saveGeneral({ description: 'new', name: 'renamed' }));

    expect(updateProject).toHaveBeenCalledWith('proj_1', {
      metadata: { description: 'new' },
      name: 'renamed',
    });
    expect(result.current.project?.metadata).toEqual({ description: 'new', starter: 'prd-v1' });
    expect(result.current.project?.name).toBe('renamed');
    expect(replace).toHaveBeenCalledWith('/team/renamed/settings?branch=main', { scroll: false });
  });

  it('leaves the saved project unchanged when a rename conflicts', async () => {
    updateProject.mockRejectedValue(new Error('Name occupied'));
    const { result } = renderHook(() => useProjectSettings('proj_1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(
        result.current.saveGeneral({ name: 'Taken', description: 'new' })
      ).rejects.toThrow('Name occupied');
    });
    expect(result.current.project?.name).toBe('tree-demo');
    expect(result.current.project?.canonical_path).toBe('/team/tree-demo');
  });

  it('surfaces a load failure without a project', async () => {
    fetchProject.mockRejectedValueOnce(new Error('Project proj_1 not found'));
    const { result } = renderHook(() => useProjectSettings('proj_1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.project).toBeNull();
    expect(result.current.error).toBe('Project proj_1 not found');
  });
});
