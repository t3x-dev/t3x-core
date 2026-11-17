// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useCommittedPublication } from '@/hooks/commits/useCommittedPublication';

const fetchExport = vi.hoisted(() => vi.fn());
vi.mock('@/infrastructure/stateExport', () => ({ fetchStateExport: fetchExport }));

it('never displays a previous commit under a new identity, even when an old request completes late', async () => {
  const requests: ((value: { content: string }) => void)[] = [];
  fetchExport.mockImplementation(() => new Promise((resolve) => requests.push(resolve)));
  const { result, rerender } = renderHook(
    ({ digest }) => useCommittedPublication('project', digest),
    { initialProps: { digest: 'A' } }
  );
  await act(async () => requests[0]({ content: '{"old":true}' }));
  expect(result.current.result?.value).toEqual({ old: true });
  rerender({ digest: 'B' });
  expect(result.current.result).toBeUndefined();
  rerender({ digest: 'C' });
  await act(async () => requests[2]({ content: '{"selected":true}' }));
  await act(async () => requests[1]({ content: '{"stale":true}' }));
  expect(result.current.result?.value).toEqual({ selected: true });
  expect(fetchExport.mock.calls[0][2]).toBe('json');
});

it('retains the exact requested commit when retrying a failed read', async () => {
  fetchExport.mockRejectedValueOnce(new Error('forbidden')).mockResolvedValue({ content: 'null' });
  const { result } = renderHook(() => useCommittedPublication('project', 'commit'));
  await waitFor(() => expect(result.current.result?.error).toContain('Could not load'));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.result?.value).toBeNull());
  expect(fetchExport).toHaveBeenLastCalledWith(
    'project',
    'commit',
    'json',
    expect.any(AbortSignal)
  );
});
