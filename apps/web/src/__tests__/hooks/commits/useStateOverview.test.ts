// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useStateOverview } from '@/hooks/commits/useStateOverview';

const fetchOverview = vi.hoisted(() => vi.fn());
vi.mock('@/infrastructure/stateOverview', () => ({ fetchStateOverview: fetchOverview }));
it('discards a late response from the previous commit selection', async () => {
  let oldResolve: (value: unknown) => void = () => {};
  fetchOverview
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldResolve = resolve;
        })
    )
    .mockResolvedValueOnce({ revision: { commitDigest: 'new' } });
  const hook = renderHook(({ digest }) => useStateOverview('project', digest), {
    initialProps: { digest: 'old' },
  });
  hook.rerender({ digest: 'new' });
  await waitFor(() => expect(hook.result.current.data?.revision.commitDigest).toBe('new'));
  await act(async () => oldResolve({ revision: { commitDigest: 'old' } }));
  expect(hook.result.current.data?.revision.commitDigest).toBe('new');
});
