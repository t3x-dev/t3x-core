// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCommittedSchema } from '@/hooks/commits/useCommittedSchema';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/infrastructure/commits', () => ({ getCommitChanges: mocks.read }));
const snapshot = {
  status: 'bound',
  schemaHash: `sha256:${'a'.repeat(64)}`,
  definition: { nodes: { checklist: { slots: { title: { type: 'string' } } } } },
  bindings: [],
};
const response = (commitDigest: string, projectId = 'p') => ({
  projectId,
  commitDigest,
  schemaReview: { draft: snapshot },
});
beforeEach(() => mocks.read.mockReset());

it('loads the frozen definition, and does not request anything before a Commit exists', async () => {
  mocks.read.mockResolvedValue(response('first'));
  const { result, rerender } = renderHook(({ digest }) => useCommittedSchema('p', digest), {
    initialProps: { digest: null as string | null },
  });
  expect(mocks.read).not.toHaveBeenCalled();
  rerender({ digest: 'first' });
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
});
it('clears the old Schema immediately and ignores its late response after changing project and Commit', async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    )
    .mockResolvedValueOnce({ ...response('second', 'other'), schemaReview: null });
  const { result, rerender } = renderHook(
    ({ project, digest }) => useCommittedSchema(project, digest),
    { initialProps: { project: 'p', digest: 'first' } }
  );
  rerender({ project: 'other', digest: 'second' });
  expect(result.current.snapshot).toBeUndefined();
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => resolveOld(response('first')));
  expect(result.current.snapshot).toBeNull();
});
it.each([
  response('wrong'),
  response('first', 'foreign'),
])('rejects a mismatched response', async (value) => {
  mocks.read.mockResolvedValue(value);
  const { result } = renderHook(() => useCommittedSchema('p', 'first'));
  await waitFor(() => expect(result.current.error).toMatch(/does not match/));
  expect(result.current.snapshot).toBeUndefined();
});
it('keeps failure separate from an unbound Schema, and permits retry', async () => {
  mocks.read.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response('first'));
  const { result } = renderHook(() => useCommittedSchema('p', 'first'));
  await waitFor(() => expect(result.current.error).toBe('offline'));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
  expect(result.current.error).toBeUndefined();
});
