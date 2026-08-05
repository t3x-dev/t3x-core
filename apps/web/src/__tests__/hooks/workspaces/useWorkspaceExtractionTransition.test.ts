// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceExtractionTransition } from '@/hooks/workspaces/useWorkspaceExtractionTransition';
import {
  getWorkspaceControlPlaneTransition,
  getWorkspaceExtractionTransitionLink,
} from '@/infrastructure/workspaces';

vi.mock('@/infrastructure/workspaces', () => ({
  getWorkspaceControlPlaneTransition: vi.fn(),
  getWorkspaceExtractionTransitionLink: vi.fn(),
}));

describe('useWorkspaceExtractionTransition', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves the current candidate link and then inspects its Transition view', async () => {
    const transitionId = `trn_${'a'.repeat(32)}`;
    const view = { mode: 'transition' } as never;
    vi.mocked(getWorkspaceExtractionTransitionLink).mockResolvedValue({
      transition_id: transitionId,
      candidate_id: 'candidate:abc',
      workspace_revision: 4,
      created_at: '2026-08-05T00:00:00.000Z',
    });
    vi.mocked(getWorkspaceControlPlaneTransition).mockResolvedValue({
      transition_id: transitionId,
      view: { transition: view },
    });

    const { result } = renderHook(() =>
      useWorkspaceExtractionTransition('proj_1', 'workspace_1', 'candidate:abc')
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ transitionId, view, error: null });
    expect(getWorkspaceControlPlaneTransition).toHaveBeenCalledWith(
      'proj_1',
      transitionId,
      expect.any(AbortSignal)
    );
  });

  it('ignores a link that does not belong to the current candidate', async () => {
    vi.mocked(getWorkspaceExtractionTransitionLink).mockResolvedValue({
      transition_id: `trn_${'b'.repeat(32)}`,
      candidate_id: 'candidate:replaced',
      workspace_revision: 4,
      created_at: '2026-08-05T00:00:00.000Z',
    });

    const { result } = renderHook(() =>
      useWorkspaceExtractionTransition('proj_1', 'workspace_1', 'candidate:abc')
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ transitionId: null, view: null, error: null });
    expect(getWorkspaceControlPlaneTransition).not.toHaveBeenCalled();
  });
});
