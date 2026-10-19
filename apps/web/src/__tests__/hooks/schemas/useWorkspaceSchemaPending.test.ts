// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceSchemaPending } from '@/hooks/schemas/useWorkspaceSchemaPending';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/infrastructure/schemaStudio', () => ({ readWorkspaceSchemaPending: mocks.read }));
beforeEach(() => mocks.read.mockReset());

it('discards delayed reads for a previous Workspace and rechecks freshness on focus', async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.read.mockImplementation((_project, workspace) =>
    workspace === 'old'
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve({ status: 'pending_preparation', pending: { workspaceId: workspace } })
  );
  const { result, rerender } = renderHook(
    ({ id, revision }) => useWorkspaceSchemaPending('p', id, revision),
    { initialProps: { id: 'old', revision: 2 } }
  );
  rerender({ id: 'new', revision: 4 });
  await waitFor(() => expect(result.current.data?.pending?.workspaceId).toBe('new'));
  await act(async () =>
    resolveOld({ status: 'pending_preparation', pending: { workspaceId: 'old' } })
  );
  expect(result.current.data?.pending?.workspaceId).toBe('new');
  mocks.read.mockResolvedValue({ status: 'stale', pending: { workspaceId: 'new' } });
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.data?.status).toBe('stale'));
  expect(result.current.data?.pending?.workspaceId).toBe('new');
});

it('does not query an unpersisted Workspace', () => {
  const { result } = renderHook(() => useWorkspaceSchemaPending('p', ''));
  expect(result.current.loading).toBe(false);
  expect(mocks.read).not.toHaveBeenCalled();
});
