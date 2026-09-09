// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteProject } from '@/commands/projects';
import { useIntroDemoCompletion } from '@/hooks/onboarding/useIntroDemoCompletion';
import { fetchProject } from '@/queries/project';
import { useCanvasStore } from '@/store/canvasStore';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/queries/project', () => ({
  fetchProject: vi.fn(),
}));

vi.mock('@/queries/projects', () => ({
  fetchProjects: vi.fn(),
}));

vi.mock('@/commands/projects', () => ({
  deleteProject: vi.fn(),
}));

describe('useIntroDemoCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    useCanvasStore.getState().clearCanvas();
  });

  it('clears local demo canvas state when the backend demo project is already gone', async () => {
    vi.mocked(fetchProject).mockRejectedValueOnce(new Error('404 not found'));
    useCanvasStore.setState({ projectId: 'proj_demo', hasMainCommit: true });

    const { result } = renderHook(() => useIntroDemoCompletion('proj_demo'));

    await act(async () => {
      await result.current.completeIntroDemo();
    });

    expect(useCanvasStore.getState().projectId).toBeNull();
    expect(useCanvasStore.getState().hasMainCommit).toBe(false);
    expect(deleteProject).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/');
  });
});
