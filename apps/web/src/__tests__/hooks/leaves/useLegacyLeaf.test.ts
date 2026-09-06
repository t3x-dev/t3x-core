// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useLegacyLeaf } from '@/hooks/leaves/useLegacyLeaf';
import { downloadAsFile } from '@/infrastructure/export/core';

const mocks = vi.hoisted(() => ({ getLeaf: vi.fn(), listLegacyLeafHistory: vi.fn() }));
vi.mock('@/infrastructure/leaves', () => mocks);
vi.mock('@/infrastructure/export/core', () => ({ downloadAsFile: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it('rejects a Leaf from a different project before loading its history', async () => {
  mocks.getLeaf.mockResolvedValue({ id: 'leaf', project_id: 'other' });
  const { result } = renderHook(() => useLegacyLeaf('requested', 'leaf'));
  await waitFor(() => expect(result.current.error).toContain('does not belong'));
  expect(result.current.leaf).toBeUndefined();
  expect(mocks.listLegacyLeafHistory).not.toHaveBeenCalled();
});
it('does not retain the previous Leaf after switching to an unavailable ID', async () => {
  mocks.getLeaf
    .mockResolvedValueOnce({ id: 'first', project_id: 'p' })
    .mockRejectedValueOnce(new Error('not found'));
  mocks.listLegacyLeafHistory.mockResolvedValue([]);
  const { result, rerender } = renderHook(({ id }) => useLegacyLeaf('p', id), {
    initialProps: { id: 'first' },
  });
  await waitFor(() => expect(result.current.history).toEqual([]));
  rerender({ id: 'missing' });
  expect(result.current.leaf).toBeUndefined();
  await waitFor(() => expect(result.current.error).toBe('not found'));
  expect(result.current.leaf).toBeUndefined();
});

it('exports historical record identity together with its source commit', async () => {
  const leaf = { id: 'first', project_id: 'p', commit_hash: 'sha256:source' };
  const history = {
    id: 'history',
    leaf_id: 'first',
    output: 'old output',
    config: {},
    model: 'saved',
    generated_at: '2026-01-01',
    created_by: null,
  };
  mocks.getLeaf.mockResolvedValue(leaf);
  mocks.listLegacyLeafHistory.mockResolvedValue([history]);
  const { result } = renderHook(() => useLegacyLeaf('p', 'first'));
  await waitFor(() => expect(result.current.history).toEqual([history]));
  result.current.download('json', history);
  expect(JSON.parse(vi.mocked(downloadAsFile).mock.calls.at(-1)![0])).toEqual({
    project_id: 'p',
    leaf_id: 'first',
    commit_hash: 'sha256:source',
    record: history,
  });
});
