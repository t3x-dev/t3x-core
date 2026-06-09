// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteProject } from '@/commands/projects';
import {
  type IntroDemoLocalCommit,
  readIntroDemoLocalCommit,
  saveIntroDemoLocalCommit,
} from '@/hooks/onboarding/introDemoLocalCommit';
import { useIntroDemoCompletion } from '@/hooks/onboarding/useIntroDemoCompletion';
import { DEMO_COMMIT_HASH, demoTree } from '@/hooks/onboarding/useIntroDemoReplayActions';
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

function makeCommit(): IntroDemoLocalCommit {
  return {
    projectId: 'proj_demo',
    conversationId: 'conv_demo',
    hash: DEMO_COMMIT_HASH,
    branch: 'main',
    message: 'Prompt review demo',
    committedAt: '2026-06-04T06:55:00.000Z',
    content: demoTree(),
  };
}

describe('useIntroDemoCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    useCanvasStore.getState().clearCanvas();
  });

  it('clears local demo canvas state when the backend demo project is already gone', async () => {
    vi.mocked(fetchProject).mockRejectedValueOnce(new Error('404 not found'));
    saveIntroDemoLocalCommit(makeCommit());
    useCanvasStore.setState({ projectId: 'proj_demo', hasMainCommit: true });

    const { result } = renderHook(() => useIntroDemoCompletion('proj_demo'));

    await act(async () => {
      await result.current.completeIntroDemo();
    });

    expect(readIntroDemoLocalCommit('proj_demo')).toBeNull();
    expect(useCanvasStore.getState().projectId).toBeNull();
    expect(useCanvasStore.getState().hasMainCommit).toBe(false);
    expect(deleteProject).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/chat');
  });
});
